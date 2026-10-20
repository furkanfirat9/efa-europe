import { NextResponse } from 'next/server';
import { topProductsThisMonth } from '@/lib/orders/periodProfit';

export const dynamic = 'force-dynamic';

/** Dashboard "En çok satanlar": bu ayın ilk 5 ürünü, sipariş sayısı ve kârıyla. Yalnız okur. */
export async function GET() {
  try {
    return NextResponse.json({ success: true, ...(await topProductsThisMonth()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'En çok satanlar alınamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status: 500 });
  }
}
