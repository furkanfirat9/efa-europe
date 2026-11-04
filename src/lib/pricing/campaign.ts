import { MAX_OZON_LIST_PRICE_USD } from '@/lib/amazon/types';
import { prisma } from '@/lib/db/prisma';
import { getOzonHeaders, ozonFetch } from '@/lib/ozon/gate';
import { buildProposals, type Proposal, type SupplySource } from './proposals';
import { PRICING, priceForProfit, profitAt as costProfitAt, type CostBase } from './rules';

/**
 * Elastik boosting kampanyasının fiyatlarını önerilerle karşılaştırır ve seçilenleri Ozon'a yazar.
 *
 * Kur her gün biraz oynadığı için öneri çoğu üründe kampanya fiyatından 1 $ kayar; bunları her gün göndermek
 * fiyatı boşuna gidip getirir. Bu yüzden değişiklik gruplara ayrılır (kullanıcıyla 2026-10-03'te kararlaştırıldı):
 *   send   gönderilecek, seçili gelir. Etiketi nedenini söyler:
 *            above-rival  Ozon endeksine göre rakipten pahalıyız (> 1,00) — fark ne olursa olsun
 *            below-floor  asgari kârın altındayız — fark ne olursa olsun
 *            profit-up    fark %2'den ve 2 $'dan büyük, fiyat artıyor (gereğinden ucuz satıyoruz)
 *            cheaper      fark %2'den ve 2 $'dan büyük, fiyat düşüyor (maliyet düştü)
 *   small  daha küçük fark (kur oynaması) ya da alınabilir kaynağı olmayan kartta fiyat indirimi → görünür, seçili değil
 *   add    kampanyada değil, girebilir → ayrı liste
 *   check  kural "elle kontrol" ya da Ozon tavanı aşılıyor → hiç otomatik seçilmez. Sayfada beş bölüm (checkKind,
 *          kullanıcıyla 2026-10-10, closed 2026-11-04): loss (stok açık, şu anki fiyatta zarar), thin (Ozon tavanı kâr
 *          sınırımızın altında), opportunity (en ucuz rakip bizden çok pahalı; hazır fiyat seçenekleri), closed (stok 0, fiyat
 *          zararda: sipariş gelemez, zarar sayılmaz; stok açılır ve fiyat hâlâ zarardaysa kendiliğinden loss olur), blocked
 *          (kampanyada değil, giremiyor ya da alınabilir kaynağı yok). Önerisi çıkmayan kart (750 € sınırında kâr yok) da
 *          kampanyada ve zarardaysa buraya düşer; maliyeti bilinmeyen kart (Hesaplanamadı) planda yoktur.
 *          "Olduğu gibi kalsın" kararı CampaignReview'da; fiyat değişince ya da maliyet veya tavan %3'ten fazla oynayınca düşer,
 *          yalnız stok varken geçerlidir: stok 0 iken plan açılırsa karar silinir (staleReviews, GET /api/kampanya-fiyat). Sınır:
 *          stok panel dışından yazılıyor, stok geçmişi yok; kart plan açılmadan 0'a düşüp yeniden açılırsa satır kalır, değerler
 *          aynıysa karar geçerli sayılır. Kanal saklanmıyor (şema değişmedi): maliyeti oynatan kanal değişikliğini %3 payı
 *          yakalar, maliyet aynıysa kâr da aynıdır.
 *   other  kampanyada değil ama Ozon'un başka bir kampanyasında (ör. Max boosting 11.11) → gönderilemez; o kampanya
 *          bitince "add"e düşer (kullanıcı 2026-10-25: toplu gönderimde yanlışlıkla Elastik'e eklenmişlerdi)
 *
 * Alınabilir kaynağı olmayan kartta maliyet yalnız tahmindir: kampanyadaki kartın fiyat indirimi "small"a düşer (seçili gelmez,
 * başlık kutusu da seçmez, satırından tek tek seçilir), zam olduğu gibi kalır; kampanyada olmayan kart "add"e girmez, check/blocked
 * olur. Sunucu da korur: ekranda "alınamaz" hâliyle görülmemiş indirim gönderilmez, hata olarak döner (isUnseenEstimateCut).
 * Fiyat yazan elle işlemler (kampanya fiyatı, ana fiyat) tam dolardır; kampanya fiyatı Ozon tavanı okunmadan yazılmaz. Toplu gönderim
 * de tavanı okunmayan kartı göndermez. Elle fiyatta zarar varsa istek confirmLoss taşımalıdır.
 * Kampanyadan çıkarmada gönderilen fiyat exitPriceOf'tur (plan ve gönderim aynı yardımcıyı kullanır, min_price gönderimde taze okunur):
 * çıkış fiyatı lojistik tavanını (MAX_OZON_LIST_PRICE_USD) aşan kart reddedilir, 750 € ihracat sınırını aşan yalnız onay penceresinde uyarı alır.
 */

const STORE = 'store1';
/** Elastik boosting (süresiz, 2026-12-31'e kadar) */
export const ELASTIC_ACTION_ID = 1977747;
const MEANINGFUL_PCT = 0.02;
const MEANINGFUL_USD = 2;
/** Öneri boost sınırının (price_max_elastic) üstündeyse sınıra en fazla bu kadar indirilir; daha fazlası kâr yakar
 *  ve rakipten gereksiz uzaklaştırır (PSG8200/80: öneri 759 $, sınır 644 $) — o zaman öneri kalır, boost düşer. */
const MAX_BOOST_CUT_PCT = 0.03;

export type ChangeGroup = 'send' | 'small' | 'add' | 'check' | 'other';
export type ChangeTag = 'above-rival' | 'below-floor' | 'profit-up' | 'cheaper';
export type CheckKind = 'loss' | 'thin' | 'opportunity' | 'closed' | 'blocked';

/** "Rakipten çok ucuzuz" bölümündeki hazır fiyat: asgari kâr ile Ozon tavanı arasında */
export interface CheckOption {
  key: 'target' | 'rival';
  label: string;
  price: number;
  profit: number | null;
}

/** Satış adedi bu kadar günden sayılır */
const SALES_DAYS = 60;
/** "Olduğu gibi kalsın" kararı maliyet ya da tavan bu orandan fazla değişince düşer; fiyatın payı yok (samePrice) */
const REVIEW_TOLERANCE = 0.03;
/** Ana fiyatın okunup doğrulanacağı süre (işlem başından) ve okuma aralığı: route 60 sn'de kesilir, plan ~11 sn sürüyor */
const BASE_VERIFY_MS = 45_000;
const BASE_VERIFY_STEP_MS = 5_000;

export interface CampaignChange {
  productId: string;
  offerId: string;
  name: string | null;
  image: string | null;
  group: ChangeGroup;
  /** Yalnız "send" grubunda: neden gönderilmeli */
  tag: ChangeTag | null;
  /** Grubun nedeni, okunur */
  reason: string;
  /** Kampanyadaki fiyat; kampanyada değilse null */
  current: number | null;
  /** Gönderilecek fiyat (öneri; boost sınırına göre ayarlanmış olabilir) */
  next: number;
  proposal: number;
  rule: Proposal['rule'];
  rivalUsd: number | null;
  /** Vitrinde rakiple fark (₽): gönderilecek fiyatla ve şu anki fiyatla. Eksi = rakibin altı. Ozon'un ürün bazlı
   *  vitrin oranıyla hesaplanır (storefrontFactorFor); endeks gibi birkaç rublelik sapma olabilir. */
  rivalGapRubNext: number | null;
  rivalGapRubNow: number | null;
  rivalTarget: number | null;
  floorPrice: number | null;
  /** Bu fiyatla kalan kâr ($) */
  profitAtNext: number | null;
  /** %55 boost için üst sınır (bunun altı en yüksek boost) */
  maxElastic: number | null;
  /** Kampanyaya girebilmenin üst sınırı */
  maxAction: number | null;
  /** Fiyat boost sınırının üstünde kalıyor: kampanyada ama %55'ten düşük boost */
  lowBoost: boolean;
  /** Öneri Ozon'un kampanya tavanını aştığı için tavana çekildi (kâr kalıyor) */
  atCeiling: boolean;
  /** Yalnız "check" grubunda: sayfadaki bölüm */
  checkKind: CheckKind | null;
  /** Şu anki kampanya fiyatında kalan kâr ($); kampanyada değilse null */
  profitNow: number | null;
  /** Kârı sıfırlayan en düşük tam dolar fiyat; asgari kâr fiyatı (floorPrice) bundan farklıdır */
  breakEvenUsd: number | null;
  /** Kampanyadan çıkınca kartın satacağı fiyat ve orada kalan kâr (exitPriceOf); kampanyada değilse ya da tavan okunamadıysa null */
  exitPrice: number | null;
  profitAtExit: number | null;
  /** 750 € ihracat sınırı ($, o günkü kurla) */
  exportLimitUsd: number;
  /** Kartın ana fiyatı (Ozon `price`). Kampanyadaki kartta kampanya fiyatına eşittir, kampanya fiyatı yazılınca o da değişir (canlı 667/667, 2026-11-04) ve kampanyadan çıkınca geri dönecek ayrı bir fiyat yoktur (exitPriceOf); müşterinin bu fiyatı doğrudan gördüğü kart kampanyada olmayandır */
  basePrice: number;
  stock: number;
  /** Elle fiyat kutusunun canlı kâr hesabı için maliyet (rules.ts profitAt); bilinmiyorsa null */
  cost: CostBase | null;
  purchaseEur: number | null;
  /** Alış + gelen kargo ($): "olduğu gibi kalsın" kararının geçerlilik kontrolü */
  landedUsd: number | null;
  source: SupplySource | null;
  /** Kaynak şu an alınabilir mi; değilse maliyet yalnız tahmin */
  buyable: boolean;
  ozonIndex: number | null;
  /** Son SALES_DAYS günde satılan adet (iptaller hariç) */
  sold: number;
  /** Yalnız "opportunity" bölümünde: hazır fiyatlar */
  options: CheckOption[];
  /** "Olduğu gibi kalsın" kararı hâlâ geçerliyse tarihi (ISO) */
  keptAt: string | null;
}

interface ActionRow {
  id: number;
  action_price?: { amount: string };
  price_max_elastic?: { amount: string };
  max_action_price?: { amount: string };
}

const amount = (m?: { amount: string }) => (m && Number(m.amount) > 0 ? Number(m.amount) : null);

async function loadAction(path: '/v2/actions/products' | '/v2/actions/candidates', actionId = ELASTIC_ACTION_ID) {
  const headers = getOzonHeaders(STORE);
  const rows = new Map<string, ActionRow>();
  let last_id = '';
  for (;;) {
    const res = await ozonFetch<{ products: ActionRow[]; last_id: string }>(
      path,
      { action_id: actionId, limit: 100, last_id },
      headers
    );
    for (const p of res.products ?? []) rows.set(String(p.id), p);
    if (!res.last_id || !res.products?.length) break;
    last_id = res.last_id;
  }
  return rows;
}

/** Elastik dışında ürünümüzün katıldığı kampanyalar: product_id → kampanya adı, fiyatı, bitişi */
async function loadOtherActions() {
  const headers = getOzonHeaders(STORE);
  const res = await ozonFetch<{ result: { id: number; title: string; date_end: string; participating_products_count: number }[] }>(
    '/v1/actions',
    undefined,
    headers,
    'GET'
  );
  const out = new Map<string, { title: string; price: number | null; dateEnd: string }>();
  for (const a of (res.result ?? []).filter((a) => a.id !== ELASTIC_ACTION_ID && a.participating_products_count > 0)) {
    const rows = await loadAction('/v2/actions/products', a.id);
    for (const [id, row] of rows) if (!out.has(id)) out.set(id, { title: a.title, price: amount(row.action_price), dateEnd: a.date_end });
  }
  return out;
}

/** Bu dolar fiyatının vitrinde rakipten kaç ruble farklı olduğu (eksi = altında) */
function gapRub(p: Proposal, price: number) {
  if (!p.rival) return null;
  const rivalRub = p.rival.price * p.rival.rubPerUsd;
  return Math.round(price * p.rival.rubPerUsd * p.rival.factor - rivalRub);
}

/** Öneri hesabındaki maliyetler (Ozon kesintileri yüzde, kargo/depo sabit); bilinmiyorsa null */
function costOf(p: Proposal): CostBase | null {
  if (p.landedUsd == null || p.ozonShippingUsd == null || p.depotUsd == null) return null;
  return {
    landedUsd: p.landedUsd,
    ozonShippingUsd: p.ozonShippingUsd,
    depotUsd: p.depotUsd,
    fixedUsd: p.landedUsd + p.ozonShippingUsd + p.depotUsd,
    feePct: p.feePct,
    platformPct: p.platformPct,
    platformCapUsd: p.platformCapUsd,
  };
}

/** Bu fiyatta kalan net kâr */
function profitAt(p: Proposal, price: number) {
  const cost = costOf(p);
  return cost ? costProfitAt(price, cost).profit : null;
}

/**
 * Kampanyadan çıkış fiyatı; plan (onay penceresi) ve removeFromCampaign (gönderim) bunu kullanır, ayrışamazlar.
 * Kartın min_price'ı, tavanın 1 $ üstü, asgari kâr fiyatı: en büyüğü. Tavan bilinmeden seçilemez.
 */
function exitPriceOf(minPrice: number, maxAction: number | null, floorPrice: number | null) {
  return maxAction == null ? null : Math.max(minPrice, Math.floor(maxAction) + 1, floorPrice ?? 0);
}

/**
 * Önerinin kampanyaya yazılacak hâli: boost sınırının (price_max_elastic) üstündeyse sınıra indirilir (en yüksek
 * boost, asgari kârı bozmuyorsa); kampanya tavanının (max_action_price) üstündeyse yazılamaz.
 */
function fitToAction(p: Proposal, row: ActionRow) {
  const maxElastic = amount(row.price_max_elastic);
  const maxAction = amount(row.max_action_price);
  let next = p.newPrice!;
  let lowBoost = false;
  if (maxElastic && next > maxElastic) {
    const capped = Math.floor(maxElastic);
    if ((p.floorPrice == null || capped >= p.floorPrice) && capped >= next * (1 - MAX_BOOST_CUT_PCT)) next = capped;
    else lowBoost = true;
  }
  // Öneri Ozon'un kampanya tavanını aşıyorsa: kâr kalıyorsa tavana çekilir, ürün kampanyaya girmeli; rakibin çok altında
  // kalsa da (kullanıcı kararı 2026-10-03: kampanya dışında müşteri şişkin ana fiyatı görüyor, ürün satmıyor).
  // Tavan asgari kârın altındaysa yazılamaz.
  let atCeiling = false;
  let overCeiling = false;
  if (maxAction != null && next > maxAction) {
    const ceiling = Math.floor(maxAction);
    if (p.floorPrice == null || ceiling >= p.floorPrice) {
      next = ceiling;
      atCeiling = true;
      lowBoost = maxElastic != null && next > maxElastic;
    } else overCeiling = true;
  }
  return { next, maxElastic, maxAction, overCeiling, lowBoost, atCeiling };
}

/** offer_id → son SALES_DAYS günde satılan adet (veri tabanındaki siparişlerden, iptaller hariç) */
async function loadSales() {
  const since = new Date(Date.now() - SALES_DAYS * 864e5);
  const orders = await prisma.ozonOrder.findMany({
    where: { storeId: STORE, inProcessAt: { gte: since }, NOT: { status: 'cancelled' } },
    select: { productsJson: true },
  });
  const sold = new Map<string, number>();
  for (const o of orders)
    for (const p of (Array.isArray(o.productsJson) ? o.productsJson : []) as { offer_id?: string; quantity?: number }[])
      if (p.offer_id) sold.set(p.offer_id, (sold.get(p.offer_id) ?? 0) + (p.quantity ?? 1));
  return sold;
}

const near = (a: number | null, b: number | null) =>
  a == null || b == null ? a == b : Math.abs(a - b) <= Math.max(Math.abs(b) * REVIEW_TOLERANCE, 0.01);
/** Fiyat kararın kendisidir, payı yok: elle ya da toplu gönderimle her değişiklik kararı düşürür (0,01 yalnız okuma yuvarlaması) */
const samePrice = (a: number | null, b: number | null) => (a == null || b == null ? a == b : Math.abs(a - b) <= 0.01);

/**
 * "Elle kontrol" bölümü. Zarar ve "Ozon tavanı asgari kârın altında" önce gelir: rakip verisi şüpheli olan üründe de tavan
 * asgari kâra yetmiyorsa rakibe bakmanın anlamı yoktur.
 */
function checkKindOf(
  p: Proposal,
  current: number | null,
  maxAction: number | null,
  profitNow: number | null,
  overCeiling: boolean,
  hasOptions: boolean
): CheckKind {
  // Kampanyada olmayan ürün ancak hazır bir fiyatla eklenebiliyorsa fırsattır (kampanyadan çıkarılan CAF-P583S-AEUR:
  // tavan asgari kâra eşit, kâr ~0). Alınabilir kaynak yoksa maliyet tahmindir, eklenmez.
  if (current == null) return overCeiling || !hasOptions || !p.buyable ? 'blocked' : 'opportunity';
  // Stok 0'da sipariş gelemez: zarar değil, stok açılmadan düzeltilecek fiyat. Stok açılınca kendiliğinden 'loss' olur
  if (profitNow != null && profitNow < 0) return p.stock === 0 ? 'closed' : 'loss';
  if (overCeiling) return 'thin';
  if (p.floorPrice != null && current < p.floorPrice && maxAction != null && maxAction < p.floorPrice) return 'thin';
  return 'opportunity';
}

/** Hazır fiyatlar: %20 marj ve rakibin 11 ₽ altı (en yüksek boost sınırını aşmadan); asgari kâr ile tavan arasında, lojistik tavanını da geçmez (kampanyadaki kartta ana fiyat da bu fiyat olur) */
function optionsFor(p: Proposal, current: number | null, maxAction: number | null, maxElastic: number | null): CheckOption[] {
  const lo = p.floorPrice ?? 0;
  const hi = Math.min(maxAction != null ? Math.floor(maxAction) : Infinity, MAX_OZON_LIST_PRICE_USD);
  const out: CheckOption[] = [];
  const push = (key: CheckOption['key'], label: string, price: number) => {
    if (price < lo || price > hi || price === current || out.some((o) => o.price === price)) return;
    out.push({ key, label, price, profit: profitAt(p, price) });
  };
  if (p.targetPrice != null) push('target', '%20 marj', p.targetPrice);
  if (p.rivalTarget != null) {
    const boostCap = maxElastic != null ? Math.floor(maxElastic) : hi;
    const price = Math.min(p.rivalTarget, boostCap);
    push('rival', price < p.rivalTarget ? 'Rakibin altı, en yüksek boost' : 'Rakibin 11 ₽ altı', price);
  }
  return out;
}

const KIND_ORDER: CheckKind[] = ['loss', 'thin', 'opportunity', 'closed', 'blocked'];

export async function buildCampaignPlan() {
  const [{ proposals, eurUsd }, inAction, candidates, otherActions, sales, reviews] = await Promise.all([
    buildProposals(),
    loadAction('/v2/actions/products'),
    loadAction('/v2/actions/candidates'),
    loadOtherActions(),
    loadSales(),
    prisma.campaignReview.findMany({ where: { storeId: STORE } }),
  ]);
  const reviewOf = new Map(reviews.map((r) => [r.productId, r]));
  const exportLimitUsd = Math.floor((PRICING.exportLimitEur - 1) * eurUsd);

  const changes: CampaignChange[] = [];
  for (const p of proposals) {
    const row = inAction.get(p.productId) ?? candidates.get(p.productId);
    if (!row) continue;
    const current = inAction.has(p.productId) ? amount(row.action_price) : null;
    // Önerisi çıkmayan kart (750 € sınırında kâr yok): kampanyada ve fiyatı zarardaysa görünür olur, fiyat yerinde
    // kalır. Maliyeti bilinmeyen kart (ağırlık yok, "Hesaplanamadı") planın dışında kalır.
    const noProposal = p.newPrice == null || p.rule == null;
    if (noProposal && !(current != null && (profitAt(p, current) ?? 0) < 0)) continue;
    const { next, maxElastic, maxAction, overCeiling, lowBoost, atCeiling } = noProposal
      ? { next: current!, maxElastic: amount(row.price_max_elastic), maxAction: amount(row.max_action_price), overCeiling: false, lowBoost: false, atCeiling: false }
      : fitToAction(p, row);
    // Fiyat tam dolar gider: yazılarda da gönderilebilecek en yüksek fiyat görünür; hesaplar ham maxAction ile yapılır
    const ceiling = maxAction != null ? Math.floor(maxAction) : null;
    const cost = costOf(p);
    const exitPrice = current != null ? exitPriceOf(p.minPrice, maxAction, p.floorPrice) : null;
    const review = reviewOf.get(p.productId);
    const kept =
      review && p.stock > 0 && samePrice(review.price, current) && near(review.landedUsd, p.landedUsd) && near(review.maxAction, maxAction)
        ? review.createdAt.toISOString()
        : null;
    const base = {
      productId: p.productId,
      offerId: p.offerId,
      name: p.name,
      image: p.image,
      current,
      next,
      proposal: p.newPrice ?? next,
      rule: p.rule,
      rivalUsd: p.rivalUsd,
      rivalGapRubNext: gapRub(p, next),
      rivalGapRubNow: current != null ? gapRub(p, current) : null,
      rivalTarget: p.rivalTarget,
      floorPrice: p.floorPrice,
      profitAtNext: profitAt(p, next),
      maxElastic,
      maxAction,
      lowBoost,
      atCeiling,
      tag: null,
      checkKind: null,
      profitNow: current != null ? profitAt(p, current) : null,
      breakEvenUsd: cost ? priceForProfit(0, cost) : null,
      exitPrice,
      profitAtExit: exitPrice != null ? profitAt(p, exitPrice) : null,
      exportLimitUsd,
      basePrice: p.currentPrice,
      stock: p.stock,
      cost,
      purchaseEur: p.purchaseEur,
      landedUsd: p.landedUsd,
      source: p.source,
      buyable: p.buyable,
      ozonIndex: p.ozonIndex,
      sold: sales.get(p.offerId) ?? 0,
      options: [] as CheckOption[],
      keptAt: kept as string | null,
    };

    const other = current == null ? otherActions.get(p.productId) : undefined;
    if (other) {
      const end = new Date(other.dateEnd).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
      changes.push({
        ...base,
        group: 'other',
        reason: `Başka kampanyada: ${other.title}${other.price != null ? ` · ${other.price} $` : ''} · bitiş ${end}. O bitince eklenir.`,
      });
      continue;
    }
    if (noProposal || p.rule === 'check' || overCeiling || (current == null && !p.buyable)) {
      const options = optionsFor(p, current, maxAction, maxElastic);
      const checkKind = checkKindOf(p, current, maxAction, base.profitNow, overCeiling, options.length > 0);
      // Asgari kâr fiyatı başabaş değildir: ikisinin arasında da kâr var, yalnız asgarinin altında
      const limits = `Ozon tavanı ${ceiling ?? '—'} $, başabaş ${base.breakEvenUsd ?? '—'} $, asgari kâr fiyatı ${p.floorPrice ?? '—'} $`;
      const reason = noProposal
        ? (p.skipReason ?? 'Öneri hesaplanamadı')
        : {
            loss: `Şu anki fiyatta zarar. ${limits}`,
            closed: `Stok 0, sipariş gelemez ama şu anki fiyatta zarar. ${limits}`,
            thin: `Ozon en fazla ${ceiling ?? '—'} $'a izin veriyor, asgari kâr fiyatımız ${p.floorPrice} $`,
            opportunity: `Ozon'daki en ucuz rakip ${p.rivalUsd?.toFixed(0) ?? '—'} $. Rakibe eşitlemek fiyatı birkaç kat yükseltir, rakip verisi şüpheli olabilir`,
            blocked: !p.buyable
              ? 'Kampanyada değil. Alınabilir kaynak yok, maliyet yalnız tahmin: kampanyaya eklenmez'
              : `Kampanyada değil. Ozon en fazla ${ceiling ?? '—'} $'a izin veriyor, asgari kâr fiyatımız ${p.floorPrice} $`,
          }[checkKind];
      changes.push({
        ...base,
        group: 'check',
        reason,
        checkKind,
        options: checkKind === 'opportunity' && maxAction != null ? options : [],
      });
      continue;
    }
    if (current == null) {
      changes.push({
        ...base,
        group: 'add',
        reason: atCeiling ? `Kampanyada değil · öneri ${p.newPrice} $, Ozon en fazla ${ceiling} $'a izin veriyor` : 'Kampanyada değil',
      });
      continue;
    }
    if (next === current) continue;

    // Alınabilir kaynak yok, maliyet yalnız tahmin: indirim toplu gönderimde seçili gelmesin ("small" seçili gelmez). "cheaper" ve
    // "above-rival"in önüne geçer; zam ("below-floor", "profit-up") olduğu gibi kalır
    if (!p.buyable && next < current) {
      changes.push({ ...base, group: 'small', reason: 'Alınabilir kaynak yok, maliyet yalnız tahmin: fiyat indirimi önceden seçilmedi' });
      continue;
    }

    // Rakipten pahalıysak — kararı Ozon'un kendi endeksi verir (> 1,00). Bizim "11 ₽ altı" hedefimiz ruble kuru oynadıkça
    // her gün 1-3 $ kayıyor; yalnız ona bakınca endeksi yeşil 74 ürün "rakibin üstünde" sayılmıştı (2026-10-03).
    const aboveRival = p.rule === 'rival' && p.rivalTarget != null && current > p.rivalTarget && p.ozonIndex != null && p.ozonIndex > 1;
    const belowFloor = p.floorPrice != null && current < p.floorPrice;
    const diff = Math.abs(next - current);
    if (belowFloor) changes.push({ ...base, group: 'send', tag: 'below-floor', reason: `Asgari kârın altında (taban ${p.floorPrice} $)` });
    else if (aboveRival)
      changes.push({
        ...base,
        group: 'send',
        tag: 'above-rival',
        reason: `Ozon endeksi ${p.ozonIndex} (rakip ${p.rivalUsd?.toFixed(2)} $)`,
      });
    else if (diff >= MEANINGFUL_USD && diff / current >= MEANINGFUL_PCT)
      changes.push(
        next < current
          ? { ...base, group: 'send', tag: 'cheaper', reason: 'Maliyet düştü, daha ucuza satabiliriz' }
          : { ...base, group: 'send', tag: 'profit-up', reason: 'Gereğinden ucuz satıyoruz' }
      );
    else changes.push({ ...base, group: 'small', reason: 'Kur oynaması kadar küçük fark' });
  }

  const exportCapped = new Set(proposals.filter((p) => p.exportCapped).map((p) => p.productId));
  for (const ch of changes) if (exportCapped.has(ch.productId)) ch.reason += ' · 750 € ihracat sınırına çekildi';

  // Acil olanlar (rakipten pahalı, zarar riski) önce, sonra fırsatlar; her birinde büyük fark önce
  const urgent = (c: CampaignChange) => (c.tag === 'above-rival' || c.tag === 'below-floor' ? 0 : 1);
  const order: ChangeGroup[] = ['send', 'add', 'small', 'check', 'other'];
  // Elle kontrol: bölüm sırası, karar verilmişler bölümün sonunda, en kötü kâr (fırsatta en büyük rakip farkı) önce
  const checkRank = (c: CampaignChange) =>
    c.checkKind === 'opportunity' ? -((c.rivalUsd ?? 0) / (c.current ?? c.proposal)) : (c.profitNow ?? 0);
  changes.sort(
    (a, b) =>
      order.indexOf(a.group) - order.indexOf(b.group) ||
      (a.group === 'check'
        ? KIND_ORDER.indexOf(a.checkKind!) - KIND_ORDER.indexOf(b.checkKind!) ||
          Number(!!a.keptAt) - Number(!!b.keptAt) ||
          checkRank(a) - checkRank(b)
        : urgent(a) - urgent(b) || Math.abs(b.next - (b.current ?? b.next)) - Math.abs(a.next - (a.current ?? a.next)))
  );
  // Stoğu 0 olan kartın kararı geçersiz; plan salt okunur kalır, silmeyi GET ucu yapar (dropStaleReviews)
  const staleReviews = proposals.filter((p) => p.stock === 0 && reviewOf.has(p.productId)).map((p) => p.productId);
  return { changes, eurUsd, actionId: ELASTIC_ACTION_ID, inCampaign: inAction.size, candidates: candidates.size, staleReviews };
}

export interface ApplyResult {
  productId: string;
  offerId: string;
  from: number | null;
  to: number;
  ok: boolean;
  /** Ozon'un kabul sonrası okunan kampanya fiyatı (setBasePrice'ta ana fiyat) */
  verified: number | null;
  error: string | null;
  /** Yalnız kampanyadan çıkarmada: gönderilen, kartın bundan sonra satacağı fiyat (to 0 kalır) */
  exitPrice?: number | null;
  /** setBasePrice sonucu: from/to kampanya değil ana fiyat */
  base?: boolean;
}

/** Alınabilir kaynağı olmayan kartta indirim, ancak kullanıcı o fiyatı "alınamaz" hâliyle ekranda gördüyse gider. Sayfa açıkken tarama ya da teklif eleme kartı alınamaz yaptıysa eski seçim bu indirimi göndermez. */
export const isUnseenEstimateCut = (c: CampaignChange, estimateCuts: Record<string, number>) =>
  !c.buyable && c.current != null && c.next < c.current && estimateCuts[c.productId] !== c.next;

/**
 * Seçilen ürünleri yazar. Fiyat istemciden alınmaz: plan sunucuda yeniden hesaplanır ve yalnızca seçilen ürünlerin
 * güncel önerisi gönderilir ("check" grubu reddedilir). Sonra kampanya yeniden okunup her ürün doğrulanır.
 * estimateCuts: kullanıcının ekranda "alınamaz" hâliyle gördüğü indirimler; görülmemiş indirim hata olarak döner, kayda girmez.
 * Ozon tavanı okunamayan kart gönderilmez, hata olarak döner.
 */
export async function applyCampaignPrices(productIds: string[], estimateCuts: Record<string, number> = {}): Promise<ApplyResult[]> {
  const { changes } = await buildCampaignPlan();
  const byId = new Map(changes.map((c) => [c.productId, c]));
  const results: ApplyResult[] = [];
  const toSend: CampaignChange[] = [];
  for (const id of new Set(productIds)) {
    const c = byId.get(id);
    if (!c)
      results.push({
        productId: id,
        offerId: id,
        from: null,
        to: 0,
        ok: false,
        verified: null,
        error: 'Değişiklik yok ya da öneri hesaplanamadı',
      });
    else if (c.group === 'check' || c.group === 'other')
      results.push({ productId: id, offerId: c.offerId, from: c.current, to: c.next, ok: false, verified: null, error: c.reason });
    else if (isUnseenEstimateCut(c, estimateCuts))
      results.push({
        productId: id,
        offerId: c.offerId,
        from: c.current,
        to: c.next,
        ok: false,
        verified: null,
        error: `Alınabilir kaynak yok, maliyet yalnız tahmin (öneri ${c.next} $). Gönderilmedi; "Küçük fark" grubundan görerek seç`,
      });
    else if (c.maxAction == null)
      // Tavan bilinmeden sınır da bilinmez: üstündeki fiyat kartı kampanyadan çıkarıp kartın fiyatı olur (setManualPrice ve removeFromCampaign da reddeder)
      results.push({ productId: id, offerId: c.offerId, from: c.current, to: c.next, ok: false, verified: null, error: 'Ozon kampanya tavanı okunamadı' });
    else toSend.push(c);
  }

  const headers = getOzonHeaders(STORE);
  const rejected = new Map<string, string>();
  for (let i = 0; i < toSend.length; i += 100) {
    const batch = toSend.slice(i, i + 100);
    const res = await ozonFetch<{ rejected?: { product_id: number; reason: string }[] }>(
      '/v1/actions/products/update',
      {
        action_id: ELASTIC_ACTION_ID,
        products: batch.map((c) => ({ product_id: Number(c.productId), action_price: { amount: String(c.next), currency: 'USD' } })),
      },
      headers
    );
    for (const r of res.rejected ?? []) rejected.set(String(r.product_id), r.reason);
  }

  const after = toSend.length ? await loadAction('/v2/actions/products') : new Map<string, ActionRow>();
  for (const c of toSend) {
    const verified = amount(after.get(c.productId)?.action_price);
    const err = rejected.get(c.productId) ?? (verified !== c.next ? `Ozon'da okunan fiyat ${verified ?? 'yok'}` : null);
    results.push({ productId: c.productId, offerId: c.offerId, from: c.current, to: c.next, ok: !err, verified, error: err });
  }

  // Kayıt: endeks geçmişindeki "fiyatımız değişti" sebebinin kaynağı ve geri dönüş için
  if (toSend.length) {
    await prisma.campaignPriceChange.createMany({
      data: results
        .filter((r) => toSend.some((c) => c.productId === r.productId))
        .map((r) => {
          const c = byId.get(r.productId)!;
          return {
            storeId: STORE,
            actionId: ELASTIC_ACTION_ID,
            productId: r.productId,
            offerId: r.offerId,
            fromPrice: r.from,
            toPrice: r.to,
            group: c.tag ?? c.group,
            rule: c.rule ?? null,
            ok: r.ok,
            error: r.error,
          };
        }),
    });
  }
  return results;
}

/** Elle kontrol işlemleri yalnız o gruptaki ürünlere uygulanır; plan sunucuda yeniden hesaplanır */
async function checkRows(productIds: string[]) {
  const { changes } = await buildCampaignPlan();
  const byId = new Map(changes.filter((c) => c.group === 'check').map((c) => [c.productId, c]));
  return productIds.map((id) => ({ id, c: byId.get(id) ?? null }));
}

const recordChanges = (rows: { c: CampaignChange; from: number | null; to: number; group: string; ok: boolean; error: string | null }[]) =>
  rows.length
    ? prisma.campaignPriceChange.createMany({
        data: rows.map((r) => ({
          storeId: STORE,
          actionId: ELASTIC_ACTION_ID,
          productId: r.c.productId,
          offerId: r.c.offerId,
          fromPrice: r.from,
          toPrice: r.to,
          group: r.group,
          rule: r.c.rule ?? null,
          ok: r.ok,
          error: r.error,
        })),
      })
    : null;

/**
 * "Zararına satıyor" / "Ozon tavanı asgari kârın altında" ürünlerini Elastik boosting'den çıkarır, sonra kampanyayı yeniden okuyup
 * doğrular. Doğrulama çıkmayan ürünü hata olarak gösterir.
 *
 * /v2/actions/products/deactivate artık yalnız "Promo Codes" içindir; elastikte "unified price logic" hatası veriyor
 * (2026-10-29). Çıkarma /v1/actions/products/update ile yapılır: kampanya tavanının üstünde bir fiyat ürünü çıkarır,
 * ama gönderilen fiyat kartın fiyatı olur ve kart bundan sonra ondan satar (min_price her zaman güncellenmiyor: GC271810
 * 148 $ satıyor, min_price 122 $ kaldı). Bu yüzden üçünün en büyüğü gönderilir: kartın min_price'ı, tavanın 1 $ üstü, asgari
 * kâr fiyatı. Eskiden asgari kâr yoktu; min_price düşükse ürün kampanyadan çıkıp yine zararına satıyordu (FN101EUGY: 185 $ = −16 $).
 * min_price gönderim anında taze okunur; çıkış fiyatı lojistik tavanını (MAX_OZON_LIST_PRICE_USD) aşan kart gönderilmez, satışa kapanırdı.
 */
export async function removeFromCampaign(productIds: string[]): Promise<ApplyResult[]> {
  const rows = await checkRows([...new Set(productIds)]);
  const results: ApplyResult[] = [];
  // Tavan bilinmeden çıkarma fiyatı seçilemez: tavanın altındaki fiyat ürünü çıkarmaz, o fiyattan kampanyaya sokar
  const eligible = rows.filter((r) => r.c && r.c.current != null && r.c.checkKind !== 'opportunity' && r.c.maxAction != null);
  for (const r of rows)
    if (!eligible.includes(r))
      results.push({
        productId: r.id,
        offerId: r.c?.offerId ?? r.id,
        from: r.c?.current ?? null,
        to: 0,
        ok: false,
        verified: null,
        error: r.c && r.c.maxAction == null ? 'Ozon kampanya tavanı okunamadı' : 'Elle kontrolde kampanyadaki zararlı/az kârlı ürün değil',
      });
  if (!eligible.length) return results;

  const headers = getOzonHeaders(STORE);
  const prices = await ozonFetch<{ items: { product_id: number; price: { min_price: number } }[] }>(
    '/v5/product/info/prices',
    { filter: { product_id: eligible.map((r) => r.id), visibility: 'ALL' }, limit: 1000 },
    headers
  );
  const minPrice = new Map(prices.items.map((i) => [String(i.product_id), Number(i.price.min_price) || 0]));
  const exitOf = new Map(eligible.map((r) => [r.id, exitPriceOf(minPrice.get(r.id) ?? 0, r.c!.maxAction, r.c!.floorPrice)!]));
  const ok = eligible.filter((r) => exitOf.get(r.id)! <= MAX_OZON_LIST_PRICE_USD);
  for (const r of eligible)
    if (!ok.includes(r))
      results.push({
        productId: r.id,
        offerId: r.c!.offerId,
        from: r.c!.current,
        to: 0,
        ok: false,
        verified: null,
        exitPrice: exitOf.get(r.id),
        error: `Çıkış fiyatı ${exitOf.get(r.id)} $, lojistik tavanını (${MAX_OZON_LIST_PRICE_USD} $) aşıyor: kart satışa kapanırdı, çıkarılmadı`,
      });
  if (!ok.length) return results;

  const res = await ozonFetch<{ rejected?: { product_id: number; reason: string }[] }>(
    '/v1/actions/products/update',
    {
      action_id: ELASTIC_ACTION_ID,
      products: ok.map((r) => ({
        product_id: Number(r.id),
        action_price: { amount: String(exitOf.get(r.id)), currency: 'USD' },
      })),
    },
    headers
  );
  const rejected = new Map((res.rejected ?? []).map((r) => [String(r.product_id), r.reason]));
  const after = await loadAction('/v2/actions/products');
  const done = ok.map((r) => {
    const still = after.has(r.id);
    const error = still ? (rejected.get(r.id) ? `Ozon reddetti: ${rejected.get(r.id)}` : 'Ozon ürünü kampanyada tutuyor') : null;
    return { c: r.c!, from: r.c!.current, to: 0, group: 'removed', ok: !still, error };
  });
  await recordChanges(done);
  for (const d of done)
    results.push({ productId: d.c.productId, offerId: d.c.offerId, from: d.from, to: 0, ok: d.ok, verified: null, error: d.error, exitPrice: exitOf.get(d.c.productId) });
  return results;
}

/** Zararına fiyat yalnız açık onayla gider: arayüz kârı gösterip sorar, onay istekte confirmLoss olarak gelir */
function lossRefusal(c: CampaignChange, price: number, confirmLoss: boolean) {
  const profit = c.cost ? costProfitAt(price, c.cost).profit : null;
  return profit != null && profit < 0 && !confirmLoss ? `${price} $'da satış başına ${Math.abs(profit).toFixed(2)} $ zarar; zararına fiyat için onay gerekli` : null;
}

/** Elle kontrolden tek ürüne elle kampanya fiyatı: tam dolar, Ozon tavanını geçemez (üstünde kart kampanyadan çıkar), lojistik tavanını geçemez (kartın ana fiyatı da bu fiyat olur), tavan okunamadıysa yazılmaz; zararına fiyat onay ister */
export async function setManualPrice(productId: string, price: number, confirmLoss = false): Promise<ApplyResult> {
  const [{ c }] = await checkRows([productId]);
  const fail = (error: string): ApplyResult => ({
    productId,
    offerId: c?.offerId ?? productId,
    from: c?.current ?? null,
    to: price,
    ok: false,
    verified: null,
    error,
  });
  if (!c) return fail('Ürün elle kontrol grubunda değil');
  if (c.checkKind === 'blocked') return fail('Ürün kampanyada değil ve giremiyor; yalnız ana fiyatı değiştirilebilir');
  if (!Number.isInteger(price) || price <= 0) return fail('Fiyat tam dolar olmalı');
  // Tavan bilinmeden sınır da bilinmez: üstündeki fiyat kartı kampanyadan çıkarıp kartın fiyatı olur (removeFromCampaign da reddeder)
  if (c.maxAction == null) return fail('Ozon kampanya tavanı okunamadı');
  if (price > Math.floor(c.maxAction)) return fail(`Ozon tavanının (${Math.floor(c.maxAction)} $) üstünde: kart kampanyadan çıkar`);
  if (price > MAX_OZON_LIST_PRICE_USD) return fail(`Lojistik tavanının (${MAX_OZON_LIST_PRICE_USD} $) üstünde: kart satışa kapanır`);
  const refusal = lossRefusal(c, price, confirmLoss);
  if (refusal) return fail(refusal);

  const res = await ozonFetch<{ rejected?: { product_id: number; reason: string }[] }>(
    '/v1/actions/products/update',
    {
      action_id: ELASTIC_ACTION_ID,
      products: [{ product_id: Number(productId), action_price: { amount: String(price), currency: 'USD' } }],
    },
    getOzonHeaders(STORE)
  );
  const verified = amount((await loadAction('/v2/actions/products')).get(productId)?.action_price);
  const error = res.rejected?.[0]?.reason ?? (verified !== price ? `Ozon'da okunan fiyat ${verified ?? 'yok'}` : null);
  await recordChanges([{ c, from: c.current, to: price, group: 'manual', ok: !error, error }]);
  return { productId, offerId: c.offerId, from: c.current, to: price, ok: !error, verified, error };
}

/**
 * Kampanyada olmayan, giremeyen ("blocked") kartın ana fiyatı: kampanya olmadığı için müşteri bunu görür. Tam dolar, lojistik
 * tavanını ve 750 € ihracat sınırını geçemez; zararına fiyat onay ister. Güncel değerler Ozon'dan okunur: üstü çizili fiyat yeni
 * fiyatın üstündeyse kalır, değilse yeni fiyat × 1,2; min_price yeni fiyat olur. Ozon kabul etse de fiyat yeniden okunur, süresinde
 * oturmazsa başarısız sayılır.
 */
export async function setBasePrice(productId: string, price: number, confirmLoss = false): Promise<ApplyResult> {
  const started = Date.now();
  const [{ c }] = await checkRows([productId]);
  const fail = (error: string): ApplyResult => ({
    productId,
    offerId: c?.offerId ?? productId,
    from: c?.basePrice ?? null,
    to: price,
    ok: false,
    verified: null,
    error,
    base: true,
  });
  if (!c || c.checkKind !== 'blocked' || c.current != null) return fail('Ürün "Kampanyaya giremiyor" bölümünde değil');
  if (!Number.isInteger(price) || price <= 0) return fail('Fiyat tam dolar olmalı');
  if (price > MAX_OZON_LIST_PRICE_USD) return fail(`Lojistik tavanının (${MAX_OZON_LIST_PRICE_USD} $) üstünde: kart satışa kapanır`);
  if (price > c.exportLimitUsd) return fail(`750 € ihracat sınırının (${c.exportLimitUsd} $) üstünde`);
  const refusal = lossRefusal(c, price, confirmLoss);
  if (refusal) return fail(refusal);

  const headers = getOzonHeaders(STORE);
  const read = async () =>
    (
      await ozonFetch<{ items: { price: { price: number | string; old_price: number | string; vat?: number | string } }[] }>(
        '/v5/product/info/prices',
        { filter: { product_id: [productId], visibility: 'ALL' }, limit: 1 },
        headers
      )
    ).items[0]?.price;
  const fresh = await read();
  if (!fresh) return fail("Ozon'dan güncel fiyat okunamadı");
  const from = Number(fresh.price) || 0;
  const oldNow = Math.round(Number(fresh.old_price) || 0);
  const res = await ozonFetch<{ result?: { updated: boolean; errors?: { code: string; message: string }[] }[] }>(
    '/v1/product/import/prices',
    {
      prices: [
        {
          offer_id: c.offerId,
          product_id: Number(productId),
          price: String(price),
          old_price: String(oldNow > price ? oldNow : Math.round(price * PRICING.oldPriceMultiplier)),
          min_price: String(price),
          currency_code: 'USD',
          vat: String(fresh.vat ?? '0'),
          auto_action_enabled: 'DISABLED',
          price_strategy_enabled: 'DISABLED',
        },
      ],
    },
    headers
  );
  const r = res.result?.[0];
  let error = r?.updated && !r.errors?.length ? null : `Ozon reddetti: ${r?.errors?.map((x) => x.message).join('; ') || 'güncellenmedi'}`;
  let verified: number | null = null;
  if (!error) {
    for (;;) {
      verified = Number((await read().catch(() => null))?.price) || null;
      if (verified === price || Date.now() - started >= BASE_VERIFY_MS) break;
      await new Promise((done) => setTimeout(done, BASE_VERIFY_STEP_MS));
    }
    if (verified !== price) error = `Ozon kabul etti ama fiyat doğrulanamadı (okunan ${verified ?? 'yok'}); birkaç dakika sonra kontrol et`;
  }
  await recordChanges([{ c, from, to: price, group: 'base', ok: !error, error }]);
  return { productId, offerId: c.offerId, from, to: price, ok: !error, verified, error, base: true };
}

/** "Olduğu gibi kalsın": o anki fiyat, maliyet ve tavanla saklanır; fiyat değişince ya da maliyet veya tavan %3'ten fazla oynayınca karar düşer (buildCampaignPlan). Stok 0'da verilemez */
export async function keepAsIs(productId: string) {
  const [{ c }] = await checkRows([productId]);
  if (!c) throw new Error('Ürün elle kontrol grubunda değil');
  if (c.stock === 0) throw new Error('Stok 0: sipariş gelemez, karar stok varken verilir');
  const data = { offerId: c.offerId, price: c.current, landedUsd: c.landedUsd, maxAction: c.maxAction, createdAt: new Date() };
  await prisma.campaignReview.upsert({
    where: { storeId_productId: { storeId: STORE, productId } },
    create: { storeId: STORE, productId, ...data },
    update: data,
  });
}

export async function undoKeep(productId: string) {
  await prisma.campaignReview.deleteMany({ where: { storeId: STORE, productId } });
}

/** Stoğu 0 olan kartların kararlarını siler (buildCampaignPlan → staleReviews). Yalnız GET /api/kampanya-fiyat çağırır: plan stok 0 iken açılmazsa satır kalır */
export async function dropStaleReviews(productIds: string[]) {
  if (productIds.length) await prisma.campaignReview.deleteMany({ where: { storeId: STORE, productId: { in: productIds } } });
}
