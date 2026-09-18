import { NextRequest, NextResponse } from 'next/server';
import { syncOzonOrdersToDb } from '@/lib/db/orders';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

async function fetchStoreOrders(clientId: string, apiKey: string, storeId: string) {
  if (!clientId || !apiKey) return [];

  const headers = {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  };

  const sinceISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toISO = new Date().toISOString();

  try {
    const res = await fetch('https://api-seller.ozon.ru/v3/posting/fbs/list', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dir: 'DESC',
        filter: { since: sinceISO, to: toISO },
        limit: 50,
        with: { analytics_data: true, financial_data: true },
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      console.warn(`[Ozon Sync] HTTP ${res.status} for store ${storeId}`);
      return [];
    }

    const json = await res.json();
    return json.result?.postings || [];
  } catch (err: any) {
    console.warn(`[Ozon Sync] Error for store ${storeId}:`, err.message);
    return [];
  }
}

async function enrichPostingsWithProductDetails(
  postings: any[],
  clientId: string,
  apiKey: string
) {
  if (!postings || postings.length === 0 || !clientId || !apiKey) return;

  const skus = new Set<number>();
  for (const p of postings) {
    for (const prod of p.products || []) {
      const numSku = Number(prod.sku);
      if (!isNaN(numSku) && numSku > 0) {
        skus.add(numSku);
      }
    }
  }

  if (skus.size === 0) return;

  const skuImageMap = new Map<number, string>();
  const skuTitleMap = new Map<number, string>();
  const skuOfferIdMap = new Map<number, string>();

  try {
    const res = await fetch('https://api-seller.ozon.ru/v3/product/info/list', {
      method: 'POST',
      headers: {
        'Client-Id': clientId,
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sku: Array.from(skus) }),
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
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
    }
  } catch (e) {
    console.warn('[Ozon Sync] Ürün bilgisi/görseli çekilemedi:', e);
  }

  for (const p of postings) {
    if (p.products && p.products.length > 0) {
      const first = p.products[0];
      const sku = Number(first.sku);
      if (sku && skuImageMap.has(sku)) {
        p.product_image = skuImageMap.get(sku);
      }
      if (sku && skuTitleMap.has(sku)) {
        first.name = skuTitleMap.get(sku);
      }
      if (sku && skuOfferIdMap.has(sku)) {
        first.offer_id = skuOfferIdMap.get(sku);
      }
    }
  }
}

/**
 * POST /api/siparisler/sync
 * Ozon API'den her iki mağazanın en son siparişlerini çekip veri tabanına senkronize eder.
 */
export async function POST() {
  try {
    const store1ClientId = process.env.OZON_CLIENT_ID || '';
    const store1ApiKey = process.env.OZON_API_KEY || '';

    // Sadece Avrupa / Polonya Mağazası (Store 1) çekilir
    const postingsStore1 = await fetchStoreOrders(store1ClientId, store1ApiKey, 'store1');

    // Tüm ürünlerin gerçek Ozon görsellerini, offer_id'lerini ve başlıklarını otomatik zenginleştir
    await enrichPostingsWithProductDetails(postingsStore1, store1ClientId, store1ApiKey);

    const res1 = await syncOzonOrdersToDb(postingsStore1, 'store1');

    // Veritabanındaki tüm eksik görselleri offer_id veya sku eşleşmesiyle tamamla
    try {
      const ordersWithImages = await prisma.ozonOrder.findMany({
        where: { productImage: { not: null } },
        select: { productOfferId: true, productImage: true },
      });

      for (const src of ordersWithImages) {
        if (src.productOfferId && src.productImage) {
          await prisma.ozonOrder.updateMany({
            where: {
              productOfferId: src.productOfferId,
              productImage: null,
            },
            data: { productImage: src.productImage },
          });
        }
      }
    } catch (e) {
      // ignore
    }

    return NextResponse.json({
      success: true,
      syncedCount: res1.count || 0,
      store1Count: res1.count || 0,
    });
  } catch (error: any) {
    console.error('API /api/siparisler/sync Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Senkronizasyon başarısız.' },
      { status: 500 }
    );
  }
}
