const fs = require('fs');
const path = require('path');
const { fetchAmazonProductGallery } = require('./lib/amazonGalleryHelper');

function getEnvConfig() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local dosyasi bulunamadi!');
  }
  const text = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  text.split('\n').forEach(line => {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) return;
    const idx = clean.indexOf('=');
    if (idx !== -1) {
      env[clean.slice(0, idx).trim()] = clean.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    }
  });
  return env;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

  console.log('================================================================');
  console.log('🚀 Ozon Canlı Mağaza Galeri Güncelleme Motoru');
  console.log(`Mod: ${isDryRun ? 'DRY-RUN (Sadece Simülasyon / Ozon Güncellenmez)' : 'CANLI GÜNCELLEME (POST /v1/product/pictures/import)'}`);
  if (limit) console.log(`Limit: ${limit} Ürün`);
  console.log('================================================================\n');

  const env = getEnvConfig();
  const clientId = env.OZON_CLIENT_ID;
  const apiKey = env.OZON_API_KEY;
  const baseUrl = env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

  const headers = {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  };

  const satistakiPath = path.join(process.cwd(), 'data', 'satistaki_urunler.json');
  const memoryPath = path.join(process.cwd(), 'data', 'catalog_memory.json');

  if (!fs.existsSync(satistakiPath) || !fs.existsSync(memoryPath)) {
    throw new Error('data/satistaki_urunler.json veya data/catalog_memory.json bulunamadı!');
  }

  const satistaki = JSON.parse(fs.readFileSync(satistakiPath, 'utf8'));
  const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));

  const candidates = [];

  for (const p of satistaki) {
    const offerId = (p.offerId || '').trim();

    // İstisna Koruması: EP2220/10 kesinlikle hariç tutulur
    if (offerId.toLowerCase().includes('ep2220/10') || offerId.toLowerCase() === 'ep2220/10') {
      continue;
    }

    const match = memory.find(
      (m) =>
        (m.asin && m.asin.toLowerCase() === offerId.toLowerCase()) ||
        (m.modelNo && m.modelNo.toLowerCase() === offerId.toLowerCase()) ||
        (m.offerId && m.offerId.toLowerCase() === offerId.toLowerCase()) ||
        (m.ozonProductId && String(m.ozonProductId) === String(p.productId))
    );

    if (match && match.asin && match.asin.startsWith('B0')) {
      candidates.push({
        productId: p.productId,
        offerId: p.offerId,
        name: p.name,
        asin: match.asin,
      });
    }
  }

  const targetList = limit > 0 ? candidates.slice(0, limit) : candidates;

  console.log(`📊 Toplam Güncellenecek Ürün: ${targetList.length} Adet (EP2220/10 hariç tutuldu)\n`);

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  const results = [];

  for (let i = 0; i < targetList.length; i++) {
    const item = targetList[i];
    const progress = `[${i + 1}/${targetList.length}]`;

    try {
      // 1. Amazon'dan katı filtreli galeri görsellerini çek
      const galleryImages = await fetchAmazonProductGallery(item.asin);

      if (!galleryImages || galleryImages.length === 0) {
        console.log(`${progress} ⚠️ Galeri Bulunamadı (${item.offerId} - ASIN: ${item.asin}) -> Atlandı.`);
        skippedCount++;
        results.push({ ...item, status: 'no_images' });
        continue;
      }

      console.log(`${progress} 📷 "${item.offerId}" için ${galleryImages.length} adet Amazon stüdyo görseli çekildi.`);

      if (isDryRun) {
        console.log(`    👉 [DRY-RUN] Ozon'a ${galleryImages.length} görsel gönderilecek.`);
        successCount++;
        results.push({ ...item, status: 'dry_run_success', imageCount: galleryImages.length, images: galleryImages });
      } else {
        // 2. Ozon API'ye gönder: POST /v1/product/pictures/import
        const ozonRes = await fetch(`${baseUrl}/v1/product/pictures/import`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            product_id: item.productId,
            images: galleryImages,
            images360: [],
            color_image: '',
          }),
        });

        if (!ozonRes.ok) {
          const errText = await ozonRes.text();
          console.error(`    ❌ Ozon Hatası [${ozonRes.status}]: ${errText}`);
          errorCount++;
          results.push({ ...item, status: 'ozon_error', error: errText });
        } else {
          const ozonData = await ozonRes.json();
          const importedCount = ozonData.result?.pictures?.length || galleryImages.length;
          console.log(`    ✅ OZON GÜNCELLENDİ: ${importedCount} görsel başarıyla içe aktarıldı.`);
          successCount++;
          results.push({ ...item, status: 'success', imageCount: importedCount, images: galleryImages });
        }
      }

      // Amazon ve Ozon API rate-limit koruması (700ms)
      await new Promise((r) => setTimeout(r, 700));
    } catch (err) {
      console.error(`${progress} ❌ Hata (${item.offerId}):`, err.message);
      errorCount++;
      results.push({ ...item, status: 'error', error: err.message });
    }
  }

  // Raporu Kaydet
  const reportPath = path.join(process.cwd(), 'data', 'galeri_guncelleme_raporu.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');

  console.log('\n================================================================');
  console.log('🎉 MAĞAZA GALERİ GÜNCELLEME İŞLEMİ TAMAMLANDI!');
  console.log(`- Toplam İşlenen: ${targetList.length}`);
  console.log(`- Başarıyla Güncellenen: ${successCount} Adet`);
  console.log(`- Atlanan: ${skippedCount} Adet`);
  console.log(`- Hata Alan: ${errorCount} Adet`);
  console.log(`- Detaylı Rapor: ${reportPath}`);
  console.log('================================================================');
}

main().catch(console.error);
