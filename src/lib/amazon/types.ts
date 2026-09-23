/** Ozon fiyatı = Amazon € × ECB EUR/USD kuru × bu çarpan (tam sayıya yuvarlanır). */
export const OZON_PRICE_MULTIPLIER = 4;

export interface AmazonProductItem {
  asin: string;
  title: string;
  modelCode: string;
  brand: string;
  buyPriceNum: number;
  buyPriceStr: string;
  ozonPrice: number; // € × kur × OZON_PRICE_MULTIPLIER, tam sayı
  ozonOldPrice: number; // ~1.2x old price rounded integer
  imageUrl: string;
  galleryImages?: string[];
  imageStatus: number;
  page: number;
  isAvailable: boolean;
  selected?: boolean;
  isAlreadyInOzon?: boolean;
  ozonDuplicateReason?: string;
}

export interface AmazonCrawlOptions {
  keyword?: string;
  brand?: string;
  category?: string;
  maxPages?: number;
  maxItems?: number;
  maxPriceEur?: number;
  hideExistingOzon?: boolean; // Mükerrer Ozon ürünlerini otomatik gizle
  sellerType?: 'amazon_direct' | 'amazon_business' | 'all_amazon';
  customUrl?: string;
}

export interface AmazonCrawlResponse {
  success: boolean;
  totalFound: number;
  pagesScanned: number;
  items: AmazonProductItem[];
  error?: string;
  /** Tarama tamamlandı ama bir kontrol yapılamadı (ör. Ozon mağazasına ulaşılamadı). */
  warning?: string;
  /** Ozon fiyatında kullanılan EUR/USD kuru */
  fx?: { rate: number; date: string | null; source: 'ECB' | 'fallback' };
}
