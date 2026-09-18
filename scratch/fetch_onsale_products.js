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

async function getOnSaleProducts() {
  const env = getEnvConfig();
  const clientId = env.OZON_CLIENT_ID;
  const apiKey = env.OZON_API_KEY;
  const baseUrl = env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

  const headers = {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  };

  // 1. Önce VISIBLE / Satışta olanları listele
  // filter: visibility: "VISIBLE" veya "READY_TO_SUPPLY" veya "ALL"
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

  // Durum dağılımı
  const statusGroups = {};
  for (const p of allProductDetails) {
    const state = p.statuses?.state_name || p.statuses?.status_name || 'Bilinmiyor';
    statusGroups[state] = (statusGroups[state] || 0) + 1;
  }

  console.log('Durum Dağılımı:', statusGroups);

  // Satışta / Satışa Hazır olan ürünleri filtrele
  // Ozon'da satışta olan durumlar: "Готов к продаже", "Продается", "В продаже", "Одобрено"
  const onSaleProducts = allProductDetails.filter(p => {
    const state = (p.statuses?.state_name || p.statuses?.status_name || '').toLowerCase();
    const isArchived = p.is_archived || p.is_autoarchived;
    const isFailed = p.statuses?.is_failed;
    
    // Satışta veya satılabilir olanlar
    return !isArchived && !isFailed && (
      state.includes('продаж') || 
      state.includes('готов') || 
      state.includes('одобр') ||
      p.statuses?.status === 'ready' ||
      p.statuses?.state === 'ready' ||
      p.statuses?.state === 'published'
    );
  });

  console.log(`\nToplam Ürün: ${allProductDetails.length}`);
  console.log(`Satışta Olan Ürün Sayısı: ${onSaleProducts.length}`);

  // Listeyi formatla
  const formattedList = onSaleProducts.map((p, idx) => ({
    sira: idx + 1,
    productId: p.id,
    offerId: p.offer_id,
    sku: p.sources?.[0]?.sku || p.id,
    name: p.name,
    price: `${p.price} ${p.currency_code}`,
    status: p.statuses?.state_description || p.statuses?.state_name || p.statuses?.status_name,
    imagesCount: (p.images?.length || 0) + (p.primary_image ? 1 : 0),
  }));

  fs.writeFileSync(
    path.join(process.cwd(), 'data', 'satistaki_urunler.json'),
    JSON.stringify(formattedList, null, 2),
    'utf8'
  );

  console.log('Saved to data/satistaki_urunler.json');
}

getOnSaleProducts().catch(console.error);
