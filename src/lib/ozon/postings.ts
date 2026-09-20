import { ozonFetch } from './gate';

/* --------------------------------------------------------------------------
   Sipariş (posting) çekme yardımcıları.

   Ozon Moskova saatine (UTC+3) göre çalışıyor ve panelin kullanıcısı da aynı
   dilimde. Bu yüzden "Eylül ayı" derken kastedilen 1 Eylül 00:00 ile 30 Eylül
   23:59 arası UTC+3'tür. Ay sınırını sunucunun yerel saatine bırakmak, aynı
   kodun geliştirme makinesinde (UTC+3) ve Vercel'de (UTC) farklı aylar
   üretmesine yol açıyordu; sınır artık her yerde açıkça UTC+3.
-------------------------------------------------------------------------- */

/** Moskova/Türkiye saatine göre bir ayın başı ve sonu. */
export function monthRangeMsk(year: number, month: number) {
  // Ayın 1'i 00:00 UTC+3 = önceki günün 21:00 UTC'si.
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - 3 * 3600 * 1000);
  // Sonraki ayın 1'i 00:00 UTC+3 (bitiş hariç tutulur).
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - 3 * 3600 * 1000);
  return { start, end, sinceISO: start.toISOString(), toISO: new Date(end.getTime() - 1).toISOString() };
}

/** Moskova/Türkiye saatine göre içinde bulunulan yıl ve ay. */
export function currentMonthMsk(): { year: number; month: number } {
  const local = new Date(Date.now() + 3 * 3600 * 1000);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1 };
}

/**
 * Verilen aralıktaki tüm FBS gönderilerini sayfalayarak çeker.
 *
 * Ozon tek istekte en fazla 1000 kayıt veriyor ve devamı olup olmadığını
 * `has_next` ile bildiriyor. Çağrılar ozonFetch kapısından geçtiği için
 * mağaza bazlı hız sınırı ve 429 yeniden denemesi otomatik uygulanır.
 */
export async function fetchPostingsForRange(
  sinceISO: string,
  toISO: string,
  headers: Record<string, string>,
  options: { maxPostings?: number; dir?: 'ASC' | 'DESC' } = {}
): Promise<any[]> {
  const { maxPostings = 20000, dir = 'DESC' } = options;
  const pageSize = 1000;
  const postings: any[] = [];
  let offset = 0;

  while (true) {
    const json = await ozonFetch<any>(
      '/v3/posting/fbs/list',
      {
        dir,
        filter: { since: sinceISO, to: toISO },
        limit: pageSize,
        offset,
        with: { analytics_data: true, financial_data: true },
      },
      headers
    );

    const batch = json.result?.postings || [];
    postings.push(...batch);

    if (!json.result?.has_next || batch.length === 0 || postings.length >= maxPostings) {
      break;
    }

    offset += batch.length;
  }

  return postings;
}

/**
 * Gönderilerdeki ürünleri Ozon ürün kataloğuyla zenginleştirir: görsel,
 * başlık ve offer_id yerinde güncellenir.
 *
 * SKU listesi 500'lük paketler hâlinde sorulur — sipariş listesi bir ayda
 * yüzlerce farklı ürün içerebiliyor ve her istek mağazanın kotasından yiyor.
 */
export async function enrichPostingsWithProductDetails(
  postings: any[],
  headers: Record<string, string>
): Promise<void> {
  if (!postings || postings.length === 0) return;

  const skus = new Set<number>();
  for (const p of postings) {
    for (const prod of p.products || []) {
      const numSku = Number(prod.sku);
      if (!isNaN(numSku) && numSku > 0) skus.add(numSku);
    }
  }
  if (skus.size === 0) return;

  const skuImageMap = new Map<number, string>();
  const skuTitleMap = new Map<number, string>();
  const skuOfferIdMap = new Map<number, string>();

  const all = Array.from(skus);
  const chunkSize = 500;

  for (let i = 0; i < all.length; i += chunkSize) {
    const chunk = all.slice(i, i + chunkSize);
    try {
      const data = await ozonFetch<any>('/v3/product/info/list', { sku: chunk }, headers);
      for (const item of data.items || []) {
        const img =
          (Array.isArray(item.primary_image) ? item.primary_image[0] : item.primary_image) ||
          (Array.isArray(item.images) ? item.images[0] : item.images) ||
          '';
        const numSku = Number(item.sku);
        if (numSku && img) skuImageMap.set(numSku, img);
        if (numSku && item.name) skuTitleMap.set(numSku, item.name);
        if (numSku && item.offer_id) skuOfferIdMap.set(numSku, item.offer_id);
      }
    } catch (e) {
      // Ürün bilgisi eksikliği senkronu çökertmez; ad/görsel boş kalır.
      console.warn('[Ozon] Ürün bilgisi/görseli çekilemedi:', e);
    }
  }

  for (const p of postings) {
    const first = p.products?.[0];
    if (!first) continue;
    const sku = Number(first.sku);
    if (!sku) continue;
    if (skuImageMap.has(sku)) p.product_image = skuImageMap.get(sku);
    if (skuTitleMap.has(sku)) first.name = skuTitleMap.get(sku);
    if (skuOfferIdMap.has(sku)) first.offer_id = skuOfferIdMap.get(sku);
  }
}
