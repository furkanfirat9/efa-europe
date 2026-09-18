const fs = require('fs');
const path = require('path');
const { fetchAmazonProductGallery } = require('./lib/amazonGalleryHelper');

function getEnvConfig() {
  const envPath = path.join(process.cwd(), '.env.local');
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

// 5 Hatalı Ürünün Gerçek Orijinal Cihaz ASIN Eşleşmeleri
const CORRECT_DEVICE_ASINS = [
  {
    offerId: 'NA352/00',
    correctAsin: 'B0CQMPH7BJ', // Philips Airfryer Dual Basket 3000 Serie 9L
    name: 'Philips Airfryer Dual Basket 3000 NA352/00'
  },
  {
    offerId: 'NA552/00',
    correctAsin: 'B0DKKL9152', // Philips Steam Airfryer 5000 Serie 9L
    name: 'Philips Steam Airfryer 5000 NA552/00'
  },
  {
    offerId: 'SL451EUSD',
    correctAsin: 'B0CZY23DYB', // Ninja Double Stack XL 9.5L
    name: 'Ninja Double Stack XL SL451EUSD'
  },
  {
    offerId: 'FW4018E0',
    correctAsin: 'B0B88RDCSR', // Tefal Easy Fry & Grill XXL
    name: 'Tefal Easy Fry FW4018E0'
  },
  {
    offerId: '0413020012',
    correctAsin: 'B00GYSV2M0', // WMF Stelio Wasserkocher 1.7L
    name: 'WMF Stelio Wasserkocher 0413020012'
  }
];

async function fixFalseImages() {
  const env = getEnvConfig();
  const clientId = env.OZON_CLIENT_ID;
  const apiKey = env.OZON_API_KEY;
  const baseUrl = env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

  const headers = {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  };

  const memPath = path.join(process.cwd(), 'data', 'catalog_memory.json');
  const satistakiPath = path.join(process.cwd(), 'data', 'satistaki_urunler.json');

  const memory = JSON.parse(fs.readFileSync(memPath, 'utf8'));
  const satistaki = JSON.parse(fs.readFileSync(satistakiPath, 'utf8'));

  console.log('=== Hatalı 5 Ürünün Orijinal Cihaz Görselleriyle Düzeltilmesi ===\n');

  for (const item of CORRECT_DEVICE_ASINS) {
    const storeProd = satistaki.find(p => p.offerId === item.offerId);
    if (!storeProd) {
      console.log(`⚠️ ${item.offerId} mağaza listesinde bulunamadı.`);
      continue;
    }

    console.log(`🔄 Düzeltiliyor: ${item.offerId} (Ozon Product ID: ${storeProd.productId})`);
    console.log(`   👉 Orijinal Cihaz ASIN'i: ${item.correctAsin} (${item.name})`);

    // Amazon'dan orijinal cihazın 6-8 stüdyo görselini çek
    const images = await fetchAmazonProductGallery(item.correctAsin);
    console.log(`   📸 Çekilen Orijinal Cihaz Görsel Sayısı: ${images.length}`);
    if (images.length > 0) {
      console.log(`   ⭐ Yeni Ana Görsel: ${images[0]}`);
    }

    // Ozon'a yükle: POST /v1/product/pictures/import
    const ozonRes = await fetch(`${baseUrl}/v1/product/pictures/import`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        product_id: storeProd.productId,
        images: images,
        images360: [],
        color_image: '',
      }),
    });

    if (ozonRes.ok) {
      const data = await ozonRes.json();
      console.log(`   ✅ OZON BAŞARIYLA DÜZELTİLDİ: ${data.result?.pictures?.length || images.length} orijinal görsel aktarıldı.\n`);

      // Katalog hafızasını güncelle
      const memIdx = memory.findIndex(m => m.modelNo === item.offerId || m.offerId === item.offerId);
      if (memIdx >= 0) {
        memory[memIdx].asin = item.correctAsin;
        memory[memIdx].source = 'corrected_device_match';
      }
    } else {
      console.error(`   ❌ Ozon Hatası: ${await ozonRes.text()}\n`);
    }

    await new Promise(r => setTimeout(r, 600));
  }

  // Hafızayı kaydet
  fs.writeFileSync(memPath, JSON.stringify(memory, null, 2), 'utf8');
  console.log(`💾 Katalog hafızası (catalog_memory.json) güncellendi.`);
}

fixFalseImages().catch(console.error);
