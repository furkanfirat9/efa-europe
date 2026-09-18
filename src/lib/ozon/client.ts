import {
  OzonCategoryNode,
  OzonCategoryTreeResponse,
  OzonAttribute,
  OzonCategoryAttributesResponse,
  OzonAttributeValue,
  OzonAttributeValuesResponse,
  OzonLanguage,
} from './types';

const BASE_URL = process.env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

function getHeaders() {
  const clientId = process.env.OZON_CLIENT_ID;
  const apiKey = process.env.OZON_API_KEY;

  if (!clientId || !apiKey) {
    throw new Error('OZON_CLIENT_ID veya OZON_API_KEY ortam değişkenleri tanımlanmamış!');
  }

  return {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  };
}

// ==========================================
// 🚀 BELLEK İÇİ AKILLI ÖNBELLEK (IN-MEMORY CACHE)
// ==========================================
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Saat

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const categoryTreeCache = new Map<OzonLanguage, CacheEntry<OzonCategoryNode[]>>();
const categoryAttributesCache = new Map<string, CacheEntry<OzonAttribute[]>>();
const attributeValuesCache = new Map<string, CacheEntry<OzonAttributeValue[]>>();

/**
 * Ozon Kategori Ağacını getirir (/v1/description-category/tree)
 */
export async function fetchCategoryTree(language: OzonLanguage = 'TR'): Promise<OzonCategoryNode[]> {
  const cached = categoryTreeCache.get(language);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetch(`${BASE_URL}/v1/description-category/tree`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ language }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ozon Kategori Ağacı Hatası [${res.status}]: ${errorText}`);
  }

  const data: OzonCategoryTreeResponse = await res.json();
  const result = data.result || [];
  categoryTreeCache.set(language, { data: result, timestamp: Date.now() });
  return result;
}

/**
 * Belirli bir kategori ve ürün türünün özelliklerini (attributes) getirir (/v1/description-category/attribute)
 */
export async function fetchCategoryAttributes(
  descriptionCategoryId: number,
  typeId: number,
  language: OzonLanguage = 'TR'
): Promise<OzonAttribute[]> {
  const cacheKey = `${descriptionCategoryId}_${typeId}_${language}`;
  const cached = categoryAttributesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetch(`${BASE_URL}/v1/description-category/attribute`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      description_category_id: descriptionCategoryId,
      type_id: typeId,
      language,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ozon Nitelik Hatası [${res.status}]: ${errorText}`);
  }

  const data: OzonCategoryAttributesResponse = await res.json();
  const result = data.result || [];
  categoryAttributesCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

/**
 * Sözlük niteliğine ait değerleri sayfalanmış olarak getirir (/v1/description-category/attribute/values)
 */
export async function fetchAttributeValues(
  descriptionCategoryId: number,
  typeId: number,
  attributeId: number,
  lastValueId = 0,
  limit = 50,
  language: OzonLanguage = 'TR'
): Promise<OzonAttributeValue[]> {
  const cacheKey = `${descriptionCategoryId}_${typeId}_${attributeId}_${lastValueId}_${limit}_${language}`;
  const cached = attributeValuesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetch(`${BASE_URL}/v1/description-category/attribute/values`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      description_category_id: descriptionCategoryId,
      type_id: typeId,
      attribute_id: attributeId,
      last_value_id: lastValueId,
      limit,
      language,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ozon Sözlük Değerleri Hatası [${res.status}]: ${errorText}`);
  }

  const data: OzonAttributeValuesResponse = await res.json();
  const result = data.result || [];
  attributeValuesCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

/**
 * Devasa sözlükler (örn. Marka, Ülke) içinde canlı arama yapar (/v1/description-category/attribute/values/search)
 */
export async function searchAttributeValues(
  descriptionCategoryId: number,
  typeId: number,
  attributeId: number,
  query: string,
  limit = 50,
  language: OzonLanguage = 'TR'
): Promise<OzonAttributeValue[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const res = await fetch(`${BASE_URL}/v1/description-category/attribute/values/search`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      description_category_id: descriptionCategoryId,
      type_id: typeId,
      attribute_id: attributeId,
      value: query.trim(),
      limit,
      language,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ozon Sözlük Arama Hatası [${res.status}]: ${errorText}`);
  }

  const data: { result: OzonAttributeValue[] } = await res.json();
  return data.result || [];
}

/**
 * Ozon'a Ürün Yükleme İsteği Gönderir (/v3/product/import)
 */
export async function importProductToOzon(payload: any): Promise<{ taskId: number }> {
  // Ozon OfferId Uzunluk Koruması (Max 50 Karakter)
  if (payload && Array.isArray(payload.items)) {
    payload.items = payload.items.map((item: any) => ({
      ...item,
      offer_id: item.offer_id ? String(item.offer_id).trim().slice(0, 50) : undefined,
    }));
  }

  const res = await fetch(`${BASE_URL}/v3/product/import`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text();
    let errorJson;
    try {
      errorJson = JSON.parse(errorText);
    } catch (e) {}

    const detailedMsg = errorJson?.message || errorJson?.error || errorText;
    throw new Error(`Ozon Ürün Yükleme Hatası [${res.status}]: ${detailedMsg}`);
  }

  const data = await res.json();
  return {
    taskId: data.result?.task_id || data.task_id,
  };
}

/**
 * Ozon Ürün Yükleme Görevinin Canlı Durumunu Sorgular (/v1/product/import/info)
 */
export async function getProductImportInfo(taskId: number): Promise<any> {
  const res = await fetch(`${BASE_URL}/v1/product/import/info`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ task_id: taskId }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ozon Yükleme Durumu Hatası [${res.status}]: ${errorText}`);
  }

  const data = await res.json();
  return data.result;
}
