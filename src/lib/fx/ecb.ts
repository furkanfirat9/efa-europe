/**
 * Avrupa Merkez Bankası (ECB) günlük EUR/USD referans kuru.
 *
 * Amazon alış fiyatı Euro, Ozon satış fiyatı dolar olduğu için avcı fiyatı
 * `Amazon € × ECB kuru × OZON_PRICE_MULTIPLIER` ile hesaplar. Eskiden kur yerine sabit 1,15 kullanılıyordu;
 * kur ondan uzaklaştıkça çarpan kayıyordu.
 *
 * ECB kuru iş günlerinde ~16:00 CET'te bir kez yayımlar; hafta sonu son iş gününün kuru
 * geçerlidir. Bu yüzden birkaç saat önbellekte tutulması yeterli.
 */

const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const TTL_MS = 3 * 60 * 60 * 1000;

export interface EcbRate {
  /** 1 EUR kaç birim (USD ya da PLN) */
  rate: number;
  /** Kurun ECB'deki tarihi (YYYY-MM-DD) */
  date: string;
}

let cache: { at: number; xml: string; date: string } | null = null;

async function getEcbRate(currency: 'USD' | 'PLN'): Promise<EcbRate> {
  if (!cache || Date.now() - cache.at >= TTL_MS) {
    const res = await fetch(ECB_DAILY_URL, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`ECB kuru alınamadı (HTTP ${res.status}).`);
    const xml = await res.text();
    const date = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
    if (!date) throw new Error('ECB kuru okunamadı.');
    cache = { at: Date.now(), xml, date };
  }
  const rate = Number(cache.xml.match(new RegExp(`currency=['"]${currency}['"]\\s+rate=['"]([\\d.]+)['"]`))?.[1]);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`ECB ${currency} kuru okunamadı.`);
  return { rate, date: cache.date };
}

export const getEcbEurUsd = () => getEcbRate('USD');
/** 1 EUR kaç PLN: amazon.pl fiyatlarını Amazon.de ile karşılaştırmak için */
export const getEcbEurPln = () => getEcbRate('PLN');
