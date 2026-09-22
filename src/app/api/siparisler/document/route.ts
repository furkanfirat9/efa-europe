import { createHash } from 'node:crypto';
import { after, NextRequest, NextResponse } from 'next/server';
import { del, get, put } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { checkSharedInvoice, IngestError, ingestOrderDocument, READABLE_TYPES } from '@/lib/documents/order-ingest';
import { CURRENT_STORE } from '@/lib/documents/service';

/**
 * Sipariş belgesi (fatura vb.)
 *
 * Dosya Vercel Blob'da private tutulur; veritabanında yalnızca adresi ve
 * meta bilgisi saklanır. Blob adresi istemciye verilmez, dosya bu uç üzerinden
 * token ile okunup aktarılır.
 *
 *   POST   form-data: postingNumber, file, onlyIfEmpty? → yükle / değiştir
 *   GET    ?postingNumber=…                           → dosyayı aç
 *   DELETE ?postingNumber=…                           → sil
 *
 * Yüklenen PDF / görsel, yanıt döndükten sonra arka planda yapay zekâyla okunup
 * Belgeler'e (Alış / Gider) o siparişle birlikte işlenir.
 */

// Arka plandaki okuma (Gemini) birkaç saniye sürer; fonksiyon onun bitmesini bekler.
export const maxDuration = 60;

// Vercel fonksiyonlarında istek gövdesi 4,5 MB ile sınırlı.
const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// Bazı tarayıcılar Office dosyalarında türü boş gönderir; uzantıdan tamamlanır.
const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const resolveType = (file: File) =>
  file.type || TYPE_BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() || ''] || '';

const token = () => process.env.BLOB_READ_WRITE_TOKEN || undefined;

const fail = (status: number, message: string) =>
  NextResponse.json({ success: false, error_message: message }, { status });

function documentFields(order: {
  documentName: string | null;
  documentContentType: string | null;
  documentSize: number | null;
  documentUploadedAt: Date | null;
}) {
  return {
    documentName: order.documentName,
    documentContentType: order.documentContentType,
    documentSize: order.documentSize,
    documentUploadedAt: order.documentUploadedAt,
  };
}

async function deleteBlobQuietly(url: string | null) {
  if (!url) return;
  // Belgeler'e işlenmiş belge aynı dosyayı kullanır; orada duruyorsa dosya silinmez.
  const inUse = await prisma.accountingDocument.count({ where: { fileUrl: url } });
  if (inUse) return;
  try {
    await del(url, { token: token() });
  } catch (err) {
    console.error('Sipariş belgesi blob silinemedi:', url, err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const postingNumber = String(form.get('postingNumber') || '').trim();
    const file = form.get('file');
    const onlyIfEmpty = form.get('onlyIfEmpty') === '1';

    if (!postingNumber) return fail(400, 'Gönderi numarası eksik.');
    if (!(file instanceof File) || file.size === 0) return fail(400, 'Dosya bulunamadı.');
    if (file.size > MAX_BYTES) return fail(413, 'Dosya 4 MB sınırını aşıyor.');
    const contentType = resolveType(file);
    if (!ALLOWED_TYPES.has(contentType)) return fail(415, 'Yalnızca PDF, görsel, Word veya Excel dosyası yüklenebilir.');

    const order = await prisma.ozonOrder.findUnique({
      where: { postingNumber },
      select: { documentUrl: true },
    });
    if (!order) return fail(404, 'Sipariş bulunamadı.');
    // Tarayıcıdaki eski belgeler taşınırken sunucudaki belge ezilmez.
    if (onlyIfEmpty && order.documentUrl) return fail(409, 'Siparişin zaten bir belgesi var.');

    const buffer = Buffer.from(await file.arrayBuffer());

    // Bu dosya Belgeler'de başka bir siparişin faturası olarak zaten varsa: faturadaki
    // ürün adedi yetmiyorsa yükleme reddedilir (yanlış dosya), yetiyorsa kullanıcıya söylenir.
    let notice: string | null = null;
    if (READABLE_TYPES.has(contentType)) {
      const alreadyLinked = await prisma.accountingDocument.count({
        where: { store: CURRENT_STORE, postingNumbers: { has: postingNumber } },
      });
      if (!alreadyLinked) {
        const fileHash = createHash('sha256').update(buffer).digest('hex');
        const shared = await checkSharedInvoice(fileHash, postingNumber);
        if (shared?.blocked) return fail(409, shared.blocked);
        notice = shared?.notice ?? null;
      }
    }

    const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-120) || 'belge';
    const blob = await put(`order-documents/${postingNumber}/${Date.now()}-${safeName}`, buffer, {
      access: 'private',
      contentType,
      token: token(),
    });

    const updated = await prisma.ozonOrder.update({
      where: { postingNumber },
      data: {
        documentUrl: blob.url,
        documentName: file.name,
        documentContentType: contentType,
        documentSize: file.size,
        documentUploadedAt: new Date(),
      },
    });

    // Yeni belge kaydedildikten sonra eskisi kaldırılır; tersi sırada bir hata
    // siparişi belgesiz bırakabilirdi.
    await deleteBlobQuietly(order.documentUrl);

    // Belgeler'e işleme yanıtı bekletmez. Siparişin zaten bir belgesi varsa ya da
    // dosya okunamayan bir türse (Word, Excel) atlanır.
    if (READABLE_TYPES.has(contentType)) {
      after(async () => {
        try {
          const { document, merged } = await ingestOrderDocument(postingNumber);
          console.log(`Sipariş belgesi Belgeler'e işlendi: ${postingNumber} → ${document.id} (${merged ? 'mevcut belgeye eklendi' : document.status})`);
        } catch (err) {
          if (err instanceof IngestError) console.log(`Sipariş belgesi Belgeler'e işlenmedi: ${postingNumber} → ${err.message}`);
          else console.error("Sipariş belgesi Belgeler'e işlenemedi:", postingNumber, err);
        }
      });
    }

    return NextResponse.json({ success: true, notice, ...documentFields(updated) });
  } catch (error: any) {
    console.error('API /api/siparisler/document POST Error:', error);
    return fail(500, 'Belge yüklenemedi: ' + (error.message || 'bilinmeyen hata'));
  }
}

export async function GET(request: NextRequest) {
  try {
    const postingNumber = request.nextUrl.searchParams.get('postingNumber')?.trim();
    if (!postingNumber) return new NextResponse('Gönderi numarası eksik.', { status: 400 });

    const order = await prisma.ozonOrder.findUnique({
      where: { postingNumber },
      select: { documentUrl: true, documentName: true, documentContentType: true },
    });
    if (!order?.documentUrl) return new NextResponse('Bu siparişe ait belge yok.', { status: 404 });

    const result = await get(order.documentUrl, { access: 'private', token: token() });
    if (!result || result.statusCode !== 200) {
      return new NextResponse('Belge depodan okunamadı.', { status: 502 });
    }

    const fileName = order.documentName || 'belge';
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': order.documentContentType || 'application/octet-stream',
        // PDF ve görseller tarayıcıda açılır; RFC 5987 ile Türkçe dosya adı korunur.
        'Content-Disposition': `inline; filename="${fileName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    console.error('API /api/siparisler/document GET Error:', error);
    return new NextResponse('Belge açılamadı: ' + (error.message || 'bilinmeyen hata'), { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const postingNumber = request.nextUrl.searchParams.get('postingNumber')?.trim();
    if (!postingNumber) return fail(400, 'Gönderi numarası eksik.');

    const order = await prisma.ozonOrder.findUnique({
      where: { postingNumber },
      select: { documentUrl: true },
    });
    if (!order) return fail(404, 'Sipariş bulunamadı.');

    await prisma.ozonOrder.update({
      where: { postingNumber },
      data: {
        documentUrl: null,
        documentName: null,
        documentContentType: null,
        documentSize: null,
        documentUploadedAt: null,
      },
    });
    await deleteBlobQuietly(order.documentUrl);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /api/siparisler/document DELETE Error:', error);
    return fail(500, 'Belge silinemedi: ' + (error.message || 'bilinmeyen hata'));
  }
}
