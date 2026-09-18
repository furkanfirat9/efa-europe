const fs = require('fs');
const path = require('path');
const {
  getEnvConfig,
  getAmazonSessionCookies,
  guessBrand,
  cleanModelForSearch,
  searchExactAsinOnAmazon,
} = require('./lib/asinMatcher');

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

  console.log('====================================================');
  console.log('🎯 Ozon Mağaza Ürünleri -> Amazon ASIN Katı Eşleştirici');
  console.log(`Mod: ${isDryRun ? 'DRY-RUN (Sadece Test / Kayıt Yapılmaz)' : 'CANLI EŞLEŞTİRME & HAFIZA GÜNCELLEME'}`);
  if (limit) console.log(`Limit: ${limit} Ürün`);
  console.log('====================================================\n');

  const env = getEnvConfig();
  const clientId = env.OZON_CLIENT_ID;
  const apiKey = env.OZON_API_KEY;
  const baseUrl = env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

  const memPath = path.join(process.cwd(), 'data', 'catalog_memory.json');
  let catalogMemory = [];
  if (fs.existsSync(memPath)) {
    try {
      catalogMemory = JSON.parse(fs.readFileSync(memPath, 'utf8'));
    } catch (e) {
      catalogMemory = [];
    }
  }

  console.log(`📂 Yerel Katalog Hafızasında ${catalogMemory.length} kayıt yüklendi.`);

  // 1. Ozon'dan Mağazadaki Tüm Ürünleri Çek
  console.log('📡 Ozon API üzerinden mağazadaki tüm ürünler çekiliyor...');
  let allListItems = [];
  let lastId = '';
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(`${baseUrl}/v3/product/list`, {
      method: 'POST',
      headers: {
        'Client-Id': clientId,
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: { visibility: 'ALL' },
        last_id: lastId,
        limit: 100,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ozon listeleme hatası [${res.status}]: ${await res.text()}`);
    }

    const data = await res.json();
    const items = data.result?.items || [];
    allListItems = allListItems.concat(items);
    lastId = data.result?.last_id || '';

    if (!lastId || items.length === 0 || allListItems.length >= (data.result?.total || 0)) {
      hasMore = false;
    }
  }

  console.log(`📦 Toplam ${allListItems.length} ürün listelendi. Detay bilgileri alınıyor...`);

  const productIds = allListItems.map((i) => i.product_id).filter(Boolean);
  let allProductDetails = [];

  for (let i = 0; i < productIds.length; i += 50) {
    const batch = productIds.slice(i, i + 50);
    const infoRes = await fetch(`${baseUrl}/v3/product/info/list`, {
      method: 'POST',
      headers: {
        'Client-Id': clientId,
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ product_id: batch }),
    });

    if (infoRes.ok) {
      const infoData = await infoRes.json();
      const items = infoData.items || infoData.result?.items || [];
      allProductDetails = allProductDetails.concat(items);
    }
  }

  console.log(`✅ ${allProductDetails.length} ürünün detayları başarıyla alındı.\n`);

  // 2. Eşleşme Analizi Yap
  const cookies = await getAmazonSessionCookies();

  let alreadyMatchedCount = 0;
  let newlyMatchedCount = 0;
  let unmatchedCount = 0;
  let processedCount = 0;

  const toProcess = [];

  for (const item of allProductDetails) {
    const offerId = item.offer_id || '';
    const name = item.name || '';
    const brand = guessBrand(name, offerId) || 'Philips';
    const modelCode = cleanModelForSearch(offerId);

    // Mevcut hafızada ASIN var mı?
    const existing = catalogMemory.find(
      (m) =>
        (m.asin && m.asin.toLowerCase() === offerId.toLowerCase()) ||
        (m.modelNo && m.modelNo.toLowerCase() === offerId.toLowerCase()) ||
        (m.offerId && m.offerId.toLowerCase() === offerId.toLowerCase())
    );

    if (existing && existing.asin && existing.asin.startsWith('B0')) {
      alreadyMatchedCount++;
    } else {
      toProcess.push({
        productId: item.id,
        offerId,
        name,
        brand,
        modelCode,
        categoryName: item.description_category_id,
      });
    }
  }

  console.log(`📊 Durum Özeti:`);
  console.log(`   - Toplam Mağaza Ürünü: ${allProductDetails.length}`);
  console.log(`   - Zaten ASIN'i Kayıtlı Olan: ${alreadyMatchedCount} Adet`);
  console.log(`   - ASIN Aranacak Eksik Ürün: ${toProcess.length} Adet\n`);

  const targetList = limit > 0 ? toProcess.slice(0, limit) : toProcess;

  console.log(`🚀 ${targetList.length} ürün için Amazon Katı Model Taraması Başlatılıyor...\n`);

  for (let i = 0; i < targetList.length; i++) {
    const target = targetList[i];
    processedCount++;
    const progressStr = `[${i + 1}/${targetList.length}]`;

    if (!target.modelCode) {
      console.log(`${progressStr} ⚠️ Geçersiz Model Kodu (${target.offerId}) -> Atlandı.`);
      unmatchedCount++;
      continue;
    }

    try {
      const matchResult = await searchExactAsinOnAmazon(target.brand, target.modelCode, cookies);

      if (matchResult) {
        newlyMatchedCount++;
        console.log(`${progressStr} ✅ EŞLEŞTİ: "${target.offerId}" (${target.brand}) -> ASIN: ${matchResult.asin}`);
        console.log(`    👉 Amazon: ${matchResult.matchedTitle.slice(0, 85)}...`);

        // Hafızaya ekle veya güncelle
        const existingIdx = catalogMemory.findIndex(
          (m) => (m.modelNo && m.modelNo.toLowerCase() === target.offerId.toLowerCase()) ||
                 (m.offerId && m.offerId.toLowerCase() === target.offerId.toLowerCase())
        );

        const memoryEntry = {
          asin: matchResult.asin,
          brand: target.brand,
          modelNo: target.offerId,
          offerId: target.offerId,
          ozonProductId: target.productId,
          finalTitle: target.name,
          productQuery: `${target.brand} ${target.modelCode}`,
          verifiedAt: new Date().toISOString(),
          source: 'autonomous_asin_matcher'
        };

        if (existingIdx >= 0) {
          catalogMemory[existingIdx] = { ...catalogMemory[existingIdx], ...memoryEntry };
        } else {
          catalogMemory.push(memoryEntry);
        }

        // Anlık kaydet (güvenlik için)
        if (!isDryRun) {
          fs.writeFileSync(memPath, JSON.stringify(catalogMemory, null, 2), 'utf8');
        }
      } else {
        unmatchedCount++;
        console.log(`${progressStr} ❌ Eşleşmedi: "${target.offerId}" (${target.brand}) -> Amazon'da tam model bulunamadı.`);
      }

      // Amazon rate-limit koruması (500ms)
      await new Promise((r) => setTimeout(r, 600));
    } catch (err) {
      console.error(`${progressStr} ⚠️ Arama Hatası (${target.offerId}):`, err.message);
      unmatchedCount++;
    }
  }

  console.log('\n====================================================');
  console.log('🎉 EŞLEŞTİRME VE KAYIT İŞLEMİ TAMAMLANDI!');
  console.log(`- Toplam Taranan: ${targetList.length}`);
  console.log(`- Yeni Doğrulanan & Kaydedilen ASIN: ${newlyMatchedCount} Adet`);
  console.log(`- Doğrulanamayan (Atlanan): ${unmatchedCount} Adet`);
  console.log(`- Hafızadaki Toplam Güncel ASIN Sayısı: ${catalogMemory.filter(m => m.asin).length} Adet`);
  console.log(`- Kayıt Dosyası: ${memPath}`);
  console.log('====================================================');
}

main().catch(console.error);
