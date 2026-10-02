import { NextRequest, NextResponse } from 'next/server';
import { recordPriceIndex } from '@/lib/pricing/indexHistory';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

function getOzonHeaders(store: 'store1' | 'store2' = 'store1') {
  if (store === 'store2') {
    const clientId = process.env.OZON_STORE_2_CLIENT_ID || process.env.OZON_CLIENT_ID || '';
    const apiKey = process.env.OZON_STORE_2_API_KEY || process.env.OZON_API_KEY || '';
    return {
      'Client-Id': clientId,
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    };
  }

  const clientId = process.env.OZON_CLIENT_ID || '';
  const apiKey = process.env.OZON_API_KEY || '';
  return {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const store = (searchParams.get('store') || 'store1') as 'store1' | 'store2';

    const headers = getOzonHeaders(store);
    if (!headers['Client-Id'] || !headers['Api-Key']) {
      return NextResponse.json(
        { success: false, error: `${store === 'store2' ? 'Türkiye' : 'Ana'} mağaza API bilgileri bulunamadı.` },
        { status: 400 }
      );
    }

    const allItems: any[] = [];
    let lastId = '';
    const pageSize = 1000;

    while (true) {
      const body: any = {
        filter: { visibility: 'ALL' },
        limit: pageSize,
      };
      if (lastId) {
        body.last_id = lastId;
      }

      const res = await fetch(`${BASE_URL}/v5/product/info/prices`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        cache: 'no-store',
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Ozon Fiyat API Hatası [${res.status}]: ${err.slice(0, 200)}`);
      }

      const json = await res.json();
      const items = json.result?.items || json.items || [];
      allItems.push(...items);

      const nextLastId = json.result?.last_id || json.last_id;
      if (!nextLastId || items.length === 0 || allItems.length >= 3000) {
        break;
      }
      lastId = nextLastId;
    }

    // Geçmişe kayıt (Değişimler sekmesi). Kayıt hatası sayfayı düşürmez.
    let history: Awaited<ReturnType<typeof recordPriceIndex>> | { error: string };
    try {
      history = await recordPriceIndex(store, allItems);
    } catch (e: any) {
      console.warn('Price index history record error:', e);
      history = { error: e.message || 'kayıt hatası' };
    }

    // İstatistik ve Endeks Dağılımı Hesaplama
    let greenCount = 0;
    let yellowCount = 0;
    let redCount = 0;
    let withoutIndexCount = 0;

    for (const it of allItems) {
      const color = it.price_indexes?.color_index || 'WITHOUT_INDEX';
      if (color === 'GREEN') greenCount++;
      else if (color === 'YELLOW') yellowCount++;
      else if (color === 'RED') redCount++;
      else withoutIndexCount++;
    }

    const total = allItems.length;
    const greenPercent = total > 0 ? Number(((greenCount / total) * 100).toFixed(1)) : 0;
    const yellowPercent = total > 0 ? Number(((yellowCount / total) * 100).toFixed(1)) : 0;
    const redPercent = total > 0 ? Number(((redCount / total) * 100).toFixed(1)) : 0;
    const withoutIndexPercent = total > 0 ? Number(((withoutIndexCount / total) * 100).toFixed(1)) : 0;

    // Ürün Detaylarını (Görsel, Başlık, Stok) 500'lük Paketlerle Zenginleştirme
    const offerIds = allItems.map((it) => it.offer_id).filter(Boolean);
    const productInfoMap: Record<string, any> = {};

    for (let i = 0; i < offerIds.length; i += 500) {
      const chunk = offerIds.slice(i, i + 500);
      try {
        const infoRes = await fetch(`${BASE_URL}/v3/product/info/list`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ offer_id: chunk }),
          cache: 'no-store',
        });
        if (infoRes.ok) {
          const infoJson = await infoRes.json();
          for (const item of infoJson.items || []) {
            if (item.offer_id) {
              productInfoMap[item.offer_id] = item;
            }
          }
        }
      } catch (e) {
        console.warn('Product info chunk fetch error:', e);
      }
    }

    // Sitedeki fiyat (Ozon'un kendi indirimi dahil, müşterinin gördüğü).
    // /v1/product/prices/details yalnızca Premium Pro mağazada açık; kapalıysa
    // 403 döner ve sayfa kampanyalı satıcı fiyatıyla yetinir. Uç ruble verir;
    // USD'ye çevirmek için ruble fiyatlar arasındaki oran kullanılır.
    const siteRatioBySku: Record<string, number> = {};
    let sitePriceAvailable = true;
    const skus = Object.values(productInfoMap).map((i: any) => String(i.sku)).filter((x) => x && x !== 'undefined');
    for (let i = 0; i < skus.length; i += 1000) {
      try {
        const res = await fetch(`${BASE_URL}/v1/product/prices/details`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ skus: skus.slice(i, i + 1000) }),
          cache: 'no-store',
        });
        if (!res.ok) {
          sitePriceAvailable = false;
          break;
        }
        const json = await res.json();
        for (const pr of json.prices || []) {
          const customer = Number(pr.customer_price?.amount || 0);
          const base = Number(pr.price?.amount || 0);
          if (customer > 0 && base > 0) siteRatioBySku[String(pr.sku)] = customer / base;
        }
      } catch (e) {
        console.warn('Price details fetch error:', e);
        sitePriceAvailable = false;
        break;
      }
    }

    // Formatlanmış Ürün Listesi
    const formattedProducts = allItems.map((it) => {
      const info = productInfoMap[it.offer_id] || {};
      const img =
        (Array.isArray(info.primary_image) ? info.primary_image[0] : info.primary_image) ||
        (Array.isArray(info.images) ? info.images[0] : info.images) ||
        '';

      const pIndexes = it.price_indexes || {};
      const ozonData = pIndexes.ozon_index_data || {};
      const extData = pIndexes.external_index_data || {};

      let totalStock = 0;
      if (info.stocks?.stocks && Array.isArray(info.stocks.stocks)) {
        totalStock = info.stocks.stocks.reduce((acc: number, s: any) => acc + (s.present || 0), 0);
      }

      return {
        productId: it.product_id,
        offerId: it.offer_id || '',
        sku: info.sku || it.product_id,
        name: info.name || it.offer_id || 'İsimsiz Ürün',
        image: img,
        // Müşterinin gördüğü fiyat: satıcı kampanyaları dahil (marketing_seller_price).
        // Kampanya yoksa Ozon bu alanı boş ya da price'a eşit döner.
        price: Number(it.price?.marketing_seller_price || 0) || Number(it.price?.price || 0),
        basePrice: Number(it.price?.price || 0),
        // prices/details'teki price, kampanyalı satıcı fiyatının ruble karşılığı.
        sitePrice: siteRatioBySku[String(info.sku)]
          ? Math.round((Number(it.price?.marketing_seller_price || 0) || Number(it.price?.price || 0)) * siteRatioBySku[String(info.sku)] * 100) / 100
          : null,
        oldPrice: Number(it.price?.old_price || 0),
        currency: it.price?.currency_code || 'USD',
        colorIndex: (pIndexes.color_index || 'WITHOUT_INDEX') as 'GREEN' | 'YELLOW' | 'RED' | 'WITHOUT_INDEX',
        // min_price rakibin ruble fiyatı; min_price_in_seller aynı fiyatın
        // Ozon tarafından mağaza para birimine (USD) çevrilmiş hâli.
        ozonMinPrice: Number(ozonData.min_price || 0),
        ozonMinPriceSeller: Number(ozonData.min_price_in_seller || 0),
        ozonIndexValue: Number(ozonData.price_index_value || 0),
        externalMinPrice: Number(extData.min_price || 0),
        externalMinPriceSeller: Number(extData.min_price_in_seller || 0),
        externalIndexValue: Number(extData.price_index_value || 0),
        stock: totalStock,
        commissionPercent: it.commissions?.sales_percent_fbs || it.commissions?.sales_percent_fbo || 5,
      };
    });

    return NextResponse.json({
      success: true,
      store,
      summary: {
        total,
        green: { count: greenCount, percent: greenPercent, label: 'Kazançlı' },
        yellow: { count: yellowCount, percent: yellowPercent, label: 'Orta Düzey' },
        red: { count: redCount, percent: redPercent, label: 'Kazançsız' },
        withoutIndex: { count: withoutIndexCount, percent: withoutIndexPercent, label: 'Endekssiz' },
      },
      products: formattedProducts,
      sitePriceAvailable,
      history,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Price index API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Fiyat endeksi alınamadı.' },
      { status: 500 }
    );
  }
}


