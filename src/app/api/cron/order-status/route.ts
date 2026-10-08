import { NextRequest, NextResponse } from 'next/server';
import { refreshOpenOrderStatuses } from '@/lib/orders/openStatus';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel Cron: Avrupa mağazasının açık siparişlerinin durumunu saatte bir Ozon'dan tazeler
 * (vercel.json). Panel açılmasa da Siparişler, Fatura oluştur ve Belgeler doğru durumu gösterir.
 *
 * Panelin giriş kapısı (src/proxy.ts) /api/cron/ adreslerini geçirir; kapıyı burada CRON_SECRET tutar.
 * Vercel cron isteğine `Authorization: Bearer <CRON_SECRET>` başlığını kendisi ekler.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET tanımlı değil.' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Yetkisiz.' }, { status: 401 });
  }

  try {
    const result = await refreshOpenOrderStatuses('store1', { force: true });
    console.log('[cron/order-status]', JSON.stringify(result));
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[cron/order-status] hata:', error);
    return NextResponse.json({ success: false, error: error.message || 'Durumlar tazelenemedi.' }, { status: 500 });
  }
}
