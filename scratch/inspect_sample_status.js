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

async function inspectStatuses() {
  const env = getEnvConfig();
  const clientId = env.OZON_CLIENT_ID;
  const apiKey = env.OZON_API_KEY;
  const baseUrl = env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru';

  const headers = {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  };

  const res = await fetch(`${baseUrl}/v3/product/list`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filter: { visibility: 'ALL' },
      limit: 10,
    }),
  });

  const data = await res.json();
  const items = data.result?.items || [];
  const pids = items.map(i => i.product_id);

  const infoRes = await fetch(`${baseUrl}/v3/product/info/list`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ product_id: pids }),
  });

  const infoData = await infoRes.json();
  const sample = (infoData.items || infoData.result?.items || [])[0];
  console.log('Sample item structure:', JSON.stringify(sample.statuses, null, 2));
}

inspectStatuses().catch(console.error);
