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

async function checkStoreOrders(storeName, clientId, apiKey) {
  if (!clientId || !apiKey) {
    console.log(`[${storeName}] Missing credentials`);
    return;
  }
  console.log(`\nChecking [${storeName}] (Client-Id: ${clientId})...`);

  const headers = {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  };

  const sinceISO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const toISO = new Date().toISOString();

  // 1. FBS Unfulfilled (Bekleyen / Aktif Siparişler)
  try {
    const res = await fetch('https://api-seller.ozon.ru/v3/posting/fbs/unfulfilled/list', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dir: 'DESC',
        filter: { cutoff_from: sinceISO, cutoff_to: toISO },
        limit: 50,
      }),
    });
    const json = await res.json();
    console.log('  - FBS Unfulfilled count:', json.result?.postings?.length || 0);
    if (json.result?.postings?.length > 0) {
      console.log('    Sample order in_process_at:', json.result.postings[0].in_process_at);
    }
  } catch (err) {
    console.log('  - FBS Unfulfilled err:', err.message);
  }

  // 2. FBS List (Tüm FBS Siparişleri)
  try {
    const res = await fetch('https://api-seller.ozon.ru/v3/posting/fbs/list', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dir: 'DESC',
        filter: { since: sinceISO, to: toISO },
        limit: 50,
      }),
    });
    const json = await res.json();
    console.log('  - FBS Total orders count:', json.result?.postings?.length || 0);
    if (json.result?.postings?.length > 0) {
      json.result.postings.forEach(p => {
        console.log(`    Order #${p.posting_number}: in_process_at: ${p.in_process_at}, shipment_date: ${p.shipment_date}, status: ${p.status}`);
      });
    }
  } catch (err) {
    console.log('  - FBS List err:', err.message);
  }

  // 3. FBO List (Ozon Depolu Siparişler)
  try {
    const res = await fetch('https://api-seller.ozon.ru/v2/posting/fbo/list', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dir: 'DESC',
        filter: { since: sinceISO, to: toISO },
        limit: 50,
      }),
    });
    const json = await res.json();
    console.log('  - FBO Total orders count:', json.result?.length || 0);
    if (json.result?.length > 0) {
      json.result.forEach(p => {
        console.log(`    FBO Order #${p.posting_number}: created_at: ${p.created_at}, status: ${p.status}`);
      });
    }
  } catch (err) {
    console.log('  - FBO List err:', err.message);
  }
}

async function run() {
  await checkStoreOrders('Store 1', env.OZON_CLIENT_ID, env.OZON_API_KEY);
  await checkStoreOrders('Store 2', env.OZON_STORE_2_CLIENT_ID || env.OZON_CLIENT_ID, env.OZON_STORE_2_API_KEY || env.OZON_API_KEY);
}

run().catch(console.error);
