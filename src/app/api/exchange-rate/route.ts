import { NextResponse } from 'next/server';

let cachedRateData: {
  eurBuying: number;   // ForexBuying (EUR Döviz Alış)
  eurSelling: number;  // ForexSelling (EUR Döviz Satış)
  usdBuying: number;   // ForexBuying (USD Döviz Alış)
  usdSelling: number;  // ForexSelling (USD Döviz Satış)
  date: string;
  timestamp: number;
} | null = null;

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 Dakika RAM Önbelleği

export async function GET() {
  try {
    const now = Date.now();
    if (cachedRateData && (now - cachedRateData.timestamp) < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        source: 'cache',
        ...cachedRateData,
      });
    }

    // TCMB XML Çekimi
    const response = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      next: { revalidate: 1800 },
    });

    if (!response.ok) {
      throw new Error(`TCMB API yanıt vermedi: HTTP ${response.status}`);
    }

    const xml = await response.text();

    // Tarih Yakalama: <Tarih_Date Tarih="21.08.2026" ...>
    const dateMatch = xml.match(/<Tarih_Date[^>]*Tarih="([^"]+)"/i);
    const date = dateMatch ? dateMatch[1] : new Date().toLocaleDateString('tr-TR');

    // EUR Bloğu Yakalama: <Currency ... Kod="EUR" ...>...</Currency>
    const eurBlockMatch = xml.match(/<Currency[^>]*Kod="EUR"[^>]*>([\s\S]*?)<\/Currency>/i);
    if (!eurBlockMatch) {
      throw new Error('TCMB XML içerisinde EUR kuru bulunamadı.');
    }

    const eurBlock = eurBlockMatch[1];
    const forexBuyingStr = eurBlock.match(/<ForexBuying>([\d.]+)<\/ForexBuying>/i)?.[1];
    const forexSellingStr = eurBlock.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/i)?.[1];

    const eurBuying = parseFloat(forexBuyingStr || '0');
    const eurSelling = parseFloat(forexSellingStr || '0');

    if (!eurBuying || isNaN(eurBuying)) {
      throw new Error('EUR Döviz Alış kuru ayrıştırılamadı.');
    }

    // USD Bloğu Yakalama: <Currency ... Kod="USD" ...>...</Currency>
    const usdBlockMatch = xml.match(/<Currency[^>]*Kod="USD"[^>]*>([\s\S]*?)<\/Currency>/i);
    let usdBuying = 36.00;
    let usdSelling = 36.10;
    if (usdBlockMatch) {
      const usdBlock = usdBlockMatch[1];
      const usdForexBuyingStr = usdBlock.match(/<ForexBuying>([\d.]+)<\/ForexBuying>/i)?.[1];
      const usdForexSellingStr = usdBlock.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/i)?.[1];
      usdBuying = parseFloat(usdForexBuyingStr || '0') || 36.00;
      usdSelling = parseFloat(usdForexSellingStr || '0') || usdBuying;
    }

    cachedRateData = {
      eurBuying,
      eurSelling: eurSelling || eurBuying,
      usdBuying,
      usdSelling: usdSelling || usdBuying,
      date,
      timestamp: now,
    };

    return NextResponse.json({
      success: true,
      source: 'live',
      eurBuying,
      eurSelling,
      usdBuying,
      usdSelling,
      date,
    });
  } catch (error: any) {
    console.error('TCMB Kur Hatası:', error.message);
    
    if (cachedRateData) {
      return NextResponse.json({
        success: true,
        source: 'stale_cache',
        ...cachedRateData,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'TCMB kurları alınamadı',
        eurBuying: 38.45,
        eurSelling: 38.55,
        usdBuying: 36.00,
        usdSelling: 36.10,
        date: 'Varsayılan',
      },
      { status: 500 }
    );
  }
}
