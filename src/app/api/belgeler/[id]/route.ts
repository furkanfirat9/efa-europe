import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { isCategoryKey } from '@/lib/documents/categories';
import { SUPPORTED_CURRENCIES } from '@/lib/fx/evds';
import {
  CURRENT_STORE,
  buildDedupKey,
  buildWarnings,
  computeFx,
  isCategorised,
  isOwnBuyer,
  parseIsoDate,
  toDto,
} from '@/lib/documents/service';

/**
 *   PATCH  { ...alanlar, confirm?: true } → düzenle; confirm ile onaylayıp toplamlara kat
 *   DELETE                                → belgeyi ve dosyasını sil
 */

const fail = (status: number, message: string) =>
  NextResponse.json({ success: false, error_message: message }, { status });

const TEXT_FIELDS = [
  'platform',
  'documentNo',
  'ksefNo',
  'sellerName',
  'sellerCountry',
  'sellerTaxId',
  'buyerName',
  'orderNumber',
  'notes',
] as const;
const DATE_FIELDS = ['documentDate', 'servicePeriodStart', 'servicePeriodEnd'] as const;

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/belgeler/[id]'>) {
  try {
    const { id } = await ctx.params;
    const body = await request.json();

    const existing = await prisma.accountingDocument.findFirst({
      where: { id, store: CURRENT_STORE },
      include: { lines: true },
    });
    if (!existing) return fail(404, 'Belge bulunamadı.');

    const data: Record<string, unknown> = {};
    for (const field of TEXT_FIELDS) if (field in body) data[field] = text(body[field]);
    for (const field of DATE_FIELDS) {
      if (!(field in body)) continue;
      if (body[field] && !parseIsoDate(body[field])) return fail(400, 'Tarih YYYY-AA-GG biçiminde olmalı.');
      data[field] = parseIsoDate(body[field]);
    }
    if ('currency' in body) {
      const currency = text(body.currency)?.toUpperCase() ?? null;
      if (currency && !(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
        return fail(400, `Desteklenen para birimleri: ${SUPPORTED_CURRENCIES.join(', ')}.`);
      }
      data.currency = currency;
    }
    if ('totalAmount' in body) {
      const amount = body.totalAmount === null || body.totalAmount === '' ? null : Number(body.totalAmount);
      if (amount !== null && !Number.isFinite(amount)) return fail(400, 'Tutar geçersiz.');
      data.totalAmount = amount === null ? null : Math.round(amount * 100) / 100;
    }
    // Belgenin siparişleri; her biri gerçekten var olan bir sipariş olmalı.
    if ('postingNumbers' in body) {
      if (!Array.isArray(body.postingNumbers)) return fail(400, 'Sipariş listesi geçersiz.');
      const postings = [
        ...new Set(body.postingNumbers.map(text).filter((p: string | null): p is string => !!p)),
      ] as string[];
      const found = await prisma.ozonOrder.findMany({
        where: { postingNumber: { in: postings } },
        select: { postingNumber: true },
      });
      const known = new Set(found.map((o) => o.postingNumber));
      const missing = postings.filter((p) => !known.has(p));
      if (missing.length) return fail(404, `Sipariş bulunamadı: ${missing.join(', ')}.`);

      // Bir sipariş yalnızca bir alış belgesine bağlanır; yalnızca yeni eklenenlere bakılır.
      const added = postings.filter((p) => !existing.postingNumbers.includes(p));
      const taken = added.length
        ? await prisma.accountingDocument.findFirst({
            where: { store: CURRENT_STORE, NOT: { id }, postingNumbers: { hasSome: added } },
            select: { documentNo: true, fileName: true, postingNumbers: true },
          })
        : null;
      if (taken) {
        const clash = added.filter((p) => taken.postingNumbers.includes(p));
        return fail(409, `${clash.join(', ')} zaten ${taken.documentNo ?? taken.fileName} belgesine bağlı.`);
      }
      data.postingNumbers = postings;
    }
    if ('category' in body) {
      if (body.category && !isCategoryKey(body.category)) return fail(400, 'Geçersiz kategori.');
      data.category = body.category || null;
    }

    // Çok kalemli belgelerde (Ozon UPD'si gibi) her kalemin kendi kategorisi olabilir.
    let lines = existing.lines;
    if (Array.isArray(body.lines)) {
      const byId = new Map<string, string | null>();
      for (const line of body.lines) {
        if (typeof line?.id !== 'string') continue;
        if (line.category && !isCategoryKey(line.category)) return fail(400, 'Geçersiz kalem kategorisi.');
        byId.set(line.id, line.category || null);
      }
      await Promise.all(
        [...byId].map(([lineId, category]) =>
          prisma.accountingDocumentLine.updateMany({ where: { id: lineId, documentId: id }, data: { category } })
        )
      );
      lines = existing.lines.map((l) => (byId.has(l.id) ? { ...l, category: byId.get(l.id)! } : l));
    }

    const merged = { ...existing, ...data } as typeof existing;
    data.buyerIsOwn = isOwnBuyer(merged.buyerName);
    data.dedupKey = buildDedupKey(merged);

    // Kur yalnızca tarih ya da para birimi değişince yeniden alınır; kaydedilen kur sabit kalır.
    const fxChanged =
      merged.currency !== existing.currency ||
      merged.documentDate?.getTime() !== existing.documentDate?.getTime() ||
      (existing.fxRate == null && merged.currency && merged.documentDate);
    if (fxChanged) {
      Object.assign(data, await computeFx(merged));
    } else if ('totalAmount' in data) {
      data.totalTry =
        merged.fxRate != null && merged.totalAmount != null
          ? Math.round(merged.totalAmount * merged.fxRate * 100) / 100
          : null;
    }

    const next = { ...merged, ...data } as typeof existing;
    const warnings = await buildWarnings(next, [], lines);

    if (body.confirm === true) {
      const blocking = [
        !next.documentDate && 'belge tarihi',
        !next.currency && 'para birimi',
        next.totalAmount == null && 'toplam tutar',
        !isCategorised({ category: next.category, lines }) && 'kategori',
        next.fxRate == null && 'TL kuru',
      ].filter(Boolean);
      if (blocking.length) return fail(422, `Onaylamak için eksik: ${blocking.join(', ')}.`);

      if (next.dedupKey) {
        const duplicate = await prisma.accountingDocument.findFirst({
          where: { store: CURRENT_STORE, dedupKey: next.dedupKey, status: 'confirmed', NOT: { id } },
          select: { documentNo: true, documentDate: true },
        });
        if (duplicate) {
          return fail(409, `Bu belge daha önce kaydedilmiş (${duplicate.documentNo ?? 'aynı numara'}).`);
        }
      }
      data.status = 'confirmed';
    }

    const updated = await prisma.accountingDocument.update({
      where: { id },
      data: { ...data, warnings },
      include: { lines: true },
    });
    return NextResponse.json({ success: true, document: toDto(updated) });
  } catch (error: any) {
    console.error('API /api/belgeler/[id] PATCH Error:', error);
    return fail(500, 'Belge kaydedilemedi: ' + (error.message || 'bilinmeyen hata'));
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/belgeler/[id]'>) {
  try {
    const { id } = await ctx.params;
    const existing = await prisma.accountingDocument.findFirst({
      where: { id, store: CURRENT_STORE },
      select: { fileUrl: true, fileShared: true },
    });
    if (!existing) return fail(404, 'Belge bulunamadı.');

    await prisma.accountingDocument.delete({ where: { id } });
    // Kayıt silindikten sonra dosya kaldırılır; dosya silinemezse yalnızca günlüğe yazılır.
    // Siparişten gelen belgelerde dosya siparişindir: sipariş hâlâ kullanıyorsa dokunulmaz,
    // siparişin belgesi o arada değiştirildiyse artık kimse kullanmadığı için silinir.
    const stillUsed = existing.fileShared
      ? (await prisma.ozonOrder.count({ where: { documentUrl: existing.fileUrl } })) > 0
      : false;
    if (!stillUsed) {
      try {
        await del(existing.fileUrl, { token: process.env.BLOB_READ_WRITE_TOKEN || undefined });
      } catch (err) {
        console.error('Belge dosyası silinemedi:', existing.fileUrl, err);
      }
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /api/belgeler/[id] DELETE Error:', error);
    return fail(500, 'Belge silinemedi: ' + (error.message || 'bilinmeyen hata'));
  }
}
