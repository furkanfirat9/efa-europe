import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const future = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    const url = `https://xapi.ozon.ru/exchange-rates/sellers/exchange-rate/by-period?fromCurrencyIds=USD&fromCurrencyIds=EUR&fromCurrencyIds=CNY&toCurrencyId=RUB&marketplaceId=1&fromDate=${encodeURIComponent(
      past.toISOString()
    )}&toDate=${encodeURIComponent(future.toISOString())}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json',
        Origin: 'https://global-help.ozon.com',
        Referer: 'https://global-help.ozon.com/',
      },
      next: { revalidate: 300 }, // 5 dakika önbellek
    });

    if (!res.ok) {
      throw new Error(`Ozon kur servisi yanıt vermedi [HTTP ${res.status}]`);
    }

    const data = await res.json();
    const today: Record<string, { rate: number; rawRate: number; fromDate: string; toDate: string }> = {};

    for (const g of data.exchangeRatesTimelines || []) {
      const timeline = g.timeline || [];
      if (timeline.length > 0) {
        const latest = timeline[timeline.length - 1];
        today[g.fromCurrencyId.toLowerCase()] = {
          rate: Number(latest.exchangeRate.rateWithAdjustment.toFixed(4)),
          rawRate: Number(latest.exchangeRate.rate.toFixed(4)),
          fromDate: latest.fromDate,
          toDate: latest.toDate,
        };
      }
    }

    return NextResponse.json({
      success: true,
      today,
      timelines: data.exchangeRatesTimelines || [],
    });
  } catch (error: any) {
    console.error('Ozon exchange rates API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Ozon döviz kurları alınamadı.',
      },
      { status: 500 }
    );
  }
}

