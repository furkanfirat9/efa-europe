import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { extractDocument, type ExtractedDocument } from '@/lib/documents/extract';
import {
  CURRENT_STORE,
  buildDedupKey,
  buildWarnings,
  computeFx,
  isOwnBuyer,
  parseIsoDate,
  toDto,
} from '@/lib/documents/service';

/**
 * Belgeler
 *
 *   GET  ?year=2026&month=9  → ayın belgeleri + onay bekleyen tüm taslaklar
 *   POST form-data: file     → yükle, Gemini ile oku, taslak olarak kaydet
 *
 * Taslak, kullanıcı onay ekranında kontrol edip onaylayana kadar toplamlara girmez.
 */

// Gemini okuması birkaç saniye sürer; Vercel'in varsayılan süresine takılmasın.
export const maxDuration = 60;

// Vercel fonksiyonlarında istek gövdesi 4,5 MB ile sınırlı.
const MAX_BYTES = 4 * 1024 * 1024;

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
const ALLOWED_TYPES = new Set(Object.values(TYPE_BY_EXTENSION));

const resolveType = (file: File) =>
  file.type || TYPE_BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() || ''] || '';

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

    const [documents, pending] = await Promise.all([
      prisma.accountingDocument.findMany({
        where: {
          store: CURRENT_STORE,
          status: 'confirmed',
          documentDate: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) },
        },
        include: { lines: true },
        orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.accountingDocument.findMany({
        where: { store: CURRENT_STORE, status: 'draft' },
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return NextResponse.json({ success: true, documents: documents.map(toDto), pending: pending.map(toDto) });
  } catch (error: any) {
    console.error('API /api/belgeler GET Error:', error);
    return fail(500, 'Belgeler alınamadı: ' + (error.message || 'bilinmeyen hata'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File) || file.size === 0) return fail(400, 'Dosya bulunamadı.');
    if (file.size > MAX_BYTES) return fail(413, 'Dosya 4 MB sınırını aşıyor.');
    const contentType = resolveType(file);
    if (!ALLOWED_TYPES.has(contentType)) return fail(415, 'Yalnızca PDF veya görsel (PNG, JPG, WEBP) yüklenebilir.');

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash('sha256').update(buffer).digest('hex');

    const sameFile = await prisma.accountingDocument.findUnique({
      where: { store_fileHash: { store: CURRENT_STORE, fileHash } },
      select: { id: true, status: true },
    });
    if (sameFile) {
      return fail(409, 'Bu dosya daha önce yüklenmiş.', { existingId: sameFile.id, existingStatus: sameFile.status });
    }

    // Okuma başarısız olsa da belge taslak olarak kaydedilir; bilgiler elle doldurulur.
    let extracted: ExtractedDocument | null = null;
    let aiModel: string | null = null;
    const extraWarnings: string[] = [];
    try {
      const result = await extractDocument({ base64: buffer.toString('base64'), mimeType: contentType });
      extracted = result.data;
      aiModel = result.model;
    } catch (err: any) {
      console.error('Belge okunamadı:', err);
      extraWarnings.push('Belge otomatik okunamadı; bilgileri elle doldurun.');
    }

    if (extracted?.documentKind === 'income_report') {
      return fail(422, 'Bu bir gelir belgesi (satış / tazminat raporu); Belgeler sayfasına yüklenmez.');
    }
    if (extracted?.documentKind === 'ozon_upd' || extracted?.documentKind === 'ozon_report') {
      return fail(422, 'Ozon belgeleri bir sonraki aşamada desteklenecek; şimdilik yüklenmez.');
    }
    if (extracted?.uncertainFields.length) {
      extraWarnings.push(`Emin olunamayan alanlar: ${extracted.uncertainFields.join(', ')}.`);
    }

    const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-120) || 'belge';
    const blob = await put(`documents/${CURRENT_STORE}/${Date.now()}-${safeName}`, buffer, {
      access: 'private',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN || undefined,
    });

    const documentDate = parseIsoDate(extracted?.documentDate);
    const fields = {
      kind: extracted?.documentKind ?? 'invoice',
      platform: extracted?.platform ?? null,
      category: extracted?.suggestedCategory ?? null,
      documentNo: extracted?.documentNo ?? null,
      ksefNo: extracted?.ksefNo ?? null,
      documentDate,
      sellerName: extracted?.sellerName ?? null,
      sellerCountry: extracted?.sellerCountry ?? null,
      sellerTaxId: extracted?.sellerTaxId ?? null,
      buyerName: extracted?.buyerName ?? null,
      buyerIsOwn: isOwnBuyer(extracted?.buyerName),
      currency: extracted?.currency ?? null,
      totalAmount: extracted?.totalAmount ?? null,
      orderNumber: extracted?.orderNumber ?? null,
      servicePeriodStart: parseIsoDate(extracted?.servicePeriodStart),
      servicePeriodEnd: parseIsoDate(extracted?.servicePeriodEnd),
      notes: extracted?.notes ?? null,
    };
    const dedupKey = buildDedupKey(fields);
    const fx = await computeFx(fields).catch((err) => {
      console.error('Kur alınamadı:', err);
      return computeFx({});
    });

    const created = await prisma.accountingDocument.create({
      data: {
        store: CURRENT_STORE,
        status: 'draft',
        ...fields,
        ...fx,
        dedupKey,
        aiModel,
        fileUrl: blob.url,
        fileName: file.name,
        fileContentType: contentType,
        fileSize: file.size,
        fileHash,
        lines: {
          create: (extracted?.lines ?? []).map((line, position) => ({
            position,
            description: line.description,
            quantity: line.quantity,
            amount: line.amount,
            isShipping: line.isShipping,
          })),
        },
      },
      include: { lines: true },
    });

    const warnings = await buildWarnings(created, extraWarnings);
    const saved = await prisma.accountingDocument.update({
      where: { id: created.id },
      data: { warnings },
      include: { lines: true },
    });

    return NextResponse.json({ success: true, document: toDto(saved) });
  } catch (error: any) {
    console.error('API /api/belgeler POST Error:', error);
    return fail(500, 'Belge yüklenemedi: ' + (error.message || 'bilinmeyen hata'));
  }
}
