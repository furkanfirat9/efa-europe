import { getOzonHeaders, ozonFetch } from './gate';

/* --------------------------------------------------------------------------
   Avrupa mağazasındaki (store1) bütün ürünlerin offer_id'leri.

   Amazon avcısının "Ozon'da zaten var mı" kontrolü eskiden elle güncellenen
   data/ozon_live_catalog.json'a bakıyordu; dosya 371 ürünün yalnızca 71'ini
   biliyordu ve Vercel'de hiç güncellenemiyordu. Liste artık her taramada
   Ozon'dan çekilir ve kısa süre hafızada tutulur.
-------------------------------------------------------------------------- */

const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; offerIds: string[] } | null = null;
let inflight: Promise<string[]> | null = null;

async function fetchAll(): Promise<string[]> {
  const headers = getOzonHeaders('store1');
  if (!headers['Client-Id'] || !headers['Api-Key']) {
    throw new Error('Ozon mağaza API bilgileri bulunamadı.');
  }

  const offerIds: string[] = [];
  let lastId = '';
  // /v3/product/list tek istekte en fazla 1000 ürün verir; devamı last_id ile istenir.
  for (let page = 0; page < 50; page++) {
    const json = await ozonFetch<any>(
      '/v3/product/list',
      { filter: { visibility: 'ALL' }, last_id: lastId, limit: 1000 },
      headers
    );
    const items: { offer_id?: string; archived?: boolean }[] = json.result?.items || [];
    for (const item of items) {
      if (item.offer_id && !item.archived) offerIds.push(item.offer_id);
    }
    lastId = json.result?.last_id || '';
    if (!items.length || !lastId || offerIds.length >= (json.result?.total || 0)) break;
  }
  return offerIds;
}

/** Mağazadaki arşivlenmemiş ürünlerin offer_id'leri (10 dakika önbellekli). */
export async function getStoreOfferIds(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.offerIds;
  // Aynı anda gelen taramalar Ozon'a ikinci kez sormaz.
  inflight ??= fetchAll()
    .then((offerIds) => {
      cache = { at: Date.now(), offerIds };
      return offerIds;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
