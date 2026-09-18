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
    const traverseRU = (node: OzonCategoryNode, path: string[], lastCatId: number, lastCatName: string) => {
      const name = node.category_name || node.type_name || '';
      const newPath = [...path, name];
      const currentCatId = node.description_category_id || lastCatId || 0;
      const currentCatName = node.category_name || lastCatName || '';

      if (node.type_id && node.type_name) {
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
          traverseRU(child, newPath, currentCatId, currentCatName);
        }
      }
    };

    for (const root of categoryTreeRU) {
      if (root.description_category_id && ALLOWED_ROOT_DEPARTMENTS.has(root.description_category_id)) {
        traverseRU(root, [], root.description_category_id, root.category_name || '');
      }
    }

    // 2. Gemini 2.5 Flash için Odaklı Seçenek Listesi
    const categoryOptionsList = allowedLeaves.map((l) => ({
      typeId: l.typeId,
      nameRU: l.typeNameRU,
      nameTR: l.typeNameTR,
      categoryName: l.categoryName,
    }));

    // 3. Geçmiş Yükleme Hafızasından (catalog_memory.json) Canlı Referansları Çek
    const memoryRecords = getAllCatalogMemory();
    const relevantMemory = memoryRecords
      .filter((m) => m.typeId && (m.productQuery || m.modelNo))
      .slice(-60)
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
1. ÇOKLU SERVİS SETLERİ: Başlıkta "Küchenhelfer Set", "Ständer mit 6 Helfern" gibi standlı kepçe, kevgir, spatula setleri varsa; içinde "Wokwender" veya "Schneebesen" geçse bile bu bir tava veya çırpıcı DEĞİLDİR! -> typeId: 92374 ("Набор кухонной навески" / Mutfak Servis Seti).
2. PİZZA KESİCİ / RULET: "Pizzaschneider", "Pizzaroller", "Pizza Cutter" -> typeId: 970791945 ("Ролик для теста" / Şekilli hamur ve pizza kesici rulet). Kevgir (Шумовка) veya Dilimleyici SEÇİLMEZ.
3. SU SÜRAHİSİ / KARAF: "Wasserkaraffe", "Karaffe", "Glaskaraffe" -> typeId: 92479 ("Кувшин" / Sürahi) veya 92478 ("Графин" / Karaf). Cam şişe (Бутылка) SEÇİLMEZ.
4. DOLU BIÇAK BLOĞU: İçinde bıçakları olan dolu bıçak blokları ("Messerblock mit Messerset") -> typeId: 92561 ("Набор столовых приборов" / Mutfak Bıçak Seti).
5. BOŞ BIÇAK BLOĞU: Yalnızca içi boş stand ("Messerblock unbestückt", "FlexTec bıçak bloğu 15 bıçağa kadar") -> typeId: 92397 ("Подставка для ножей" / Bıçak Standı).
6. TEKİL TAVA vs ÇOKLU TAVA SETİ:
   - Tekil tava ("Bratpfanne", "Crepe Pfanne") -> typeId: 92462 ("Сковорода" / Tava).
   - 2'li veya 3'lü tava seti ("Pfannenset 2-teilig / 3-teilig") -> typeId: 92452 ("Набор посуды для приготовления" / Pişirme Kapları Seti).
7. TENCERE SETİ: "Topfset 4-teilig / 5-teilig" -> typeId: 92452 ("Набор посуды для приготовления" / Pişirme Kapları Seti).
8. SÜT VE SOS TENCERESİ: "Milchtopf", "Süt tenceresi" -> typeId: 92448 ("Ковш" / Sütlük) veya 92447 ("Кастрюля").
9. DERİN GÜVEÇ / SOTE TAVASI: "Schmorpfanne", "Servierpfanne", "Güveç tavası" -> typeId: 92466 ("Сотейник" / Sote Tavası).
10. KAHVE MAKİNESİ FİLTRESİ / YEDEK PARÇA: "AquaClean Su Filtresi" -> typeId: 95805 ("Аксессуары, запчасти для кофемашины" / Kahve Makinesi Aksesuarı).
11. ELEKTRİKLİ SÜPÜRGELER:
    - Torbasız klasik kızaklı süpürge -> typeId: 91586 ("Напольный пылесос" / Klasik Elektrikli Süpürge).
    - Islak/kuru şarjlı dikey süpürge ("AquaTrio 9000") -> typeId: 91587 ("Вертикальный пылесос" / Dikey Şarjlı Süpürge).
12. BUHARLI DÜZLEŞTİRİCİ (STEAMER): "Philips Steamer 7000 / El tipi düzleştirici" -> typeId: 91426 ("Отпариватель для одежды" / Buharlı Kırışık Giderici).
13. HAVA TEMİZLEYİCİ: "Philips 1000i Hava Temizleyici" -> typeId: 91451 ("Очиститель воздуха" / Hava Temizleyici).
14. SALATA KASESİ & SERVİS SETİ: "Taverno Salatschüssel Set mit Salatbesteck" -> typeId: 92507 ("Салатник" / Salata Kasesi).
15. YUMURTA PİŞİRİCİ: "Küchenminis Eierkocher" -> typeId: 91438 ("Яйцеварка" / Yumurta Pişirici).
16. SÜT KÖPÜRTÜCÜ: "Lono Milchaufschäumer" -> typeId: 94747 ("Капучинатор" / Süt Köpürtücü).
17. TOST / EKMEK KIZARTMA: "Stelio Toaster" -> typeId: 94979 ("Тостер" / Ekmek Kızartma Makinesi).

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
      console.error('[Bulk Category AI Error]:', e);
    }

    const aiResultMap = new Map<string, number>();
    aiResults.forEach((r) => {
      if (r.id && r.typeId) {
        aiResultMap.set(r.id, Number(r.typeId));
      }
    });

    const results = items.map((item) => {
      const chosenTypeId = aiResultMap.get(item.id);
      let match = allowedLeaves.find((l) => l.typeId === chosenTypeId);

      // Yedek Eşleşme (Eğer AI bulamadıysa varsayılan Tava/Mutfak)
      if (!match) {
        match = allowedLeaves.find((l) => l.typeId === 92462) || allowedLeaves[0];
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
