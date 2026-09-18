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

async function checkDetailedMetrics() {
  const today = new Date().toISOString().split('T')[0];
  const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const candidateMetrics = [
    'hits_view_search',
    'hits_view_pdp',
    'hits_view',
    'session_view',
    'session_view_search',
    'session_view_pdp',
    'hits_tocart',
    'conv_tocart',
    'conv_tocart_search',
    'conv_tocart_pdp',
    'ordered_units',
    'revenue',
    'position_category'
  ];

  console.log('Querying candidate metrics from Ozon...');
  const res = await fetch('https://api-seller.ozon.ru/v1/analytics/data', {
    method: 'POST',
    headers: {
      'Client-Id': CLIENT_ID,
      'Api-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      date_from: lastWeek,
      date_to: today,
      metrics: candidateMetrics,
      dimension: ['day'],
      limit: 10,
    }),
  });

  console.log('Status:', res.status);
  const json = await res.json();
  if (json.result) {
    console.log('Metrics available:');
    candidateMetrics.forEach((m, idx) => {
      console.log(`  - ${m}: ${json.result.totals?.[idx]}`);
    });
  } else {
    console.log('Error:', JSON.stringify(json));
  }
}

checkDetailedMetrics().catch(console.error);
