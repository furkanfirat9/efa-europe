/**
 * Rusya Merkez Bankası (CBR) günlük kurları, 1 birimin ₽ karşılığı.
 *
 * Ozon Global sipariş günündeki CBR kuruyla çeviriyor: euro tarifeli kargo tam CBR EUR kuruyla
 * rubleye (42703766-0246-1: 15,30 € × 100,5693 = 1.538,71 ₽), satıcının dolar fiyatı CBR USD × ~1,005 ile.
 * `date_req` istenen günde geçerli kuru verir (hafta sonu ve tatilde son belirlenen kur).
 * cbr.ru'ya ulaşılamazsa cbr-xml-daily.ru aynası denenir; o yalnızca kur belirlenen günleri tutar.
 */

export interface CbrRates {
  USD: number;
  EUR: number;
}

const LOOKBACK_DAYS = 7;
const cache = new Map<string, CbrRates>();

const pad = (n: number) => String(n).padStart(2, '0');

/** Moskova (UTC+3) takvim günü */
function mskDay(date: Date): Date {
  const local = new Date(date.getTime() + 3 * 3600 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

async function fromCbr(day: Date): Promise<CbrRates | null> {
  const req = `${pad(day.getUTCDate())}/${pad(day.getUTCMonth() + 1)}/${day.getUTCFullYear()}`;
  const res = await fetch(`https://www.cbr.ru/scripts/XML_daily.asp?date_req=${req}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const xml = await res.text();
  const rate = (code: string) => {
    const m = xml.match(new RegExp(`<CharCode>${code}</CharCode>[\\s\\S]*?<Nominal>(\\d+)</Nominal>[\\s\\S]*?<Value>([\\d,]+)</Value>`));
    return m ? Number(m[2].replace(',', '.')) / Number(m[1]) : NaN;
  };
  const USD = rate('USD');
  const EUR = rate('EUR');
  return USD > 0 && EUR > 0 ? { USD, EUR } : null;
}

async function fromMirror(day: Date): Promise<CbrRates | null> {
  for (let i = 0; i <= LOOKBACK_DAYS; i++) {
    const d = new Date(day.getTime() - i * 86_400_000);
    const url = `https://www.cbr-xml-daily.ru/archive/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/daily_json.js`;
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (res.status === 404) continue;
    if (!res.ok) return null;
    const data = await res.json();
    const USD = Number(data?.Valute?.USD?.Value) / (Number(data?.Valute?.USD?.Nominal) || 1);
    const EUR = Number(data?.Valute?.EUR?.Value) / (Number(data?.Valute?.EUR?.Nominal) || 1);
    return USD > 0 && EUR > 0 ? { USD, EUR } : null;
  }
  return null;
}

/** Verilen günde (Moskova saati) geçerli CBR kurları; alınamazsa null. */
export async function getCbrRates(date: Date): Promise<CbrRates | null> {
  const day = mskDay(date);
  const key = day.toISOString().slice(0, 10);
  const hit = cache.get(key);
  if (hit) return hit;

  let rates: CbrRates | null = null;
  try {
    rates = await fromCbr(day);
  } catch {
    // Aynaya geç.
  }
  if (!rates) {
    try {
      rates = await fromMirror(day);
    } catch {
      rates = null;
    }
  }
  if (rates) cache.set(key, rates);
  return rates;
}
