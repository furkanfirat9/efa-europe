import fs from 'fs';
import path from 'path';

interface CatalogMemoryItem {
  asin?: string;
  brand?: string;
  modelNo?: string;
  finalTitle?: string;
  productQuery?: string;
  ozonTaskId?: string;
}

interface OzonLiveCatalogItem {
  productId?: number;
  offerId?: string;
  name?: string;
  barcode?: string;
  status?: string;
  isArchived?: boolean;
}

const ASIN_REGEX = /\b(B0[0-9A-Z]{8})\b/i;

/**
 * Mağazada veya yükleme hafızasında bulunan tüm bilinen ASIN'leri ve ürünleri çeker.
 */
export function getUploadedOzonProducts(): {
  memoryItems: CatalogMemoryItem[];
  liveCatalogItems: OzonLiveCatalogItem[];
  knownAsinSet: Set<string>;
} {
  let memoryItems: CatalogMemoryItem[] = [];
  let liveCatalogItems: OzonLiveCatalogItem[] = [];
  const knownAsinSet = new Set<string>();

  try {
    const memoryPath = path.join(process.cwd(), 'data', 'catalog_memory.json');
    if (fs.existsSync(memoryPath)) {
      const content = fs.readFileSync(memoryPath, 'utf8');
      memoryItems = JSON.parse(content || '[]');
      
      memoryItems.forEach((m) => {
        if (m.asin) knownAsinSet.add(m.asin.toUpperCase().trim());
        const matchModel = m.modelNo?.match(ASIN_REGEX);
        if (matchModel) knownAsinSet.add(matchModel[1].toUpperCase());
        const matchQuery = m.productQuery?.match(ASIN_REGEX);
        if (matchQuery) knownAsinSet.add(matchQuery[1].toUpperCase());
      });
    }
  } catch (e) {
    console.warn('[Duplicate Detector] catalog_memory.json okunamadı:', e);
  }

  try {
    const livePath = path.join(process.cwd(), 'data', 'ozon_live_catalog.json');
    if (fs.existsSync(livePath)) {
      const content = fs.readFileSync(livePath, 'utf8');
      liveCatalogItems = JSON.parse(content || '[]');

      liveCatalogItems.forEach((live) => {
        if (live.isArchived) return;
        if (live.offerId) {
          const matchOffer = live.offerId.match(ASIN_REGEX);
          if (matchOffer) knownAsinSet.add(matchOffer[1].toUpperCase());
        }
        if (live.barcode) {
          const matchBar = live.barcode.match(ASIN_REGEX);
          if (matchBar) knownAsinSet.add(matchBar[1].toUpperCase());
        }
      });
    }
  } catch (e) {
    console.warn('[Duplicate Detector] ozon_live_catalog.json okunamadı:', e);
  }

  return { memoryItems, liveCatalogItems, knownAsinSet };
}

/**
 * Bir Amazon ürününün ASIN odaklı mükerrer kontrolünü yapar.
 */
export function checkIsProductInOzon(
  amazonTitle: string,
  asin: string,
  modelCode: string,
  brand: string
): { isUploaded: boolean; reason?: string } {
  const { memoryItems, liveCatalogItems, knownAsinSet } = getUploadedOzonProducts();

  const cleanAsin = (asin || '').toUpperCase().trim();
  const cleanModel = (modelCode || '').toLowerCase().trim();
  const cleanTitle = (amazonTitle || '').toLowerCase();

  // 1. ÖNCELİKLİ & KESİN KONTROL: ASIN PARMAK İZİ EŞLEŞMESİ (Zero False-Positive)
  if (cleanAsin && knownAsinSet.has(cleanAsin)) {
    return {
      isUploaded: true,
      reason: `ASIN Ozon mağazasında zaten yüklü (${cleanAsin})`,
    };
  }

  // 2. Ozon Canlı Mağaza Offer ID Kontrolü
  for (const live of liveCatalogItems) {
    if (live.isArchived) continue;

    if (live.offerId) {
      const offLower = live.offerId.toLowerCase().trim();
      if (cleanAsin && offLower === cleanAsin.toLowerCase()) {
        return { isUploaded: true, reason: `Ozon Offer ID eşleşti (${live.offerId})` };
      }
      if (cleanModel && offLower === cleanModel && cleanModel.length > 5) {
        return { isUploaded: true, reason: `Model kodu mağazada aktif (${live.offerId})` };
      }
    }
  }

  // 3. Yerel Hafıza Model Kodu Kontrolü
  for (const item of memoryItems) {
    if (cleanModel && item.modelNo) {
      const mLower = item.modelNo.toLowerCase().trim();
      if (mLower === cleanModel && cleanModel.length > 6) {
        return { isUploaded: true, reason: `Model kodu hafızada kayıtlı (${item.modelNo})` };
      }
    }
  }

  return { isUploaded: false };
}
