const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

async function getAmazonTitle(asin) {
  const url = `https://www.amazon.de/dp/${asin}`;
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
    req.setTimeout(5000, () => {
      req.destroy();
      resolve('');
    });
  });

  const titleMatch = html.match(/id="productTitle"[^>]*>([\s\S]*?)<\/span>/i);
  return titleMatch ? titleMatch[1].trim() : '';
}

async function auditAllAsins() {
  const memPath = path.join(process.cwd(), 'data', 'catalog_memory.json');
  const memory = JSON.parse(fs.readFileSync(memPath, 'utf8'));

  const ACCESSORY_SIGNATURES = [
    'backpapier', 'silikonform', 'silikon', 'zubehör', 'passend für', 'kompatibel mit',
    'ersatzteil', 'für philips', 'für tefal', 'für ninja', 'stück luftfritteusen',
    'ha bin', 'kalkfilter', 'feinsieb für', 'ersatzfilter für wmf', 'silikonmatte',
    'zubehör set für', 'reinigungsbürste für', 'silikoneinsatz', 'pergamentpapier',
    'schutzhülle', 'tasche für'
  ];

  console.log(`Auditing ${memory.length} entries in catalog memory...`);

  const fakeMatches = [];

  for (let i = 0; i < memory.length; i++) {
    const item = memory[i];
    if (!item.asin || !item.asin.startsWith('B0')) continue;

    // We already have some known ones:
    // Let's check if model is an airfryer/machine but ASIN title is an accessory
    const title = await getAmazonTitle(item.asin);
    const titleLower = title.toLowerCase();

    const isAccessory = ACCESSORY_SIGNATURES.some(sig => titleLower.includes(sig));

    // If our product is an Airfryer / Shaver / Iron / Machine, but Amazon title is an accessory:
    if (isAccessory && !item.modelNo.toLowerCase().includes('filter') && !item.modelNo.toLowerCase().includes('kartusche') && !item.modelNo.toLowerCase().includes('ersatz')) {
      fakeMatches.push({
        idx: i,
        modelNo: item.modelNo,
        asin: item.asin,
        amazonTitle: title
      });
      console.log(`❌ HATALI EŞLEŞME BULUNDU [${i}]: ${item.modelNo} (${item.asin}) -> "${title}"`);
    } else {
      process.stdout.write('.');
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n\nAudit complete! Found ${fakeMatches.length} fake accessory matches.`);
  fs.writeFileSync(
    path.join(process.cwd(), 'data', 'fake_accessory_matches.json'),
    JSON.stringify(fakeMatches, null, 2),
    'utf8'
  );
}

auditAllAsins().catch(console.error);
