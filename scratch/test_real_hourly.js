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

async function testRealHourlyAggregation() {
  const clientId = env.OZON_STORE_2_CLIENT_ID || env.OZON_CLIENT_ID;
  const apiKey = env.OZON_STORE_2_API_KEY || env.OZON_API_KEY;

  // Let's test for 2026-08-23 (where there are multiple orders!)
  const targetDate = '2026-08-23';
  const sinceISO = `${targetDate}T00:00:00.000Z`;
  const toISO = `${targetDate}T23:59:59.999Z`;

  console.log(`Fetching FBS orders for ${targetDate}...`);
  const res = await fetch('https://api-seller.ozon.ru/v3/posting/fbs/list', {
    method: 'POST',
    headers: {
      'Client-Id': clientId,
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dir: 'DESC',
      filter: {
        since: sinceISO,
        to: toISO,
      },
      limit: 100,
    }),
  });

  const json = await res.json();
  const postings = json.result?.postings || [];
  console.log(`Found ${postings.length} postings for ${targetDate}`);

  // 24 saatlik bucket (00:00 - 23:00) UTC+3 (Türkiye / Moskova saati)
  const hourly = Array.from({ length: 24 }).map((_, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    orders: 0,
    revenue: 0,
  }));

  postings.forEach(p => {
    const dateStr = p.in_process_at || p.shipment_date;
    if (!dateStr) return;
    const d = new Date(dateStr);
    // UTC+3 saati
    const utcHours = d.getUTCHours();
    const localHour = (utcHours + 3) % 24;

    // Fiyat toplamı
    let orderPrice = 0;
    if (p.financial_data?.products) {
      orderPrice = p.financial_data.products.reduce((acc, prod) => acc + Number(prod.price || 0), 0);
    } else if (p.products) {
      orderPrice = p.products.reduce((acc, prod) => acc + Number(prod.price || 0), 0);
    }

    hourly[localHour].orders += 1;
    hourly[localHour].revenue += orderPrice;
  });

  console.log('\nHourly Distribution (UTC+3):');
  hourly.forEach(h => {
    if (h.orders > 0) {
      console.log(`  ${h.hour} -> ${h.orders} sipariş, ${h.revenue} ₽ / $`);
    }
  });
}

testRealHourlyAggregation().catch(console.error);
