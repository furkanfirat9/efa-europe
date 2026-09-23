import { GoogleGenAI } from '@google/genai';
import { fetchCategoryAttributes, fetchAttributeValues, searchAttributeValues } from '../ozon/client';
import { calculateGemini37Cost, TokenUsageStats } from './types';
import { OzonLanguage, OzonAttribute } from '../ozon/types';

export interface AttributeSelectedValue {
  value: string;
  dictionaryValueId?: number;
}

export interface PreFilledAttribute {
  attributeId: number;
  name: string;
  type: string;
  isRequired: boolean;
  isAspect: boolean;
  dictionaryId: number;
  isCollection: boolean;
  valueText: string;
  dictionaryValueId?: number;
  selectedValues?: AttributeSelectedValue[];
  matchStatus: 'matched' | 'manual_needed' | 'free_text';
  isReadOnly?: boolean;
}

export interface DeepFillResult {
  attributes: PreFilledAttribute[];
  usage?: TokenUsageStats;
}

/**
 * Garanti Alanı Kontrolü (15 Gün Sabit ve Değiştirilemez)
 */
export function isWarrantyAttribute(attr: { id?: number; attributeId?: number; name?: string }): boolean {
  const id = attr.id !== undefined ? attr.id : attr.attributeId;
  const nameLower = (attr.name || '').toLowerCase();
  return (
    id === 10400 ||
    nameLower.includes('garanti') ||
    nameLower.includes('гаранти') ||
    nameLower.includes('warranty')
  );
}

/**
 * Benzer Ürünlerle Birleşme / Kart Birleştirme Alanı Kontrolü (Kategori Adı Sabit ve Salt Okunur)
 */
export function isMergeWithSimilarAttribute(attr: { id?: number; attributeId?: number; name?: string }): boolean {
  const id = attr.id !== undefined ? attr.id : attr.attributeId;
  const nameLower = (attr.name || '').toLowerCase();
  return (
    id === 22390 ||
    nameLower.includes('benzer ürünlerle birleş') ||
    nameLower.includes('объединить на одной карточке') ||
    nameLower.includes('объединение на одной карточке') ||
    nameLower.includes('похожие товары')
  );
}

/**
 * Ozon'da Tekil Değer Zorunlu Olan Nitelik Kontrolü
 * (Страна-изготовитель, Праздник / Tatil, Для кого / Hedef Kitle vb.)
 * Ozon bu alanlarda is_collection: true olsa dahi KESİNLİKLE tek bir değer kabul eder.
 */
export function isStrictSingleValueAttribute(attr: { id?: number; attributeId?: number; name?: string }): boolean {
  const id = attr.id !== undefined ? attr.id : attr.attributeId;
  const nameLower = (attr.name || '').toLowerCase();
  return (
    id === 4389 || // Страна-изготовитель (Üretim ülkesi)
    id === 4384 || // Комплектация
    id === 8448 || // Праздник (Tatil / Bayram / Kutlama)
    id === 8449 || // Для кого (Kimin için / Hedef kitle)
    id === 9390 || // Hedef kitle
    id === 6949 || // Количество предметов (Parça sayısı)
    id === 10914 || // Предназначение (Kullanım amacı)
    id === 4878 || // Область применения (Kullanım alanı)
    id === 12619 || // Ev aletleri türü (Вид бытовой техники / Тип прибора)
    nameLower.includes('kullanım amacı') ||
    nameLower.includes('kullanım alanı') ||
    nameLower.includes('kullanım') ||
    nameLower.includes('amaç') ||
    nameLower.includes('hedef kitle') ||
    nameLower.includes('tatil') ||
    nameLower.includes('bayram') ||
    nameLower.includes('kutlama') ||
    nameLower.includes('üretim ülkesi') ||
    nameLower.includes('kimin için') ||
    nameLower.includes('ev aletleri türü') ||
    nameLower.includes('alet türü') ||
    nameLower.includes('cihaz türü') ||
    nameLower.includes('cihaz tipi') ||
    nameLower.includes('вид бытовой техники') ||
    nameLower.includes('тип прибора') ||
    nameLower.includes('назначение') ||
    nameLower.includes('предназначение') ||
    nameLower.includes('область применения') ||
    nameLower.includes('праздник') ||
    nameLower.includes('страна-изготовитель') ||
    nameLower.includes('страна производства') ||
    nameLower.includes('страна бренда') ||
    nameLower.includes('для кого')
  );
}

/**
 * Üretim Ülkesi Nitelik Kontrolü (Geriye uyumluluk için)
 */
export function isCountryOfOriginAttribute(attr: { id?: number; attributeId?: number; name?: string }): boolean {
  return isStrictSingleValueAttribute(attr);
}

/**
 * Ozon'un ID 22390 (Benzer Ürünlerle Birleşme) için izin verdiği karakter filtreleme:
 * Sadece 0-9, Rusça/İngilizce harfler ve özel karakterler: ! ? , : ; ( ) - / & "
 */
export function sanitizeOzonSeriesName(text: string): string {
  if (!text) return '';
  const trMap: Record<string, string> = {
    'ç': 'c', 'Ç': 'C',
    'ğ': 'g', 'Ğ': 'G',
    'ı': 'i', 'I': 'I', 'İ': 'I',
    'ö': 'o', 'Ö': 'O',
    'ş': 's', 'Ş': 'S',
    'ü': 'u', 'Ü': 'U',
  };
  const cleaned = text.replace(/[çÇğĞıIİöÖşŞüÜ]/g, (m) => trMap[m] || m);
  return cleaned.replace(/[^a-zA-Z0-9а-яА-ЯёЁ!?,:;()\-/\&"\s]/g, '').trim();
}

/**
 * Ozon "orijinal ürün" ifadesini yasaklıyor (FB_ORIGINAL; Комплектация'da BR_attribute_advertising).
 * Amazon başlıkları "Orijinal" dediği için yapay zekâ "Оригинальный фильтр…" yazıyordu; 25 ürün bu yüzden
 * hata aldı. Kelime ürün adının parçası olsa da (Senseo Original Plus) Ozon itiraz ediyor, o yüzden her
 * durumda çıkarılır. "неоригинальный" gibi kelimenin içinde geçen hâller eşleşmez.
 */
export function stripOriginalityClaims(text: string): string {
  if (!text) return text;
  let startsWithClaim = false;
  const out = text
    .replace(/(?<![\p{L}\p{N}])(?:оригинал|original|orijinal)\p{L}*/giu, (_m, offset: number) => {
      if (text.slice(0, offset).trim() === '') startsWithClaim = true;
      return '';
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:!?)])/g, '$1')
    .replace(/^[ \t]+/gm, '');
  // "Оригинальные сменные насадки…" → "Сменные насадки…"
  return startsWithClaim ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

/**
 * Vitrin model adının (12141/20776) üst sınırı. Sınır kategoriye göre değişiyor: diş fırçasında 49 karakter
 * kabul edildi, 53 reddedildi (VALUE_MAX_LENGTH_LIMIT); tıraş makinesinde 76 geçti. 50 her yerde güvenli.
 */
export const NAMING_TEMPLATE_MAX_LENGTH = 50;

export function capNamingTemplate(text: string, max = NAMING_TEMPLATE_MAX_LENGTH): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const words = clean.slice(0, max + 1).split(' ');
  if (words.length > 1) words.pop(); // yarım kalan son kelime
  // Sonda asılı kalan edat/bağlaç ("… с") ya da birimi kesilmiş sayı ("… 5 режимов" → "… 5") anlamsız görünür
  while (words.length > 1 && /^(с|со|для|и|в|во|на|из|без|по|от|к|а|,|-|—|[\d.,]+)$/i.test(words[words.length - 1])) words.pop();
  return words.join(' ').replace(/[,;:\-—]+$/, '').trim() || clean.slice(0, max).trim();
}

/**
 * Ozon Vitrin Başlığını Oluşturan Adlandırma Şablonu Nitelikleri (Naming Template Model / Part Number)
 * Airfryer/Tıraş Makinesi: "Adlandırma şablonu için model adı" (ID 12141)
 * Kahve Makinesi/Diğerleri: "Şablon motorunun parça numarası" (ID 20776)
 */
export function isNamingTemplateAttribute(attr: { id?: number; attributeId?: number; name?: string }): boolean {
  const id = attr.id !== undefined ? attr.id : attr.attributeId;
  if (id === 12141 || id === 20776) return true;
  const nameLower = (attr.name || '').toLowerCase();
  return (
    nameLower.includes('adlandırma şablonu') ||
    nameLower.includes('şablon motorunun') ||
    nameLower.includes('шаблона именования') ||
    nameLower.includes('движка шаблонов')
  );
}

/**
 * Kullanılmayan ve AI tarafından doldurulması İSTENMEYEN Salt Okunur / Pasif Nitelikler:
 * - Rich-içerik JSON
 * - AEB'nin GTİP kodları / GTİP Kodu
 * - PDF belgesi / PDF dosyasının adı
 * - UEI'deki mal miktarı
 * - #Hashtag'ler
 * - Ozone.Video (isim, kapak, bağlantı, videoda ürünler)
 */
export function isIgnoredAttribute(attr: { id?: number; attributeId?: number; name?: string }): boolean {
  const id = attr.id !== undefined ? attr.id : attr.attributeId;
  const nameLower = (attr.name || '').toLowerCase();

  const ignoredIds = [
    11254, // Rich-içerik JSON
    22232, // AEB'nin GTİP kodları
    22992, // GTİP Kodu
    8790,  // PDF belgesi
    8789,  // PDF dosyasının adı
    23249, // UEI'deki mal miktarı
    23171, // #Hashtag'ler
    21837, // Ozone.Video: isim
    21845, // Ozone.Video kapak: link
    21841, // Ozone.Video: bağlantı
    22273, // Ozone.Video: videoda ürünler
  ];

  if (id && ignoredIds.includes(id)) return true;

  return (
    nameLower.includes('rich-içerik') ||
    nameLower.includes('rich-контент') ||
    nameLower.includes('rich content') ||
    nameLower.includes('gtip') ||
    nameLower.includes('gtip kodu') ||
    nameLower.includes('гтип') ||
    nameLower.includes('тн вэд') ||
    nameLower.includes('tn ved') ||
    nameLower.includes('pdf') ||
    nameLower.includes('uei') ||
    nameLower.includes('коммерческой единице') ||
    nameLower.includes('hashtag') ||
    nameLower.includes('хэштег') ||
    nameLower.includes('хэштеги') ||
    nameLower.includes('ozone.video') ||
    nameLower.includes('видеообложка') ||
    nameLower.includes('видео в карточке')
  );
}

/**
 * 2. AŞAMA: Ozon sözlük seçeneklerini dinamik olarak AI'a sunarak,
 * %100 Rusça (RU) ve Ozon sözlük kurallarına tam uyumlu nitelik doldurma motoru.
 */
export async function deepAiFillCategoryAttributes(
  categoryId: number,
  typeId: number,
  brand: string,
  modelNo: string,
  productQuery: string,
  language: OzonLanguage = 'RU'
): Promise<DeepFillResult> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.DEFAULT_AI_MODEL || 'gemini-3.8-flash';
  const thinkingBudget = Number(process.env.GEMINI_THINKING_BUDGET || '2048');

  // 1. Ozon API'den kategorinin gerçek niteliklerini çek
  const rawAttributesTR: OzonAttribute[] = await fetchCategoryAttributes(categoryId, typeId, 'TR');

  if (!geminiApiKey || geminiApiKey.trim().length < 5) {
    throw new Error(
      'Google Gemini API anahtarı (.env dosyasında GEMINI_API_KEY) tanımlanmamış.'
    );
  }

  // 2. Sözlüklü Niteliklerin Ozon Rusça Seçeneklerini Dinamik Olarak Çek
  const dictionaryOptionsMap: Record<number, Array<{ id: number; value: string }>> = {};

  const dictFetchPromises = rawAttributesTR.map(async (attr) => {
    // Garanti alanı veya dev marka sözlüğü değilse seçenekleri çek
    if (
      attr.dictionary_id > 0 &&
      attr.id !== 85 &&
      attr.dictionary_id !== 28732849 &&
      !isWarrantyAttribute(attr)
    ) {
      try {
        const valRes = await fetchAttributeValues(categoryId, typeId, attr.id, 0, 25, 'RU');
        if (valRes && valRes.length > 0) {
          dictionaryOptionsMap[attr.id] = valRes.map((v) => ({ id: v.id, value: v.value }));
        }
      } catch (e) {
        // Ignore single fetch fail
      }
    }
  });

  await Promise.all(dictFetchPromises);

  // 3. AI için Açıklamalı ve Seçenekli Nitelik Listesi Hazırla (Garanti alanı hariç tutulur, yapay zeka dokunamaz)
  const attributesToFill = rawAttributesTR
    .filter((attr) => !isWarrantyAttribute(attr))
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

  // 4. Gemini 3.8 Flash ile Nitelik Doldurma İstemi (%100 Rusça Değerler + Dinamik Sözlük Seçimi)
  const prompt = `Sen Ozon Marketplace için uzman bir Rusça ürün yöneticisisin.
Analiz edilecek ürün: "${brand} ${modelNo} (${productQuery})"

Ozon'un bu ürün kategorisi için istediği nitelik listesi ve varsa Ozon'un kabul ettiği Rusça resmi seçenekler (options) aşağıdadır:
${JSON.stringify(attributesToFill, null, 2)}

ÖNEMLİ VE KESİN KURALLAR:
1. TÜM NİTELİK DEĞERLERİ %100 RUSÇA (RU) OLMALIDIR. (Örnek: Siyah -> "Черный", Beyaz -> "Белый", Elektronik -> "Электронное", 5 Yıl -> "5 лет", Paslanmaz Çelik -> "Нержавеющая сталь").
2. Eğer bir nitelik için "options" (seçenekler) listesi verilmişse, ürünün gerçek fabrika ve teknik özelliklerine göre YALNIZCA VE KESİNLİKLE O LİSTEDEKİ EN UYGUN SEÇENEĞİ AYNEN SEÇ. (Listede olmayan uydurma kelimeler yazma).
   - Örneğin Makine Türü için seçeneklerde "Автоматическая кофемашина", "Капсульная кофемашина" varsa ve ürün tam otomatik çekirdek/öğütücülü bir makineyse KESİNLİKLE "Автоматическая кофемашина" seç.
3. Çoklu seçim ("isCollection": true) olan alanlarda birden fazla seçenek geçerliyse dizi ["seçenek1", "seçenek2"] olarak ver.
4. Sayısal alanları (Güç, Sıcaklık, Hacim vb.) ürünün gerçek verilerine göre sadece sayı veya Rusça birimle doldur.
5. Eğer bir nitelik bu ürün için geçerli değilse veya bilinmiyorsa boş string "" bırak.
6. Yanıtını YALNIZCA her nitelik ID'sini ve doldurulan değeri içeren geçerli bir JSON nesnesi olarak döndür.

Format:
{
  "filledAttributes": {
    "85": "${brand}",
    "9048": "${modelNo}",
    "4851": "2750",
    "10096": "Черный"
  }
}`;

  const ai = new GoogleGenAI({ apiKey: geminiApiKey.trim() });
  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      thinkingConfig: {
        thinkingBudget: thinkingBudget,
      },
      responseMimeType: 'application/json',
    },
  });

  const responseText = response.text || '';
  let filledMap: Record<string, any> = {};

  try {
    const parsed = JSON.parse(responseText);
    filledMap = parsed.filledAttributes || parsed;
  } catch (e) {
    console.error('Gemini attribute fill JSON parse error:', e);
  }

  // Token Kullanım Metrikleri
  let usageStats: TokenUsageStats | undefined = undefined;
  if (response.usageMetadata) {
    const promptTokens = response.usageMetadata.promptTokenCount || 0;
    const candidatesTokens = response.usageMetadata.candidatesTokenCount || 0;
    const totalTokens = response.usageMetadata.totalTokenCount || (promptTokens + candidatesTokens);
    const estimatedCostUsd = calculateGemini37Cost(promptTokens, candidatesTokens);

    usageStats = {
      promptTokens,
      candidatesTokens,
      totalTokens,
      estimatedCostUsd,
      model: modelName,
    };
  }

  // 5. Ozon Rusça Sözlük ID Eşleştirmeleri
  const results: PreFilledAttribute[] = [];

  for (const attr of rawAttributesTR) {
    const isWarranty = isWarrantyAttribute(attr);

    // KURAL: Garanti Süresi Her Zaman 15 Gün (15 дней - ID 972120566) Olarak Sabittir ve Salt Okunurdur.
    if (isWarranty) {
      let warrantyDictId: number = 972120566;
      if (attr.dictionary_id > 0 && attr.dictionary_id !== 46700526) {
        try {
          const searchRes = await searchAttributeValues(categoryId, typeId, attr.id, '15 дней', 5, 'RU');
          if (searchRes && searchRes.length > 0) {
            warrantyDictId = searchRes[0].id;
          }
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

    let rawVal = filledMap[attr.id.toString()];
    let selectedValues: AttributeSelectedValue[] = [];
    let valueToAssign = '';
    let dictionaryValueId: number | undefined = undefined;
    let matchStatus: 'matched' | 'manual_needed' | 'free_text' = 'manual_needed';

    // Marka Alanı için Garanti Eşleşme
    if (attr.id === 85 && !rawVal && brand) {
      rawVal = brand;
    }
    // Model Adı için Garanti Eşleşme
    if (attr.id === 9048 && !rawVal && modelNo) {
      rawVal = modelNo;
    }

    if (rawVal !== undefined && rawVal !== null && String(rawVal).trim().length > 0) {
      // Çoklu Değer Kontrolü
      if (Array.isArray(rawVal)) {
        for (const item of rawVal) {
          const valStr = String(item).trim();
          if (valStr) {
            let dictId: number | undefined = undefined;
            const optMatch = dictionaryOptionsMap[attr.id]?.find(
              (o) => o.value.toLowerCase() === valStr.toLowerCase()
            );
            if (optMatch) {
              dictId = optMatch.id;
            } else if (attr.dictionary_id > 0) {
              try {
                const searchRes = await searchAttributeValues(categoryId, typeId, attr.id, valStr, 5, 'RU');
                if (searchRes && searchRes.length > 0) {
                  dictId = searchRes[0].id;
                }
              } catch (e) {}
            }
            selectedValues.push({ value: valStr, dictionaryValueId: dictId });
          }
        }
        valueToAssign = selectedValues.map((v) => v.value).join(', ');
        matchStatus = 'matched';
      } else {
        valueToAssign = String(rawVal).trim();

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
            } catch (e) {}
          }
        } else {
          matchStatus = 'free_text';
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
    attributes: results,
    usage: usageStats,
  };
}
