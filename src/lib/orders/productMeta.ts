/** Siparişin ilk ürününün offer_id, ad ve görseli; kolonlar boşsa Ozon'un ham verisinden tamamlanır. */
export function extractProductMeta(p: any) {
  let offerId = p.productOfferId || '';
  let title = p.productTitle || '';
  let image = p.productImage || '';
  let sku = '';

  if (p.productsJson && Array.isArray(p.productsJson) && p.productsJson.length > 0) {
    const first = p.productsJson[0];
    if (!offerId && first.offer_id) offerId = first.offer_id;
    if (!title && first.name) title = first.name;
    if (first.sku) sku = String(first.sku);
  }

  // Raw veriden görsel kontrolü
  if (!image && p.rawDataJson?.products?.[0]?.sku) {
    const rawProd = p.rawDataJson.products[0];
    if (rawProd.image_url) image = rawProd.image_url;
  }

  return { offerId, title, image, sku };
}
