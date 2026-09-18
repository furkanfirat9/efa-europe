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

async function testOzonHourlyAndPostings() {
  const today = new Date().toISOString().split('T')[0];
  const sinceISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toISO = new Date().toISOString();

  console.log('1. Testing /v1/analytics/data with hour dimension...');
  try {
    const res = await fetch('https://api-seller.ozon.ru/v1/analytics/data', {
      method: 'POST',
      headers: {
        'Client-Id': CLIENT_ID,
        'Api-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        date_from: today,
        date_to: today,
        metrics: ['ordered_units', 'revenue', 'hits_view_pdp'],
        dimension: ['hour'],
        limit: 24,
      }),
    });
    const json = await res.json();
    console.log('Analytics hour result status:', res.status, JSON.stringify(json).slice(0, 300));
  } catch (err) {
    console.error('Analytics hour error:', err);
  }

  console.log('\n2. Testing /v3/posting/fbs/list for real orders...');
  try {
    const res = await fetch('https://api-seller.ozon.ru/v3/posting/fbs/list', {
      method: 'POST',
      headers: {
        'Client-Id': CLIENT_ID,
        'Api-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dir: 'DESC',
        filter: {
          since: sinceISO,
          to: toISO,
        },
        limit: 50,
      }),
    });
    const json = await res.json();
    console.log('FBS Postings status:', res.status, 'Total postings:', json.result?.postings?.length || 0);
    if (json.result?.postings?.length > 0) {
      console.log('Sample posting created_at:', json.result.postings[0].in_process_at || json.result.postings[0].shipment_date);
    }
  } catch (err) {
    console.error('FBS list error:', err);
  }

  console.log('\n3. Testing /v2/posting/fbo/list for real orders...');
  try {
    const res = await fetch('https://api-seller.ozon.ru/v2/posting/fbo/list', {
      method: 'POST',
      headers: {
        'Client-Id': CLIENT_ID,
        'Api-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dir: 'DESC',
        filter: {
          since: sinceISO,
          to: toISO,
        },
        limit: 50,
      }),
    });
    const json = await res.json();
    console.log('FBO Postings status:', res.status, 'Total postings:', json.result?.length || 0);
    if (json.result?.length > 0) {
      console.log('Sample FBO posting:', json.result[0].created_at);
    }
  } catch (err) {
    console.error('FBO list error:', err);
  }
}

testOzonHourlyAndPostings().catch(console.error);
