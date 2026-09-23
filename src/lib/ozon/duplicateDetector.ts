interface CatalogMemoryItem {
  asin?: string;
  brand?: string;
  modelNo?: string;
  finalTitle?: string;
  productQuery?: string;
  ozonTaskId?: string;
}

const ASIN_REGEX = /\b(B0[0-9A-Z]{8})\b/i;

/**
 * Yükleme hafızasındaki (CatalogMemory tablosu) ASIN'ler ve model kodları. Hafıza çağıran tarafta
 * bir kez yüklenir (getAllCatalogMemory) ve buraya verilir; mağazanın kendisi Ozon'dan canlı
 * sorulur (getStoreOfferIds).
 */
export function getUploadedOzonProducts(memoryItems: CatalogMemoryItem[]): {
  memoryItems: CatalogMemoryItem[];
  knownAsinSet: Set<string>;
} {
  const knownAsinSet = new Set<string>();
  memoryItems.forEach((m) => {
    if (m.asin) knownAsinSet.add(m.asin.toUpperCase().trim());
    const matchModel = m.modelNo?.match(ASIN_REGEX);
    if (matchModel) knownAsinSet.add(matchModel[1].toUpperCase());
    const matchQuery = m.productQuery?.match(ASIN_REGEX);
    if (matchQuery) knownAsinSet.add(matchQuery[1].toUpperCase());
  });
  return { memoryItems, knownAsinSet };
}

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/**
 * Kod başlıkta ayrı bir parça olarak geçiyor mu: "HX9094/88" → "…4'lü Paket, HX9094/88" evet,
 * "HX9094/880" hayır. Karşılaştırma küçük harfle yapılır.
 */
function titleContainsCode(titleLower: string, codeLower: string): boolean {
  let i = titleLower.indexOf(codeLower);
  while (i >= 0) {
    if (!isWordChar(titleLower[i - 1]) && !isWordChar(titleLower[i + codeLower.length])) return true;
    i = titleLower.indexOf(codeLower, i + 1);
  }
  return false;
}

/**
 * Başlıkta aranacak mağaza kodları. Rakam içermeyen ya da 5 karakterden kısa kodlar atlanır
 * (sıradan kelimelerle yanlış eşleşmesinler). Başlığın kesilmiş hâli olan bozuk kodlar da
 * hiçbir başlıkta birebir geçmediği için zararsızdır.
 */
export function prepareStoreCodes(offerIds: string[]): string[] {
  return offerIds.map((id) => id.trim().toLowerCase()).filter((id) => id.length >= 5 && /\d/.test(id));
}

/**
 * Bir Amazon ürününün mağazada ya da yükleme hafızasında olup olmadığını bulur.
 *
 * Mağaza kontrolü tersinden yapılır: başlıktan model kodu tahmin edilip mağazada aranmaz,
 * mağazadaki her kod başlığın içinde aranır. Tahmin yanlış çıktığında ("CC13/50" yerine
 * "Quick Clean") yüklü ürün kaçıyordu; Amazon başlıkları model kodunu neredeyse hep içerir.
 */
export function checkIsProductInOzon(
  amazonTitle: string,
  asin: string,
  modelCode: string,
  storeCodes: string[] = [],
  memory: ReturnType<typeof getUploadedOzonProducts> = getUploadedOzonProducts([])
): { isUploaded: boolean; reason?: string } {
  const { memoryItems, knownAsinSet } = memory;

  const cleanAsin = (asin || '').toUpperCase().trim();
  const cleanModel = (modelCode || '').toLowerCase().trim();
  // Amazon başlıkları model kodunu bazen boşluklu yazar ("HD9350 / 90"); mağazada "HD9350/90".
  const cleanTitle = (amazonTitle || '').toLowerCase().replace(/\s*\/\s*/g, '/');

  // 1. ASIN hafızada kayıtlı
  if (cleanAsin && knownAsinSet.has(cleanAsin)) {
    return { isUploaded: true, reason: `ASIN daha önce yüklenmiş (${cleanAsin})` };
  }

  // 2. Mağazadaki bir ürün kodu başlıkta ya da ASIN/model koduyla birebir geçiyor
  for (const code of storeCodes) {
    if (code === cleanAsin.toLowerCase() || code === cleanModel || titleContainsCode(cleanTitle, code)) {
      return { isUploaded: true, reason: `Mağazada yüklü (${code.toUpperCase()})` };
    }
  }

  // 3. Yükleme hafızasındaki model kodu
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
