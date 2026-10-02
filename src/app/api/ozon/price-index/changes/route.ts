import { NextRequest, NextResponse } from 'next/server';
import { loadColorChanges } from '@/lib/pricing/indexHistory';

export const dynamic = 'force-dynamic';

/** Son N günde rengi değişen ürünler ve mağazanın renk dağılımı geçmişi. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const store = searchParams.get('store') === 'store2' ? 'store2' : 'store1';
  const days = Math.min(Math.max(Number(searchParams.get('days')) || 14, 1), 180);
  try {
    return NextResponse.json({ success: true, store, days, ...(await loadColorChanges(store, days)) });
  } catch (error: any) {
    console.error('Price index changes error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Değişimler alınamadı.' }, { status: 500 });
  }
}
