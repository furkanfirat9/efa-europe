const https = require('https');
const zlib = require('zlib');

async function extractAmazonImagesStrictOrder(asin) {
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
  });

  let primaryImage = '';
  const galleryImages = [];

  // 1. Önce landingImage üzerinden en yüksek çözünürlüklü ANA VİTRİN görselini bul
  // a) data-old-hires
  const oldHiresMatch = html.match(/id="landingImage"[^>]*data-old-hires="([^"]+)"/i) ||
                        html.match(/data-old-hires="([^"]+)"[^>]*id="landingImage"/i);
  if (oldHiresMatch && oldHiresMatch[1].startsWith('http')) {
    primaryImage = oldHiresMatch[1].replace(/\._[A-Z0-9_,]+_\.jpg$/i, '.jpg');
  }

  // b) data-a-dynamic-image (En büyük çözünürlüklü olanı seç)
  if (!primaryImage) {
    const dynMatch = html.match(/id="landingImage"[^>]*data-a-dynamic-image="([^"]+)"/i);
    if (dynMatch) {
      try {
        const decoded = dynMatch[1].replace(/&quot;/g, '"');
        const obj = JSON.parse(decoded);
        let maxPixels = 0;
        let bestUrl = '';
        for (const [imgUrl, dims] of Object.entries(obj)) {
          const pixels = (dims[0] || 0) * (dims[1] || 0);
          if (pixels >= maxPixels) {
            maxPixels = pixels;
            bestUrl = imgUrl;
          }
        }
        if (bestUrl) primaryImage = bestUrl.replace(/\._[A-Z0-9_,]+_\.jpg$/i, '.jpg');
      } catch (e) {}
    }
  }

  // 2. colorImages.initial içerisinden variant: 'MAIN' ve 'PT...' görsellerini çek
  const colorImagesMatch =
    html.match(/ImageBlockATF['"]?\s*,\s*\{[\s\S]*?'colorImages'\s*:\s*\{\s*'initial'\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])/) ||
    html.match(/'colorImages'\s*:\s*\{\s*'initial'\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])\s*[,}]/);

  if (colorImagesMatch) {
    try {
      const parsed = JSON.parse(colorImagesMatch[1]);
      for (const item of parsed) {
        if (item.variant === 'SWCH' || item.variant === 'MAIN_SWATCH' || item.variant === 'VIDEO') continue;
        const img = (item.hiRes || item.large || item.main?.[Object.keys(item.main || {})[0]] || '').replace(/\._[A-Z0-9_,]+_\.jpg$/i, '.jpg');
        if (!img || !img.startsWith('http')) continue;

        if (item.variant === 'MAIN' && !primaryImage) {
          primaryImage = img;
        } else if (item.variant === 'MAIN') {
          // Eğer primaryImage zaten varsa, ama MAIN ile eşleşiyorsa güncelle
          primaryImage = img;
        } else {
          galleryImages.push(img);
        }
      }
    } catch (e) {}
  }

  // 3. Fallback olarak landingImage src
  if (!primaryImage) {
    const srcMatch = html.match(/id="landingImage"[^>]*src="([^"]+)"/i);
    if (srcMatch) primaryImage = srcMatch[1].replace(/\._[A-Z0-9_,]+_\.jpg$/i, '.jpg');
  }

  // Tüm listeyi birleştir: [primaryImage, ...galleryImages] (Tekilleştirilmiş)
  const allOrdered = [];
  if (primaryImage) allOrdered.push(primaryImage);

  galleryImages.forEach(img => {
    if (img !== primaryImage && !allOrdered.includes(img)) {
      allOrdered.push(img);
    }
  });

  return {
    primaryImage,
    allOrdered,
    totalImages: allOrdered.length
  };
}

async function test() {
  const asins = ['B0DT6V61RW', 'B0CQMPH7BJ', 'B08CBJ8W9W'];
  for (const asin of asins) {
    console.log(`=== Testing ASIN: ${asin} ===`);
    const res = await extractAmazonImagesStrictOrder(asin);
    console.log(`⭐ KESİN ANA VİTRİN GÖRSELİ (Primary / Index 0): ${res.primaryImage}`);
    console.log(`📸 Ek Galeri Görselleri (${res.allOrdered.length - 1} Adet):`);
    res.allOrdered.slice(1).forEach((img, i) => console.log(`   [${i+1}] ${img}`));
    console.log('');
  }
}

test().catch(console.error);
