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

const env = getEnvConfig();
const CLIENT_ID = env.OZON_CLIENT_ID;
const API_KEY = env.OZON_API_KEY;

async function benchmark() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`=== Ozon API Hız Ölçümü (Bugün: ${today}) ===`);

  // 1. Sadece Gün / KPI Verisi
  const t0 = Date.now();
  const resDay = await fetch('https://api-seller.ozon.ru/v1/analytics/data', {
    method: 'POST',
    headers: {
      'Client-Id': CLIENT_ID,
      'Api-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      date_from: today,
      date_to: today,
      metrics: ['hits_view_search', 'hits_view_pdp', 'hits_view', 'session_view', 'hits_tocart', 'conv_tocart', 'ordered_units', 'revenue', 'position_category'],
      dimension: ['day'],
      limit: 10,
    }),
  });
  const durDay = Date.now() - t0;
  console.log(`1. Günlük KPI Sorgusu Süresi: ${durDay}ms (HTTP ${resDay.status})`);

  // 2. SKU / Ürün Dağılımı Sorgusu
  await new Promise(r => setTimeout(r, 600));
  const t1 = Date.now();
  const resSku = await fetch('https://api-seller.ozon.ru/v1/analytics/data', {
    method: 'POST',
    headers: {
      'Client-Id': CLIENT_ID,
      'Api-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      date_from: today,
      date_to: today,
      metrics: ['hits_view_search', 'hits_view_pdp', 'hits_tocart', 'position_category'],
      dimension: ['sku'],
      sort: [{ key: 'hits_view_pdp', order: 'DESC' }],
      limit: 30,
    }),
  });
  const durSku = Date.now() - t1;
  console.log(`2. SKU / Ürün Bazlı Sorgu Süresi: ${durSku}ms (HTTP ${resSku.status})`);
}

benchmark().catch(console.error);
