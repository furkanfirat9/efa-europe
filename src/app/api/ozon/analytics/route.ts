import { NextRequest, NextResponse } from 'next/server';
import { syncOzonOrdersToDb } from '@/lib/db/orders';

const BASE_URL = process.env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';


function getOzonHeaders(store: 'store1' | 'store2' = 'store1') {
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

function getOrderStatusName(status: string): string {
  switch (status) {
    case 'awaiting_packaging':
      return 'Paketleme Bekliyor';
    case 'awaiting_deliver':
    case 'awaiting_registration':
      return 'Sevkiyat Bekliyor';
    case 'delivering':
    case 'driver_pickup':
      return 'Kargoda';
    case 'delivered':
      return 'Teslim Edildi';
    case 'cancelled':
      return 'İptal Edildi';
    default:
      return status || 'İşleniyor';
  }
}

// 30 Saniyelik Önbellek
interface CacheEntry {
  timestamp: number;
  data: any;
}
const analyticsCache: Record<string, CacheEntry> = {};

/**
 * Ozon analitiği zaten saatlik tazelikte; 30 saniyelik önbellek mağazalar
 * arasında gidip gelirken her seferinde ~4 saniyelik çağrıları yeniden
 * yaptırıyor ve kotayı tüketiyordu. Yenile butonu force_refresh gönderdiği
 * için taze veri her zaman bir tık uzakta.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/* --------------------------------------------------------------------------
   Ozon istek sırası.

   Ozon seller-api'de saniyede en fazla 2 istek kabul ediyor ve bu sınır
   endpoint başına değil, Client-Id başına uygulanıyor. Panel ise tek bir
   sayfa açılışında günlük analitik + sipariş listesi + SKU analitiği +
   ürün bilgisi çağrılarını aynı anda gönderiyordu; sınır kaçınılmaz olarak
   aşılıyordu. Artık bütün çağrılar mağaza bazlı tek bir kuyruktan geçiyor
   ve aralarında sabit bir boşluk bırakılıyor.
-------------------------------------------------------------------------- */

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
async function ozonFetch<T = any>(
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

/**
 * Doğrudan Analitikten Dönen SKU Listesi İçin Görsel ve Model Kodlarını %100 Çeker
 */
interface ProductInfo {
  offerId: string;
  primaryImage: string;
  name: string;
}

/**
 * Ürün adı/görseli nadiren değişir; mağaza değiştirip geri dönüldüğünde
 * aynı SKU'ları tekrar sormak boşuna istek harcıyordu.
 */
const productInfoCache = new Map<string, { at: number; value: ProductInfo }>();
const PRODUCT_INFO_TTL_MS = 15 * 60 * 1000;

async function enrichSkusWithProductInfo(skuIds: (number | string)[], headers: Record<string, string>) {
  if (!skuIds || skuIds.length === 0) return {};
  const numericSkus = Array.from(new Set(skuIds.map((s) => Number(s)).filter((n) => !isNaN(n) && n > 0)));
  if (numericSkus.length === 0) return {};

  const clientId = headers['Client-Id'] || 'default';
  const infoMap: Record<string, ProductInfo> = {};
  const now = Date.now();

  const remember = (sku: string | number | undefined, entry: ProductInfo) => {
    if (sku === undefined || sku === null || sku === '') return;
    infoMap[String(sku)] = entry;
    productInfoCache.set(`${clientId}:${sku}`, { at: now, value: entry });
  };

  // Önbellekte tazesi olanlar istekten düşülür.
  const missing = numericSkus.filter((sku) => {
    const cached = productInfoCache.get(`${clientId}:${sku}`);
    if (cached && now - cached.at < PRODUCT_INFO_TTL_MS) {
      infoMap[String(sku)] = cached.value;
      return false;
    }
    return true;
  });

  // 50'lik paketler 100 SKU için bile iki ayrı istek demekti; endpoint tek
  // seferde çok daha fazlasını kabul ediyor ve her istek kotadan yiyor.
  const chunkSize = 500;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    try {
      const json = await ozonFetch<any>('/v3/product/info/list', { sku: chunk }, headers);
      (json.items || []).forEach((item: any) => {
        const primaryImg =
          (Array.isArray(item.primary_image) ? item.primary_image[0] : item.primary_image) ||
          (Array.isArray(item.images) ? item.images[0] : item.images) ||
          '';
        const entry: ProductInfo = {
          offerId: item.offer_id || '',
          primaryImage: primaryImg,
          name: item.name || '',
        };
        remember(item.sku, entry);
        remember(item.id, entry);
        remember(item.offer_id, entry);
      });
    } catch (err) {
      // Ürün bilgisi eksikliği sayfayı çökertmez; ad/görsel boş kalır.
      console.warn('SKU info fetch error:', err);
    }
  }

  return infoMap;
}

/** Ozon posting kaydını panelin sipariş modeline çevirir. */
function formatPostings(postings: any[], catalog: Record<string, ProductInfo>) {
  return (postings || []).map((p: any) => {
    let orderTotal = 0;
    const products = (p.products || []).map((prod: any) => {
      const itemPrice = Math.round(Number(prod.price || 0));
      const qty = Number(prod.quantity || 1);
      orderTotal += itemPrice * qty;
      const skuStr = String(prod.sku || '');
      const catalogEntry = catalog[skuStr];

      return {
        sku: skuStr,
        offerId: prod.offer_id || catalogEntry?.offerId || '',
        name: prod.name || catalogEntry?.name || 'Ürün',
        price: itemPrice,
        quantity: qty,
        currency: prod.currency_code || 'USD',
        primaryImage: catalogEntry?.primaryImage || '',
      };
    });

    const customerName = p.customer?.name || p.addressee?.name || '';
    const customerCity = p.customer?.address?.city || p.analytics_data?.city || '';
    const customerRegion = p.customer?.address?.region || p.analytics_data?.region || '';

    let lat: number | undefined = undefined;
    let lng: number | undefined = undefined;
    const rawLat = p.customer?.address?.latitude ?? p.analytics_data?.latitude;
    const rawLng = p.customer?.address?.longitude ?? p.analytics_data?.longitude;
    if (rawLat !== undefined && rawLat !== null && rawLat !== '') {
      const parsed = Number(rawLat);
      if (Number.isFinite(parsed)) lat = parsed;
    }
    if (rawLng !== undefined && rawLng !== null && rawLng !== '') {
      const parsed = Number(rawLng);
      if (Number.isFinite(parsed)) lng = parsed;
    }

    return {
      postingNumber: p.posting_number || '',
      orderId: String(p.order_id || p.order_number || ''),
      status: p.status || '',
      statusName: getOrderStatusName(p.status),
      inProcessAt: p.in_process_at || p.created_at || p.shipment_date || '',
      shipmentDate: p.shipment_date || '',
      totalPrice: orderTotal,
      currency: p.products?.[0]?.currency_code || 'USD',
      customerCity,
      customerRegion,
      customerName,
      customerAddressTail: p.customer?.address?.address_tail || '',
      deliveryType: p.analytics_data?.delivery_type || '',
      paymentType: p.analytics_data?.payment_type_group_name || '',
      warehouse: p.analytics_data?.warehouse || '',
      tplProvider: p.analytics_data?.tpl_provider || '',
      latitude: lat,
      longitude: lng,
      products,
    };
  });
}

const FULL_DAY_METRICS = [
  'hits_view_search',      // 0
  'hits_view_pdp',         // 1
  'hits_view',             // 2
  'session_view',          // 3
  'session_view_search',   // 4
  'session_view_pdp',      // 5
  'hits_tocart',           // 6
  'conv_tocart',           // 7
  'conv_tocart_search',    // 8
  'conv_tocart_pdp',       // 9
  'ordered_units',         // 10
  'revenue',               // 11
  'position_category',     // 12
];

/** Analitik servisi çağrısı; kuyruk ve yeniden deneme ozonFetch içinde. */
function fetchOzonAnalyticsWithRetry(payload: any, headers: Record<string, string>): Promise<any> {
  return ozonFetch('/v1/analytics/data', payload, headers);
}

/**
 * Gerçek Siparişleri (FBS + FBO) Çeker ve Saatlik / Günlük Dağılımını Hesaplar
 */
async function fetchRealOrders(dateFrom: string, dateTo: string, headers: Record<string, string>, store: string = 'store1') {
  try {
    // Moskova / Türkiye yerel saat dilimi (UTC+3) başlangıç ve bitişi
    const sinceISO = new Date(`${dateFrom}T00:00:00+03:00`).toISOString();
    const toISO = new Date(`${dateTo}T23:59:59.999+03:00`).toISOString();

    const postings: any[] = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const json = await ozonFetch<any>(
        '/v3/posting/fbs/list',
        {
          dir: 'DESC',
          filter: { since: sinceISO, to: toISO },
          limit: pageSize,
          offset,
          with: {
            analytics_data: true,
            financial_data: true,
          },
        },
        headers
      );

      const batch = json.result?.postings || [];
      postings.push(...batch);

      if (!json.result?.has_next || batch.length === 0 || postings.length >= 2500) {
        break;
      }

      offset += batch.length;
    }

    // Arka planda DB'ye kaydet / senkronize et
    if (postings.length > 0) {
      syncOzonOrdersToDb(postings, store).catch((err) =>
        console.warn(`[DB Sync] ${store} siparişleri kaydedilirken hata:`, err)
      );
    }


    // 24 Saatlik Dağılım (UTC+3)
    const hourly = Array.from({ length: 24 }).map((_, h) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      orders: 0,
      revenue: 0,
      date: dateFrom,
    }));

    // Günlük Dağılım Map
    const dailyMap: Record<string, { orders: number; revenue: number }> = {};

    let totalOrders = 0;
    let totalRevenue = 0;

    postings.forEach((p: any) => {
      if (p.status === 'cancelled') return;

      const dateStr = p.in_process_at || p.created_at || p.shipment_date;
      if (!dateStr) return;

      const d = new Date(dateStr);
      // Moskova ve Türkiye saat dilimi (UTC+3)
      const localTime = new Date(d.getTime() + 3 * 3600 * 1000);
      const localHour = localTime.getUTCHours();

      const year = localTime.getUTCFullYear();
      const month = String(localTime.getUTCMonth() + 1).padStart(2, '0');
      const dayNum = String(localTime.getUTCDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${dayNum}`;

      // Yalnızca seçili tarih aralığına (yerel gün bazında) uyan siparişleri dahil et
      if (dayKey < dateFrom || dayKey > dateTo) return;

      // Fiyat hesabı
      let orderPrice = 0;
      if (p.financial_data?.products) {
        orderPrice = p.financial_data.products.reduce((acc: number, prod: any) => acc + Number(prod.price || 0), 0);
      } else if (p.products) {
        orderPrice = p.products.reduce((acc: number, prod: any) => acc + Number(prod.price || 0), 0);
      }

      totalOrders += 1;
      totalRevenue += orderPrice;

      // Saatlik ekle (dateFrom gününe ait olanlar)
      if (dayKey === dateFrom && hourly[localHour]) {
        hourly[localHour].orders += 1;
        hourly[localHour].revenue += orderPrice;
      }

      // Günlük ekle
      if (!dailyMap[dayKey]) {
        dailyMap[dayKey] = { orders: 0, revenue: 0 };
      }
      dailyMap[dayKey].orders += 1;
      dailyMap[dayKey].revenue += orderPrice;
    });

    return { postings, totalOrders, totalRevenue, hourly, dailyMap, failed: false };
  } catch (err) {
    // Sınıra takılmayı yutmak, ekranda "sipariş yok" yazdırıyordu; bu bir
    // hata değil boş veri gibi göründüğü için en yanıltıcı davranıştı.
    if (err instanceof OzonRateLimitError) throw err;
    console.warn('Real orders fetch error:', err);
    return { postings: [], totalOrders: 0, totalRevenue: 0, hourly: [], dailyMap: {}, failed: true };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      date_from,
      date_to,
      store = 'store1',
      limit = 50,
      mode = 'all', // 'all' | 'summary' | 'products'
      force_refresh = false,
    } = body;

    const today = new Date();
    const localNow = new Date(today.getTime() + 3 * 3600 * 1000);
    const defaultTo = localNow.toISOString().split('T')[0];
    const defaultFrom = new Date(localNow.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const dateFrom = date_from || defaultFrom;
    const dateTo = date_to || defaultTo;

    const cacheKey = `${store}_${dateFrom}_${dateTo}_${limit}_${mode}`;

    // Önbellek kontrolü
    if (!force_refresh && analyticsCache[cacheKey]) {
      const entry = analyticsCache[cacheKey];
      if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return NextResponse.json(entry.data);
      }
    }

    const headers = getOzonHeaders(store);
    if (!headers['Client-Id'] || !headers['Api-Key']) {
      return NextResponse.json(
        { error: `${store === 'store2' ? 'Türkiye' : 'Avrupa'} mağazası için API Key veya Client ID tanımlı değil (.env.local kontrol edin)` },
        { status: 400 }
      );
    }

    /* --- MODE: ORDERS ---
       Arka plan yenilemesi için hafif uç. Yalnızca sipariş listesini çeker
       (~135ms) ve ürün bilgisini önbellekten karşılar; ~4 saniyelik analitik
       çağrısına hiç dokunmaz, böylece dakikada bir yoklamak ucuz kalır. */
    if (mode === 'orders') {
      const realOrdersData = await fetchRealOrders(dateFrom, dateTo, headers, store);

      const orderSkuIds: (number | string)[] = [];
      (realOrdersData.postings || []).forEach((p: any) => {
        (p.products || []).forEach((prod: any) => {
          if (prod.sku) orderSkuIds.push(prod.sku);
        });
      });

      const catalog = await enrichSkusWithProductInfo(orderSkuIds, headers);

      const payload = {
        success: true,
        store,
        dateRange: { from: dateFrom, to: dateTo },
        recentOrders: formatPostings(realOrdersData.postings || [], catalog),
        hourlyOrders: realOrdersData.hourly || [],
        totalOrders: realOrdersData.totalOrders,
        totalRevenue: realOrdersData.totalRevenue,
        updatedAt: new Date().toISOString(),
      };

      analyticsCache[cacheKey] = { timestamp: Date.now(), data: payload };
      return NextResponse.json(payload);
    }

    // --- MODE: SUMMARY ---
    if (mode === 'summary') {
      const dayPayload = {
        date_from: dateFrom,
        date_to: dateTo,
        metrics: FULL_DAY_METRICS,
        dimension: ['day'],
        limit: 100,
      };

      const [dayJson, realOrdersData] = await Promise.all([
        fetchOzonAnalyticsWithRetry(dayPayload, headers),
        fetchRealOrders(dateFrom, dateTo, headers, store),
      ]);

      const totals = dayJson.result?.totals || [];
      const realTotalOrders = realOrdersData.totalOrders > 0 ? realOrdersData.totalOrders : (totals[10] || 0);
      const realTotalRevenue = realOrdersData.totalRevenue > 0 ? realOrdersData.totalRevenue : (totals[11] || 0);

      // Günlük kırılım aynı istekten geliyor; trend grafiği için ek çağrı gerekmez.
      const summaryDays = (dayJson.result?.data || []).map((d: any) => {
        const dayKey = d.dimensions?.[0]?.id || '';
        const realDay = realOrdersData.dailyMap?.[dayKey];

        return {
          date: dayKey,
          hitsViewSearch: d.metrics?.[0] || 0,
          hitsViewPdp: d.metrics?.[1] || 0,
          hitsViewTotal: d.metrics?.[2] || 0,
          sessionView: d.metrics?.[3] || 0,
          sessionViewSearch: d.metrics?.[4] || 0,
          sessionViewPdp: d.metrics?.[5] || 0,
          hitsToCart: d.metrics?.[6] || 0,
          convToCart: d.metrics?.[7] || 0,
          convToCartSearch: d.metrics?.[8] || 0,
          convToCartPdp: d.metrics?.[9] || 0,
          orderedUnits: realDay ? realDay.orders : d.metrics?.[10] || 0,
          revenue: realDay ? realDay.revenue : d.metrics?.[11] || 0,
          positionCategory: d.metrics?.[12] ? Number(d.metrics[12].toFixed(1)) : 0,
        };
      });

      const summary = {
        hitsViewSearch: totals[0] || 0,
        hitsViewPdp: totals[1] || 0,
        hitsViewTotal: totals[2] || 0,
        sessionView: totals[3] || 0,
        sessionViewSearch: totals[4] || 0,
        sessionViewPdp: totals[5] || 0,
        hitsToCart: totals[6] || 0,
        convToCart: totals[7] ? Number(totals[7].toFixed(2)) : 0,
        convToCartSearch: totals[8] ? Number(totals[8].toFixed(2)) : 0,
        convToCartPdp: totals[9] ? Number(totals[9].toFixed(2)) : 0,
        orderedUnits: realTotalOrders,
        revenue: realTotalRevenue,
        avgPositionCategory: totals[12] ? Number(totals[12].toFixed(1)) : 0,
        ctrPdp: totals[0] > 0 ? Number(((totals[1] / totals[0]) * 100).toFixed(2)) : 0,
      };

      const orderSkuIds: (number | string)[] = [];
      (realOrdersData.postings || []).forEach((p: any) => {
        (p.products || []).forEach((prod: any) => {
          if (prod.sku) orderSkuIds.push(prod.sku);
        });
      });
      const orderCatalogMap = await enrichSkusWithProductInfo(orderSkuIds, headers);

      const recentOrders = formatPostings(realOrdersData.postings || [], orderCatalogMap);

      const payload = {
        success: true,
        store,
        dateRange: { from: dateFrom, to: dateTo },
        summary,
        days: summaryDays,
        hourlyOrders: realOrdersData.hourly || [],
        recentOrders,
        updatedAt: new Date().toISOString(),
      };

      analyticsCache[cacheKey] = { timestamp: Date.now(), data: payload };
      return NextResponse.json(payload);
    }

    // --- MODE: PRODUCTS ---
    if (mode === 'products') {
      const skuPayload = {
        date_from: dateFrom,
        date_to: dateTo,
        metrics: [
          'hits_view_search',
          'hits_view_pdp',
          'hits_tocart',
          'conv_tocart',
          'ordered_units',
          'revenue',
          'position_category',
        ],
        dimension: ['sku'],
        sort: [{ key: 'hits_view_pdp', order: 'DESC' }],
        limit: limit || 100,
      };

      const skuJson = await fetchOzonAnalyticsWithRetry(skuPayload, headers);
      const skuData = skuJson.result?.data || [];
      const rawSkuIds = skuData.map((s: any) => s.dimensions?.[0]?.id).filter(Boolean);

      const catalogMap = await enrichSkusWithProductInfo(rawSkuIds, headers);

      const formattedSkus = skuData.map((s: any) => {
        const skuId = String(s.dimensions?.[0]?.id || '');
        const catalogEntry = catalogMap[skuId];

        return {
          sku: skuId,
          name: catalogEntry?.name || s.dimensions?.[0]?.name || 'İsimsiz Ürün',
          offerId: catalogEntry?.offerId || '',
          primaryImage: catalogEntry?.primaryImage || '',
          hitsViewSearch: s.metrics?.[0] || 0,
          hitsViewPdp: s.metrics?.[1] || 0,
          hitsToCart: s.metrics?.[2] || 0,
          convToCart: s.metrics?.[3] ? Number(s.metrics[3].toFixed(2)) : 0,
          orderedUnits: s.metrics?.[4] || 0,
          revenue: s.metrics?.[5] || 0,
          positionCategory: s.metrics?.[6] ? Number(s.metrics[6].toFixed(1)) : 0,
        };
      });

      const payload = {
        success: true,
        store,
        dateRange: { from: dateFrom, to: dateTo },
        topProducts: formattedSkus,
        updatedAt: new Date().toISOString(),
      };

      analyticsCache[cacheKey] = { timestamp: Date.now(), data: payload };
      return NextResponse.json(payload);
    }

    // --- MODE: ALL ---
    const dayPayload = {
      date_from: dateFrom,
      date_to: dateTo,
      metrics: FULL_DAY_METRICS,
      dimension: ['day'],
      limit: 100,
    };

    const skuPayload = {
      date_from: dateFrom,
      date_to: dateTo,
      metrics: [
        'hits_view_search',
        'hits_view_pdp',
        'hits_tocart',
        'conv_tocart',
        'ordered_units',
        'revenue',
        'position_category',
      ],
      dimension: ['sku'],
      sort: [{ key: 'hits_view_pdp', order: 'DESC' }],
      limit: limit || 100,
    };

    const [dayJson, skuJson, realOrdersData] = await Promise.all([
      fetchOzonAnalyticsWithRetry(dayPayload, headers),
      fetchOzonAnalyticsWithRetry(skuPayload, headers).catch(() => ({ result: { data: [] } })),
      fetchRealOrders(dateFrom, dateTo, headers, store),
    ]);

    const dayData = dayJson.result?.data || [];
    const totals = dayJson.result?.totals || [];
    const skuData = skuJson.result?.data || [];
    const postings = realOrdersData.postings || [];

    // Hem analitik hem de sipariş ürünlerinin SKU'larını birleştirip tek seferde görsel/model çekelim
    const analyticsSkuIds = skuData.map((s: any) => s.dimensions?.[0]?.id).filter(Boolean);
    const orderSkuIds: (number | string)[] = [];
    postings.forEach((p: any) => {
      (p.products || []).forEach((prod: any) => {
        if (prod.sku) orderSkuIds.push(prod.sku);
      });
    });

    const allSkuIds = Array.from(new Set([...analyticsSkuIds, ...orderSkuIds]));
    const catalogMap = await enrichSkusWithProductInfo(allSkuIds, headers);

    const formattedDays = dayData.map((d: any) => {
      const dayKey = d.dimensions?.[0]?.id || '';
      const realDay = realOrdersData.dailyMap?.[dayKey];

      return {
        date: dayKey,
        hitsViewSearch: d.metrics?.[0] || 0,
        hitsViewPdp: d.metrics?.[1] || 0,
        hitsViewTotal: d.metrics?.[2] || 0,
        sessionView: d.metrics?.[3] || 0,
        sessionViewSearch: d.metrics?.[4] || 0,
        sessionViewPdp: d.metrics?.[5] || 0,
        hitsToCart: d.metrics?.[6] || 0,
        convToCart: d.metrics?.[7] || 0,
        convToCartSearch: d.metrics?.[8] || 0,
        convToCartPdp: d.metrics?.[9] || 0,
        orderedUnits: realDay ? realDay.orders : d.metrics?.[10] || 0,
        revenue: realDay ? realDay.revenue : d.metrics?.[11] || 0,
        positionCategory: d.metrics?.[12] ? Number(d.metrics[12].toFixed(1)) : 0,
      };
    });

    const formattedSkus = skuData.map((s: any) => {
      const skuId = String(s.dimensions?.[0]?.id || '');
      const catalogEntry = catalogMap[skuId];

      return {
        sku: skuId,
        name: catalogEntry?.name || s.dimensions?.[0]?.name || 'İsimsiz Ürün',
        offerId: catalogEntry?.offerId || '',
        primaryImage: catalogEntry?.primaryImage || '',
        hitsViewSearch: s.metrics?.[0] || 0,
        hitsViewPdp: s.metrics?.[1] || 0,
        hitsToCart: s.metrics?.[2] || 0,
        convToCart: s.metrics?.[3] ? Number(s.metrics[3].toFixed(2)) : 0,
        orderedUnits: s.metrics?.[4] || 0,
        revenue: s.metrics?.[5] || 0,
        positionCategory: s.metrics?.[6] ? Number(s.metrics[6].toFixed(1)) : 0,
      };
    });

    // Gelen Siparişlerin Zenginleştirilmesi
    const formattedRecentOrders = formatPostings(postings, catalogMap);

    const realTotalOrders = realOrdersData.totalOrders > 0 ? realOrdersData.totalOrders : (totals[10] || 0);
    const realTotalRevenue = realOrdersData.totalRevenue > 0 ? realOrdersData.totalRevenue : (totals[11] || 0);

    const summary = {
      hitsViewSearch: totals[0] || 0,
      hitsViewPdp: totals[1] || 0,
      hitsViewTotal: totals[2] || 0,
      sessionView: totals[3] || 0,
      sessionViewSearch: totals[4] || 0,
      sessionViewPdp: totals[5] || 0,
      hitsToCart: totals[6] || 0,
      convToCart: totals[7] ? Number(totals[7].toFixed(2)) : 0,
      convToCartSearch: totals[8] ? Number(totals[8].toFixed(2)) : 0,
      convToCartPdp: totals[9] ? Number(totals[9].toFixed(2)) : 0,
      orderedUnits: realTotalOrders,
      revenue: realTotalRevenue,
      avgPositionCategory: totals[12] ? Number(totals[12].toFixed(1)) : 0,
      ctrPdp: totals[0] > 0 ? Number(((totals[1] / totals[0]) * 100).toFixed(2)) : 0,
    };

    const responsePayload = {
      success: true,
      store,
      dateRange: { from: dateFrom, to: dateTo },
      summary,
      days: formattedDays,
      hourlyOrders: realOrdersData.hourly || [],
      topProducts: formattedSkus,
      recentOrders: formattedRecentOrders,
      updatedAt: new Date().toISOString(),
    };

    analyticsCache[cacheKey] = { timestamp: Date.now(), data: responsePayload };
    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error('Analytics API Route Error:', error);

    if (error instanceof OzonRateLimitError) {
      return NextResponse.json({ error: error.message, retryable: true }, { status: 429 });
    }

    return NextResponse.json(
      { error: error.message || 'Analitik verileri alınırken sunucu hatası oluştu' },
      { status: 500 }
    );
  }
}
