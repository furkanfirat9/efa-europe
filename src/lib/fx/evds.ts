/**
 * Belgelerin TL karşılığı için TCMB kuru (EVDS).
 *
 * Kural: fatura tarihinde geçerli olan kur, yani bir önceki iş günü 15:30'da ilan
 * edilip fatura günü Resmi Gazete'de yayımlanan kur. EVDS kurları tam olarak bu
 * geçerlilik gününe göre tarihler (Cuma ilan edilen kur Pazartesi tarihlidir), bu
 * yüzden fatura tarihindeki EVDS değeri doğrudan kullanılır. Hafta sonu ve tatilde
 * değer boş gelir; o durumda geriye doğru ilk dolu gün alınır.
 *
 *   EUR, USD → TCMB döviz alış (ForexBuying)
 *   PLN      → TCMB bilgi amaçlı kur; alınamazsa NBP EUR/PLN ile çapraz kur
 */

const EVDS_BASE = 'https://evds3.tcmb.gov.tr/igmevdsms-dis';
const LOOKBACK_DAYS = 10;

const SERIES: Record<string, { code: string; source: string }> = {
  EUR: { code: 'TP.DK.EUR.A', source: 'TCMB döviz alış' },
  USD: { code: 'TP.DK.USD.A', source: 'TCMB döviz alış' },
  PLN: { code: 'TP.DK.PLN', source: 'TCMB bilgi amaçlı kur' },
};

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'PLN', 'TRY'] as const;

export interface FxResult {
  rate: number;
  /** Kurun ait olduğu (geçerli olduğu) gün */
  rateDate: Date;
  source: string;
}

type Point = { date: Date; value: number };

const cache = new Map<string, Point | null>();

const pad = (n: number) => String(n).padStart(2, '0');
const toEvdsDate = (d: Date) => `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/** "18-09-2026" → UTC gece yarısı */
function parseEvdsDate(s: string): Date {
  const [d, m, y] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Verilen günde ya da öncesindeki ilk dolu EVDS değeri. */
async function evdsValueOnOrBefore(series: string, date: Date): Promise<Point | null> {
  const key = `${series}:${toIsoDate(date)}`;
  if (cache.has(key)) return cache.get(key)!;

  const apiKey = process.env.EVDS_API_KEY?.trim();
  if (!apiKey) throw new Error('EVDS_API_KEY tanımlı değil.');

  const url = `${EVDS_BASE}/series=${series}&startDate=${toEvdsDate(addDays(date, -LOOKBACK_DAYS))}&endDate=${toEvdsDate(date)}&type=json`;
  const res = await fetch(url, { headers: { key: apiKey }, cache: 'no-store' });
  if (!res.ok) throw new Error(`EVDS yanıt vermedi (HTTP ${res.status}).`);
  const data = await res.json();

  const field = series.replace(/\./g, '_');
  const points: Point[] = (data?.items ?? [])
    .map((item: Record<string, string | null>) => ({
      date: parseEvdsDate(String(item.Tarih)),
      value: item[field] === null || item[field] === undefined ? NaN : Number(item[field]),
    }))
    .filter((p: Point) => Number.isFinite(p.value) && p.value > 0 && p.date <= date)
    .sort((a: Point, b: Point) => a.date.getTime() - b.date.getTime());

  const point = points.at(-1) ?? null;
  // Geçmiş günlerin kuru değişmez; bugünün boş sonucu önbelleğe alınmaz.
  if (point || date < addDays(new Date(), -1)) cache.set(key, point);
  return point;
}

/** NBP (Polonya Merkez Bankası) EUR/PLN ortalama kuru, verilen gün ya da öncesi. */
async function nbpEurPlnOnOrBefore(date: Date): Promise<Point | null> {
  const url = `https://api.nbp.pl/api/exchangerates/rates/a/eur/${toIsoDate(addDays(date, -LOOKBACK_DAYS))}/${toIsoDate(date)}/?format=json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  const rates: { effectiveDate: string; mid: number }[] = data?.rates ?? [];
  const last = rates.filter((r) => r.mid > 0).at(-1);
  return last ? { date: new Date(`${last.effectiveDate}T00:00:00Z`), value: last.mid } : null;
}

/**
 * Belge tarihinde geçerli TL kuru. Desteklenmeyen para biriminde ya da kur
 * bulunamazsa null döner; çağıran taraf belgeyi kursuz kaydedip uyarı gösterir.
 */
export async function getTryRate(currency: string, documentDate: Date): Promise<FxResult | null> {
  const code = currency.toUpperCase();
  if (code === 'TRY') return { rate: 1, rateDate: documentDate, source: 'TL' };

  const series = SERIES[code];
  if (!series) return null;

  const point = await evdsValueOnOrBefore(series.code, documentDate);
  if (point) return { rate: point.value, rateDate: point.date, source: series.source };

  if (code === 'PLN') {
    const [eur, eurPln] = await Promise.all([
      evdsValueOnOrBefore(SERIES.EUR.code, documentDate),
      nbpEurPlnOnOrBefore(documentDate),
    ]);
    if (eur && eurPln) {
      return {
        rate: Math.round((eur.value / eurPln.value) * 1e6) / 1e6,
        rateDate: eur.date,
        source: 'Çapraz kur (TCMB EUR alış / NBP EUR-PLN)',
      };
    }
  }
  return null;
}
