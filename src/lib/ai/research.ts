import { GoogleGenAI } from '@google/genai';
import { OzonCategoryNode, OzonAttribute, OzonLanguage } from '../ozon/types';
import { fetchCategoryTree, fetchCategoryAttributes, fetchAttributeValues, searchAttributeValues } from '../ozon/client';
import {
  isWarrantyAttribute,
  isMergeWithSimilarAttribute,
  isNamingTemplateAttribute,
  isIgnoredAttribute,
  isCountryOfOriginAttribute,
  isStrictSingleValueAttribute,
  sanitizeOzonSeriesName,
  PreFilledAttribute,
  AttributeSelectedValue,
} from './filler';
import { findRelevantCatalogMemory } from '../db/catalogMemory';
import { TokenUsageStats, CategoryMatchResult, DeepCategoryResearchResult, calculateGemini37Cost } from './types';

export type { TokenUsageStats, CategoryMatchResult, DeepCategoryResearchResult };
export { calculateGemini37Cost };

/**
 * 13 Haneli Geçerli EAN-13 Barkod Üretici
 */
export function generateRandomEan13(): string {
  let code = '869' + Math.floor(100000000 + Math.random() * 900000000).toString().slice(0, 9);
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checksum = (10 - (sum % 10)) % 10;
  return code + checksum.toString();
}

/**
 * 1. STRATEJİ: Hafif ve Hızlı Kategori Bulucu (Yalnızca Kategori Eşleştirme)
 */
export async function findOzonCategories(productQuery: string): Promise<CategoryMatchResult> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.DEFAULT_AI_MODEL || 'gemini-3.8-flash';

  if (!geminiApiKey || geminiApiKey.trim().length < 5) {
    throw new Error('Google Gemini API anahtarı (.env dosyasında GEMINI_API_KEY) tanımlanmamış.');
  }

  // 1. Ozon Canlı Kategori Ağacını Çek
  const categoryTree = await fetchCategoryTree('TR');

  const allLeafCategories: Array<{
    categoryId: number;
    categoryName: string;
    typeId: number;
    typeName: string;
    path: string[];
  }> = [];

  const traverse = (node: OzonCategoryNode, path: string[], lastCatId: number, lastCatName: string) => {
    const name = node.category_name || node.type_name || '';
    const newPath = [...path, name];
    const catId = node.description_category_id !== undefined ? node.description_category_id : lastCatId;
    const catName = node.category_name || lastCatName;

    if (node.type_id !== undefined && node.type_name) {
      allLeafCategories.push({
        categoryId: catId,
        categoryName: catName,
        typeId: node.type_id,
        typeName: node.type_name,
        path: newPath,
      });
    }

    if (node.children && node.children.length > 0) {
      node.children.forEach((child) => traverse(child, newPath, catId, catName));
    }
  };

  categoryTree.forEach((root) => {
    traverse(root, [], root.description_category_id || 0, root.category_name || '');
  });

  // 2. Gemini ile Hızlı Marka/Model ve Kategori Anahtar Kelimeleri Çıkarma
  const prompt = `Analiz edilecek ürün: "${productQuery}"

GÖREV: Bu ürünün marka ve model numarasını tespit et ve Ozon Marketplace ağacında eşleşebileceği en uygun 3 ürün türü arama kelimesini belirle.
Yanıtını YALNIZCA geçerli bir JSON nesnesi olarak ver:
{
  "brand": "Philips",
  "modelNo": "NA350/00",
  "suggestedCategoryKeywords": ["Airfryer", "Sıcak Hava Fritözü", "Aerogrill"]
}`;

  const ai = new GoogleGenAI({ apiKey: geminiApiKey.trim() });
  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const responseText = response.text || '';
  let aiData: any = {};
  try {
    const cleanJson = responseText.replace(/^```json\s*|\s*```$/g, '').trim();
    aiData = JSON.parse(cleanJson);
  } catch (e) {
    try {
      const match = responseText.match(/\{[\s\S]*\}/);
      aiData = match ? JSON.parse(match[0]) : {};
    } catch (e2) {
      aiData = { brand: 'Genel', modelNo: productQuery, suggestedCategoryKeywords: [productQuery] };
    }
  }

  // Token Kullanımı
  let usageStats: TokenUsageStats | undefined = undefined;
  if (response.usageMetadata) {
    const promptTokens = response.usageMetadata.promptTokenCount || 0;
    const candidatesTokens = response.usageMetadata.candidatesTokenCount || 0;
    const totalTokens = response.usageMetadata.totalTokenCount || (promptTokens + candidatesTokens);
    usageStats = {
      promptTokens,
      candidatesTokens,
      totalTokens,
      estimatedCostUsd: calculateGemini37Cost(promptTokens, candidatesTokens),
      model: modelName,
    };
  }

  // 3. Ozon Kategori Ağacında Arama ve Skorlama
  const rawKeywords: string[] = aiData.suggestedCategoryKeywords || [];
  const stopWords = new Set(['model', 'modelleri', 'modeli', 'set', 've', 'için', 'icin', 'tip', 'tipi', 'urun', 'ürün']);

  const cleanKeywords = [
    ...rawKeywords,
    aiData.brand,
  ]
    .filter(Boolean)
    .map((k) => k.toLowerCase().trim())
    .filter((k) => k.length > 2 && !stopWords.has(k));

  const scoredCategories = allLeafCategories.map((leaf) => {
    let score = 0;
    const typeNameLower = leaf.typeName.toLowerCase();
    const catNameLower = leaf.categoryName.toLowerCase();
    const pathText = leaf.path.join(' ').toLowerCase();

    cleanKeywords.forEach((kw, kwIdx) => {
      const weight = Math.max(10, 50 - kwIdx * 5);
      if (typeNameLower === kw) score += weight * 3;
      else if (typeNameLower.includes(kw) || kw.includes(typeNameLower)) score += weight * 2;
      else if (catNameLower.includes(kw)) score += weight * 1.5;
      else if (pathText.includes(kw)) score += weight * 0.8;
    });

    return { ...leaf, score };
  });

  scoredCategories.sort((a, b) => b.score - a.score);
  const top3 = scoredCategories.slice(0, 3).map((item, idx) => ({
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    typeId: item.typeId,
    typeName: item.typeName,
    path: item.path,
    confidence: Math.min(99, Math.max(60, Math.round(98 - idx * 14))),
    reason: idx === 0 ? 'En yüksek Ozon canlı kategori eşleşmesi' : `Alternatif kategori seçeneği #${idx + 1}`,
  }));

  return {
    brand: aiData.brand || 'Genel',
    modelNo: aiData.modelNo || productQuery,
    suggestedCategories: top3,
    usage: usageStats,
  };
}

/**
 * 2. STRATEJİ: Kategori Seçildikten Sonra Nitelik Odaklı Derin Araştırma Motoru
 * (Ozon'un o kategorideki tüm niteliklerini AI'a bir soru formu gibi verip doğrudan cevaplarını araştırır)
 */
export async function deepCategoryProductResearch(
  categoryId: number,
  typeId: number,
  brand: string,
  modelNo: string,
  productQuery: string,
  language: OzonLanguage = 'RU',
  categoryName?: string,
  typeName?: string
): Promise<DeepCategoryResearchResult> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.DEFAULT_AI_MODEL || 'gemini-3.8-flash';
  const thinkingBudget = Number(process.env.GEMINI_THINKING_BUDGET || '2048');

  if (!geminiApiKey || geminiApiKey.trim().length < 5) {
    throw new Error('Google Gemini API anahtarı (.env dosyasında GEMINI_API_KEY) tanımlanmamış.');
  }

  // 1. Ozon API'den seçilen kategorinin gerçek niteliklerini çek (Hata durumunda otomatik ağaçtan doğrula)
  let rawAttributesTR: OzonAttribute[] = [];
  let effectiveCatId = categoryId;
  let effectiveTypeId = typeId;

  try {
    rawAttributesTR = await fetchCategoryAttributes(effectiveCatId, effectiveTypeId, 'TR');
  } catch (err: any) {
    console.warn(`[Kategori Doğrulama] Cat=${effectiveCatId}, Type=${effectiveTypeId} için nitelik hatası. Canlı ağaçtan eşleştiriliyor...`);
    try {
      const tree = await fetchCategoryTree('TR');
      const findCorrectNode = (nodes: OzonCategoryNode[], lastCatId: number): { catId: number; typeId: number } | null => {
        for (const n of nodes) {
          const curCatId = n.description_category_id || lastCatId;
          if (n.type_id === effectiveTypeId || (typeName && n.type_name?.toLowerCase() === typeName.toLowerCase())) {
            return { catId: curCatId, typeId: n.type_id || effectiveTypeId };
          }
          if (n.children && n.children.length > 0) {
            const sub = findCorrectNode(n.children, curCatId);
            if (sub) return sub;
          }
        }
        return null;
      };

      const match = findCorrectNode(tree, 0);
      if (match) {
        effectiveCatId = match.catId;
        effectiveTypeId = match.typeId;
        rawAttributesTR = await fetchCategoryAttributes(effectiveCatId, effectiveTypeId, 'TR');
      } else {
        // Fallback: Mutfak Gereçleri genel nitelikleri (Tava)
        rawAttributesTR = await fetchCategoryAttributes(17028732, 92462, 'TR');
        effectiveCatId = 17028732;
        effectiveTypeId = 92462;
      }
    } catch (fallbackErr) {
      console.error('Kategori fallback hatası:', fallbackErr);
      throw new Error(`Ozon nitelikleri alınamadı: ${err.message}`);
    }
  }

  // 2. Ozon Canlı Rusça Kategori Adını Çöz (ID 22390 Benzer Ürünlerle Birleşme için %100 Rusça Kategori Adı)
  let russianTypeName = typeName || '';
  try {
    const ruCategoryTree = await fetchCategoryTree('RU');
    const findRuNode = (nodes: OzonCategoryNode[]): string | undefined => {
      for (const n of nodes) {
        if (n.type_id === typeId && n.type_name) return n.type_name;
        if (n.children && n.children.length > 0) {
          const sub = findRuNode(n.children);
          if (sub) return sub;
        }
      }
      return undefined;
    };
    russianTypeName = findRuNode(ruCategoryTree) || typeName || '';
  } catch (e) {}

  // 3. Sözlüklü niteliklerin Rusça geçerli seçeneklerini dinamik çek
  const dictionaryOptionsMap: Record<number, Array<{ id: number; value: string }>> = {};

  const dictFetchPromises = rawAttributesTR.map(async (attr) => {
    if (
      attr.dictionary_id > 0 &&
      attr.id !== 85 &&
      attr.dictionary_id !== 28732849 &&
      !isWarrantyAttribute(attr) &&
      !isMergeWithSimilarAttribute(attr)
    ) {
      try {
        const valRes = await fetchAttributeValues(effectiveCatId, effectiveTypeId, attr.id, 0, 25, 'RU');
        if (valRes && valRes.length > 0) {
          dictionaryOptionsMap[attr.id] = valRes.map((v) => ({ id: v.id, value: v.value }));
        }
      } catch (e) {}
    }
  });

  await Promise.all(dictFetchPromises);

  // 3. AI için Hedefli Soru Formu Hazırla (Garanti, Benzer Ürünlerle Birleşme ve Pasif/Salt-okunur alanlar hariç tutulur)
  const attributesToFill = rawAttributesTR
    .filter((attr) => !isWarrantyAttribute(attr) && !isMergeWithSimilarAttribute(attr) && !isIgnoredAttribute(attr))
    .map((attr) => {
      const opts = dictionaryOptionsMap[attr.id]?.map((o) => o.value) || [];
      return {
        id: attr.id,
        name: attr.name,
        type: attr.type,
        isRequired: attr.is_required,
        isCollection: attr.is_collection,
        hasDictionary: attr.dictionary_id > 0,
        options: opts.length > 0 ? opts : undefined,
      };
    });

  // 4. Katalog Hafızasını Sorgula (Daha önce kaydedilmiş aynı marka/kategori ürünleri)
  const relevantHistory = findRelevantCatalogMemory(brand, categoryId, typeId, productQuery, 5);
  let memoryPromptSection = '';
  if (relevantHistory.length > 0) {
    memoryPromptSection = `
=== GEÇMİŞ KATALOG HAFIZASI (DAHA ÖNCE KULLANILMIŞ KODLAR VE ŞABLONLAR) ===
Aynı marka ve kategoride daha önce sisteme kaydedilmiş ürünler ve bu ürünler için kullandığın kodlar:
${relevantHistory
  .map(
    (m) =>
      `• Model: ${m.brand} ${m.modelNo} (${m.typeName})\n  - Kart Birleştirici (ID 9048): "${m.seriesMergeCode}"\n  - Vitrin Modeli (ID 12141/20776): "${m.namingTemplateModel}"\n  - Renk/Hacim: ${m.aspects?.color || '-'} / ${m.aspects?.volumeLiters || '-'}`
  )
  .join('\n')}

ÖNEMLİ KURAL: Eğer araştırılan yeni ürün (${brand} ${modelNo}) yukarıdaki geçmiş ürünlerle AYNI SERİYE/AİLEYE aitse, KESİNLİKLE aynı Kart Birleştirici (ID 9048) kodunu kullan (örn: "${relevantHistory[0].seriesMergeCode}") ve Vitrin Modeli (ID 12141/20776) alanını yukarıdakiyle aynı SEO kalıbında oluştur!
=============================================================================
`;
  }

  // 5. Gemini 3.8 Flash High Effort Thinking ile Derinlemesine Soru-Cevap Araştırması
  const prompt = `Sen Ozon Marketplace için uzman bir Rusça ürün yöneticisi ve teknik analistisin.
Araştırılacak Ürün: "${brand} ${modelNo} (${productQuery})"
${memoryPromptSection}
GÖREV:
Bu ürünün gerçek teknik dökümanlarını, fabrika özelliklerini ve pazar verilerini derinlemesine araştır:
1. Rusça SEO Başlığı (Ozon arama motoru standartlarında anahtar kelimeleri içeren başlık)
2. Gerçek Paket Ölçüleri (Genişlik, Yükseklik, Derinlik mm cinsinden - 0 OLAMAZ)
3. Gerçek Paket Ağırlığı (Gram cinsinden - 0 OLAMAZ)
4. Varsa Orijinal EAN-13 Barkodu (yoksa "")
5. Aşağıdaki Ozon nitelik soru listesindeki her bir alanın bu ürün için doğru Rusça cevabını araştırıp doldur:

OZON NİTELİK LİSTESİ VE SEÇENEKLERİ:
${JSON.stringify(attributesToFill, null, 2)}

KESİN KURALLAR:
1. RUSÇA SEO BAŞLIĞI ("russianSeoTitle"):
   - Başlık KESİNLİKLE ürünün gerçek resmi Rusça tipi ile başlamalıdır:
     * Bıçak Seti -> "Набор кухонных ножей ${brand} [Seri Adı] [Parça Sayısı] предм. из стали Cromargan"
     * Tekil Bıçak -> "Нож кухонный ${brand} [Seri Adı] [Bıçak Tipi / Ölçü]"
     * Tava -> "Сковорода ${brand} [Seri Adı] [Çap cm] для индукции"
     * Tencere Seti -> "Набор кастрюль ${brand} [Seri Adı] [Parça Sayısı] предм."
     * Soyucu -> "Овощечистка ${brand} [Seri Adı] [Ölçü cm]"
     * Çatal Bıçak Takımı -> "Набор столовых приборов ${brand} [Seri Adı] [Parça Sayısı] предм."
   - KESİNLİKLE yan aksesuarları (kılıf / "чехол", stand / "подставка", kapak / "крышка") ana başlık YAPMA!
   - Birden fazla ürün tipini yan yana yapıştırarak bozuk başlık üretme (Örn: "Нож десертный Набор столовых приборов" YASAKTIR).
2. TÜM NİTELİK DEĞERLERİ %100 RUSÇA (RU) OLMALIDIR. (Örn: Siyah -> "Черный", 5 Yıl -> "5 лет", Paslanmaz Çelik -> "Нержавеющая сталь").
3. ID 4191 ("Kısa bilgi" / "Аннотация" / Ürün Açıklaması):
   Ozon'daki ana ürün açıklaması alanıdır. Buraya mutlaka şu 2 bölümlü profesyonel Rusça SEO metnini yaz:
   - 1. Paragraf: Ürünün öne çıkan faydalarını, teknolojisini ve değerini anlatan, zengin Rusça anahtar kelimelerle dolu ikna edici SEO tanıtım paragrafı.
   - 2. Bölüm (Maddeler): Ürünün en can alıcı teknik özelliklerinin, fonksiyonlarının ve avantajlarının maddeler halinde listesi (Örn:
     • Мощность: ...
     • Объем / Вместимость: ...
     • Покрытие / Материал: ...
     • Управление и режимы: ...
     • Особенности: ...).
3. ID 9048 ("Model adı (tek bir karta birleştirmek için)" / "Название модели (для объединения в одну карточку)"):
   Bu alan aynı ürün serisine ait farklı renk/varyantları Ozon'da TEK BİR ÜRÜN KARTINDA BİRLEŞTİRMEK içindir.
   Bu alanı KESİNLİKLE şu standart seri slug formatında oluştur (tümü küçük harf, tire ile ayrılmış):
   "[marka_kısa_kodu]-[ürün_serisi_numarası_veya_adı]-[kategori_kısa_adı]"
   Örnekler:
   - Philips 5400 Serisi Kahve Makinesi -> "ph-5400-kahve"
   - Philips 2200 / Series 2200 Kahve Makinesi (EP2220 vb.) -> "ph-2200-kahve"
   - Philips 5000 / 3000 Serisi Airfryer (NA350 / HD9280 / HD9455 / NA331) -> "ph-5000-airfryer" / "ph-3000-airfryer"
   - Tefal Ingenio Tava -> "tf-ingenio-tava"
   - Karaca Bio Diamond Tencere -> "kr-biodiamond-tencere"
   - Dyson V15 Süpürge -> "dy-v15-supurge"
4. ADLANDIRMA ŞABLONU / VİTRİN MODELİ ALANLARI (ID 12141 "Adlandırma şablonu için model adı" veya ID 20776 "Şablon motorunun parça numarası"):
   Ozon'un vitrin başlığında müşteriye göstereceği model adıdır.
   - KURAL 1 (Marka Tekrarını Önleme): Ozon zaten marka adını başlığın en başına otomatik eklemektedir. Çift marka yazılmaması için ("Philips Airfryer Philips NA350" olmaması için) BURAYA KESİNLİKLE MARKA ADI EKLEME!
   - KURAL 2 (SEO & Arama Sıralama Gücü): Ozon arama motorunda (SEO) en üst sıralara çıkmak ve tıklama oranını (CTR) artırmak için; Model numarasının yanına ürünün en can alıcı 1-2 teknik ayırt edici özelliğini (Hacim, Güç, Hazne türü, Basınç vb.) Rusça olarak ekle.
   - Format: "[Model Numarası] [En Önemli 1-2 Teknik Özellik / Rusça Parametre]"
   - Örnekler:
     * Philips NA350/00 (9L çift hazneli airfryer) -> "NA350/00 9 л с двумя чашами 2750 Вт"
     * Philips HD9455/50 (5L airfryer) -> "HD9455/50 5 л 1700 Вт"
     * Philips EP2220/10 (Kahve makinesi) -> "EP2220/10 15 бар с капучинатором"
     * Tefal Ingenio 26cm Tava -> "Ingenio 26 см с антипригарным покрытием"
     * Philips S5588/30 (Tıraş makinesi) -> "S5588/30 для сухого и влажного бритья"
     * Philips Sonicare (Elektrikli diş fırçası / HX7113 / HX3675 vb.) -> "Sonicare 5300 HX7113/01 звуковая с датчиком давления"
     * Braun Series 9 Pro -> "Series 9 Pro 9465cc для влажного и сухого бритья"
5. ID 4381 ("Parça numarası" / "Партномер"):
   Ürünün fabrika saf model/parça numarasıdır. Buraya yalnızca temiz model kodunu yaz (Örn: "${modelNo}").
6. Eğer bir nitelik için "options" (seçenekler) listesi verilmişse, ürünün gerçek özelliklerine göre YALNIZCA VE KESİNLİKLE O LİSTEDEKİ EN UYGUN SEÇENEĞİ AYNEN SEÇ. (Listede olmayan uydurma kelimeler yazma).
   - Örneğin Kahve Makinesi Türü için seçeneklerde "Автоматическая кофемашина" varsa ve ürün tam otomatik bir makineyse KESİNLİKLE "Автоматическая кофемашина" seç.
7. Çoklu seçim ("isCollection": true) alanlarında birden fazla seçenek geçerliyse dizi ["seçenek1", "seçenek2"] olarak ver (Örn: Çift renkli ise Renk alanına ["черный", "серый"]).
   ÖNEMLİ KURAL (TEKİL DEĞER ZORUNLU ALANLAR):
   - ID 12619 ("Ev aletleri türü" / "Вид бытовой техники" / "Тип прибора") -> KESİNLİKLE YALNIZCA 1 TEKİL DEĞER (örn: "Триммер" veya "Электробритва" - ASLA 2-3 seçenek gönderme!)
   - ID 4389 ("Üretim ülkesi" / "Страна-изготовитель") -> YALNIZCA 1 ÜLKE (örn: "Германия" veya "Китай")
   - "Kullanım amacı" / "Назначение" / "Предназначение" / "Область применения" -> YALNIZCA 1 DEĞER (örn: "Для дома" veya "Для салата" veya "Универсальное")
   - ID 8448 ("Tatil" / "Праздник") -> YALNIZCA 1 DEĞER (örn: "Универсальный" veya "Новый год")
   - ID 8449 ("Kimin için" / "Для кого" / "Hedef Kitle") -> YALNIZCA 1 DEĞER (örn: "Универсально" или "Для всей семьи")
   - 'isCollection': false olan tüm alanlar -> YALNIZCA 1 DEĞER
   OZON BU ALANLARDA KESİNLİKLE YALNIZCA 1 TEKİL DEĞER KABUL EDER. ASLA birden fazla değer veya dizi/virgül gönderme!
8. "summaryBullets": Ürünün araştırılan en önemli 5 özelliğini Türkçe kısa maddeler halinde özetle.

Format:
{
  "brand": "${brand}",
  "modelNo": "${modelNo}",
  "russianSeoTitle": "...",
  "turkishTitle": "...",
  "barcode": "...",
  "widthMm": 250,
  "heightMm": 200,
  "depthMm": 150,
  "weightG": 1500,
  "summaryBullets": [
    "Güç: 2750 W",
    "Hazne: 9 Litre Çift Hazne",
    "Kaplama: Yapışmaz Kaplama",
    "Kontrol: Dokunmatik Elektronik",
    "Bulaşık makinesinde yıkanabilir parçalar"
  ],
  "filledAttributes": {
    "85": "${brand}",
    "9048": "${modelNo}",
    "4851": "2750"
  }
}`;

  const ai = new GoogleGenAI({ apiKey: geminiApiKey.trim() });
  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: {
        thinkingBudget: thinkingBudget,
      },
    },
  });

  const responseText = response.text || '';
  let aiResult: any = {};
  try {
    const cleanJson = responseText.replace(/^```json\s*|\s*```$/g, '').trim();
    aiResult = JSON.parse(cleanJson);
  } catch (e) {
    try {
      const match = responseText.match(/\{[\s\S]*\}/);
      aiResult = match ? JSON.parse(match[0]) : {};
    } catch (e2) {
      console.error('Deep research parse error:', e2);
    }
  }

  // Token Kullanım Metrikleri
  let usageStats: TokenUsageStats | undefined = undefined;
  if (response.usageMetadata) {
    const promptTokens = response.usageMetadata.promptTokenCount || 0;
    const candidatesTokens = response.usageMetadata.candidatesTokenCount || 0;
    const totalTokens = response.usageMetadata.totalTokenCount || (promptTokens + candidatesTokens);
    usageStats = {
      promptTokens,
      candidatesTokens,
      totalTokens,
      estimatedCostUsd: calculateGemini37Cost(promptTokens, candidatesTokens),
      model: modelName,
    };
  }

  // Barkod Kontrolü
  let finalBarcode = aiResult.barcode || '';
  let isBarcodeGenerated = false;
  if (!finalBarcode || finalBarcode.length < 8) {
    finalBarcode = generateRandomEan13();
    isBarcodeGenerated = true;
  }

  const filledMap = aiResult.filledAttributes || {};
  const results: PreFilledAttribute[] = [];

  // 5. Ozon Rusça Sözlük ID Eşleştirmeleri
  for (const attr of rawAttributesTR) {
    const isWarranty = isWarrantyAttribute(attr);

    if (isWarranty) {
      let warrantyDictId = 972120566;
      if (attr.dictionary_id > 0 && attr.dictionary_id !== 46700526) {
        try {
          const searchRes = await searchAttributeValues(categoryId, typeId, attr.id, '15 дней', 5, 'RU');
          if (searchRes && searchRes.length > 0) warrantyDictId = searchRes[0].id;
        } catch (e) {}
      }

      results.push({
        attributeId: attr.id,
        name: attr.name,
        type: attr.type,
        isRequired: attr.is_required,
        isAspect: attr.is_aspect,
        dictionaryId: attr.dictionary_id,
        isCollection: attr.is_collection,
        valueText: '15 дней',
        dictionaryValueId: warrantyDictId,
        selectedValues: [{ value: '15 дней', dictionaryValueId: warrantyDictId }],
        matchStatus: 'matched',
        isReadOnly: true,
      });
      continue;
    }

    const isMerge = isMergeWithSimilarAttribute(attr);
    if (isMerge) {
      const mergeVal = sanitizeOzonSeriesName(russianTypeName || typeName || 'Товар');
      results.push({
        attributeId: attr.id,
        name: attr.name,
        type: attr.type,
        isRequired: attr.is_required,
        isAspect: attr.is_aspect,
        dictionaryId: attr.dictionary_id,
        isCollection: attr.is_collection,
        valueText: mergeVal,
        dictionaryValueId: undefined,
        selectedValues: [{ value: mergeVal }],
        matchStatus: 'matched',
        isReadOnly: true,
      });
      continue;
    }

    const isIgnored = isIgnoredAttribute(attr);
    if (isIgnored) {
      results.push({
        attributeId: attr.id,
        name: attr.name,
        type: attr.type,
        isRequired: attr.is_required,
        isAspect: attr.is_aspect,
        dictionaryId: attr.dictionary_id,
        isCollection: attr.is_collection,
        valueText: '',
        dictionaryValueId: undefined,
        selectedValues: [],
        matchStatus: 'matched',
        isReadOnly: true,
      });
      continue;
    }

    let rawVal = filledMap[attr.id.toString()];
    let selectedValues: AttributeSelectedValue[] = [];
    let valueToAssign = '';
    let dictionaryValueId: number | undefined = undefined;
    let matchStatus: 'matched' | 'manual_needed' | 'free_text' = 'manual_needed';

    if (attr.id === 85 && !rawVal && brand) rawVal = brand;
    if (attr.id === 9048 && !rawVal && modelNo) rawVal = modelNo;

    // Naming template ve Part number alanlarında marka adını temizle ve ASLA boş kalmasına izin verme
    if (attr.id === 12141 || attr.id === 20776 || attr.id === 4381 || isNamingTemplateAttribute(attr)) {
      if (!rawVal || String(rawVal).trim().length === 0) {
        rawVal = modelNo.replace(new RegExp(`^${brand}\\s*`, 'i'), '').trim() || modelNo.trim() || productQuery.trim();
      } else if (typeof rawVal === 'string' && brand) {
        const brandRegex = new RegExp(`^${brand}\\s*`, 'i');
        const cleaned = rawVal.replace(brandRegex, '').trim();
        rawVal = cleaned.length > 0 ? cleaned : modelNo.replace(brandRegex, '').trim() || modelNo.trim();
      }
    }

    if (rawVal !== undefined && rawVal !== null && String(rawVal).trim().length > 0) {
      const isSingleOnly = isStrictSingleValueAttribute(attr) || !attr.is_collection;

      if (!isSingleOnly && (attr.is_collection || Array.isArray(rawVal) || (typeof rawVal === 'string' && rawVal.includes(',') && attr.dictionary_id > 0))) {
        const itemsArray = Array.isArray(rawVal)
          ? rawVal
          : String(rawVal)
              .split(/[,;\n]+/)
              .map((s) => s.trim())
              .filter(Boolean);

        for (const item of itemsArray) {
          const valStr = String(item).trim();
          if (valStr) {
            let dictId: number | undefined = undefined;
            let finalVal = valStr;

            // 1. Önce önceden çekilen sözlükte tam veya yakın eşleşme ara
            const optMatch = dictionaryOptionsMap[attr.id]?.find(
              (o) =>
                o.value.toLowerCase() === valStr.toLowerCase() ||
                o.value.toLowerCase().includes(valStr.toLowerCase()) ||
                valStr.toLowerCase().includes(o.value.toLowerCase())
            );

            if (optMatch) {
              dictId = optMatch.id;
              finalVal = optMatch.value;
            } else if (attr.dictionary_id > 0) {
              try {
                const searchRes = await searchAttributeValues(categoryId, typeId, attr.id, valStr, 5, 'RU');
                if (searchRes && searchRes.length > 0) {
                  dictId = searchRes[0].id;
                  finalVal = searchRes[0].value;
                }
              } catch (e) {}
            }

            selectedValues.push({ value: finalVal, dictionaryValueId: dictId });
          }
        }
        valueToAssign = selectedValues.map((v) => v.value).join(', ');
        matchStatus = selectedValues.some((v) => v.dictionaryValueId) || attr.dictionary_id === 0 ? 'matched' : 'manual_needed';
      } else {
        // Tekil değer (Üretim ülkesi ve tekil alanlar için KESİNLİKLE ilk geçerli değer alınır)
        let singleStr = '';
        if (Array.isArray(rawVal)) {
          singleStr = String(rawVal[0] || '').trim();
        } else if (typeof rawVal === 'string' && rawVal.includes(',')) {
          singleStr = rawVal.split(/[,;\n]+/)[0].trim();
        } else {
          singleStr = String(rawVal).trim();
        }

        valueToAssign = singleStr;

        if (attr.dictionary_id > 0) {
          const optMatch = dictionaryOptionsMap[attr.id]?.find(
            (o) =>
              o.value.toLowerCase() === valueToAssign.toLowerCase() ||
              o.value.toLowerCase().includes(valueToAssign.toLowerCase()) ||
              valueToAssign.toLowerCase().includes(o.value.toLowerCase())
          );

          if (optMatch) {
            dictionaryValueId = optMatch.id;
            valueToAssign = optMatch.value;
            matchStatus = 'matched';
            selectedValues = [{ value: valueToAssign, dictionaryValueId }];
          } else {
            try {
              const searchRes = await searchAttributeValues(categoryId, typeId, attr.id, valueToAssign, 5, 'RU');
              if (searchRes && searchRes.length > 0) {
                dictionaryValueId = searchRes[0].id;
                valueToAssign = searchRes[0].value;
                matchStatus = 'matched';
                selectedValues = [{ value: valueToAssign, dictionaryValueId }];
              } else {
                matchStatus = 'manual_needed';
                selectedValues = [{ value: valueToAssign }];
              }
            } catch (e) {
              selectedValues = [{ value: valueToAssign }];
            }
          }
        } else {
          matchStatus = 'matched';
          selectedValues = [{ value: valueToAssign }];
        }
      }
    }

    results.push({
      attributeId: attr.id,
      name: attr.name,
      type: attr.type,
      isRequired: attr.is_required,
      isAspect: attr.is_aspect,
      dictionaryId: attr.dictionary_id,
      isCollection: attr.is_collection,
      valueText: valueToAssign,
      dictionaryValueId,
      selectedValues,
      matchStatus: valueToAssign ? (dictionaryValueId || attr.dictionary_id === 0 || selectedValues.length > 0 ? 'matched' : 'manual_needed') : 'manual_needed',
      isReadOnly: false,
    });
  }

  return {
    brand: aiResult.brand || brand,
    modelNo: aiResult.modelNo || modelNo,
    russianSeoTitle: aiResult.russianSeoTitle || `${brand} ${modelNo}`,
    turkishTitle: aiResult.turkishTitle || productQuery,
    barcode: finalBarcode,
    isBarcodeGenerated,
    dimensions: {
      widthMm: Number(aiResult.widthMm) || 200,
      heightMm: Number(aiResult.heightMm) || 200,
      depthMm: Number(aiResult.depthMm) || 200,
    },
    weightG: Number(aiResult.weightG) || 1000,
    attributes: results,
    researchSummaryBullets: aiResult.summaryBullets || [],
    usage: usageStats,
  };
}
