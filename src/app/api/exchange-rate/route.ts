import { NextRequest, NextResponse } from 'next/server';

let cachedRateData: {
  eurBuying: number;
  eurSelling: number;
  usdBuying: number;
  usdSelling: number;
  date: string;
  timestamp: number;
} | null = null;

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 Dakika RAM Önbelleği

function parseTcmbXml(xml: string) {
  const dateMatch = xml.match(/<Tarih_Date[^>]*Tarih="([^"]+)"/i);
  const date = dateMatch ? dateMatch[1] : '';

  // EUR
  const eurBlockMatch = xml.match(/<Currency[^>]*Kod="EUR"[^>]*>([\s\S]*?)<\/Currency>/i);
  let eurBuying = 0;
  let eurSelling = 0;
  if (eurBlockMatch) {
    const eurBlock = eurBlockMatch[1];
    eurBuying = parseFloat(eurBlock.match(/<ForexBuying>([\d.]+)<\/ForexBuying>/i)?.[1] || '0');
    eurSelling = parseFloat(eurBlock.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/i)?.[1] || '0') || eurBuying;
  }

  // USD
  const usdBlockMatch = xml.match(/<Currency[^>]*Kod="USD"[^>]*>([\s\S]*?)<\/Currency>/i);
  let usdBuying = 0;
  let usdSelling = 0;
  if (usdBlockMatch) {
    const usdBlock = usdBlockMatch[1];
    usdBuying = parseFloat(usdBlock.match(/<ForexBuying>([\d.]+)<\/ForexBuying>/i)?.[1] || '0');
    usdSelling = parseFloat(usdBlock.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/i)?.[1] || '0') || usdBuying;
  }

  return { date, eurBuying, eurSelling, usdBuying, usdSelling };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedDate = searchParams.get('date'); // YYYY-MM-DD

    const now = Date.now();

    // Tarih belirtilmemişse ve taze önbellek varsa doğrudan dön
    if (!requestedDate && cachedRateData && (now - cachedRateData.timestamp) < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        source: 'cache',
        ...cachedRateData,
      });
    }

    // Belirli bir tarih istenmişse (örn: ay sonu veya geçmiş gün)
    if (requestedDate) {
      // YYYY-MM-DD -> DDMMYYYY ve YYYYMM
      const parts = requestedDate.split('-');
      if (parts.length === 3) {
        let curDate = new Date(`${requestedDate}T12:00:00Z`);

        // Tatil veya hafta sonuysa son iş gününü bulana kadar en fazla 5 gün geriye git
        for (let attempt = 0; attempt < 5; attempt++) {
          const y = curDate.getUTCFullYear();
          const m = String(curDate.getUTCMonth() + 1).padStart(2, '0');
          const d = String(curDate.getUTCDate()).padStart(2, '0');
          const url = `https://www.tcmb.gov.tr/kurlar/${y}${m}/${d}${m}${y}.xml`;

          try {
            const res = await fetch(url, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              next: { revalidate: 86400 },
            });

            if (res.ok) {
              const xml = await res.text();
              const parsed = parseTcmbXml(xml);
              if (parsed.usdBuying > 0) {
                return NextResponse.json({
                  success: true,
                  source: 'historical',
                  requestedDate,
                  effectiveDate: `${d}.${m}.${y}`,
                  ...parsed,
                });
              }
            }
          } catch {
            // Devam et
          }

          // 1 gün geriye git
          curDate = new Date(curDate.getTime() - 24 * 60 * 60 * 1000);
        }
      }
    }

    // Bugünün canlı TCMB kuru
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
    const parsed = parseTcmbXml(xml);

    if (!parsed.usdBuying || parsed.usdBuying === 0) {
      throw new Error('TCMB XML içerisinde USD kuru bulunamadı.');
    }

    cachedRateData = {
      ...parsed,
      timestamp: now,
    };

    return NextResponse.json({
      success: true,
      source: 'live',
      ...parsed,
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
        eurBuying: 55.80,
        eurSelling: 55.90,
        usdBuying: 48.60,
        usdSelling: 48.70,
        date: new Date().toLocaleDateString('tr-TR'),
      },
      { status: 500 }
    );
  }
}
