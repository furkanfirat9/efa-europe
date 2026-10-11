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
 *   kesin    alışı girilmiş sipariş: Siparişler sayfasının kârı (src/lib/orders/profit.ts; Ozon tahakkuku gelmediyse
 *            kesintiler tarifeden tahmin, alış kartın gerçek TL'si)
 *   tahmini  alışı henüz girilmemiş sipariş: fiyat önerisinin maliyetiyle (en ucuz tedarik kanalı, kur farkı,
 *            kutulu ağırlık; komisyon Ozon'un oranı bilinmediği için %5)
 * Tedarik fiyatı ya da ağırlığı olmayan sipariş hiçbirine girmez, `unknownCount` ile sayılır.
 * İptal edilen siparişler sayılmaz. Yalnız Avrupa mağazası (store1), Siparişler sayfası gibi.
 */

const STORE = 'store1';
const MSK_MS = 3 * 3600 * 1000;
const DAY_MS = 86_400_000;

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
    const w = shippingWeight({ amzItemG: src?.amzItemWeightG, amzPackageG: src?.amzPackageWeightG, icecatPackageG: src?.icecatPackageWeightG });
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

export async function periodProfits(now = new Date()) {
  const starts = periodStartsMsk(now);
  const from = new Date(Math.min(starts.week.getTime(), starts.month.getTime()));
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

  const perOrder = orders.map((o) => {
    const at = (o.inProcessAt ?? o.createdAt).getTime();
    if (o.netProfit != null) return { at, revenue: o.totalPrice, known: o.netProfit, knownTry: o.netProfitTry ?? null, estimate: null };
    const estimate = rates ? estimateProfit(o, sources, rates) : null;
    return { at, revenue: o.totalPrice, known: null, knownTry: null, estimate };
  });

  const labels: Record<PeriodKey, string> = { today: 'Bugün', week: 'Bu hafta', month: 'Bu ay' };
  const periods: PeriodProfit[] = (['today', 'week', 'month'] as const).map((key) => {
    const start = starts[key].getTime();
    const rows = perOrder.filter((r) => r.at >= start);
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
    };
  });

  return { periods, usdTry: usdTry?.rate ?? null, asOf: now.toISOString() };
}
