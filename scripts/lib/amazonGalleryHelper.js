const https = require('https');
const zlib = require('zlib');

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

async function verifyImageUrl(url) {
  if (!url || !url.startsWith('http')) return 400;
  return new Promise((resolve) => {
    try {
      const req = https.get(url, (res) => {
        resolve(res.statusCode || 400);
      });
      req.on('error', () => resolve(500));
      req.setTimeout(2500, () => {
        req.destroy();
        resolve(408);
      });
    } catch {
      resolve(500);
    }
  });
}

/**
 * Amazon PDP sayfasından KESİN ANA VİTRİN GÖRSELİNİ (Primary Hero Image)
 * 1. sıraya (index 0) koyarak ve yan açı stüdyo görsellerini arkasına dizerek çeker.
 */
async function fetchAmazonProductGallery(asin, primaryFallbackImg) {
  if (!asin) return primaryFallbackImg ? [primaryFallbackImg] : [];

  const cookies = await getAmazonSessionCookies();
  const url = `https://www.amazon.de/dp/${asin}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'de-DE,de;q=0.9',
    'Cookie': cookies,
  };

  try {
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
          } catch {
            resolve(Buffer.concat(chunks).toString('utf8'));
          }
        });
      });
      req.on('error', () => resolve(''));
      req.setTimeout(7000, () => {
        req.destroy();
        resolve('');
      });
    });

    if (!html || html.length < 5000) {
      return primaryFallbackImg ? [primaryFallbackImg] : [];
    }

    let primaryHeroImage = '';
    const otherGalleryImages = [];

    // 1. ÖNCELİK: Doğrudan #landingImage üzerinden ANA VİTRİN görselini tespit et
    // a) data-old-hires
    const oldHiresMatch = html.match(/id="landingImage"[^>]*data-old-hires="([^"]+)"/i) ||
                          html.match(/data-old-hires="([^"]+)"[^>]*id="landingImage"/i);
    if (oldHiresMatch && oldHiresMatch[1].startsWith('http')) {
      primaryHeroImage = oldHiresMatch[1].replace(/\._[A-Z0-9_,]+_\.jpg$/i, '.jpg');
    }

    // b) data-a-dynamic-image (En yüksek çözünürlüklü olanı seç)
    if (!primaryHeroImage) {
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
          if (bestUrl) primaryHeroImage = bestUrl.replace(/\._[A-Z0-9_,]+_\.jpg$/i, '.jpg');
        } catch (e) {}
      }
    }

    // 2. ÖNCELİK: colorImages.initial içerisindeki MAIN ve PT... varyantları
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

          if (item.variant === 'MAIN') {
            primaryHeroImage = img; // MAIN varyantı her zaman 1. sıradaki ana görseldir
          } else {
            otherGalleryImages.push(img);
          }
        }
      } catch {}
    }

    // 3. ÖNCELİK: Sol Galeri Kapsayıcısı (<div id="leftCol" ...> veya <div id="altImages" ...>)
    const leftColMatch =
      html.match(/id="leftCol"[^>]*>([\s\S]*?)(?:id="centerCol"|id="rightCol"|id="twisterContainer"|$)/i) ||
      html.match(/<div id="altImages"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
      html.match(/<div id="imageBlock"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);

    if (leftColMatch) {
      const scopedSection = leftColMatch[1];
      const imgs = scopedSection.match(/https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9_\-+%]+(?:\._[A-Z0-9_,]+_)?\.jpg/g) || [];
      for (const rawImg of imgs) {
        if (rawImg.includes('play-icon') || rawImg.includes('video') || rawImg.includes('sprite') || rawImg.includes('grey-pixel') || rawImg.includes('transparent-pixel')) continue;
        const clean = rawImg.replace(/\._[A-Z0-9_,]+_\.jpg$/i, '.jpg');
        if (clean && clean.startsWith('https://m.media-amazon.com/images/I/')) {
          otherGalleryImages.push(clean);
        }
      }
    }

    // 4. Fallback olarak landingImage src
    if (!primaryHeroImage) {
      const srcMatch = html.match(/id="landingImage"[^>]*src="([^"]+)"/i);
      if (srcMatch) primaryHeroImage = srcMatch[1].replace(/\._[A-Z0-9_,]+_\.jpg$/i, '.jpg');
    }

    if (!primaryHeroImage && primaryFallbackImg) {
      primaryHeroImage = primaryFallbackImg;
    }

    // KESİN DİZİLİM:
    // [0]: primaryHeroImage (Ozon'da Ana Vitrin Kapak Görseli)
    // [1..N]: otherGalleryImages (Ek stüdyo açıları ve kutu içeriği)
    const finalOrderedList = [];
    if (primaryHeroImage) finalOrderedList.push(primaryHeroImage);

    otherGalleryImages.forEach((img) => {
      if (img !== primaryHeroImage && !finalOrderedList.includes(img)) {
        finalOrderedList.push(img);
      }
    });

    // İlk 8 görseli doğrula (HTTP 200)
    const targetSlice = finalOrderedList.slice(0, 8);
    const verified = await Promise.all(
      targetSlice.map(async (img) => {
        const code = await verifyImageUrl(img);
        return code === 200 ? img : null;
      })
    );

    const validImages = verified.filter((img) => img !== null);

    return validImages.length > 0 ? validImages : (primaryHeroImage ? [primaryHeroImage] : []);
  } catch (err) {
    console.error(`Amazon gallery error for ASIN ${asin}:`, err);
    return primaryFallbackImg ? [primaryFallbackImg] : [];
  }
}

module.exports = {
  fetchAmazonProductGallery,
};
