import { NextRequest, NextResponse } from 'next/server';
import { refreshPendingIssues } from '@/lib/efatura/issue';
import { refreshOpenOrderStatuses } from '@/lib/orders/openStatus';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel Cron: Avrupa mağazasının açık siparişlerinin durumunu saatte bir Ozon'dan tazeler
 * (vercel.json). Panel açılmasa da Siparişler, Fatura oluştur ve Belgeler doğru durumu gösterir.
 *
 * Aynı turda kesilen e-Arşiv faturaları da ilerletilir: Belgeler → Satış faturaları'na yazılır,
 * XML'i geç çıkıp yalnız PDF ile kaydedilenlerin XML'i eklenir. İki iş birbirini beklemez;
 * biri hata verse de diğeri çalışır.
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

  const [orders, invoices] = await Promise.allSettled([
    refreshOpenOrderStatuses('store1', { force: true }),
    refreshPendingIssues(),
  ]);
  const reason = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : String(r.reason));

  if (orders.status === 'fulfilled') console.log('[cron/order-status]', JSON.stringify(orders.value));
  else console.error('[cron/order-status] hata:', orders.reason);
  if (invoices.status === 'fulfilled') console.log('[cron/order-status] e-Arşiv:', JSON.stringify(invoices.value));
  else console.error('[cron/order-status] e-Arşiv hata:', invoices.reason);

  if (orders.status === 'rejected') {
    return NextResponse.json(
      { success: false, error: reason(orders) || 'Durumlar tazelenemedi.', invoices: invoices.status === 'fulfilled' ? invoices.value : { error: reason(invoices) } },
      { status: 500 }
    );
  }
  return NextResponse.json({
    success: true,
    ...orders.value,
    invoices: invoices.status === 'fulfilled' ? invoices.value : { error: reason(invoices) },
  });
}
