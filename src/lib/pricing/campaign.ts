import { prisma } from '@/lib/db/prisma';
import { getOzonHeaders, ozonFetch } from '@/lib/ozon/gate';
import { buildProposals, type Proposal } from './proposals';

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
 *   check  kural "elle kontrol" ya da Ozon tavanı aşılıyor → hiç otomatik seçilmez
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

/** Bu fiyatta kalan net kâr: öneri hesabındaki maliyetlerle (komisyon yüzde, kargo/depo sabit). */
function profitAt(p: Proposal, price: number) {
  if (p.landedUsd == null || p.ozonShippingUsd == null || p.depotUsd == null) return null;
  return price * (1 - p.feePct) - p.landedUsd - p.ozonShippingUsd - p.depotUsd;
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

export async function buildCampaignPlan() {
  const [{ proposals, eurUsd }, inAction, candidates] = await Promise.all([
    buildProposals(),
    loadAction('/v2/actions/products'),
    loadAction('/v2/actions/candidates'),
  ]);

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
    };

    if (p.rule === 'check') {
      changes.push({ ...base, group: 'check', reason: 'Önerilen fiyat abartılı görünüyor, elle kontrol' });
      continue;
    }
    if (overCeiling) {
      changes.push({
        ...base,
        group: 'check',
        reason: `Ozon'un kampanya tavanı ${maxAction} $ asgari kârın (${p.floorPrice} $) altında; zararına girer`,
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

  // Acil olanlar (rakipten pahalı, zarar riski) önce, sonra fırsatlar; her birinde büyük fark önce
  const urgent = (c: CampaignChange) => (c.tag === 'above-rival' || c.tag === 'below-floor' ? 0 : 1);
  const order: ChangeGroup[] = ['send', 'add', 'small', 'check'];
  changes.sort(
    (a, b) =>
      order.indexOf(a.group) - order.indexOf(b.group) ||
      urgent(a) - urgent(b) ||
      Math.abs(b.next - (b.current ?? b.next)) - Math.abs(a.next - (a.current ?? a.next))
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
