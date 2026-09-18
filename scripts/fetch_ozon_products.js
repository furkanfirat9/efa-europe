/**
 * Ozon Seller API - Canli Urun Takip ve Listeleme Scripti
 * 
 * Bu script, Ozon magazinizdaki tum aktif/arsivdeki urunleri canli olarak ceker.
 * 
 * Kullanilan Endpoint'ler:
 * 1. POST https://api-seller.ozon.ru/v3/product/list -> Urun kimliklerini (product_id, offer_id, sku) sayfalanmis ceker.
 * 2. POST https://api-seller.ozon.ru/v3/product/info/list -> 50'lik paketler halinde isim, fiyat, kategori, barkod bilgilerini ceker.
 * 
 * Calistirma:
 * node scripts/fetch_ozon_products.js
 * node scripts/fetch_ozon_products.js --search=NA350
 * node scripts/fetch_ozon_products.js --category=17039629
 */

const fs = require('fs');
const path = require('path');

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

async function fetchAllOzonProducts(options = {}) {
  const env = getEnvConfig();
  const clientId = env.OZON_CLIENT_ID;
  const apiKey = env.OZON_API_KEY;
  const baseUrl = env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

  if (!clientId || !apiKey) {
    throw new Error('OZON_CLIENT_ID veya OZON_API_KEY eksik!');
  }

  const headers = {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'Content-Type': 'application/json'
  };

  console.log('Ozon API uzerinden urun listesi cekiliyor...');

  let allListItems = [];
  let lastId = '';
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(`${baseUrl}/v3/product/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filter: { visibility: 'ALL' },
        last_id: lastId,
        limit: 100
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ozon /v3/product/list hatasi [${res.status}]: ${err}`);
    }

    const data = await res.json();
    const items = data.result?.items || [];
    allListItems = allListItems.concat(items);
    lastId = data.result?.last_id || '';

    if (!lastId || items.length === 0 || allListItems.length >= (data.result?.total || 0)) {
      hasMore = false;
    }
  }

  console.log(`Toplam ${allListItems.length} urun kimligi bulundu. Detaylar getiriliyor...`);

  const productIds = allListItems.map(i => i.product_id).filter(Boolean);
  let allProductDetails = [];

  for (let i = 0; i < productIds.length; i += 50) {
    const batch = productIds.slice(i, i + 50);
    const infoRes = await fetch(`${baseUrl}/v3/product/info/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ product_id: batch })
    });

    if (!infoRes.ok) {
      console.warn(`Detay cekme uyarisi [${infoRes.status}]`);
      continue;
    }

    const infoData = await infoRes.json();
    const items = infoData.items || infoData.result?.items || [];
    allProductDetails = allProductDetails.concat(items);
  }

  const formattedProducts = allProductDetails.map(p => ({
    productId: p.id,
    offerId: p.offer_id,
    name: p.name,
    price: p.price,
    oldPrice: p.old_price,
    currency: p.currency_code,
    categoryId: p.description_category_id,
    typeId: p.type_id,
    sku: p.sources?.[0]?.sku || (p.barcodes && p.barcodes[0]) || '',
    barcodes: p.barcodes || [],
    isArchived: p.is_archived,
    createdAt: p.created_at,
    modelId: p.model_info?.model_id,
    status: p.statuses?.status_name || p.statuses?.state_name || 'Bilinmiyor'
  }));

  let filtered = formattedProducts;
  if (options.search) {
    const q = options.search.toLowerCase();
    filtered = filtered.filter(p => 
      (p.offerId && p.offerId.toLowerCase().includes(q)) || 
      (p.name && p.name.toLowerCase().includes(q))
    );
  }

  if (options.categoryId) {
    filtered = filtered.filter(p => String(p.categoryId) === String(options.categoryId));
  }

  return {
    total: formattedProducts.length,
    filteredCount: filtered.length,
    products: filtered
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const searchArg = args.find(a => a.startsWith('--search='));
  const categoryArg = args.find(a => a.startsWith('--category='));

  const search = searchArg ? searchArg.split('=')[1] : undefined;
  const categoryId = categoryArg ? categoryArg.split('=')[1] : undefined;

  fetchAllOzonProducts({ search, categoryId })
    .then(res => {
      console.log(`\n================ OZON CANLI KATALOG (${res.filteredCount} / ${res.total} Urun) ================`);
      res.products.forEach((p, idx) => {
        console.log(`${idx + 1}. [${p.offerId}] ${p.name}`);
        console.log(`   Fiyat: ${p.price} ${p.currency} | Kategori ID: ${p.categoryId} | Durum: ${p.status}`);
      });
      console.log('========================================================================\n');
    })
    .catch(err => {
      console.error('Hata:', err.message);
      process.exit(1);
    });
}

module.exports = { fetchAllOzonProducts, getEnvConfig };
