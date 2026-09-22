import { NextRequest, NextResponse } from 'next/server';
import { IngestError, ingestOrderDocument } from '@/lib/documents/order-ingest';
import { toDto } from '@/lib/documents/service';

/**
 * POST { postingNumber } → siparişe yüklenmiş alış faturasını okuyup Belgeler'e işler.
 *
 * Siparişler sayfasında yüklenen belge zaten arka planda okunur; bu uç, o okuma
 * başarısız olduğunda ya da eski yüklemeler için elle çalıştırılır. Uyarısız okunan
 * belge doğrudan onaylanır. Aynı dosya listede zaten varsa sipariş o belgeye
 * eklenir ve yanıtta `merged: true` döner.
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

    const { document, merged } = await ingestOrderDocument(postingNumber.trim());
    return NextResponse.json({ success: true, merged, document: toDto(document) });
  } catch (error: any) {
    if (error instanceof IngestError) return fail(error.status, error.message, error.extra);
    console.error('API /api/belgeler/siparis Error:', error);
    return fail(500, 'Sipariş belgesi alınamadı: ' + (error.message || 'bilinmeyen hata'));
  }
}
