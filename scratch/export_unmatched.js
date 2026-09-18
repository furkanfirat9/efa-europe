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

async function exportUnmatched() {
  const env = getEnvConfig();
  const clientId = env.OZON_CLIENT_ID;
  const apiKey = env.OZON_API_KEY;
  const baseUrl = env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

  const memPath = path.join(process.cwd(), 'data', 'catalog_memory.json');
  const catalogMemory = JSON.parse(fs.readFileSync(memPath, 'utf8'));

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
      headers: {
        'Client-Id': clientId,
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ product_id: batch }),
    });

    if (infoRes.ok) {
      const infoData = await infoRes.json();
      allProductDetails = allProductDetails.concat(infoData.items || infoData.result?.items || []);
    }
  }

  const unmatched = [];

  for (const item of allProductDetails) {
    const offerId = (item.offer_id || '').toLowerCase();
    const existing = catalogMemory.find(
      (m) =>
        (m.asin && m.asin.toLowerCase() === offerId) ||
        (m.modelNo && m.modelNo.toLowerCase() === offerId) ||
        (m.offerId && m.offerId.toLowerCase() === offerId) ||
        (m.ozonProductId && String(m.ozonProductId) === String(item.id))
    );

    if (!existing || !existing.asin || !existing.asin.startsWith('B0')) {
      unmatched.push({
        ozon_product_id: item.id,
        offer_id: item.offer_id,
        name: item.name,
        category_id: item.description_category_id,
        type_id: item.type_id,
        price: item.price,
        old_price: item.old_price,
        barcodes: item.barcodes || [],
        currency: item.currency_code,
        status: item.statuses?.status_name || 'Aktif',
      });
    }
  }

  const outJsonPath = path.join(process.cwd(), 'data', 'asinsiz_magaza_urunleri.json');
  fs.writeFileSync(outJsonPath, JSON.stringify(unmatched, null, 2), 'utf8');

  console.log(`Saved ${unmatched.length} unmatched products to ${outJsonPath}`);
}

exportUnmatched().catch(console.error);
