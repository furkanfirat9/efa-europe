import { NextRequest, NextResponse } from 'next/server';
import { loadProductHistory } from '@/lib/pricing/indexHistory';

export const dynamic = 'force-dynamic';

/** Tek ürünün endeks ve fiyat geçmişi. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const store = searchParams.get('store') === 'store2' ? 'store2' : 'store1';
  const productId = searchParams.get('productId');
  if (!productId) return NextResponse.json({ success: false, error: 'productId gerekli.' }, { status: 400 });
  try {
    return NextResponse.json({ success: true, store, productId, ...(await loadProductHistory(store, productId)) });
  } catch (error: any) {
    console.error('Price index history error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Geçmiş alınamadı.' }, { status: 500 });
  }
}
