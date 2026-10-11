import { NextResponse } from 'next/server';
import { periodProfits } from '@/lib/orders/periodProfit';

export const dynamic = 'force-dynamic';

/** Dashboard kâr kartı: bugün / bu hafta / bu ay sipariş kârı (src/lib/orders/periodProfit.ts). Yalnız okur. */
export async function GET() {
  try {
    return NextResponse.json({ success: true, ...(await periodProfits()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kâr hesaplanamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status: 500 });
  }
}
