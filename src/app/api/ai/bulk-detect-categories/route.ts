import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { fetchCategoryTree } from '@/lib/ozon/client';
import { OzonCategoryNode } from '@/lib/ozon/types';
import { getAllCatalogMemory } from '@/lib/db/catalogMemory';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export interface BulkCategoryDetectionRequest {
  items: {
    id: string;
    query: string;
  }[];
}

// Yalnızca mağazamızın sattığı Ozon 1. Seviye Ana Departman ID'leri
const ALLOWED_ROOT_DEPARTMENTS = new Set([
  17027494, // Ev & Bahçe (Дом и сад)
  17027486, // Ev aletleri (Бытовая техника)
  17027489, // Kişisel bakım ve hijyen (Красота и гигиена)
  17027488, // Çocuk ürünleri (Детские товары)
  17027492, // Kırtasiye ürünleri (Makaslar vb.)
]);

// Kapalı ana bölümlerden yalnızca satılan ürünlerin dalları açılır. Bölümün tamamı açılmaz: Строительство
// и ремонт 1316, Автотовары 1180 kategori; zaten ~95k token olan istem ikiye katlanırdı. Bu dallar yokken
// yapay zekâ doğru kategoriyi göremiyor ve en yakın açık olanı seçiyordu: araba ampulleri ve GU10
// ampuller "Украшение на машину" (araba süsü), gömme spot "Интерьерное украшение" oldu.
const ALLOWED_EXTRA_CATEGORIES = new Set([
  17028609, // Лампочка (Строительство и ремонт)
  17028941, // Бытовое освещение (Строительство и ремонт)
]);
const ALLOWED_EXTRA_TYPES = new Set([
  367249974, // Лампа автомобильная (Автотовары > Запчасти для легковых автомобилей, 422 kategorilik dal)
]);

export async function POST(request: NextRequest) {
  try {
    const body: BulkCategoryDetectionRequest = await request.json();
    const items = body.items || [];

    if (items.length === 0) {
      return NextResponse.json({ success: true, results: [] });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const modelName = process.env.DEFAULT_AI_MODEL || 'gemini-3.8-flash';

    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY ortam değişkeni tanımlanmamış.');
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    // 1. Canlı Rusça ve Türkçe Ağaçtan Yalnızca İzinli Departmanların Yaprak Düğümlerini Çek
    const [categoryTreeRU, categoryTreeTR] = await Promise.all([
      fetchCategoryTree('RU'),
      fetchCategoryTree('TR'),
    ]);

    const trMap = new Map<number, string>();
    const traverseTR = (node: OzonCategoryNode) => {
      if (node.type_id && node.type_name) {
        trMap.set(node.type_id, node.type_name);
      }
      if (node.children) node.children.forEach(traverseTR);
    };
    categoryTreeTR.forEach((n) => traverseTR(n));

    interface FilteredLeaf {
      categoryId: number;
      categoryName: string;
      typeId: number;
      typeNameRU: string;
      typeNameTR: string;
      path: string[];
    }

    const allowedLeaves: FilteredLeaf[] = [];
    const traverseRU = (node: OzonCategoryNode, path: string[], lastCatId: number, lastCatName: string, allowed: boolean) => {
      const name = node.category_name || node.type_name || '';
      const newPath = [...path, name];
      const currentCatId = node.description_category_id || lastCatId || 0;
      const currentCatName = node.category_name || lastCatName || '';
      const inAllowedBranch = allowed || (!!node.description_category_id && ALLOWED_EXTRA_CATEGORIES.has(node.description_category_id));

      if (node.type_id && node.type_name && (inAllowedBranch || ALLOWED_EXTRA_TYPES.has(node.type_id))) {
        allowedLeaves.push({
          categoryId: currentCatId,
          categoryName: currentCatName,
          typeId: node.type_id,
          typeNameRU: node.type_name,
          typeNameTR: trMap.get(node.type_id) || node.type_name,
          path: newPath,
        });
      }

      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          traverseRU(child, newPath, currentCatId, currentCatName, inAllowedBranch);
        }
      }
    };

    for (const root of categoryTreeRU) {
      traverseRU(root, [], root.description_category_id || 0, root.category_name || '', !!root.description_category_id && ALLOWED_ROOT_DEPARTMENTS.has(root.description_category_id));
    }

    // 2. Gemini 2.5 Flash için Odaklı Seçenek Listesi
    const categoryOptionsList = allowedLeaves.map((l) => ({
      typeId: l.typeId,
      nameRU: l.typeNameRU,
      nameTR: l.typeNameTR,
      categoryName: l.categoryName,
    }));

    // 3. Geçmiş Yükleme Hafızasından (CatalogMemory) Canlı Referansları Çek
    // Kayıtlar en yeni başta gelir; en yeni 60 yükleme örnek verilir (eskiden slice(-60) en eskileri alıyordu).
    const memoryRecords = await getAllCatalogMemory();
    const relevantMemory = memoryRecords
      .filter((m) => m.typeId && (m.productQuery || m.modelNo))
      .slice(0, 60)
      .map((m) => ({
        query: (m.productQuery || `${m.brand} ${m.modelNo}`).slice(0, 80),
        brand: m.brand,
        modelNo: m.modelNo,
        typeId: m.typeId,
        typeName: m.typeName,
      }));

    // 4. wmf.md, philips.md ve catalog_memory.json Referans Bilgi Bankası (Ground Truth Prompt)
    const prompt = `Sen Ozon Marketplace için uzman bir Rusça/Türkçe e-ticaret Kategori Sınıflandırma motorusun.
Aşağıda verilen ürünlerin başlıklarını incele ve her ürün için Ozon Marketplace'teki en doğru kategori typeId değerini seç.

KESİN KURALLAR VE ALTIN STANDART REFERANS ÖRNEKLER:
(Ürün başlıkları Amazon.de'nin Türkçe arayüzünden gelir; eski kayıtlar Almanca olabilir. Her kuralı iki dilde de uygula.)
1. ÇOKLU SERVİS SETLERİ: Başlıkta "Küchenhelfer Set", "Ständer mit 6 Helfern", "mutfak gereçleri seti", "standlı 6 parça mutfak yardımcısı" gibi standlı kepçe, kevgir, spatula setleri varsa; içinde "Wokwender"/"wok spatulası" veya "Schneebesen"/"çırpma teli" geçse bile bu bir tava veya çırpıcı DEĞİLDİR! -> typeId: 92374 ("Набор кухонной навески" / Mutfak Servis Seti).
2. PİZZA KESİCİ / RULET: "Pizzaschneider", "Pizzaroller", "Pizza Cutter", "pizza kesici", "pizza ruleti" -> typeId: 970791945 ("Ролик для теста" / Şekilli hamur ve pizza kesici rulet). Kevgir (Шумовка) veya Dilimleyici SEÇİLMEZ.
3. SU SÜRAHİSİ / KARAF: "Wasserkaraffe", "Karaffe", "Glaskaraffe", "su sürahisi", "sürahi", "karaf" -> typeId: 92479 ("Кувшин" / Sürahi) veya 92478 ("Графин" / Karaf). Cam şişe (Бутылка) SEÇİLMEZ.
4. DOLU BIÇAK BLOĞU: İçinde bıçakları olan dolu bıçak blokları ("Messerblock mit Messerset", "bıçaklı bıçak bloğu", "bıçak seti ve bloğu") -> typeId: 92561 ("Набор столовых приборов" / Mutfak Bıçak Seti).
5. BOŞ BIÇAK BLOĞU: Yalnızca içi boş stand ("Messerblock unbestückt", "boş bıçak bloğu", "FlexTec bıçak bloğu 15 bıçağa kadar") -> typeId: 92397 ("Подставка для ножей" / Bıçak Standı).
6. TEKİL TAVA vs ÇOKLU TAVA SETİ:
   - Tekil tava ("Bratpfanne", "Crepe Pfanne", "kızartma tavası", "krep tavası", "tava 28 cm") -> typeId: 92462 ("Сковорода" / Tava).
   - 2'li veya 3'lü tava seti ("Pfannenset 2-teilig / 3-teilig", "2 parçalı tava seti", "3'lü tava seti") -> typeId: 92452 ("Набор посуды для приготовления" / Pişirme Kapları Seti).
7. TENCERE SETİ: "Topfset 4-teilig / 5-teilig", "4 parçalı tencere seti", "tencere takımı" -> typeId: 92452 ("Набор посуды для приготовления" / Pişirme Kapları Seti).
8. SÜT VE SOS TENCERESİ: "Milchtopf", "süt tenceresi", "sütlük", "sos tenceresi" -> typeId: 92448 ("Ковш" / Sütlük) veya 92447 ("Кастрюля").
9. DERİN GÜVEÇ / SOTE TAVASI: "Schmorpfanne", "Servierpfanne", "güveç tavası", "sote tavası", "servis tavası" -> typeId: 92466 ("Сотейник" / Sote Tavası).
10. KAHVE MAKİNESİ FİLTRESİ / YEDEK PARÇA: "AquaClean Su Filtresi", "kahve makinesi için su filtresi", "kireç çözücü" -> typeId: 95805 ("Аксессуары, запчасти для кофемашины" / Kahve Makinesi Aksesuarı).
11. ELEKTRİKLİ SÜPÜRGELER:
    - Torbasız ya da torbalı klasik kızaklı süpürge ("torbasız elektrikli süpürge", "Bodenstaubsauger") -> typeId: 91586 ("Напольный пылесос" / Klasik Elektrikli Süpürge).
    - Islak/kuru ya da akülü dikey süpürge ("AquaTrio 9000", "akülü elektrikli süpürge", "şarjlı dikey süpürge", "Akku-Staubsauger") -> typeId: 91587 ("Вертикальный пылесос" / Dikey Şarjlı Süpürge).
12. BUHARLI DÜZLEŞTİRİCİ (STEAMER): "Philips Steamer 7000", "el tipi buharlı düzleştirici", "kıyafet buharlayıcı", "Dampfglätter" -> typeId: 91426 ("Отпариватель для одежды" / Buharlı Kırışık Giderici).
13. HAVA TEMİZLEYİCİ: "Philips 1000i Hava Temizleyici", "hava temizleyici", "Luftreiniger" -> typeId: 91451 ("Очиститель воздуха" / Hava Temizleyici).
14. SALATA KASESİ & SERVİS SETİ: "Taverno Salatschüssel Set mit Salatbesteck", "salata kasesi seti", "salata servis takımı" -> typeId: 92507 ("Салатник" / Salata Kasesi).
15. YUMURTA PİŞİRİCİ: "Küchenminis Eierkocher", "yumurta pişirici", "yumurta haşlama makinesi" -> typeId: 91438 ("Яйцеварка" / Yumurta Pişirici).
16. SÜT KÖPÜRTÜCÜ: "Lono Milchaufschäumer", "süt köpürtücü", "süt köpürtme makinesi" -> typeId: 94747 ("Капучинатор" / Süt Köpürtücü).
17. TOST / EKMEK KIZARTMA: "Stelio Toaster", "ekmek kızartma makinesi", "tost makinesi (ekmek kızartıcı)" -> typeId: 94979 ("Тостер" / Ekmek Kızartma Makinesi).
18. KADIN TIRAŞ MAKİNESİ: "Lady Shaver", "Damenrasierer", "kadın tıraş makinesi", "kadınlar için elektrikli tıraş makinesi" kılı yüzeyden keser, EPİLATÖR DEĞİLDİR (epilatör kökten çeker) -> typeId: 91687 ("Электробритва" / Tıraş makinesi). Эпилятор (91688) SEÇİLMEZ.
19. AYDINLATMA VE AMPULLER: "Украшение на машину" (araba süsü) ve "Интерьерное украшение" (iç mekân süsü) ampul veya lamba için ASLA SEÇİLMEZ.
    - Araç ampulü ("far ampulü", "sinyal ampulü", "H1", "H4", "H7", "HB4", "P21W", "W5W", "Autolampe", "Scheinwerferlampe", "Ultinon", "X-tremeVision", "WhiteVision", "Easy Kit") -> typeId: 367249974 ("Лампа автомобильная").
    - Ev ampulü ("LED ampul", "GU10", "E27", "E14", "spot ampul", "LED-Lampe", "Glühbirne", "Leuchtmittel") -> typeId: 91309 ("Лампочка").
    - Gömme spot / tavan lambası ("tavan lambası", "gömme spot", "Einbauleuchte", "Deckenleuchte", "Deckenstrahler") -> typeId: 970589574 ("Потолочный светильник"). Duvar lambası 91647, masa lambası 91637, lambader 91645.

GEÇMİŞTE MAĞAZAYA YÜKLENMİŞ ÜRÜN VE KATEGORİ HAFIZASI (Referans olarak incele ve benzer ürünlerde aynı kategoriyi kullan):
${JSON.stringify(relevantMemory, null, 2)}

İZİN VERİLEN KATEGORİ LİSTESİ (YALNIZCA BU LİSTEDEKİ typeId NUMARALARINDAN BİRİNİ SEÇ):
${JSON.stringify(categoryOptionsList, null, 2)}

SINIFLANDIRILACAK ÜRÜNLER:
${JSON.stringify(items, null, 2)}

YANIT FORMATI (YALNIZCA GEÇERLİ JSON DİZİSİ):
[
  {
    "id": "urun-id",
    "typeId": 92374
  }
]
`;

    let aiResults: Array<{ id: string; typeId: number }> = [];

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      const cleaned = (response.text || '[]').replace(/^```json\s*/, '').replace(/\s*```$/, '');
      aiResults = JSON.parse(cleaned);
    } catch (e) {
      // Yutulmaz: hepsi "bulunamadı" görünürse sebep (yapay zekâ hatası) kaybolur.
      console.error('[Bulk Category AI Error]:', e);
      throw new Error('Yapay zekâ kategori tespiti başarısız oldu; tekrar deneyin.');
    }

    const aiResultMap = new Map<string, number>();
    aiResults.forEach((r) => {
      if (r.id && r.typeId) {
        aiResultMap.set(r.id, Number(r.typeId));
      }
    });

    const results = items.map((item) => {
      const chosenTypeId = aiResultMap.get(item.id);
      const match = allowedLeaves.find((l) => l.typeId === chosenTypeId);

      // Yapay zekâ geçerli bir kategori seçmediyse kategori boş döner ve tabloda "Kategori Seç"
      // olarak görünür. Eskiden "Tava" (92462) atanıyordu; kahve makinesi sessizce tava olabiliyordu.
      if (!match) {
        console.warn(`[Category Detected] ID: ${item.id} | Query: "${item.query.slice(0, 45)}..." -> kategori bulunamadı`);
        return { id: item.id, category: null };
      }

      console.log(`[Category Detected] ID: ${item.id} | Query: "${item.query.slice(0, 45)}..." -> Ozon: "${match.typeNameTR}" / "${match.typeNameRU}" (Cat: ${match.categoryId}, Type: ${match.typeId})`);

      return {
        id: item.id,
        category: {
          categoryId: match.categoryId,
          typeId: match.typeId,
          categoryName: match.categoryName,
          typeName: match.typeNameRU,
          typeNameTR: match.typeNameTR,
          path: match.path,
        },
      };
    });

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Bulk detect categories error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Kategori tespiti sırasında hata oluştu.' },
      { status: 500 }
    );
  }
}
