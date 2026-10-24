import type { OzonOrder, ProductSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getCbrRates } from '@/lib/fx/cbr';
import { getEcbEurPln, getEcbEurUsd } from '@/lib/fx/ecb';
import { getTryRate } from '@/lib/fx/evds';
import { pickSupply } from '@/lib/pricing/proposals';
import { OZON_GLOBAL_FEES, PRICING, costBase, platformCapUsdFor, profitAt, shippingWeight } from '@/lib/pricing/rules';

/**
 * Dashboard kâr kartı: bugün, bu hafta (pazartesiden) ve bu ay, Moskova/Türkiye saatiyle (UTC+3), sipariş tarihine göre.
 *
 *   kesin    alışı (€/zł ya da ₺) girilmiş sipariş: Siparişler sayfasının kârı (src/lib/orders/profit.ts; Ozon tahakkuku gelmediyse
 *            kesintiler tarifeden tahmin, alış kartın gerçek TL'si)
 *   tahmini  alışı henüz girilmemiş sipariş: fiyat önerisinin maliyetiyle (en ucuz tedarik kanalı, kur farkı,
 *            kutulu ağırlık; komisyon Ozon'un oranı bilinmediği için %5)
 * Tedarik fiyatı ya da ağırlığı olmayan sipariş hiçbirine girmez, `unknownCount` ile sayılır.
 * İptal edilen siparişler sayılmaz. Yalnız Avrupa mağazası (store1), Siparişler sayfası gibi.
 */

const STORE = 'store1';
const MSK_MS = 3 * 3600 * 1000;
const DAY_MS = 86_400_000;
/** Dashboard satış grafiğinin en uzun dönemi (gün, bugün dahil) */
const LAST_DAYS = 30;

/** Aylık net kâr hedefi ($). Muhasebe raporuyla aynı (scripts/muhasebe_rapor.mjs → hedefAylikUsd, kullanıcı 2026-10-13). */
export const MONTHLY_PROFIT_TARGET_USD = 10_000;

export type PeriodKey = 'today' | 'week' | 'month';

export interface PeriodProfit {
  key: PeriodKey;
  label: string;
  /** Dönem başlangıcı (UTC ISO) */
  from: string;
  orders: number;
  revenueUsd: number;
  profitUsd: number;
  profitTry: number;
  knownUsd: number;
  knownCount: number;
  estimatedUsd: number;
  estimatedCount: number;
  unknownCount: number;
  /** Önceki dönemin aynı uzunluktaki kısmı: dünün bu saatine, geçen haftanın bu anına, geçen ayın bu gününe kadar. */
  prevProfitUsd: number;
  prevOrders: number;
}

/** Bu ayın bir günü (UTC+3). */
export interface DailyProfit {
  /** YYYY-MM-DD */
  date: string;
  knownUsd: number;
  estimatedUsd: number;
  orders: number;
}

/** Bugünün, bu haftanın (pazartesi) ve bu ayın başlangıcı, UTC+3 */
export function periodStartsMsk(now = new Date()) {
  const local = new Date(now.getTime() + MSK_MS);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - MSK_MS;
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  return {
    today: new Date(today),
    week: new Date(today - sinceMonday * DAY_MS),
    month: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - MSK_MS),
  };
}

/** Karşılaştırılan önceki dönemlerin başlangıcı: dün, geçen pazartesi, geçen ayın 1'i (UTC+3). */
function previousStartsMsk(now: Date, starts: ReturnType<typeof periodStartsMsk>) {
  const local = new Date(now.getTime() + MSK_MS);
  return {
    today: new Date(starts.today.getTime() - DAY_MS),
    week: new Date(starts.week.getTime() - 7 * DAY_MS),
    month: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) - MSK_MS),
  };
}

const mskDate = (ms: number) => new Date(ms + MSK_MS).toISOString().slice(0, 10);

interface OrderProduct {
  offer_id?: string;
  quantity?: number;
}

interface EstimateRates {
  eurUsd: number;
  eurPln: number;
  platformCapUsd: number | null;
}

/** Alışı girilmemiş siparişin tahmini kârı ($); tedarik fiyatı ya da ağırlık eksikse null. */
function estimateProfit(order: OzonOrder, sources: Map<string, ProductSource>, rates: EstimateRates): number | null {
  const products = (order.productsJson as OrderProduct[] | null) ?? [];
  if (!products.length) return null;
  let purchaseEur = 0;
  let inboundEur = 0;
  let grams = 0;
  for (const p of products) {
    const qty = p.quantity || 1;
    const src = p.offer_id ? sources.get(p.offer_id) : undefined;
    const { chosen, purchaseEur: unitEur } = pickSupply(src, rates.eurPln);
    const w = shippingWeight({
      amzItemG: src?.amzItemWeightG,
      amzPackageG: src?.amzPackageWeightG,
      researchedPackageG: src?.researchedPackageWeightG,
      icecatPackageG: src?.icecatPackageWeightG,
    });
    if (!chosen || unitEur == null || !w.grams) return null;
    purchaseEur += unitEur * qty;
    inboundEur += chosen.shippingEur * qty;
    grams += w.grams * qty;
  }
  const c = costBase({
    purchaseEur,
    shippingEur: inboundEur,
    weightG: grams,
    eurUsd: rates.eurUsd,
    feePct: OZON_GLOBAL_FEES.defaultCommissionPct + PRICING.acquiringPct + OZON_GLOBAL_FEES.intermediaryPct,
    platformPct: OZON_GLOBAL_FEES.platformPct,
    platformCapUsd: rates.platformCapUsd,
  });
  return profitAt(Number(order.totalPrice) || 0, c).profit;
}

/** Bir siparişin kârı: kesin (alışı girilmiş) ya da tahmini; ikisi de yoksa hesaplanamadı. */
interface OrderProfitRow {
  at: number;
  revenue: number;
  known: number | null;
  knownTry: number | null;
  estimate: number | null;
  order: OzonOrder;
}

/** `from`'dan bugüne iptal edilmemiş siparişler ve kârları. */
async function loadOrderProfitRows(from: Date, now: Date) {
  const orders = await prisma.ozonOrder.findMany({
    where: {
      storeId: STORE,
      status: { not: 'cancelled' },
      OR: [{ inProcessAt: { gte: from } }, { inProcessAt: null, createdAt: { gte: from } }],
    },
  });

  const pending = orders.filter((o) => o.netProfit == null);
  let rates: EstimateRates | null = null;
  let sources = new Map<string, ProductSource>();
  const usdTry = await getTryRate('USD', now);
  if (pending.length) {
    const offerIds = [...new Set(pending.flatMap((o) => ((o.productsJson as OrderProduct[] | null) ?? []).map((p) => p.offer_id)).filter(Boolean))] as string[];
    const [ecb, pln, cbr, rows] = await Promise.all([
      getEcbEurUsd(),
      getEcbEurPln(),
      getCbrRates(now).catch(() => null),
      prisma.productSource.findMany({ where: { storeId: STORE, offerId: { in: offerIds } } }),
    ]);
    rates = { eurUsd: ecb.rate, eurPln: pln.rate, platformCapUsd: platformCapUsdFor(cbr?.USD) };
    sources = new Map(rows.map((s) => [s.offerId, s]));
  }

  const rows: OrderProfitRow[] = orders.map((o) => {
    const at = (o.inProcessAt ?? o.createdAt).getTime();
    if (o.netProfit != null) return { at, revenue: o.totalPrice, known: o.netProfit, knownTry: o.netProfitTry ?? null, estimate: null, order: o };
    const estimate = rates ? estimateProfit(o, sources, rates) : null;
    return { at, revenue: o.totalPrice, known: null, knownTry: null, estimate, order: o };
  });
  return { rows, usdTry };
}

const profitOf = (r: OrderProfitRow) => r.known ?? r.estimate ?? 0;

export async function periodProfits(now = new Date()) {
  const starts = periodStartsMsk(now);
  const prevStarts = previousStartsMsk(now, starts);
  // Son 30 günün grafiği bugünden 29 gün öncesinin başından başlar
  const last30Start = starts.today.getTime() - (LAST_DAYS - 1) * DAY_MS;
  // Önceki dönemlerle karşılaştırma için geçen ayın başından (ya da geçen pazartesiden) itibaren okunur;
  // şubattan sonraki ayın ilk günlerinde 30 günlük grafik daha geriye uzanabilir
  const from = new Date(Math.min(prevStarts.week.getTime(), prevStarts.month.getTime(), last30Start));
  const { rows: perOrder, usdTry } = await loadOrderProfitRows(from, now);

  const labels: Record<PeriodKey, string> = { today: 'Bugün', week: 'Bu hafta', month: 'Bu ay' };
  const periods: PeriodProfit[] = (['today', 'week', 'month'] as const).map((key) => {
    const start = starts[key].getTime();
    const rows = perOrder.filter((r) => r.at >= start);
    // Önceki dönemin aynı uzunluğu; geçen ay daha kısaysa ayın sonunda kesilir
    const prevStart = prevStarts[key].getTime();
    const prevEnd = Math.min(prevStart + (now.getTime() - start), start);
    const prevRows = perOrder.filter((r) => r.at >= prevStart && r.at < prevEnd);
    const known = rows.filter((r) => r.known != null);
    const estimated = rows.filter((r) => r.estimate != null);
    const knownUsd = known.reduce((s, r) => s + r.known!, 0);
    const estimatedUsd = estimated.reduce((s, r) => s + r.estimate!, 0);
    // Kesin kârın TL'si siparişin kendi günündeki kurla yazılı; tahmininki bugünün TCMB kuruyla
    const knownTry = known.reduce((s, r) => s + (r.knownTry ?? r.known! * (usdTry?.rate ?? 0)), 0);
    return {
      key,
      label: labels[key],
      from: starts[key].toISOString(),
      orders: rows.length,
      revenueUsd: rows.reduce((s, r) => s + r.revenue, 0),
      profitUsd: knownUsd + estimatedUsd,
      profitTry: knownTry + estimatedUsd * (usdTry?.rate ?? 0),
      knownUsd,
      knownCount: known.length,
      estimatedUsd,
      estimatedCount: estimated.length,
      unknownCount: rows.length - known.length - estimated.length,
      prevProfitUsd: prevRows.reduce((s, r) => s + profitOf(r), 0),
      prevOrders: prevRows.length,
    };
  });

  // Günlük kâr, siparişsiz günler de 0 olarak: bu ayın 1'inden ve son 30 günün başından bugüne
  const dailyFrom = (start: number) => {
    const days: DailyProfit[] = [];
    for (let t = start; t <= now.getTime(); t += DAY_MS) days.push({ date: mskDate(t), knownUsd: 0, estimatedUsd: 0, orders: 0 });
    for (const r of perOrder) {
      if (r.at < start) continue;
      const day = days[Math.floor((r.at - start) / DAY_MS)];
      if (!day) continue;
      day.orders++;
      if (r.known != null) day.knownUsd += r.known;
      else if (r.estimate != null) day.estimatedUsd += r.estimate;
    }
    return days;
  };
  const daily = dailyFrom(starts.month.getTime());
  const last30 = dailyFrom(last30Start);

  const local = new Date(now.getTime() + MSK_MS);
  const monthDays = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();

  return {
    periods,
    daily,
    last30,
    monthDays,
    targetUsd: MONTHLY_PROFIT_TARGET_USD,
    usdTry: usdTry?.rate ?? null,
    asOf: now.toISOString(),
  };
}

export interface TopProduct {
  offerId: string;
  title: string | null;
  image: string | null;
  orders: number;
  units: number;
  revenueUsd: number;
  /** Kesin + tahmini kâr */
  profitUsd: number;
  /** Kârın bir kısmı tahmin (alışı girilmemiş sipariş var) */
  estimated: boolean;
  /** Kârı hesaplanamayan sipariş sayısı (tedarik fiyatı ya da ağırlık yok) */
  unknownCount: number;
}

/** Bu ayın en çok satan ürünleri: sipariş sayısına, eşitlikte ciroya göre. */
export async function topProductsThisMonth(limit = 5, now = new Date()) {
  const { month } = periodStartsMsk(now);
  const { rows } = await loadOrderProfitRows(month, now);

  const byOffer = new Map<string, TopProduct>();
  for (const r of rows) {
    const products = (r.order.productsJson as (OrderProduct & { name?: string })[] | null) ?? [];
    const offerId = r.order.productOfferId || products[0]?.offer_id || '—';
    const item = byOffer.get(offerId) ?? {
      offerId,
      title: r.order.productTitle || products[0]?.name || null,
      image: r.order.productImage,
      orders: 0,
      units: 0,
      revenueUsd: 0,
      profitUsd: 0,
      estimated: false,
      unknownCount: 0,
    };
    item.orders++;
    item.units += products.reduce((s, p) => s + (p.quantity || 1), 0) || 1;
    item.revenueUsd += r.revenue;
    item.profitUsd += profitOf(r);
    if (r.known == null && r.estimate != null) item.estimated = true;
    if (r.known == null && r.estimate == null) item.unknownCount++;
    if (!item.image && r.order.productImage) item.image = r.order.productImage;
    byOffer.set(offerId, item);
  }

  const items = [...byOffer.values()].sort((a, b) => b.orders - a.orders || b.revenueUsd - a.revenueUsd);
  return { items: items.slice(0, limit), productCount: items.length, orderCount: rows.length, from: month.toISOString() };
}
