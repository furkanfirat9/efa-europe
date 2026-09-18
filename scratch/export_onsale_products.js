const fs = require('fs');
const path = require('path');

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

async function exportOnSaleProducts() {
  const env = getEnvConfig();
  const clientId = env.OZON_CLIENT_ID;
  const apiKey = env.OZON_API_KEY;
  const baseUrl = env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

  const headers = {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  };

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
        limit: 100,
      }),
    });

    const data = await res.json();
    const items = data.result?.items || [];
    allListItems = allListItems.concat(items);
    lastId = data.result?.last_id || '';

    if (!lastId || items.length === 0 || allListItems.length >= (data.result?.total || 0)) {
      hasMore = false;
    }
  }

  const productIds = allListItems.map((i) => i.product_id).filter(Boolean);
  let allProductDetails = [];

  for (let i = 0; i < productIds.length; i += 50) {
    const batch = productIds.slice(i, i + 50);
    const infoRes = await fetch(`${baseUrl}/v3/product/info/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ product_id: batch }),
    });

    if (infoRes.ok) {
      const infoData = await infoRes.json();
      allProductDetails = allProductDetails.concat(infoData.items || infoData.result?.items || []);
    }
  }

  // Satışta olanlar (status_name: "Продается")
  const onSaleList = allProductDetails.filter(p => p.statuses?.status_name === 'Продается');
  const notOnSaleList = allProductDetails.filter(p => p.statuses?.status_name !== 'Продается');

  console.log(`========================================`);
  console.log(`🛍️ OZON CANLI MAĞAZA SATIŞ DURUMU`);
  console.log(`========================================`);
  console.log(`Toplam Ürün: ${allProductDetails.length}`);
  console.log(`✅ Satışta Olan (Продается): ${onSaleList.length} Adet`);
  console.log(`⏸️ Satışta Olmayan (Не продается): ${notOnSaleList.length} Adet`);
  console.log(`========================================\n`);

  const formattedOnSale = onSaleList.map((p, idx) => ({
    sira: idx + 1,
    productId: p.id,
    offerId: p.offer_id,
    name: p.name,
    price: `${p.price} ${p.currency_code}`,
    oldPrice: p.old_price ? `${p.old_price} ${p.currency_code}` : '-',
    sku: p.sources?.[0]?.sku || (p.barcodes && p.barcodes[0]) || '',
    barcodes: p.barcodes || [],
    categoryId: p.description_category_id,
    typeId: p.type_id,
    createdAt: p.created_at,
    status: p.statuses?.status_name,
    moderation: p.statuses?.moderate_status,
  }));

  const outPath = path.join(process.cwd(), 'data', 'satistaki_urunler.json');
  fs.writeFileSync(outPath, JSON.stringify(formattedOnSale, null, 2), 'utf8');
  console.log(`📁 ${formattedOnSale.length} adet satışta olan ürün ${outPath} dosyasına kaydedildi.`);

  // Kategori bazlı özet
  const categoryCounts = {};
  for (const p of onSaleList) {
    const cat = p.description_category_id || 'Bilinmiyor';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }
  console.log('\nKategori ID Dağılımı:', categoryCounts);
}

exportOnSaleProducts().catch(console.error);
