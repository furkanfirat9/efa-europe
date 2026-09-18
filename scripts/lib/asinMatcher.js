const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

function getEnvConfig() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local dosyasi bulunamadi!');
  }
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

const POSTAL_POST_DATA = 'locationType=LOCATION_INPUT&zipCode=69-108&countryCode=PL&deviceType=web&pageType=Search&actionSource=glow';

async function getAmazonSessionCookies() {
  try {
    const initRes = await new Promise((resolve) => {
      const req = https.get('https://www.amazon.de/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'de-DE,de;q=0.9',
        }
      }, (res) => {
        resolve({ cookies: res.headers['set-cookie'] || [] });
      });
      req.on('error', () => resolve({ cookies: [] }));
    });

    let cookies = initRes.cookies.map(c => c.split(';')[0]).join('; ');
    cookies += '; i18n-prefs=EUR; lc-acbde=de_DE';

    const zipRes = await new Promise((resolve) => {
      const req = https.request('https://www.amazon.de/portal-migration/hz/glow/address-change?actionSource=glow', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(POSTAL_POST_DATA),
          'Cookie': cookies,
          'X-Requested-With': 'XMLHttpRequest'
        }
      }, (res) => {
        resolve({ cookies: res.headers['set-cookie'] || [] });
      });
      req.on('error', () => resolve({ cookies: [] }));
      req.write(POSTAL_POST_DATA);
      req.end();
    });

    if (zipRes.cookies.length) {
      cookies += '; ' + zipRes.cookies.map(c => c.split(';')[0]).join('; ');
    }

    return cookies;
  } catch (err) {
    return 'i18n-prefs=EUR; lc-acbde=de_DE;';
  }
}

// Marka tespiti
function guessBrand(title, offerId) {
  const lower = `${title} ${offerId}`.toLowerCase();
  if (lower.includes('ninja')) return 'Ninja';
  if (lower.includes('shark')) return 'Shark';
  if (lower.includes('philips')) return 'Philips';
  if (lower.includes('tefal')) return 'Tefal';
  if (lower.includes('bosch')) return 'Bosch';
  if (lower.includes('braun')) return 'Braun';
  if (lower.includes('wmf')) return 'WMF';
  if (lower.includes("delonghi") || lower.includes("de'longhi")) return "De'Longhi";
  if (lower.includes('siemens')) return 'Siemens';
  if (lower.includes('oral-b') || lower.includes('oral b')) return 'Oral-B';
  if (lower.includes('karaca')) return 'Karaca';

  // Model prefix heuristikleri
  const offUpper = (offerId || '').toUpperCase();
  if (offUpper.startsWith('FN') || offUpper.startsWith('TB') || offUpper.startsWith('CB') || offUpper.startsWith('OG') || offUpper.startsWith('AF')) return 'Ninja';
  if (offUpper.startsWith('EP') || offUpper.startsWith('NA') || offUpper.startsWith('HD') || offUpper.startsWith('GC') || offUpper.startsWith('PSG') || offUpper.startsWith('DST') || offUpper.startsWith('HX') || offUpper.startsWith('S9') || offUpper.startsWith('S7') || offUpper.startsWith('S5')) return 'Philips';
  if (offUpper.startsWith('L') || offUpper.startsWith('DT') || offUpper.startsWith('GV') || offUpper.startsWith('FV') || offUpper.startsWith('EY')) return 'Tefal';
  if (offUpper.startsWith('07.') || offUpper.startsWith('07') || offUpper.startsWith('18.') || offUpper.startsWith('18') || offUpper.startsWith('04.')) return 'WMF';
  
  return 'Philips';
}

// Model kodunu arama için temizle
function cleanModelForSearch(offerId) {
  if (!offerId) return '';
  let clean = offerId.trim();

  // Marka adını başından temizle (Örn: "Philips GC7844/20" -> "GC7844/20")
  clean = clean.replace(/^(philips|tefal|bosch|braun|wmf|delonghi|de'longhi|ninja|shark|siemens|karaca)\s+/i, '');

  if (clean.startsWith('SKU-') || clean.startsWith('TEMP-')) return '';
  return clean.trim();
}

// Katı model eşleşme kontrolü
function isExactModelMatch(amazonTitle, targetModel, targetBrand) {
  if (!amazonTitle || !targetModel) return false;
  const amzLower = amazonTitle.toLowerCase();
  const modelLower = targetModel.toLowerCase();

  // 1. Model kodu slash'lı ise (örn: EP5447/90 veya NA350/00)
  if (modelLower.includes('/')) {
    const [baseModel, suffix] = modelLower.split('/');
    // Tam slash'lı hali veya slash'sız hali başlıkta var mı?
    if (amzLower.includes(modelLower)) return true;
    if (baseModel.length >= 4 && amzLower.includes(baseModel)) {
      // Base model eşleşiyorsa suffix kontrolü (örn: EP5447)
      return true;
    }
  }

  // 2. Noktalı veya tireli parça kodu (örn: 07.2105.6380 veya 0721056380)
  const dotClean = modelLower.replace(/[\.\-\s]/g, '');
  const amzClean = amzLower.replace(/[\.\-\s]/g, '');
  if (dotClean.length >= 6 && amzClean.includes(dotClean)) {
    return true;
  }

  // 3. Standart alfanümerik model kodu (örn: L7639002 veya GC9682)
  if (modelLower.length >= 4 && amzLower.includes(modelLower)) {
    return true;
  }

  return false;
}

// Amazon'dan ASIN arama ve katı doğrulama
async function searchExactAsinOnAmazon(brand, modelCode, cookies) {
  const searchQuery = `${brand} ${modelCode}`.trim();
  const url = `https://www.amazon.de/s?k=${encodeURIComponent(searchQuery)}&currency=EUR`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'de-DE,de;q=0.9',
    'Cookie': cookies,
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
    req.setTimeout(6500, () => {
      req.destroy();
      resolve('');
    });
  });

  if (!html || html.length < 5000) return null;

  const cardRegex = /<div [^>]*data-asin="([A-Z0-9]{10})"[\s\S]*?(?=<div [^>]*data-asin="[A-Z0-9]{10}"|$)/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const asin = match[1];
    const chunk = match[0];
    const isAd = chunk.includes('AdHolder') || chunk.includes('Gesponsert') || chunk.includes('Sponsored');

    const titleMatch =
      chunk.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) ||
      chunk.match(/class="a-text-normal"[^>]*>([\s\S]*?)<\/span>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      : '';

    if (!isAd && title && asin) {
      // Katı Model Eşleşmesi Kontrolü
      if (isExactModelMatch(title, modelCode, brand)) {
        return {
          asin,
          matchedTitle: title,
          searchQuery
        };
      }
    }
  }

  return null;
}

module.exports = {
  getEnvConfig,
  getAmazonSessionCookies,
  guessBrand,
  cleanModelForSearch,
  isExactModelMatch,
  searchExactAsinOnAmazon,
};
