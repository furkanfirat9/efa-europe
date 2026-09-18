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

async function inspectNotOnSale() {
  const env = getEnvConfig();
  const clientId = env.OZON_CLIENT_ID;
  const apiKey = env.OZON_API_KEY;
  const baseUrl = env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

  const res = await fetch(`${baseUrl}/v3/product/list`, {
    method: 'POST',
    headers: {
      'Client-Id': clientId,
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: { visibility: 'ALL' },
      limit: 1000,
    }),
  });

  const data = await res.json();
  const productIds = (data.result?.items || []).map(i => i.product_id);

  let details = [];
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
    const infoData = await infoRes.json();
    details = details.concat(infoData.items || infoData.result?.items || []);
  }

  const notOnSale = details.filter(p => p.statuses?.status_name !== 'Продается');
  console.log(`\nSatışta Olmayan 10 Ürün:`);
  notOnSale.forEach((p, idx) => {
    console.log(`[${idx+1}] Offer ID: ${p.offer_id} | Status: ${p.statuses?.status_name} | State: ${p.statuses?.state_name} | Moderate: ${p.statuses?.moderate_status} | Reason: ${p.statuses?.status_description || p.statuses?.status_failed || 'Stok Yok / Fiyat Bekleniyor'}`);
  });
}

inspectNotOnSale().catch(console.error);
