import { prisma } from '@/lib/db/prisma';
import { getOzonHeaders, ozonFetch } from '@/lib/ozon/gate';
import { buildProposals, type Proposal, type SupplySource } from './proposals';
import { profitAt as costProfitAt } from './rules';

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
 *   small  daha küçük fark (kur oynaması) → görünür, seçili değil
 *   add    kampanyada değil, girebilir → ayrı liste
 *   check  kural "elle kontrol" ya da Ozon tavanı aşılıyor → hiç otomatik seçilmez. Sayfada dört bölüm (checkKind,
 *          kullanıcıyla 2026-10-10): loss (şu anki fiyatta zarar), thin (Ozon tavanı kâr sınırımızın altında),
 *          opportunity (en ucuz rakip bizden çok pahalı; hazır fiyat seçenekleri), blocked (kampanyada değil, giremiyor).
 *          "Olduğu gibi kalsın" kararı CampaignReview'da; fiyat, maliyet ya da tavan değişince düşer.
 */

const STORE = 'store1';
/** Elastik boosting (süresiz, 2026-12-31'e kadar) */
export const ELASTIC_ACTION_ID = 1977747;
const MEANINGFUL_PCT = 0.02;
const MEANINGFUL_USD = 2;
/** Öneri boost sınırının (price_max_elastic) üstündeyse sınıra en fazla bu kadar indirilir; daha fazlası kâr yakar
 *  ve rakipten gereksiz uzaklaştırır (PSG8200/80: öneri 759 $, sınır 644 $) — o zaman öneri kalır, boost düşer. */
const MAX_BOOST_CUT_PCT = 0.03;

export type ChangeGroup = 'send' | 'small' | 'add' | 'check';
export type ChangeTag = 'above-rival' | 'below-floor' | 'profit-up' | 'cheaper';
export type CheckKind = 'loss' | 'thin' | 'opportunity' | 'blocked';

/** "Rakipten çok ucuzuz" bölümündeki hazır fiyat: asgari kâr ile Ozon tavanı arasında */
export interface CheckOption {
  key: 'target' | 'rival';
  label: string;
  price: number;
  profit: number | null;
}

/** Satış adedi bu kadar günden sayılır */
const SALES_DAYS = 60;
/** "Olduğu gibi kalsın" kararı maliyet ya da tavan bu orandan fazla değişince düşer */
const REVIEW_TOLERANCE = 0.03;

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
  purchaseEur: number | null;
  /** Alış + gelen kargo ($): "olduğu gibi kalsın" kararının geçerlilik kontrolü */
  landedUsd: number | null;
  source: SupplySource | null;
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

async function loadAction(path: '/v2/actions/products' | '/v2/actions/candidates') {
  const headers = getOzonHeaders(STORE);
  const rows = new Map<string, ActionRow>();
  let last_id = '';
  for (;;) {
    const res = await ozonFetch<{ products: ActionRow[]; last_id: string }>(
      path,
      { action_id: ELASTIC_ACTION_ID, limit: 100, last_id },
      headers
    );
    for (const p of res.products ?? []) rows.set(String(p.id), p);
    if (!res.last_id || !res.products?.length) break;
    last_id = res.last_id;
  }
  return rows;
}

/** Bu dolar fiyatının vitrinde rakipten kaç ruble farklı olduğu (eksi = altında) */
function gapRub(p: Proposal, price: number) {
  if (!p.rival) return null;
  const rivalRub = p.rival.price * p.rival.rubPerUsd;
  return Math.round(price * p.rival.rubPerUsd * p.rival.factor - rivalRub);
}

/** Bu fiyatta kalan net kâr: öneri hesabındaki maliyetlerle (Ozon kesintileri yüzde, kargo/depo sabit). */
function profitAt(p: Proposal, price: number) {
  if (p.landedUsd == null || p.ozonShippingUsd == null || p.depotUsd == null) return null;
  return costProfitAt(price, {
    landedUsd: p.landedUsd,
    ozonShippingUsd: p.ozonShippingUsd,
    depotUsd: p.depotUsd,
    fixedUsd: p.landedUsd + p.ozonShippingUsd + p.depotUsd,
    feePct: p.feePct,
    platformPct: p.platformPct,
    platformCapUsd: p.platformCapUsd,
  }).profit;
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

/**
 * "Elle kontrol" bölümü. Zarar ve "Ozon izin vermiyor" önce gelir: rakip verisi şüpheli olan üründe de fiyat
 * yükseltilemiyorsa orada yapılacak bir şey yoktur.
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
  // tavan asgari kâra eşit, kâr ~0)
  if (current == null) return overCeiling || !hasOptions ? 'blocked' : 'opportunity';
  if (profitNow != null && profitNow < 0) return 'loss';
  if (overCeiling) return 'thin';
  if (p.floorPrice != null && current < p.floorPrice && maxAction != null && maxAction < p.floorPrice) return 'thin';
  return 'opportunity';
}

/** Hazır fiyatlar: %20 marj ve rakibin 11 ₽ altı (en yüksek boost sınırını aşmadan); asgari kâr ile tavan arasında */
function optionsFor(p: Proposal, current: number | null, maxAction: number | null, maxElastic: number | null): CheckOption[] {
  const lo = p.floorPrice ?? 0;
  const hi = maxAction != null ? Math.floor(maxAction) : Infinity;
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

const KIND_ORDER: CheckKind[] = ['loss', 'thin', 'opportunity', 'blocked'];

export async function buildCampaignPlan() {
  const [{ proposals, eurUsd }, inAction, candidates, sales, reviews] = await Promise.all([
    buildProposals(),
    loadAction('/v2/actions/products'),
    loadAction('/v2/actions/candidates'),
    loadSales(),
    prisma.campaignReview.findMany({ where: { storeId: STORE } }),
  ]);
  const reviewOf = new Map(reviews.map((r) => [r.productId, r]));

  const changes: CampaignChange[] = [];
  for (const p of proposals) {
    if (p.newPrice == null || p.rule == null) continue;
    const row = inAction.get(p.productId) ?? candidates.get(p.productId);
    if (!row) continue;
    const current = inAction.has(p.productId) ? amount(row.action_price) : null;
    const { next, maxElastic, maxAction, overCeiling, lowBoost, atCeiling } = fitToAction(p, row);
    const base = {
      productId: p.productId,
      offerId: p.offerId,
      name: p.name,
      image: p.image,
      current,
      next,
      proposal: p.newPrice,
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
      purchaseEur: p.purchaseEur,
      landedUsd: p.landedUsd,
      source: p.source,
      ozonIndex: p.ozonIndex,
      sold: sales.get(p.offerId) ?? 0,
      options: [] as CheckOption[],
      keptAt: null as string | null,
    };

    if (p.rule === 'check' || overCeiling) {
      const options = optionsFor(p, current, maxAction, maxElastic);
      const checkKind = checkKindOf(p, current, maxAction, base.profitNow, overCeiling, options.length > 0);
      const review = reviewOf.get(p.productId);
      const kept =
        review && near(review.price, current) && near(review.landedUsd, p.landedUsd) && near(review.maxAction, maxAction)
          ? review.createdAt.toISOString()
          : null;
      const reason = {
        loss: `Şu anki fiyatta zarar. Ozon en fazla ${maxAction} $'a izin veriyor, kâr için en az ${p.floorPrice} $ gerekir`,
        thin: `Ozon en fazla ${maxAction} $'a izin veriyor, asgari kâr fiyatımız ${p.floorPrice} $`,
        opportunity: `Ozon'daki en ucuz rakip ${p.rivalUsd?.toFixed(0) ?? '—'} $. Rakibe eşitlemek fiyatı birkaç kat yükseltir, rakip verisi şüpheli olabilir`,
        blocked: `Kampanyada değil. Ozon en fazla ${maxAction} $'a izin veriyor, asgari kâr fiyatımız ${p.floorPrice} $`,
      }[checkKind];
      changes.push({
        ...base,
        group: 'check',
        reason,
        checkKind,
        keptAt: kept,
        options: checkKind === 'opportunity' ? options : [],
      });
      continue;
    }
    if (current == null) {
      changes.push({
        ...base,
        group: 'add',
        reason: atCeiling ? `Kampanyada değil · öneri ${p.newPrice} $, Ozon en fazla ${maxAction} $'a izin veriyor` : 'Kampanyada değil',
      });
      continue;
    }
    if (next === current) continue;

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
  const order: ChangeGroup[] = ['send', 'add', 'small', 'check'];
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
  return { changes, eurUsd, actionId: ELASTIC_ACTION_ID, inCampaign: inAction.size, candidates: candidates.size };
}

export interface ApplyResult {
  productId: string;
  offerId: string;
  from: number | null;
  to: number;
  ok: boolean;
  /** Ozon'un kabul sonrası okunan kampanya fiyatı */
  verified: number | null;
  error: string | null;
}

/**
 * Seçilen ürünleri yazar. Fiyat istemciden alınmaz: plan sunucuda yeniden hesaplanır ve yalnızca seçilen ürünlerin
 * güncel önerisi gönderilir ("check" grubu reddedilir). Sonra kampanya yeniden okunup her ürün doğrulanır.
 */
export async function applyCampaignPrices(productIds: string[]): Promise<ApplyResult[]> {
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
    else if (c.group === 'check')
      results.push({ productId: id, offerId: c.offerId, from: c.current, to: c.next, ok: false, verified: null, error: c.reason });
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
 * "Zararına satıyor" / "Ozon izin vermiyor" ürünlerini Elastik boosting'den çıkarır, sonra kampanyayı yeniden okuyup
 * doğrular. Ozon 13 Ekim 2026'dan sonra /v2/actions/products/deactivate'i yalnız "Promo Codes" için bırakıyor; elastik
 * kampanyadan çıkarma /v1/actions/products/update'e taşınıyor. Doğrulama çıkmayan ürünü hata olarak gösterir.
 */
export async function removeFromCampaign(productIds: string[]): Promise<ApplyResult[]> {
  const rows = await checkRows([...new Set(productIds)]);
  const results: ApplyResult[] = [];
  const ok = rows.filter((r) => r.c && r.c.current != null && r.c.checkKind !== 'opportunity');
  for (const r of rows)
    if (!ok.includes(r))
      results.push({
        productId: r.id,
        offerId: r.c?.offerId ?? r.id,
        from: r.c?.current ?? null,
        to: 0,
        ok: false,
        verified: null,
        error: 'Elle kontrolde kampanyadaki zararlı/az kârlı ürün değil',
      });
  if (!ok.length) return results;

  await ozonFetch(
    '/v2/actions/products/deactivate',
    { action_id: ELASTIC_ACTION_ID, product_ids: ok.map((r) => Number(r.id)) },
    getOzonHeaders(STORE)
  );
  const after = await loadAction('/v2/actions/products');
  const done = ok.map((r) => {
    const still = after.has(r.id);
    return { c: r.c!, from: r.c!.current, to: 0, group: 'removed', ok: !still, error: still ? 'Ozon ürünü kampanyada tutuyor' : null };
  });
  await recordChanges(done);
  for (const d of done)
    results.push({ productId: d.c.productId, offerId: d.c.offerId, from: d.from, to: 0, ok: d.ok, verified: null, error: d.error });
  return results;
}

/** Elle kontrolden tek ürüne elle kampanya fiyatı: asgari kâr ile Ozon tavanı arasında, tam dolar */
export async function setManualPrice(productId: string, price: number): Promise<ApplyResult> {
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
  if (!Number.isInteger(price) || price <= 0) return fail('Fiyat tam dolar olmalı');
  if (c.floorPrice != null && price < c.floorPrice) return fail(`Asgari kâr fiyatının (${c.floorPrice} $) altında`);
  if (c.maxAction != null && price > Math.floor(c.maxAction)) return fail(`Ozon tavanının (${c.maxAction} $) üstünde`);

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

/** "Olduğu gibi kalsın": o anki fiyat, maliyet ve tavanla saklanır; biri değişince karar düşer (buildCampaignPlan) */
export async function keepAsIs(productId: string) {
  const [{ c }] = await checkRows([productId]);
  if (!c) throw new Error('Ürün elle kontrol grubunda değil');
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
