import fs from 'fs';
import path from 'path';
import type { CatalogProductRecord } from '../db/catalogMemory';

export interface OzonLiveProduct {
  productId: number;
  offerId: string;
  name: string;
  price?: string;
  oldPrice?: string;
  currency?: string;
  categoryId?: number;
  typeId?: number;
  sku?: string | number;
  barcodes?: string[];
  status?: string;
  isArchived?: boolean;
  createdAt?: string;
}

export interface DuplicateCheckMatch {
  isDuplicate: boolean;
  matchType: 'exact_offer_id' | 'base_model_match' | 'model_in_query' | 'query_in_title' | 'catalog_memory' | null;
  confidence: number;
  matchedProduct?: {
    offerId: string;
    name: string;
    price?: string;
    currency?: string;
    status?: string;
    categoryId?: number;
    source: 'ozon_live' | 'catalog_memory';
    createdAt?: string;
    ozonTaskId?: string;
    details?: string;
  };
}

const DATA_DIR = path.join(process.cwd(), 'data');
const OZON_CATALOG_FILE = path.join(DATA_DIR, 'ozon_live_catalog.json');

function normalizeStr(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]/gi, '')
    .trim();
}

/**
 * Model kodundan varyant / ülke uzantısını temizler (örn: NA350/00 -> NA350, EP5447/90 -> EP5447, FN101EUSTGD -> FN101)
 */
function extractBaseModel(str: string): string {
  if (!str) return '';
  const clean = str.trim().split('/')[0].split('.')[0];
  return clean.replace(/(EU[A-Z0-9]*|E[0-9]+)$/i, '');
}

/**
 * Bir kelimenin model kodu benzeri olup olmadığını kontrol eder (harf + rakam veya >= 6 haneli kod)
 */
function isModelLikeToken(t: string): boolean {
  const norm = normalizeStr(t);
  if (norm.length < 3) return false;
  const hasLetter = /[a-z]/i.test(norm);
  const hasDigit = /[0-9]/.test(norm);
  if (hasLetter && hasDigit) return true;
  if (!hasLetter && hasDigit && norm.length >= 6) return true;
  return false;
}

export function getOzonLiveCatalog(): OzonLiveProduct[] {
  try {
    if (!fs.existsSync(OZON_CATALOG_FILE)) {
      return [];
    }
    const data = fs.readFileSync(OZON_CATALOG_FILE, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Ozon live catalog read error:', err);
    return [];
  }
}

export function saveOzonLiveCatalog(products: OzonLiveProduct[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${OZON_CATALOG_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(products, null, 2), 'utf-8');
    fs.renameSync(tmp, OZON_CATALOG_FILE);
  } catch (err) {
    console.error('Ozon live catalog save error:', err);
  }
}

export async function syncOzonCatalogFromApi(): Promise<OzonLiveProduct[]> {
  const clientId = process.env.OZON_CLIENT_ID;
  const apiKey = process.env.OZON_API_KEY;
  const baseUrl = process.env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

  if (!clientId || !apiKey) {
    console.warn('Ozon API kimlik bilgileri eksik, senkronizasyon atlandi.');
    return getOzonLiveCatalog();
  }

  try {
    const headers = {
      'Client-Id': clientId,
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    };

    let allListItems: any[] = [];
    let lastId = '';
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(`${baseUrl}/v3/product/list`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filter: { visibility: 'ALL' },
          last_id: lastId,
          limit: 100,
        }),
        cache: 'no-store',
      });

      if (!res.ok) {
        break;
      }

      const data = await res.json();
      const items = data.result?.items || [];
      allListItems = allListItems.concat(items);
      lastId = data.result?.last_id || '';

      if (!lastId || items.length === 0 || allListItems.length >= (data.result?.total || 0)) {
        hasMore = false;
      }
    }

    const productIds = allListItems.map((i) => i.product_id).filter(Boolean);
    let allProductDetails: any[] = [];

    for (let i = 0; i < productIds.length; i += 50) {
      const batch = productIds.slice(i, i + 50);
      const infoRes = await fetch(`${baseUrl}/v3/product/info/list`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ product_id: batch }),
        cache: 'no-store',
      });

      if (infoRes.ok) {
        const infoData = await infoRes.json();
        const items = infoData.items || infoData.result?.items || [];
        allProductDetails = allProductDetails.concat(items);
      }
    }

    const liveProducts: OzonLiveProduct[] = allProductDetails.map((p) => ({
      productId: p.id,
      offerId: p.offer_id,
      name: p.name,
      price: p.price,
      oldPrice: p.old_price,
      currency: p.currency_code,
      categoryId: p.description_category_id,
      typeId: p.type_id,
      sku: p.sources?.[0]?.sku || (p.barcodes && p.barcodes[0]) || '',
      barcodes: p.barcodes || [],
      status: p.statuses?.status_name || p.statuses?.state_name || 'Aktif',
      isArchived: p.is_archived,
      createdAt: p.created_at,
    }));

    if (liveProducts.length > 0) {
      saveOzonLiveCatalog(liveProducts);
    }

    return liveProducts;
  } catch (err) {
    console.error('Ozon API senkronizasyon hatasi:', err);
    return getOzonLiveCatalog();
  }
}

/**
 * memoryRecords: getAllCatalogMemory() sonucu. Hafıza veri tabanında olduğu için çağıran bir kez
 * yükleyip verir; kontrolün kendisi eşzamanlı kalır.
 */
export function checkDuplicateProduct(
  query: string,
  modelNo?: string,
  brand?: string,
  memoryRecords: CatalogProductRecord[] = []
): DuplicateCheckMatch {
  if (!query || !query.trim()) {
    return { isDuplicate: false, matchType: null, confidence: 0 };
  }

  const rawQuery = query.trim();
  const normQuery = normalizeStr(rawQuery);
  const baseQuery = normalizeStr(extractBaseModel(rawQuery));
  const normModel = modelNo ? normalizeStr(modelNo) : '';
  const baseModel = modelNo ? normalizeStr(extractBaseModel(modelNo)) : '';
  const tokens = rawQuery.split(/[\s,/-]+/).map(normalizeStr).filter(isModelLikeToken);

  const ozonProducts = getOzonLiveCatalog();

  // 1. ONCE CANLI OZON MAGAZASINDA ARAMA
  for (const p of ozonProducts) {
    const pOffer = p.offerId || '';
    const normOffer = normalizeStr(pOffer);
    const baseOffer = normalizeStr(extractBaseModel(pOffer));
    const pName = p.name || '';
    const normName = normalizeStr(pName);

    // a) Tam Offer ID Eslesmesi (örn: "NA350/00" === "NA350/00")
    if (normOffer && (normQuery === normOffer || (normModel && normModel === normOffer))) {
      return {
        isDuplicate: true,
        matchType: 'exact_offer_id',
        confidence: 100,
        matchedProduct: {
          offerId: p.offerId,
          name: p.name,
          price: p.price,
          currency: p.currency,
          status: p.status,
          categoryId: p.categoryId,
          source: 'ozon_live',
          createdAt: p.createdAt,
          details: `Ozon Magazasinda Tam Offer ID Eslesmesi (${p.offerId})`,
        },
      };
    }

    // b) Temel Model Eslesmesi (örn: kullanıcı "NA350" aradı, mağazada "NA350/00" veya "NA350/03" var)
    if (
      baseOffer &&
      baseOffer.length >= 3 &&
      (normQuery === baseOffer || baseQuery === baseOffer || (normModel && (normModel === baseOffer || baseModel === baseOffer)))
    ) {
      return {
        isDuplicate: true,
        matchType: 'base_model_match',
        confidence: 98,
        matchedProduct: {
          offerId: p.offerId,
          name: p.name,
          price: p.price,
          currency: p.currency,
          status: p.status,
          categoryId: p.categoryId,
          source: 'ozon_live',
          createdAt: p.createdAt,
          details: `Ozon Magazasinda Model Serisi Eslesmesi (${p.offerId})`,
        },
      };
    }

    // c) Prefix / Model Kodu Baslangici (örn: "na35000" startsWith "na350")
    if (normOffer && isModelLikeToken(normQuery) && normOffer.startsWith(normQuery)) {
      return {
        isDuplicate: true,
        matchType: 'model_in_query',
        confidence: 95,
        matchedProduct: {
          offerId: p.offerId,
          name: p.name,
          price: p.price,
          currency: p.currency,
          status: p.status,
          categoryId: p.categoryId,
          source: 'ozon_live',
          createdAt: p.createdAt,
          details: `Ozon Magazasinda Model Kodu Eslesmesi (${p.offerId})`,
        },
      };
    }

    // d) Cok Kelimeli Sorgu Icinde Model Token Eslesmesi (örn: "Philips NA350 Airfryer" içindeki "na350" tokeni)
    for (const t of tokens) {
      if (normOffer.startsWith(t) || baseOffer === t || (t.length >= 4 && normOffer.includes(t))) {
        return {
          isDuplicate: true,
          matchType: 'model_in_query',
          confidence: 92,
          matchedProduct: {
            offerId: p.offerId,
            name: p.name,
            price: p.price,
            currency: p.currency,
            status: p.status,
            categoryId: p.categoryId,
            source: 'ozon_live',
            createdAt: p.createdAt,
            details: `Ozon Magazasinda Model Eşleşmesi (${p.offerId})`,
          },
        };
      }
    }

    // e) Model Baslikta Geciyor mu (örn: p.name içinde "NA350" arama)
    if (isModelLikeToken(normQuery) && normName.includes(normQuery)) {
      return {
        isDuplicate: true,
        matchType: 'query_in_title',
        confidence: 90,
        matchedProduct: {
          offerId: p.offerId,
          name: p.name,
          price: p.price,
          currency: p.currency,
          status: p.status,
          categoryId: p.categoryId,
          source: 'ozon_live',
          createdAt: p.createdAt,
          details: `Ozon Magazasinda Baslik/Model Eslesmesi (${p.name})`,
        },
      };
    }
  }

  // 2. YEREL KATALOG HAFIZASINDA ARAMA (catalog_memory.json)
  for (const m of memoryRecords) {
    const mModel = normalizeStr(m.modelNo || '');
    const baseMModel = normalizeStr(extractBaseModel(m.modelNo || ''));
    const mPart = normalizeStr(m.partNumber || '');
    const baseMPart = normalizeStr(extractBaseModel(m.partNumber || ''));
    const mQuery = normalizeStr(m.productQuery || '');

    if (
      (mModel && (normQuery === mModel || normQuery === baseMModel || normQuery.includes(mModel) || mModel.startsWith(normQuery))) ||
      (mPart && (normQuery === mPart || normQuery === baseMPart || normQuery.includes(mPart) || mPart.startsWith(normQuery))) ||
      (mQuery && (normQuery === mQuery || mQuery.includes(normQuery)))
    ) {
      return {
        isDuplicate: true,
        matchType: 'catalog_memory',
        confidence: 85,
        matchedProduct: {
          offerId: m.partNumber || m.modelNo,
          name: m.finalTitle || `${m.brand} ${m.modelNo}`,
          status: m.ozonTaskId ? `Yuklendi (Task ID: ${m.ozonTaskId})` : 'Katalog Hafizasinda Mevcut',
          categoryId: m.categoryId,
          source: 'catalog_memory',
          createdAt: m.createdAt,
          ozonTaskId: m.ozonTaskId,
          details: `Daha Once Bu Panelden Yuklenmis (${m.brand} ${m.modelNo})`,
        },
      };
    }
  }

  return { isDuplicate: false, matchType: null, confidence: 0 };
}

export function checkBulkDuplicates(
  queries: string[],
  memoryRecords: CatalogProductRecord[] = []
): Array<{
  query: string;
  result: DuplicateCheckMatch;
}> {
  return queries.map((q) => ({
    query: q,
    result: checkDuplicateProduct(q, undefined, undefined, memoryRecords),
  }));
}
