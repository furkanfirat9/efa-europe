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

async function testAnalytics() {
  const today = new Date();
  const dateTo = today.toISOString().split('T')[0];
  const lastWeek = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const dateFrom = lastWeek.toISOString().split('T')[0];

  console.log(`Querying Ozon Analytics from ${dateFrom} to ${dateTo}...`);

  // 1. Day Dimension (Time Series Funnel)
  const resDay = await fetch('https://api-seller.ozon.ru/v1/analytics/data', {
    method: 'POST',
    headers: {
      'Client-Id': CLIENT_ID,
      'Api-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      date_from: dateFrom,
      date_to: dateTo,
      metrics: [
        'hits_view_search',
        'hits_view_pdp',
        'hits_view',
        'session_view',
        'hits_tocart',
        'conv_tocart',
        'ordered_units',
        'revenue',
        'position_category'
      ],
      dimension: ['day'],
      limit: 100,
    }),
  });

  console.log('Day analytics status:', resDay.status);
  const dataDay = await resDay.json();
  console.log('Day analytics data rows:', dataDay.result?.data?.length);
  if (dataDay.result?.data?.length > 0) {
    console.log('Sample Day Row:', JSON.stringify(dataDay.result.data[0], null, 2));
    console.log('Totals:', JSON.stringify(dataDay.result.totals, null, 2));
  }

  // 2. SKU Dimension (Top Products)
  const resSku = await fetch('https://api-seller.ozon.ru/v1/analytics/data', {
    method: 'POST',
    headers: {
      'Client-Id': CLIENT_ID,
      'Api-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      date_from: dateFrom,
      date_to: dateTo,
      metrics: [
        'hits_view_search',
        'hits_view_pdp',
        'hits_tocart',
        'ordered_units',
        'revenue',
        'position_category'
      ],
      dimension: ['sku'],
      sort: [{ key: 'hits_view_pdp', order: 'DESC' }],
      limit: 10,
    }),
  });

  console.log('\nSKU analytics status:', resSku.status);
  const dataSku = await resSku.json();
  console.log('SKU analytics data rows:', dataSku.result?.data?.length);
  if (dataSku.result?.data?.length > 0) {
    console.log('Sample SKU Row:', JSON.stringify(dataSku.result.data[0], null, 2));
  }
}

testAnalytics().catch(console.error);
