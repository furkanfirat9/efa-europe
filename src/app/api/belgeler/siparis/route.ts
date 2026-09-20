import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { extractDocument, type ExtractedDocument } from '@/lib/documents/extract';
import { CURRENT_STORE, isOtherStoreBuyer, saveExtractedDocument, toDto } from '@/lib/documents/service';

/**
 * POST { postingNumber } → siparişe yüklenmiş alış faturasını okuyup Belgeler
 * listesine taslak olarak ekler.
 *
 * Dosya kopyalanmaz: siparişin blob adresi paylaşılır (fileShared), böylece belge
 * silinse de siparişin faturası yerinde kalır.
 */

export const maxDuration = 60;

const fail = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error_message: message, ...extra }, { status });

export async function POST(request: NextRequest) {
  try {
    const { postingNumber } = await request.json();
    if (typeof postingNumber !== 'string' || !postingNumber.trim()) {
      return fail(400, 'Gönderi numarası gerekli.');
    }

    const order = await prisma.ozonOrder.findUnique({
      where: { postingNumber: postingNumber.trim() },
      select: { postingNumber: true, documentUrl: true, documentName: true, documentContentType: true, documentSize: true },
    });
    if (!order?.documentUrl) return fail(404, 'Siparişe yüklenmiş belge bulunamadı.');

    const already = await prisma.accountingDocument.findFirst({
      where: { store: CURRENT_STORE, postingNumber: order.postingNumber },
      select: { id: true },
    });
    if (already) return fail(409, 'Bu siparişin belgesi zaten listede.', { existingId: already.id });

    const blobResult = await get(order.documentUrl, {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN || undefined,
    });
    if (!blobResult || blobResult.statusCode !== 200) return fail(502, 'Belge depodan okunamadı.');

    const buffer = Buffer.from(await new Response(blobResult.stream).arrayBuffer());
    const fileHash = createHash('sha256').update(buffer).digest('hex');
    const contentType = order.documentContentType || 'application/pdf';

    const sameFile = await prisma.accountingDocument.findUnique({
      where: { store_fileHash: { store: CURRENT_STORE, fileHash } },
      select: { id: true },
    });
    if (sameFile) return fail(409, 'Bu dosya zaten listede.', { existingId: sameFile.id });

    let extracted: ExtractedDocument | null = null;
    let aiModel: string | null = null;
    const extraWarnings: string[] = [];
    try {
      const result = await extractDocument({ base64: buffer.toString('base64'), mimeType: contentType });
      extracted = result.data;
      aiModel = result.model;
    } catch (err: any) {
      console.error('Sipariş belgesi okunamadı:', err);
      extraWarnings.push('Belge otomatik okunamadı; bilgileri elle doldurun.');
    }

    if (isOtherStoreBuyer(extracted?.buyerName)) {
      return fail(422, `Bu belge diğer mağazaya ait (alıcı: ${extracted?.buyerName}).`);
    }
    if (extracted?.uncertainFields.length) {
      extraWarnings.push(`Emin olunamayan alanlar: ${extracted.uncertainFields.join(', ')}.`);
    }

    const saved = await saveExtractedDocument({
      extracted,
      aiModel,
      extraWarnings,
      postingNumber: order.postingNumber,
      file: {
        url: order.documentUrl,
        name: order.documentName || 'belge',
        contentType,
        size: order.documentSize ?? buffer.length,
        hash: fileHash,
        shared: true,
      },
    });

    return NextResponse.json({ success: true, document: toDto(saved) });
  } catch (error: any) {
    console.error('API /api/belgeler/siparis Error:', error);
    return fail(500, 'Sipariş belgesi alınamadı: ' + (error.message || 'bilinmeyen hata'));
  }
}
