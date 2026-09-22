import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { InvoiceParseError, readInvoiceFile, type ParsedInvoice } from '@/lib/sales-invoices/ubl';
import { CURRENT_STORE, OWN_TAX_ID, saveParsedInvoice, toSalesDto } from '@/lib/sales-invoices/service';

/**
 * Satış faturaları
 *
 *   GET  ?year=2026&month=9 → ayın satış faturaları
 *   POST form-data: file    → GİB ZIP'i ya da UBL XML'i oku ve kaydet
 *
 * Fatura XML'den okunduğu için taslak / onay adımı yoktur; doğrudan kaydedilir.
 * Bir ZIP birden fazla fatura içerebilir; her biri ayrı kayıt olur, dosya ortaktır.
 */

// Vercel fonksiyonlarında istek gövdesi 4,5 MB ile sınırlı.
const MAX_BYTES = 4 * 1024 * 1024;

const fail = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error_message: message, ...extra }, { status });

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const year = Number(params.get('year'));
    const month = Number(params.get('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return fail(400, 'Geçerli bir yıl ve ay gerekli.');
    }

    const invoices = await prisma.salesInvoice.findMany({
      where: {
        store: CURRENT_STORE,
        issueDate: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) },
      },
      include: { lines: true },
      orderBy: [{ issueDate: 'desc' }, { invoiceNo: 'desc' }],
    });

    return NextResponse.json({ success: true, invoices: invoices.map(toSalesDto) });
  } catch (error: any) {
    console.error('API /api/belgeler/satis GET Error:', error);
    return fail(500, 'Satış faturaları alınamadı: ' + (error.message || 'bilinmeyen hata'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File) || file.size === 0) return fail(400, 'Dosya bulunamadı.');
    if (file.size > MAX_BYTES) return fail(413, 'Dosya 4 MB sınırını aşıyor.');

    const buffer = Buffer.from(await file.arrayBuffer());
    let read: ReturnType<typeof readInvoiceFile>;
    try {
      read = readInvoiceFile(new Uint8Array(buffer));
    } catch (err) {
      if (err instanceof InvoiceParseError) {
        return fail(415, `${err.message} GİB'den inen ZIP'i ya da faturanın XML (UBL) dosyasını yükleyin.`);
      }
      throw err;
    }

    // Kaydedilmeyecek faturalar gerekçesiyle geri döner; ZIP'teki diğerleri yine kaydedilir.
    const skipped: { invoiceNo: string; reason: string }[] = [];
    const accepted: ParsedInvoice[] = [];
    const existing = await prisma.salesInvoice.findMany({
      where: { store: CURRENT_STORE, uuid: { in: read.invoices.map((i) => i.uuid) } },
      select: { uuid: true },
    });
    const known = new Set(existing.map((e) => e.uuid));

    for (const invoice of read.invoices) {
      if (invoice.sellerTaxId !== OWN_TAX_ID) {
        skipped.push({
          invoiceNo: invoice.invoiceNo,
          reason: `Bu fatura Lenora'ya ait değil (satıcı: ${invoice.sellerName ?? invoice.sellerTaxId ?? 'bilinmiyor'}).`,
        });
      } else if (known.has(invoice.uuid)) {
        skipped.push({ invoiceNo: invoice.invoiceNo, reason: 'Bu fatura daha önce yüklenmiş.' });
      } else {
        known.add(invoice.uuid);
        accepted.push(invoice);
      }
    }

    if (!accepted.length) {
      return fail(409, skipped.map((s) => `${s.invoiceNo}: ${s.reason}`).join(' '), { skipped });
    }

    const contentType = read.kind === 'zip' ? 'application/zip' : 'application/xml';
    const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-120) || 'fatura';
    const blob = await put(`sales-invoices/${CURRENT_STORE}/${Date.now()}-${safeName}`, buffer, {
      access: 'private',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN || undefined,
    });
    const stored = {
      url: blob.url,
      name: file.name,
      contentType,
      size: file.size,
      hash: createHash('sha256').update(buffer).digest('hex'),
    };

    const saved = [];
    for (const invoice of accepted) saved.push(await saveParsedInvoice(invoice, stored));

    return NextResponse.json({ success: true, invoices: saved.map(toSalesDto), skipped });
  } catch (error: any) {
    console.error('API /api/belgeler/satis POST Error:', error);
    return fail(500, 'Fatura yüklenemedi: ' + (error.message || 'bilinmeyen hata'));
  }
}
