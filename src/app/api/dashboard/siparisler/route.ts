import { NextRequest, NextResponse } from 'next/server';
import { DAILY_ORDER_TARGET } from '@/lib/dashboard/targets';
import { loadOrderPulse } from '@/lib/dashboard/orderPulse';
import { OzonRateLimitError } from '@/lib/ozon/gate';

export const dynamic = 'force-dynamic';

/** Dashboard: günlük sipariş sayısı ve sipariş durumları (src/lib/dashboard/orderPulse.ts). Yalnız okur. */
export async function GET(request: NextRequest) {
  try {
    const pulse = await loadOrderPulse({ force: request.nextUrl.searchParams.get('yenile') === '1' });
    return NextResponse.json({ success: true, target: DAILY_ORDER_TARGET, ...pulse });
  } catch (error) {
    const limited = error instanceof OzonRateLimitError;
    const message = limited
      ? 'Ozon istek sınırına takıldı, biraz sonra yeniden denenecek.'
      : error instanceof Error
        ? error.message
        : 'Siparişler alınamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status: limited ? 429 : 500 });
  }
}
