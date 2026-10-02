import type { ArbitrageOrder, OzonOrder, Prisma, ProductSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { calculateFulfillmentCosts, calculateShippingCosts } from '@/lib/calculator/profitCalculator';
import { getCbrRates, type CbrRates } from '@/lib/fx/cbr';
import { getTryRate } from '@/lib/fx/evds';
import { getOzonHeaders, ozonFetch } from '@/lib/ozon/gate';
import { shippingWeight, type WeightSource } from '@/lib/pricing/rules';

/**
 * Sipariş kârı (Avrupa mağazası, store1).
 *
 *   net kâr $ = satış $ − Ozon kesintileri $ − LS depo ücreti $ − alış ₺ ÷ (USD/TRY)
 *   net kâr ₺ = net kâr $ × (USD/TRY)
 *
 * Ozon kesintileri:
 *  - Tahakkuk ettiyse (teslimattan sonra, `/v1/finance/accrual/postings`) Ozon'un gerçek tutarları.
 *    Ruble tutarlar siparişin kendi kuruyla (satıcı fiyatı ₽ ÷ satıcı fiyatı $) dolara çevrilir.
 *  - Etmediyse tarifeden tahmin: komisyon + platform hizmeti (%2, en fazla 200 ₽) + aracılık (%0,33) satış
 *    fiyatından, kargo LS Economy PL tarifesinden (10,30 € + 2,50 € × başlanan her 500 g). Tarifeyi LS teyit etti.
 *    Ruble tavanı ve kargo, Ozon'un yaptığı gibi sipariş günündeki CBR kuruyla çevrilir (src/lib/fx/cbr.ts).
 * Aracı banka (acquiring) gönderiye değil sipariş numarasına, sipariş günü kesilir; o günün tahakkuklarından
 * bulunur. Oran ödeme yöntemine göre değiştiği için bulunamazsa %1 varsayılır.
 * LS depo ücreti (kabul + sevk + paket) LS'nin aylık faturasıyla gelir, Ozon'da görünmez; hep tahmindir.
 * TL ↔ $ çevrimi sipariş günündeki TCMB döviz alış kurlarıyla yapılır. Eskiden sabit 48,35 ₺/$
 * ile yalnızca alış ve %5 komisyon düşülüyordu; kargo ve depo atlandığı için kâr olduğundan yüksek çıkıyordu.
 */

export const OZON_GLOBAL_FEES = {
  /** Ozon komisyonu tahakkuk etmeden finansal veride oran yoksa */
  defaultCommissionPct: 0.05,
  /** "Электронная услуга подключения к логистической Платформе Ozon" (tahakkuk tipi 123), gönderi başına en fazla 200 ₽ */
  platformPct: 0.02,
  platformCapRub: 200,
  /** "Услуги по заключению договора на организацию международной перевозки" (tahakkuk tipi 122);
   *  tek tahakkuktan çıkarıldı: 42703766-0246-1'de 21,82 ₽ = 6.613 ₽ × %0,33 */
  intermediaryPct: 0.0033,
  /** Ozon satıcının dolar fiyatını CBR USD kurunun bu katıyla rubleye çeviriyor (6.613 ₽ ÷ 76 $ = 87,013; CBR 86,5857) */
  saleRateFactor: 1.005,
  /** Aracı banka tahakkuku bulunamazsa. Gerçekte ödeme yöntemine göre değişiyor:
   *  СБП %0,49 (42703766-0246), Ozon Bank %1,90 (18047692-0554), müşterinin ödediği tutardan. */
  defaultAcquiringPct: 0.01,
} as const;

/** Gönderi tahakkuk tipleri (`/v1/finance/accrual/postings`) */
const ACCRUAL = { delivery: 67, sale: 69, intermediary: 122, platform: 123 } as const;
/** Aracı banka (Эквайринг). Gönderiye değil sipariş numarasına, sipariş günü yazılır (`/v1/finance/accrual/by-day`). */
const ACQUIRING_TYPE = 1;

/** Kesintisi tahakkuk etmemiş sipariş Ozon'a en fazla bu sıklıkla sorulur. */
const PROFIT_RECHECK_MS = 6 * 60 * 60 * 1000;

export type ProfitSource = 'ozon' | 'estimate';

export interface OrderProfitBreakdown {
  saleUsd: number;
  commissionUsd: number;
  /** Platform hizmeti + aracılık */
  ozonServicesUsd: number;
  shippingUsd: number;
  /** Tahakkukta ayrıca tanınmayan diğer Ozon kalemleri (iade, düzeltme vb.) */
  otherOzonUsd: number;
  /** Aracı banka (acquiring) */
  acquiringUsd: number;
  /** Ozon'un kestiği aracı banka tutarı (₽); bulunamadıysa null ve acquiringUsd tahmindir */
  acquiringRub: number | null;
  depotUsd: number;
  buyTry: number;
  buyUsd: number;
  netProfitUsd: number;
  netProfitTry: number;
  /** Kargo ve depo ücretinin dayandığı paketli ağırlık; bilinmiyorsa ikisi de 0 */
  weightG: number | null;
  weightSource: WeightSource | 'ls-order' | null;
  usdTry: number;
  eurUsd: number;
  /** Kurların ait olduğu gün (YYYY-MM-DD) */
  rateDate: string;
  /** Tahakkuktan: Ozon'un bu sipariş için kullandığı ₽/$ */
  ozonRubPerUsd: number | null;
}

type Accrual = { type_id: number; accrued: { amount: string }; seller_price?: { amount: string } | null };

interface OrderProduct {
  sku?: number | string;
  offer_id?: string;
  price?: string | number;
  quantity?: number;
}

interface FinancialProduct {
  price?: number;
  quantity?: number;
  commission_percent?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function fetchAccruals(postingNumbers: string[]): Promise<Map<string, Accrual[]>> {
  const out = new Map<string, Accrual[]>();
  const headers = getOzonHeaders('store1');
  for (let i = 0; i < postingNumbers.length; i += 200) {
    const res = await ozonFetch<{ posting_accruals?: { posting_number: string; accruals: Accrual[] }[] }>(
      '/v1/finance/accrual/postings',
      { posting_numbers: postingNumbers.slice(i, i + 200) },
      headers
    );
    for (const p of res.posting_accruals ?? []) out.set(p.posting_number, p.accruals ?? []);
  }
  return out;
}

interface ByDayAccrual {
  unit_number?: string;
  item_fees?: { fees?: { sku: number; fees?: { type_id: number; accrued: { amount: string } }[] }[] } | null;
}

/** Sipariş numarası → SKU bazında aracı banka kesintileri (₽, pozitif), verilen günlerin tahakkuklarından. */
async function fetchAcquiring(days: string[]): Promise<Map<string, { sku: number; rub: number }[]>> {
  const out = new Map<string, { sku: number; rub: number }[]>();
  const headers = getOzonHeaders('store1');
  for (const date of days) {
    let lastId = '';
    do {
      const res = await ozonFetch<{ accruals?: ByDayAccrual[]; last_id?: string }>(
        '/v1/finance/accrual/by-day',
        { date, last_id: lastId },
        headers
      );
      for (const a of res.accruals ?? []) {
        if (!a.unit_number) continue;
        for (const item of a.item_fees?.fees ?? []) {
          for (const fee of item.fees ?? []) {
            if (fee.type_id !== ACQUIRING_TYPE) continue;
            const list = out.get(a.unit_number) ?? [];
            list.push({ sku: Number(item.sku), rub: -Number(fee.accrued.amount) });
            out.set(a.unit_number, list);
          }
        }
      }
      lastId = res.last_id ?? '';
    } while (lastId);
  }
  return out;
}

/** "42703766-0246-1" → "42703766-0246" */
const orderNumberOf = (postingNumber: string) => postingNumber.replace(/-\d+$/, '');

/** Siparişin Moskova günü ve ertesi gün (tahakkuk gece yarısını geçebilir), YYYY-MM-DD */
function acquiringDays(date: Date): string[] {
  const msk = new Date(date.getTime() + 3 * 3600 * 1000);
  return [msk, new Date(msk.getTime() + 86_400_000)].map((d) => d.toISOString().slice(0, 10));
}

interface OrderRates {
  usdTry: number;
  /** TCMB çapraz kuru; CBR alınamazsa kargo bununla çevrilir */
  eurUsd: number;
  rateDate: string;
  /** Sipariş günündeki CBR kurları (₽); alınamazsa null */
  cbr: CbrRates | null;
}

/** Sipariş günündeki TCMB ve CBR kurları; aynı gün için bir kez sorulur. CBR alınamazsa hesap TCMB ile sürer. */
async function ratesFor(date: Date, memo: Map<string, Promise<OrderRates>>) {
  const key = date.toISOString().slice(0, 10);
  if (!memo.has(key)) {
    memo.set(
      key,
      Promise.all([getTryRate('USD', date), getTryRate('EUR', date), getCbrRates(date).catch(() => null)]).then(
        ([usd, eur, cbr]) => {
          if (!usd || !eur) throw new Error(`${key} için TCMB kuru bulunamadı.`);
          return { usdTry: usd.rate, eurUsd: eur.rate / usd.rate, rateDate: usd.rateDate.toISOString().slice(0, 10), cbr };
        }
      )
    );
  }
  return memo.get(key)!;
}

/** Paketli ağırlık: ürünlerin tedarik kaydındaki ağırlığı (paket payıyla), yoksa LS'ye bildirilen ağırlık. */
function orderWeight(
  products: OrderProduct[],
  sources: Map<string, ProductSource>,
  lsOrder: ArbitrageOrder | undefined
): { grams: number; source: OrderProfitBreakdown['weightSource'] } | null {
  let total = 0;
  let source: WeightSource | null = null;
  for (const p of products) {
    const s = p.offer_id ? sources.get(p.offer_id) : undefined;
    const w = shippingWeight(s?.amzItemWeightG ?? null, s?.amzPackageWeightG ?? null, null);
    if (!w.grams) {
      total = 0;
      break;
    }
    total += w.grams * (p.quantity || 1);
    source = w.source;
  }
  if (total > 0) return { grams: total, source };
  if (lsOrder?.weightGr) return { grams: lsOrder.weightGr, source: 'ls-order' };
  return null;
}

function computeProfit(
  order: OzonOrder,
  accruals: Accrual[] | undefined,
  weight: ReturnType<typeof orderWeight>,
  rates: OrderRates,
  acquiringRub: number | null
): { breakdown: OrderProfitBreakdown; source: ProfitSource } {
  const saleUsd = Number(order.totalPrice) || 0;
  const buyTry = Number(order.buyPrice) || 0;
  const weightG = weight?.grams ?? null;
  const depotUsd = weightG ? calculateFulfillmentCosts(weightG).totalFulfillment * rates.eurUsd : 0;

  let commissionUsd: number;
  let ozonServicesUsd: number;
  let shippingUsd: number;
  let otherOzonUsd = 0;
  let ozonRubPerUsd: number | null = null;
  let source: ProfitSource = 'estimate';

  const list = accruals ?? [];
  const has = (id: number) => list.some((a) => a.type_id === id);
  const sellerRub = list
    .filter((a) => a.type_id === ACCRUAL.sale)
    .reduce((s, a) => s + Number(a.seller_price?.amount || 0), 0);

  if (has(ACCRUAL.sale) && has(ACCRUAL.delivery) && sellerRub > 0 && saleUsd > 0) {
    source = 'ozon';
    ozonRubPerUsd = sellerRub / saleUsd;
    const costUsd = (ids: number[] | null) =>
      list
        .filter((a) => (ids ? ids.includes(a.type_id) : !Object.values(ACCRUAL).includes(a.type_id as never)))
        .reduce((s, a) => s - Number(a.accrued.amount), 0) / ozonRubPerUsd!;
    commissionUsd = costUsd([ACCRUAL.sale]);
    shippingUsd = costUsd([ACCRUAL.delivery]);
    ozonServicesUsd = costUsd([ACCRUAL.platform, ACCRUAL.intermediary]);
    otherOzonUsd = costUsd(null);
  } else {
    const fin = ((order.financialDataJson as { products?: FinancialProduct[] } | null)?.products ?? []);
    const commissionFromOzon = fin.reduce(
      (s, p) => s + (Number(p.price) || 0) * (p.quantity || 1) * (Number(p.commission_percent) || 0) / 100,
      0
    );
    commissionUsd = commissionFromOzon > 0 ? commissionFromOzon : saleUsd * OZON_GLOBAL_FEES.defaultCommissionPct;

    // Ozon'un çevrimi: kargo € × CBR EUR → ₽, ₽ → $ satıcı kuruyla (CBR USD × 1,005).
    ozonRubPerUsd = rates.cbr ? rates.cbr.USD * OZON_GLOBAL_FEES.saleRateFactor : null;
    const platformUsd = saleUsd * OZON_GLOBAL_FEES.platformPct;
    ozonServicesUsd =
      (ozonRubPerUsd ? Math.min(platformUsd, OZON_GLOBAL_FEES.platformCapRub / ozonRubPerUsd) : platformUsd) +
      saleUsd * OZON_GLOBAL_FEES.intermediaryPct;

    const tariffEur = weightG ? calculateShippingCosts(weightG).totalShipping : 0;
    shippingUsd = rates.cbr && ozonRubPerUsd ? (tariffEur * rates.cbr.EUR) / ozonRubPerUsd : tariffEur * rates.eurUsd;
  }

  const acquiringUsd =
    acquiringRub !== null && ozonRubPerUsd ? acquiringRub / ozonRubPerUsd : saleUsd * OZON_GLOBAL_FEES.defaultAcquiringPct;

  const buyUsd = buyTry / rates.usdTry;
  const netProfitUsd =
    saleUsd - commissionUsd - ozonServicesUsd - shippingUsd - otherOzonUsd - acquiringUsd - depotUsd - buyUsd;

  return {
    source,
    breakdown: {
      saleUsd: round2(saleUsd),
      commissionUsd: round2(commissionUsd),
      ozonServicesUsd: round2(ozonServicesUsd),
      shippingUsd: round2(shippingUsd),
      otherOzonUsd: round2(otherOzonUsd),
      acquiringUsd: round2(acquiringUsd),
      acquiringRub: acquiringRub !== null && ozonRubPerUsd ? round2(acquiringRub) : null,
      depotUsd: round2(depotUsd),
      buyTry: round2(buyTry),
      buyUsd: round2(buyUsd),
      netProfitUsd: round2(netProfitUsd),
      netProfitTry: round2(netProfitUsd * rates.usdTry),
      weightG,
      weightSource: weight?.source ?? null,
      usdTry: rates.usdTry,
      eurUsd: Math.round(rates.eurUsd * 1e4) / 1e4,
      rateDate: rates.rateDate,
      ozonRubPerUsd: ozonRubPerUsd ? Math.round(ozonRubPerUsd * 1e4) / 1e4 : null,
    },
  };
}

/**
 * Alış fiyatı girilmiş siparişlerin kârını yeniden hesaplayıp yazar. `checkOzon` ise önce Ozon'a
 * tahakkuk sorulur; gelmişse kâr kesinleşir ('ozon') ve bir daha sorulmaz.
 * Kuru alınamayan sipariş atlanır (eski değeri yerinde kalır), sonraki turda yeniden denenir.
 * Dönen sayı güncellenen sipariş adedidir.
 */
export async function recalcOrderProfits(orders: OzonOrder[], { checkOzon }: { checkOzon: boolean }): Promise<number> {
  const targets = orders.filter((o) => Number(o.buyPrice) > 0 && Number(o.totalPrice) > 0 && o.currency === 'USD');
  if (targets.length === 0) return 0;

  const toCheck = checkOzon ? targets.filter((o) => o.status !== 'cancelled').map((o) => o.postingNumber) : [];
  let accruals = new Map<string, Accrual[]>();
  let checkedAt: Date | undefined;
  if (toCheck.length) {
    try {
      accruals = await fetchAccruals(toCheck);
      checkedAt = new Date();
    } catch (err) {
      // Ozon'a ulaşılamazsa tahminle devam edilir; işaret konmadığı için sonraki turda yeniden sorulur.
      console.warn('[Kâr] Ozon tahakkukları alınamadı:', err instanceof Error ? err.message : err);
    }
  }

  // Aracı banka sipariş günü kesilir ve değişmez: bir kez bulunduysa önceki dökümden alınır.
  const knownAcquiring = (o: OzonOrder) => (o.profitJson as Partial<OrderProfitBreakdown> | null)?.acquiringRub ?? null;
  let acquiring = new Map<string, { sku: number; rub: number }[]>();
  if (checkedAt) {
    const days = [
      ...new Set(
        targets
          .filter((o) => o.status !== 'cancelled' && knownAcquiring(o) === null)
          .flatMap((o) => acquiringDays(o.inProcessAt ?? o.createdAt))
      ),
    ];
    try {
      if (days.length) acquiring = await fetchAcquiring(days);
    } catch (err) {
      console.warn('[Kâr] Aracı banka tahakkukları alınamadı:', err instanceof Error ? err.message : err);
    }
  }
  const acquiringFor = (o: OzonOrder): number | null => {
    const known = knownAcquiring(o);
    if (known !== null) return known;
    const skus = new Set(((o.productsJson as OrderProduct[] | null) ?? []).map((p) => Number(p.sku)));
    const fees = (acquiring.get(orderNumberOf(o.postingNumber)) ?? []).filter((f) => skus.has(f.sku));
    return fees.length ? fees.reduce((s, f) => s + f.rub, 0) : null;
  };

  const offerIds = [
    ...new Set(targets.flatMap((o) => ((o.productsJson as OrderProduct[] | null) ?? []).map((p) => p.offer_id).filter(Boolean) as string[])),
  ];
  const [sources, lsOrders] = await Promise.all([
    prisma.productSource.findMany({ where: { storeId: 'store1', offerId: { in: offerIds } } }),
    prisma.arbitrageOrder.findMany({ where: { ozonOrderId: { in: targets.map((o) => o.postingNumber) } } }),
  ]);
  const sourceByOffer = new Map(sources.map((s) => [s.offerId, s]));
  const lsByPosting = new Map(lsOrders.map((l) => [l.ozonOrderId, l]));
  const rateMemo = new Map<string, Promise<OrderRates>>();

  let updated = 0;
  for (const order of targets) {
    try {
      const rates = await ratesFor(order.inProcessAt ?? order.createdAt, rateMemo);
      const weight = orderWeight(
        (order.productsJson as OrderProduct[] | null) ?? [],
        sourceByOffer,
        lsByPosting.get(order.postingNumber)
      );
      const { breakdown, source } = computeProfit(
        order,
        accruals.get(order.postingNumber),
        weight,
        rates,
        acquiringFor(order)
      );
      await prisma.ozonOrder.update({
        where: { postingNumber: order.postingNumber },
        data: {
          buyPriceTry: breakdown.buyTry,
          netProfit: breakdown.netProfitUsd,
          netProfitTry: breakdown.netProfitTry,
          profitSource: source,
          profitJson: breakdown as unknown as Prisma.InputJsonObject,
          ...(checkedAt ? { profitCheckedAt: checkedAt } : {}),
        },
      });
      updated++;
    } catch (err) {
      console.warn(`[Kâr] ${order.postingNumber} hesaplanamadı:`, err instanceof Error ? err.message : err);
    }
  }
  return updated;
}

/**
 * Dönemdeki kesinleşmemiş kârları tazeler: alış fiyatı girilmiş, iptal olmayan ve Ozon'a son
 * 6 saatte sorulmamış siparişler. Geçmiş aylar Ozon'dan bir kez indirildiği için sipariş durumu
 * orada eski kalabilir; tahakkuk durumdan bağımsız sorulur.
 */
export async function refreshPeriodProfits(storeId: string, start: Date, end: Date): Promise<number> {
  const cutoff = new Date(Date.now() - PROFIT_RECHECK_MS);
  const orders = await prisma.ozonOrder.findMany({
    where: {
      storeId,
      buyPrice: { gt: 0 },
      status: { not: 'cancelled' },
      AND: [
        { OR: [{ inProcessAt: { gte: start, lt: end } }, { inProcessAt: null, createdAt: { gte: start, lt: end } }] },
        { OR: [{ profitSource: null }, { profitSource: 'estimate' }] },
        { OR: [{ profitCheckedAt: null }, { profitCheckedAt: { lt: cutoff } }] },
      ],
    },
  });
  return recalcOrderProfits(orders, { checkOzon: true });
}
