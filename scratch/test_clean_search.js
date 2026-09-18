const https = require('https');
const zlib = require('zlib');

async function testCleanSearch(brand, model) {
  // Add negative keywords to query: -Backpapier -Zubehör -Silikon -Silikonform -Tasche -Ersatzteil -Kalkfilter
  const cleanQuery = `${brand} ${model} -Backpapier -Zubehör -Silikon -Silikonform -Tasche -Ersatzteil -Kalkfilter -Stück`;
  const url = `https://www.amazon.de/s?k=${encodeURIComponent(cleanQuery)}&currency=EUR`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'de-DE,de;q=0.9',
    'Cookie': 'i18n-prefs=EUR; lc-acbde=de_DE;'
  };

  const html = await new Promise((resolve) => {
    const req = https.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const buf = Buffer.concat(chunks);
          if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
            resolve(zlib.gunzipSync(buf).toString('utf8'));
          } else if (res.headers['content-encoding'] === 'gzip') {
            resolve(zlib.gunzipSync(buf).toString('utf8'));
          } else if (res.headers['content-encoding'] === 'br') {
            resolve(zlib.brotliDecompressSync(buf).toString('utf8'));
          } else {
            resolve(buf.toString('utf8'));
          }
        } catch (e) {
          resolve(Buffer.concat(chunks).toString('utf8'));
        }
      });
    });
    req.on('error', () => resolve(''));
  });

  const cardRegex = /<div [^>]*data-asin="([A-Z0-9]{10})"[\s\S]*?(?=<div [^>]*data-asin="[A-Z0-9]{10}"|$)/g;
  let match;

  console.log(`=== Arama: "${cleanQuery}" ===`);
  let count = 0;
  while ((match = cardRegex.exec(html)) !== null && count < 3) {
    const asin = match[1];
    const chunk = match[0];
    const isAd = chunk.includes('AdHolder') || chunk.includes('Gesponsert') || chunk.includes('Sponsored');
    const titleMatch = chunk.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) ||
                       chunk.match(/class="a-text-normal"[^>]*>([\s\S]*?)<\/span>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    if (!isAd && title && asin) {
      count++;
      console.log(`  [${count}] ASIN: ${asin} | Başlık: ${title.slice(0, 95)}...`);
    }
  }
  console.log('');
}

async function run() {
  await testCleanSearch('Philips', 'NA352/00');
  await testCleanSearch('Philips', 'NA552/00');
  await testCleanSearch('Tefal', 'FW4018E0');
  await testCleanSearch('Ninja', 'SL451EUSD');
}

run().catch(console.error);
