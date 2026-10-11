import { NextResponse } from 'next/server';
import { getCbrRates } from '@/lib/fx/cbr';
import { getEcbEurUsd } from '@/lib/fx/ecb';
import { getTryRate } from '@/lib/fx/evds';
import { platformCapUsdFor } from '@/lib/pricing/rules';

/**
 * Kâr hesaplama sayfasının kurları; hesabın kendisi tarayıcıda, fiyat önerisiyle aynı kurallarla
 * (src/lib/pricing/rules.ts) yapılır.
 *   eurUsd          ECB (fiyat önerisi alışı bununla dolara çeviriyor)
 *   eurTry, usdTry  TCMB döviz alış (sipariş kârı TL karşılığını bununla buluyor)
 *   platformCapUsd  platform hizmetinin 200 ₽ tavanı, CBR kuruyla
 */
export async function GET() {
  try {
    const now = new Date();
    const [ecb, eurTry, usdTry, cbr] = await Promise.all([
      getEcbEurUsd(),
      getTryRate('EUR', now),
      getTryRate('USD', now),
      getCbrRates(now).catch(() => null),
    ]);
    if (!eurTry || !usdTry) throw new Error('TCMB kuru alınamadı.');
    return NextResponse.json({
      success: true,
      eurUsd: ecb.rate,
      eurUsdDate: ecb.date,
      eurTry: eurTry.rate,
      usdTry: usdTry.rate,
      tryDate: usdTry.rateDate.toISOString().slice(0, 10),
      platformCapUsd: platformCapUsdFor(cbr?.USD),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kurlar alınamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status: 502 });
  }
}
