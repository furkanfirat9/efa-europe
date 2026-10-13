import { NextResponse } from 'next/server';
import { getCbrRates } from '@/lib/fx/cbr';
import { getEcbEurPln, getEcbEurUsd } from '@/lib/fx/ecb';
import { getTryRate } from '@/lib/fx/evds';
import { platformCapUsdFor } from '@/lib/pricing/rules';

/**
 * Kâr hesaplama sayfasının kurları; hesabın kendisi tarayıcıda, fiyat önerisiyle aynı kurallarla
 * (src/lib/pricing/rules.ts) yapılır.
 *   eurUsd          ECB (fiyat önerisi alışı bununla dolara çeviriyor)
 *   eurPln          ECB; zł girilen alış (amazon.pl) önce bununla €'ya çevrilir
 *   eurTry, usdTry  TCMB döviz alış (sipariş kârı TL karşılığını bununla buluyor)
 *   plnTry          TCMB zł alış (yoksa TCMB EUR / NBP EUR-PLN çapraz kuru); zł alışın karttan çekilecek TL'si
 *   platformCapUsd  platform hizmetinin 200 ₽ tavanı, CBR kuruyla
 */
export async function GET() {
  try {
    const now = new Date();
    const [ecb, ecbPln, eurTry, usdTry, plnTry, cbr] = await Promise.all([
      getEcbEurUsd(),
      getEcbEurPln(),
      getTryRate('EUR', now),
      getTryRate('USD', now),
      getTryRate('PLN', now).catch(() => null),
      getCbrRates(now).catch(() => null),
    ]);
    if (!eurTry || !usdTry) throw new Error('TCMB kuru alınamadı.');
    return NextResponse.json({
      success: true,
      eurUsd: ecb.rate,
      eurUsdDate: ecb.date,
      eurPln: ecbPln.rate,
      eurTry: eurTry.rate,
      // TCMB zł kuru alınamazsa € kuru üzerinden çapraz hesap (ECB EUR/PLN)
      plnTry: plnTry?.rate ?? eurTry.rate / ecbPln.rate,
      usdTry: usdTry.rate,
      tryDate: usdTry.rateDate.toISOString().slice(0, 10),
      platformCapUsd: platformCapUsdFor(cbr?.USD),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kurlar alınamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status: 502 });
  }
}
