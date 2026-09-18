import { NextRequest, NextResponse } from 'next/server';
import { getLSStocks } from '@/lib/fulfillment/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pageSize = Number(searchParams.get('pageSize')) || 100;
    const pageToken = searchParams.get('pageToken') || undefined;

    const stocks = await getLSStocks(pageSize, pageToken);

    return NextResponse.json({
      success: true,
      stocks: stocks.items || [],
      page_next_token: stocks.page_next_token,
    });
  } catch (error: any) {
    console.error('API /fulfillment/stocks Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Stoklar alınamadı.' },
      { status: 500 }
    );
  }
}
