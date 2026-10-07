import {
  LSSettingsResponse,
  LSOrderItem,
  LSOrderListItem,
  LSStockItem,
} from './types';

const BASE_URL = process.env.LS_API_BASE_URL || 'https://lpw.betta.ru:8084/grh/api';
const DEFAULT_PARTNER_ID = process.env.LS_PARTNER_ID || '6117';
const DEFAULT_PASSWORD = process.env.LS_PASSWORD || '305:1v[(73y6Bd?';

const LS_TIMEOUT_MS = 20000;

function getAuthHeader(): string {
  const credentials = `${DEFAULT_PARTNER_ID}:${DEFAULT_PASSWORD}`;
  const encoded = Buffer.from(credentials).toString('base64');
  return `Basic ${encoded}`;
}

export async function lsRequest<T = any>(
  path: string,
  method: 'GET' | 'POST' = 'POST',
  body?: any
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: getAuthHeader(),
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
    cache: 'no-store',
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  // Depo API'si yanıt vermezse istek sonsuza kadar asılı kalmasın
  options.signal = AbortSignal.timeout(LS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(
        `Depo API'sine ${LS_TIMEOUT_MS / 1000} sn içinde ulaşılamadı (${BASE_URL}). Sunucu bu ortamdan gelen bağlantıyı engelliyor olabilir.`
      );
    }
    throw new Error(`Depo API'sine bağlanılamadı (${BASE_URL}): ${err?.cause?.code || err?.message || err}`);
  }

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errJson = await response.json();
      errorDetail = errJson.error_message || JSON.stringify(errJson);
    } catch {
      errorDetail = await response.text();
    }
    throw new Error(`LS Fulfillment API Hatası [${response.status}]: ${errorDetail}`);
  }

  return response.json() as Promise<T>;
}

export async function getLSSettings(): Promise<LSSettingsResponse> {
  return lsRequest<LSSettingsResponse>('/settings', 'GET');
}

/**
 * Mail Forward Sipariş / Sevkiyat Görevi Oluşturur (POST /orders)
 */
export async function createLSOrders(
  orders: LSOrderItem[]
): Promise<{ success: boolean; error_code?: number; error_message?: string }> {
  return lsRequest('/orders', 'POST', { orders });
}

/**
 * Kayıtlı Siparişleri Listeler (POST /orders/list)
 */
export async function getLSOrdersList(
  pageSize = 50,
  pageToken?: string
): Promise<{ success: boolean; items?: LSOrderListItem[]; page_next_token?: string }> {
  const body: any = { page_size: pageSize };
  if (pageToken) body.page_token = pageToken;
  return lsRequest('/orders/list', 'POST', body);
}

/**
 * Siparişi İptal Eder (POST /orders/cancel)
 */
export async function cancelLSOrders(
  orderIds: string[]
): Promise<{ success: boolean; orders?: Array<{ order_id: string; state: string }> }> {
  return lsRequest('/orders/cancel', 'POST', { order_ids: orderIds });
}

/**
 * Depodaki Malların Fotoğraflarını Çeker (POST /goods/photos/list)
 */
export async function getLSGoodsPhotos(
  pageSize = 50,
  pageToken?: string
): Promise<{
  success: boolean;
  items?: Array<{
    photo_id: number;
    url: string;
    created_at?: string;
    descrip?: string;
    good_id?: string;
    order_id?: string;
  }>;
  page_next_token?: string;
}> {
  const body: any = { page_size: pageSize };
  if (pageToken) body.page_token = pageToken;
  return lsRequest('/goods/photos/list', 'POST', body);
}

/**
 * Depodaki Anlık Stokları Getirir (POST /goods/stock)
 */
export async function getLSStocks(
  pageSize = 50,
  pageToken?: string
): Promise<{ success: boolean; items?: LSStockItem[]; page_next_token?: string }> {
  const body: any = { page_size: pageSize };
  if (pageToken) body.page_token = pageToken;
  return lsRequest('/goods/stock', 'POST', body);
}
