import type { ProductSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { calculateShippingCosts } from '@/lib/calculator/profitCalculator';
import { getCbrRates } from '@/lib/fx/cbr';
import { getEcbEurPln, getEcbEurUsd } from '@/lib/fx/ecb';
import { getOzonHeaders, ozonFetch } from '@/lib/ozon/gate';
import type { OrderProfitBreakdown } from '@/lib/orders/profit';
import { pickBestOffer, type CeneoOffer } from '@/lib/sourcing/ceneoRules';
import {
  OZON_GLOBAL_FEES,
  PRICING,
  costBase,
  decidePrice,
  platformCapUsdFor,
  profitAt,
  shippingWeight,
  storefrontFactorFor,
  type PriceRule,
  type WeightSource,
} from './rules';

/**
 * Mağazadaki her ürün için fiyat ve stok önerisi. Hiçbir şey yazmaz; öneri ekranı ve
 * (kullanıcı onayından sonra) uygulama adımı bu listeyi kullanır.
 *
 * Kaynaklar: ProductSource (Amazon.de ve amazon.pl alışı, ağırlık, stok — haftalık tarayıcı taraması),
 * Ozon /v5/product/info/prices (fiyat, komisyon, en ucuz rakip), /v4/product/info/stocks, teslim edilmiş
 * siparişlerin kargo tahakkukları (gerçek kargo ağırlığı).
 *
 * Tedarik kanalı: o an alınabilen kanallardan depoya en ucuz geleni — Amazon.de, amazon.pl (stokta, satıcı
 * Amazon, fiyat var) ve Ceneo'daki en uygun güvenilir teklif (src/lib/sourcing/ceneoRules.ts).
 */

const STORE = 'store1';

export type StockAction = 'keep' | 'close' | 'open';
export type SupplySource = 'amazon-de' | 'amazon-pl' | 'ceneo';

interface SupplyOffer {
  source: SupplySource;
  grossEur: number;
  netEur: number;
  shippingEur: number;
  buyable: boolean;
  /** Ceneo'da teklifi veren mağaza (allegro.pl, mediaexpert.pl …) */
  shop?: string | null;
}

/** Ürünün Amazon.de ve amazon.pl teklifleri (fiyatı olanlar) */
function supplyOffers(src: ProductSource | undefined, eurPln: number): SupplyOffer[] {
  if (!src) return [];
  const out: SupplyOffer[] = [];
  if (src.asin && src.priceGrossEur) {
    out.push({
      source: 'amazon-de',
      grossEur: src.priceGrossEur,
      netEur: src.priceNetEur ?? src.priceGrossEur,
      shippingEur: PRICING.amazonShippingEur,
      buyable: !!(src.inStock && src.soldByAmazon),
    });
  }
  if (src.asin && src.plPricePln) {
    const grossEur = src.plPricePln / eurPln;
    out.push({
      source: 'amazon-pl',
      grossEur,
      netEur: grossEur / (1 + PRICING.plVatRate),
      shippingEur: /darmowa/i.test(src.plDeliveryText ?? '') ? 0 : PRICING.amazonShippingEur,
      buyable: !!(src.plInStock && src.plSoldByAmazon),
    });
  }
  // Ceneo: yalnız eşleşmesi kesin ya da onaylı ürün; teklifler Polonya'daki depoya kargo dahil (Allegro 0, Smart)
  const ceneo = (src.ceneoStatus === 'EXACT' || src.ceneoStatus === 'MANUAL') && Array.isArray(src.ceneoOffers)
    ? pickBestOffer(src.ceneoOffers as unknown as CeneoOffer[], src.ozonBrand)
    : null;
  if (ceneo) {
    const grossEur = ceneo.best.pricePln / eurPln;
    out.push({
      source: 'ceneo',
      grossEur,
      netEur: grossEur / (1 + PRICING.plVatRate),
      shippingEur: (ceneo.best.totalPln - ceneo.best.pricePln) / eurPln,
      buyable: true,
      shop: ceneo.best.shop,
    });
  }
  return out;
}

/** Depoya en ucuz gelen alınabilir kanal; hiçbiri alınamıyorsa fiyatı olan ilk kanal (buyable false). */
export function pickSupply(src: ProductSource | undefined, eurPln: number, vatMode: 'gross' | 'net' = PRICING.vatMode) {
  const priceOf = (o: SupplyOffer) => (vatMode === 'net' ? o.netEur : o.grossEur);
  const offers = supplyOffers(src, eurPln);
  const landed = (o: SupplyOffer) => priceOf(o) + o.shippingEur;
  const chosen = offers.filter((o) => o.buyable).sort((a, b) => landed(a) - landed(b))[0] ?? offers[0] ?? null;
  return { offers, chosen, priceOf, purchaseEur: chosen ? priceOf(chosen) : null };
}

export interface Proposal {
  productId: string;
  offerId: string;
  name: string | null;
  brand: string | null;
  image: string | null;
  sku: string | null;
  asin: string | null;
  ceneoId: string | null;
  asinStatus: string;
  /** Herhangi bir kanaldan şu an alınabilir mi (stokta, satıcı Amazon, fiyat var) */
  buyable: boolean;
  /** Maliyetin dayandığı kanal: alınabilenlerden en ucuzu; hiçbiri alınamıyorsa fiyatı olan ilk kanal */
  source: SupplySource | null;
  /** Seçilen kanaldaki alış fiyatı (vatMode'a göre KDV dahil/hariç, €) */
  purchaseEur: number | null;
  /** Karşılaştırma için kanalların fiyatı (vatMode'a göre, €); alınamıyorsa buyable false */
  channels: { source: SupplySource; eur: number; shippingEur: number; buyable: boolean; shop?: string | null }[];
  weightG: number;
  weightSource: WeightSource;
  weightCheck: boolean;
  landedUsd: number | null;
  ozonShippingUsd: number | null;
  depotUsd: number | null;
  /** Satıştan tavansız kesilen oranlar (komisyon + acquiring + aracılık) */
  feePct: number;
  /** Platform hizmeti oranı ve gönderi başına tavanı ($; null = tavansız) */
  platformPct: number;
  platformCapUsd: number | null;
  currentPrice: number;
  currentOldPrice: number;
  /** Müşterinin gördüğü fiyat (kampanya/indirim sonrası) */
  customerPrice: number;
  currentProfit: number | null;
  currentMargin: number | null;
  rivalUsd: number | null;
  /** Ozon'un kendi endeksi (bizim fiyat ÷ en ucuz rakip, vitrin kuruyla); > 1 = rakipten pahalıyız. Saatler gecikebilir. */
  ozonIndex: number | null;
  /** factor: Ozon'un bu ürünün endeksinde kullandığı oran (storefrontFactorFor) */
  rival: { price: number; rubPerUsd: number; factor: number } | null;
  rule: PriceRule | null;
  newPrice: number | null;
  newOldPrice: number | null;
  newMinPrice: number | null;
  newProfit: number | null;
  newMargin: number | null;
  targetPrice: number | null;
  floorPrice: number | null;
  /** Rakibin 11 ₽ altı (tam dolar); rakip yoksa null */
  rivalTarget: number | null;
  /** Kural fiyatı 750 € ihracat sınırını aştığı için sınırın hemen altına çekildi */
  exportCapped: boolean;
  stock: number;
  stockAction: StockAction;
  /** Fiyat değişikliği önerilmiyorsa nedeni */
  skipReason: string | null;
}

interface V5Item {
  product_id: number;
  offer_id: string;
  commissions: { sales_percent_rfbs: number };
  price: { price: string | number; old_price: string | number; marketing_seller_price: string | number };
  price_indexes?: { ozon_index_data?: { min_price: number; min_price_in_seller: number; price_index_value?: number } };
}

async function loadOzonPrices() {
  const headers = getOzonHeaders(STORE);
  const items: V5Item[] = [];
  let cursor = '';
  for (;;) {
    const res = await ozonFetch<{ items: V5Item[]; cursor: string }>(
      '/v5/product/info/prices',
      { filter: { visibility: 'ALL' }, limit: 1000, cursor },
      headers
    );
    items.push(...res.items);
    if (!res.cursor || res.items.length < 1000) break;
    cursor = res.cursor;
  }
  return items;
}

async function loadStocks(productIds: string[]) {
  const headers = getOzonHeaders(STORE);
  const stock = new Map<string, number>();
  let cursor = '';
  for (;;) {
    const res = await ozonFetch<{ items: { product_id: number; stocks: { present: number }[] }[]; cursor: string }>(
      '/v4/product/info/stocks',
      { filter: { product_id: productIds, visibility: 'ALL' }, limit: 1000, cursor },
      headers
    );
    for (const i of res.items) stock.set(String(i.product_id), i.stocks.reduce((s, x) => s + (x.present || 0), 0));
    if (!res.cursor || res.items.length < 1000) break;
    cursor = res.cursor;
  }
  return stock;
}

/** Ozon kartındaki paketli ağırlık (g) — yalnız Amazon ağırlığı yoksa yedek olarak kullanılır. */
async function loadCardWeights() {
  const headers = getOzonHeaders(STORE);
  const weights = new Map<string, number>();
  let last_id = '';
  for (;;) {
    const res = await ozonFetch<{ result: { id: number; weight: number; weight_unit: string }[]; last_id: string }>(
      '/v4/product/info/attributes',
      { filter: { visibility: 'ALL' }, limit: 1000, last_id },
      headers
    );
    for (const p of res.result) weights.set(String(p.id), p.weight_unit === 'kg' ? p.weight * 1000 : p.weight);
    if (!res.last_id || res.result.length < 1000) break;
    last_id = res.last_id;
  }
  return weights;
}

/**
 * Daha önce gönderilmiş ürünlerin gerçek kargo ağırlığı (offer_id → g): Ozon'un teslim edilmiş siparişte kestiği
 * kargo bedelinden (sipariş kârındaki tahakkuk) kademe sayısı bulunur, ağırlık = kademe × 500 g. Ozon LS'nin
 * ölçtüğü ağırlığı API'de vermiyor; kargo bedeli de yalnız teslimattan sonra tahakkuk ediyor.
 * Yalnız tek ürünlü siparişler. Ürün birden çok kez gittiyse en yüksek kademe: LS'nin paketi değişiyor
 * (Devil 27 bir gönderide 1 420 g, ötekinde 1 960 g ölçüldü).
 */
async function loadRealShippingWeights() {
  const orders = await prisma.ozonOrder.findMany({
    where: { storeId: STORE, profitSource: 'ozon' },
    select: { productsJson: true, profitJson: true },
  });
  const weights = new Map<string, number>();
  for (const o of orders) {
    const products = (o.productsJson as { offer_id?: string; quantity?: number }[] | null) ?? [];
    const profit = o.profitJson as Partial<OrderProfitBreakdown> | null;
    const offerId = products[0]?.offer_id;
    if (products.length !== 1 || (products[0].quantity ?? 1) !== 1 || !offerId || !profit?.shippingUsd || !profit.eurUsd) continue;
    // Ozon kargoyu € × CBR EUR ile rubleye, rubleyi satıcı kuruyla (CBR USD × 1,005) dolara çeviriyor
    const shippingEur = (profit.shippingUsd * OZON_GLOBAL_FEES.saleRateFactor) / profit.eurUsd;
    let tiers = 1;
    for (let n = 2; n <= 62; n++) {
      const diff = (k: number) => Math.abs(calculateShippingCosts(k * 500).totalShipping - shippingEur);
      if (diff(n) < diff(tiers)) tiers = n;
    }
    weights.set(offerId, Math.max(weights.get(offerId) ?? 0, tiers * 500));
  }
  return weights;
}

/** @param vatMode karşılaştırma için PRICING.vatMode'u ezer (ör. KDV kaydı sonrası tabloyu önceden görmek) */
export async function buildProposals(
  vatMode: 'gross' | 'net' = PRICING.vatMode
): Promise<{ proposals: Proposal[]; eurUsd: number; eurUsdDate: string; eurPln: number; vatMode: string }> {
  const [ecb, pln, cbr, ozon, sources, realWeights] = await Promise.all([
    getEcbEurUsd(),
    getEcbEurPln(),
    getCbrRates(new Date()),
    loadOzonPrices(),
    prisma.productSource.findMany({ where: { storeId: STORE, asinStatus: { not: 'ARCHIVED' } } }),
    loadRealShippingWeights(),
  ]);
  const byId = new Map(sources.map((s) => [s.ozonProductId, s]));
  const [stocks, cardWeights] = await Promise.all([loadStocks(ozon.map((i) => String(i.product_id))), loadCardWeights()]);
  // CBR alınamazsa platform hizmeti tavansız sayılır (temkinli)
  const platformPct = OZON_GLOBAL_FEES.platformPct;
  const platformCapUsd = platformCapUsdFor(cbr?.USD);

  const proposals = ozon.map((item): Proposal => {
    const src = byId.get(String(item.product_id));
    const currentPrice = Number(item.price.price) || 0;
    const customerPrice = Number(item.price.marketing_seller_price) || currentPrice;
    const feePct = (item.commissions.sales_percent_rfbs || 0) / 100 + PRICING.acquiringPct + OZON_GLOBAL_FEES.intermediaryPct;
    const idx = item.price_indexes?.ozon_index_data;
    const rival =
      idx && idx.min_price > 0 && idx.min_price_in_seller > 0
        ? {
            price: idx.min_price_in_seller,
            rubPerUsd: idx.min_price / idx.min_price_in_seller,
            factor: storefrontFactorFor(idx.price_index_value, customerPrice, idx.min_price_in_seller),
          }
        : null;

    const { offers, chosen, priceOf, purchaseEur } = pickSupply(src, pln.rate, vatMode);
    const buyable = !!chosen?.buyable;
    const stock = stocks.get(String(item.product_id)) ?? 0;
    const stockAction: StockAction = !buyable && stock > 0 ? 'close' : buyable && stock === 0 ? 'open' : 'keep';
    const w = shippingWeight({
      amzItemG: src?.amzItemWeightG,
      amzPackageG: src?.amzPackageWeightG,
      icecatPackageG: src?.icecatPackageWeightG,
      ozonCardG: cardWeights.get(String(item.product_id)),
      realG: realWeights.get(item.offer_id),
    });

    const base: Proposal = {
      productId: String(item.product_id),
      offerId: item.offer_id,
      name: src?.ozonName ?? null,
      brand: src?.ozonBrand ?? null,
      image: src?.ozonImage ?? null,
      sku: src?.sku ?? null,
      asin: src?.asin ?? null,
      ceneoId: src?.ceneoProductId ?? null,
      asinStatus: src?.asinStatus ?? 'MISSING',
      buyable,
      source: chosen?.source ?? null,
      purchaseEur,
      channels: offers.map((o) => ({ source: o.source, eur: priceOf(o), shippingEur: o.shippingEur, buyable: o.buyable, shop: o.shop ?? null })),
      weightG: w.grams,
      weightSource: w.source,
      weightCheck: w.check,
      landedUsd: null,
      ozonShippingUsd: null,
      depotUsd: null,
      feePct,
      platformPct,
      platformCapUsd,
      currentPrice,
      currentOldPrice: Number(item.price.old_price) || 0,
      customerPrice,
      currentProfit: null,
      currentMargin: null,
      rivalUsd: rival?.price ?? null,
      ozonIndex: idx?.price_index_value && idx.price_index_value > 0 ? idx.price_index_value : null,
      rival,
      rule: null,
      newPrice: null,
      newOldPrice: null,
      newMinPrice: null,
      newProfit: null,
      newMargin: null,
      targetPrice: null,
      floorPrice: null,
      rivalTarget: null,
      exportCapped: false,
      stock,
      stockAction,
      skipReason: null,
    };

    if (!chosen || purchaseEur == null) return { ...base, skipReason: src?.asin ? 'Amazon.de / .pl / Ceneo fiyatı yok' : 'ASIN yok' };
    if (!w.grams) return { ...base, skipReason: 'Ağırlık bilinmiyor' };

    const c = costBase({
      purchaseEur,
      shippingEur: chosen.shippingEur,
      weightG: w.grams,
      eurUsd: ecb.rate,
      feePct,
      platformPct,
      platformCapUsd,
    });
    const current = profitAt(customerPrice, c);
    let d = decidePrice(c, rival?.price ?? null, rival?.rubPerUsd ?? null, chosen.netEur * ecb.rate, rival?.factor);
    const costs = {
      landedUsd: c.landedUsd,
      ozonShippingUsd: c.ozonShippingUsd,
      depotUsd: c.depotUsd,
      currentProfit: current.profit,
      currentMargin: current.margin,
    };
    // Satış fiyatı 750 €'yu geçemez (ihracat sınırı): kural fiyatı aşıyorsa sınırın hemen altına çekilir; orada asgari
    // kâr kalmıyorsa fiyat önerilmez. Kampanya ajanı (scripts/kampanya_yeni_kart.mjs) da aynı sınırı uygular.
    const exportLimitUsd = Math.floor((PRICING.exportLimitEur - 1) * ecb.rate);
    const exportCapped = d.price > exportLimitUsd;
    if (exportCapped) {
      if (exportLimitUsd < d.floorPrice)
        // Sınırın altında kâr yok: alınabilse de stok açılmaz (2026-10-12, EP5544/50 ve ADD6921DG/10 kapatıldı)
        return {
          ...base,
          ...costs,
          floorPrice: d.floorPrice,
          stockAction: stock > 0 ? 'close' : 'keep',
          skipReason: `750 € ihracat sınırında kâr yok (asgari ${d.floorPrice} $)`,
        };
      d = { ...d, price: exportLimitUsd, oldPrice: Math.round(exportLimitUsd * PRICING.oldPriceMultiplier) };
    }
    const next = profitAt(d.price, c);
    return {
      ...base,
      ...costs,
      exportCapped,
      rule: d.rule,
      newPrice: d.price,
      newOldPrice: d.oldPrice,
      newMinPrice: d.minPrice,
      newProfit: next.profit,
      newMargin: next.margin,
      targetPrice: d.targetPrice,
      floorPrice: d.floorPrice,
      rivalTarget: d.rivalTarget,
    };
  });

  return { proposals, eurUsd: ecb.rate, eurUsdDate: ecb.date, eurPln: pln.rate, vatMode };
}
