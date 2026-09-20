/* --------------------------------------------------------------------------
   Ozon istek sırası — tüm panelin tek kapısı.

   Ozon seller-api'de saniyede en fazla 2 istek kabul ediyor ve bu sınır
   endpoint başına değil, Client-Id başına uygulanıyor. Panel ise tek bir
   sayfa açılışında günlük analitik + sipariş listesi + SKU analitiği +
   ürün bilgisi çağrılarını aynı anda gönderiyordu; sınır kaçınılmaz olarak
   aşılıyordu. Artık bütün çağrılar mağaza bazlı tek bir kuyruktan geçiyor
   ve aralarında sabit bir boşluk bırakılıyor.

   Kuyruk bu modülün içinde yaşıyor: analitik ucu da, sipariş çekme ucu da
   aynı modülü içe aktardığı için aynı mağaza tek bir şeridi paylaşır. Her
   uç kendi sınırlayıcısını yazsaydı iki bağımsız kapı aynı Client-Id'yi
   döver ve sınır yine aşılırdı.
-------------------------------------------------------------------------- */

export const BASE_URL = process.env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

export type OzonStore = 'store1' | 'store2';

export function getOzonHeaders(store: OzonStore = 'store1'): Record<string, string> {
  if (store === 'store2') {
    const clientId = process.env.OZON_STORE_2_CLIENT_ID || process.env.OZON_CLIENT_ID || '';
    const apiKey = process.env.OZON_STORE_2_API_KEY || process.env.OZON_API_KEY || '';
    return {
      'Client-Id': clientId,
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    };
  }

  const clientId = process.env.OZON_CLIENT_ID || '';
  const apiKey = process.env.OZON_API_KEY || '';
  return {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  };
}

/** İki isteğin başlangıcı arasındaki en kısa süre (~1,5 istek/sn). */
const MIN_REQUEST_GAP_MS = 650;
const MAX_RATE_LIMIT_RETRIES = 5;

/**
 * Ölçüm: /v1/analytics/data çağrısı tek başına ~4 saniye sürüyor ve üst üste
 * bindirildiğinde Ozon bunları kendi tarafında kuyruğa alıp yanıtı 4 → 6 → 8
 * saniyeye çıkarıyor, bazen de reddediyor. Bu yüzden aynı anda uçuşta olan
 * ağır analitik çağrısı sayısı 1 ile sınırlandırılıyor; ucuz uçlar (sipariş listesi 135ms,
 * ürün bilgisi) yalnızca hız sınırına tabi.
 */
const MAX_CONCURRENT_ANALYTICS = 1;

interface RequestLane {
  /** Bir sonraki isteğin başlayabileceği en erken an. */
  nextSlot: number;
  /** 429 sonrası tüm kuyruğun beklediği an. */
  pausedUntil: number;
  /** Uçuştaki ağır analitik çağrıları. */
  heavyInFlight: number;
  /** Yer açıldığında uyandırılacak bekleyenler. */
  heavyWaiters: (() => void)[];
}

const requestLanes = new Map<string, RequestLane>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function laneFor(clientId: string): RequestLane {
  let lane = requestLanes.get(clientId);
  if (!lane) {
    lane = { nextSlot: 0, pausedUntil: 0, heavyInFlight: 0, heavyWaiters: [] };
    requestLanes.set(clientId, lane);
  }
  return lane;
}

/**
 * Sınır "aynı anda tek istek" değil, "saniyede iki istek". Bu yüzden istekler
 * uçuşta üst üste binebilir; kısıtlanan yalnızca başlama anları. Tam seri
 * çalıştırmak her çağrının gidiş-dönüş süresini de sıraya eklediği için
 * sayfayı gereksiz yere saniyelerce bekletiyordu.
 */
async function schedule<T>(lane: RequestLane, heavy: boolean, task: () => Promise<T>): Promise<T> {
  if (heavy) {
    while (lane.heavyInFlight >= MAX_CONCURRENT_ANALYTICS) {
      await new Promise<void>((resolve) => lane.heavyWaiters.push(resolve));
    }
    lane.heavyInFlight++;
  }

  try {
    const startAt = Math.max(Date.now(), lane.nextSlot, lane.pausedUntil);
    lane.nextSlot = startAt + MIN_REQUEST_GAP_MS;

    const wait = startAt - Date.now();
    if (wait > 0) await sleep(wait);
    return await task();
  } finally {
    if (heavy) {
      lane.heavyInFlight--;
      lane.heavyWaiters.shift()?.();
    }
  }
}

export class OzonRateLimitError extends Error {
  constructor() {
    super(
      'Ozon saniyede en fazla 2 istek kabul ediyor. İstekler sıraya alındı ama sınır yine de aşıldı — birkaç saniye sonra tekrar deneyin.'
    );
    this.name = 'OzonRateLimitError';
  }
}

/**
 * Ozon'a giden tek kapı. Kuyruğa girer, 429 / code 8 durumunda üstel geri
 * çekilmeyle yeniden dener ve geri çekilme süresince tüm kuyruğu duraklatır.
 */
export async function ozonFetch<T = any>(
  path: string,
  body: unknown,
  headers: Record<string, string>
): Promise<T> {
  const lane = laneFor(headers['Client-Id'] || 'default');
  const heavy = path.startsWith('/v1/analytics');

  for (let attempt = 0; ; attempt++) {
    const res = await schedule(lane, heavy, () =>
      fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        cache: 'no-store',
      })
    );

    if (res.ok) return (await res.json()) as T;

    const errText = await res.text();
    const rateLimited =
      res.status === 429 || errText.includes('rate limit exceeded') || errText.includes('"code":8');

    if (rateLimited && attempt < MAX_RATE_LIMIT_RETRIES) {
      // Jitter, aynı anda sıraya girmiş çağrıların yeniden denemede tekrar
      // çakışmasını engeller.
      const backoff = Math.round(1200 * 2 ** attempt + Math.random() * 500);
      lane.pausedUntil = Date.now() + backoff;
      console.warn(`[Ozon] ${path} sınıra takıldı, ${backoff}ms sonra tekrar denenecek (deneme ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES}).`);
      continue;
    }

    if (rateLimited) throw new OzonRateLimitError();
    throw new Error(`Ozon API hatası [${res.status}] ${path}: ${errText.slice(0, 300)}`);
  }
}
