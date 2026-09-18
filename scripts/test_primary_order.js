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

  const oldHiresMatch = html.match(/id="landingImage"[^>]*data-old-hires="([^"]+)"/i) ||
                        html.match(/data-old-hires="([^"]+)"[^>]*id="landingImage"/i);
  if (oldHiresMatch && oldHiresMatch[1].startsWith('http')) {
    primaryImage = oldHiresMatch[1].replace(/\._[A-Z0-9_,]+_\.jpg$/i, '.jpg');
  }

  return { primaryImage, totalImages: galleryImages.length };
}

module.exports = { extractAmazonImagesStrictOrder };


