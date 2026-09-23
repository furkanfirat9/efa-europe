import https from 'https';
import zlib from 'zlib';
import { AmazonProductItem, AmazonCrawlOptions, AmazonCrawlResponse } from './types';
import { checkIsProductInOzon } from '@/lib/ozon/duplicateDetector';

// Amazon.de Türkçe arayüzü: arama kelimeleri ve başlıklar Türkçe. Kullanıcı siteyi Türkçe kullanıyor
// ve aramalarını Türkçe yapıyor; Almanca oturumla Türkçe kelimeler sonuç vermiyordu.
const AMAZON_LANG_COOKIE = 'i18n-prefs=EUR; lc-acbde=tr_TR';
const ACCEPT_LANGUAGE = 'tr-TR,tr;q=0.9';

const POSTAL_POST_DATA = 'locationType=LOCATION_INPUT&zipCode=69-108&countryCode=PL&deviceType=web&pageType=Search&actionSource=glow';

async function getAmazonSessionCookies(): Promise<string> {
  try {
    const initRes = await new Promise<{ cookies: string[] }>((resolve) => {
      const req = https.get('https://www.amazon.de/-/tr/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': ACCEPT_LANGUAGE,
        }
      }, (res) => {
        resolve({ cookies: res.headers['set-cookie'] || [] });
      });
      req.on('error', () => resolve({ cookies: [] }));
    });

    let cookies = initRes.cookies.map(c => c.split(';')[0]).join('; ');
    cookies += '; ' + AMAZON_LANG_COOKIE;

    const zipRes = await new Promise<{ cookies: string[] }>((resolve) => {
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
    console.error('Amazon cookie session error:', err);
    return AMAZON_LANG_COOKIE;
  }
}

async function verifyImageUrl(url: string): Promise<number> {
  if (!url || !url.startsWith('http')) return 400;
  return new Promise<number>((resolve) => {
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

/** Amazon görsel adresinin dosya kimliği: .../images/I/61wr9k6x2kL._AC_SL1500_.jpg → "61wr9k6x2kL". */
function amazonImageId(url: string): string {
  return (url.match(/\/images\/I\/([A-Za-z0-9+%-]+)/) || [])[1] || '';
}

/**
 * Amazon.de fiyat metnini sayıya çevirir: "37,10€" → 37.1, "1.299,99 €" → 1299.99.
 * Nokta binlik, virgül ondalık ayracıdır; okunamazsa 0 döner.
 */
export function parseEuroPrice(text: string): number {
  const raw = (text || '').replace(/[^\d,.]/g, '');
  if (!raw) return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(raw)
    ? raw.replace(/\./g, '')
    : raw;
  const value = parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Verilen Amazon ASIN kodunun ürün detay sayfasından (PDP)
 * YALNIZCA VE KESİNLİKLE ana ürünün kendi stüdyo görsellerini çeker (4-8 adet).
 * Diğer renk varyantları, sepet çapraz satışları ("Birden fazla ürün mü alıyorsunuz?"),
 * yeni sürüm kutuları ve alttaki tavsiye carousel'leri %100 filtrelenir.
 */
export async function fetchAmazonProductGallery(asin: string, primaryFallbackImg?: string): Promise<string[]> {
  if (!asin) return primaryFallbackImg ? [primaryFallbackImg] : [];

  const cookies = await getAmazonSessionCookies();
  const url = `https://www.amazon.de/dp/${asin}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': ACCEPT_LANGUAGE,
    'Cookie': cookies,
  };

  try {
    const html = await new Promise<string>((resolve) => {
      const req = https.get(url, { headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
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

    // Amazon aynı görselin küçük ("large") ve büyük ("hiRes") hâline FARKLI dosya kimlikleri veriyor.
    // Aynı görselin kopyası iki kez eklenmesin diye bir görsele ait bütün kimlikler birlikte "görüldü"
    // sayılır. Eskiden ana görselin düşük çözünürlüklü kopyası başa, yüksek çözünürlüklüsü sona
    // düşüyordu: MAIN girdisinde hiRes boşken "large" ana görselin yerine geçiyor, sol sütun
    // taraması da büyük kopyayı listenin sonuna ekliyordu.
    const seenIds = new Set<string>();
    const markSeen = (urls: string[]) => urls.forEach((u) => { const id = amazonImageId(u); if (id) seenIds.add(id); });
    const isSeen = (url: string) => { const id = amazonImageId(url); return !!id && seenIds.has(id); };
    const cleanImg = (url: string) => (url || '').replace(/\._[A-Z0-9_,]+_\.jpg$/i, '.jpg');

    let primaryHeroImage = '';
    const otherGalleryImages: string[] = [];

    // 1. ÖNCELİK: #landingImage üzerinden yüksek çözünürlüklü ana vitrin görseli
    const oldHiresMatch = html.match(/id="landingImage"[^>]*data-old-hires="([^"]+)"/i) ||
                          html.match(/data-old-hires="([^"]+)"[^>]*id="landingImage"/i);
    if (oldHiresMatch && oldHiresMatch[1].startsWith('http')) {
      primaryHeroImage = cleanImg(oldHiresMatch[1]);
    }

    // Ana görselin bütün boyutları (farklı kimliklerle) data-a-dynamic-image içinde durur.
    const dynMatch = html.match(/id="landingImage"[^>]*data-a-dynamic-image="([^"]+)"/i);
    if (dynMatch) {
      try {
        const obj = JSON.parse(dynMatch[1].replace(/&quot;/g, '"'));
        let maxPixels = 0;
        let bestUrl = '';
        for (const [imgUrl, dims] of Object.entries(obj)) {
          const dimsArr = dims as number[];
          const pixels = (dimsArr[0] || 0) * (dimsArr[1] || 0);
          if (pixels >= maxPixels) {
            maxPixels = pixels;
            bestUrl = imgUrl;
          }
        }
        markSeen(Object.keys(obj));
        if (!primaryHeroImage && bestUrl) primaryHeroImage = cleanImg(bestUrl);
      } catch {}
    }
    if (primaryHeroImage) markSeen([primaryHeroImage]);

    // 2. ÖNCELİK: colorImages.initial — her girdi tek bir görselin bütün boyutlarını taşır.
    // Amazon listeyi artık `'initial': A.$.parseJSON('[...]')` biçiminde yazıyor; eski kalıp yalnızca
    // `'initial': [...]` tanıyordu, liste hiç okunamıyor ve sol sütundaki 500px kopyalara düşülüyordu.
    const colorImagesMatch = html.match(
      /'colorImages'\s*:\s*\{\s*'initial'\s*:\s*(?:A\.\$\.parseJSON\(\s*')?(\[\s*\{[\s\S]*?\}\s*\])/
    );

    let colorImagesParsed = false;
    if (colorImagesMatch) {
      try {
        // parseJSON('...') içindeki metin tek tırnaklı JS dizesi; kaçışlı tırnaklar düzeltilir.
        const parsed = JSON.parse(colorImagesMatch[1].replace(/\\'/g, "'"));
        for (const item of parsed) {
          if (item.variant === 'SWCH' || item.variant === 'MAIN_SWATCH' || item.variant === 'VIDEO') continue;
          const sizes: string[] = [item.hiRes, item.large, item.thumb, ...Object.keys(item.main || {})].filter(
            (u): u is string => typeof u === 'string' && u.startsWith('http')
          );
          if (sizes.length === 0) continue;
          colorImagesParsed = true;
          const best = cleanImg(item.hiRes || sizes.find((u) => u !== item.thumb) || sizes[0]);

          if (item.variant === 'MAIN') {
            // Yüksek çözünürlük bulunduysa daha düşük kaliteli bir kopya onun yerine geçemez.
            if (item.hiRes || !primaryHeroImage) primaryHeroImage = best;
            markSeen([...sizes, primaryHeroImage]);
            continue;
          }
          if (sizes.some(isSeen)) continue;
          markSeen(sizes);
          otherGalleryImages.push(best);
        }
      } catch {}
    }

    // 3. YEDEK: colorImages okunamadıysa sol galeri sütunu taranır; görülen kimlikler atlanır.
    if (!colorImagesParsed) {
      const leftColMatch =
        html.match(/id="leftCol"[^>]*>([\s\S]*?)(?:id="centerCol"|id="rightCol"|id="twisterContainer"|$)/i) ||
        html.match(/<div id="altImages"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
        html.match(/<div id="imageBlock"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);

      if (leftColMatch) {
        const imgs = leftColMatch[1].match(/https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9_\-+%]+(?:\._[A-Z0-9_,]+_)?\.jpg/g) || [];
        for (const rawImg of imgs) {
          if (rawImg.includes('play-icon') || rawImg.includes('video') || rawImg.includes('sprite') || rawImg.includes('grey-pixel') || rawImg.includes('transparent-pixel')) continue;
          const clean = cleanImg(rawImg);
          if (!clean.startsWith('https://m.media-amazon.com/images/I/') || isSeen(clean)) continue;
          markSeen([clean]);
          otherGalleryImages.push(clean);
        }
      }
    }

    if (!primaryHeroImage && primaryFallbackImg) {
      primaryHeroImage = primaryFallbackImg;
    }

    // KESİN DİZİLİM:
    // [0]: primaryHeroImage (Ozon'da Ana Vitrin Kapak Görseli)
    // [1..N]: otherGalleryImages (Ek stüdyo açıları)
    const finalOrderedList: string[] = [];
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

    const validImages = verified.filter((img): img is string => img !== null);

    return validImages.length > 0 ? validImages : (primaryFallbackImg ? [primaryFallbackImg] : []);
  } catch (err) {
    console.error(`Amazon gallery error for ASIN ${asin}:`, err);
    return primaryFallbackImg ? [primaryFallbackImg] : [];
  }
}

function extractModelCode(title: string, brand: string): string {
  if (!title) return brand || 'Model';

  // 1. Elektronik model kodları (Örn: EP5447/90, HD9280/90, GC9682/80, DST8050/20, S5588/30)
  const slashMatch = title.match(/\b([A-Z]{1,4}\d{3,5}(?:\/\d{2,3})?)\b/i);
  if (slashMatch) {
    return slashMatch[1].trim();
  }

  // 2. Parantez içi model kodu (Örn: (0721056380) veya (NA350/00))
  const parenMatch = title.match(/\(([A-Z0-9\/\.\-]+)\)/i);
  if (parenMatch && parenMatch[1].length >= 3 && !parenMatch[1].toLowerCase().includes(brand.toLowerCase())) {
    return parenMatch[1].trim();
  }

  // 3. Noktalı veya tireli parça kodları (Örn: 18.9649.9990 veya 07.2105.6380)
  const dotMatch = title.match(/\b(\d{2}\.\d{4}\.\d{4})\b/);
  if (dotMatch) {
    return dotMatch[1].trim();
  }

  // 4. Markadan sonra gelen Gerçek Seri / Model Adı (Örn: WMF Gourmet, WMF Profi Plus, WMF Provence Plus, Tefal Ingenio)
  const bClean = brand.replace(/['']/g, '').trim();
  const brandRegex = new RegExp(`^.*?\\b${bClean}\\b\\s+([\\p{L}0-9&'\\-]+(?:\\s+[\\p{L}0-9&'\\-]+)?)`, 'iu');
  const seriesMatch = title.match(brandRegex);

  if (seriesMatch && seriesMatch[1]) {
    const series = seriesMatch[1].trim();
    // Genel ürün kelimelerini filtrele (başlıklar Türkçe arayüzde Türkçe, bazen Almanca gelir)
    const stopWords = [
      'set', 'teilig', 'mit', 'für', 'und', 'aus', 'edelstahl', 'schwarz', 'induktion', 'küchenhelfer', 'pfanne', 'topf', 'kochlöffel', 'reibe', 'rührschüssel', 'messer', 'schere', 'besteckset',
      'seti', 'takım', 'takımı', 'parçalı', 'için', 've', 'ile', 'paslanmaz', 'çelik', 'siyah', 'beyaz', 'orijinal', 'yedek', 'başlık', 'başlığı', 'bıçak', 'tava', 'tencere', 'kase', 'adet', 'paket',
    ];
    const parts = series.split(/\s+/).filter(p => !stopWords.includes(p.toLowerCase()));
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }

  // 5. Alfanümerik token
  const tokenMatch = title.match(/\b([A-Z0-9]{5,10})\b/);
  if (tokenMatch && !tokenMatch[1].toLowerCase().includes(brand.toLowerCase())) {
    return tokenMatch[1].trim();
  }

  return `${brand} Model`;
}

const CATEGORY_MAP: Record<string, string> = {
  all: 'aps',
  kitchen: 'kitchen',
  personal_care: 'beauty',
  baby: 'baby',
};

export async function crawlAmazonProducts(options: AmazonCrawlOptions): Promise<AmazonCrawlResponse> {
  const {
    brand = '',
    keyword = '',
    category = 'all',
    maxPages = 2,
    maxItems = 5, // Varsayılan 5 ürün canlı test sınırı
    maxPriceEur = 550,
    customUrl,
  } = options;

  const cookies = await getAmazonSessionCookies();
  const allItems: AmazonProductItem[] = [];
  const visitedAsins = new Set<string>();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': ACCEPT_LANGUAGE,
    'Cookie': cookies,
  };

  const maxScanPages = options.hideExistingOzon ? Math.max(maxPages, 8) : maxPages;

  for (let page = 1; page <= maxScanPages; page++) {
    if (maxItems && allItems.length >= maxItems) break;

    let pageUrl: string;

    if (customUrl) {
      const separator = customUrl.includes('?') ? '&' : '?';
      pageUrl = `${customUrl}${separator}page=${page}&currency=EUR`;
    } else {
      // Marka ve arama kelimesi ayrı: kelime ("yedek başlık") aramaya eklenir ama marka
      // filtresine karışmaz. Eskiden kelime marka yerine geçiyor ve başlıkta aranıyordu.
      const cleanBrand = brand.trim();
      const searchKeyword = encodeURIComponent([cleanBrand, keyword.trim()].filter(Boolean).join(' '));
      const iParam = CATEGORY_MAP[category] && CATEGORY_MAP[category] !== 'aps' ? `&i=${CATEGORY_MAP[category]}` : '';

      let brandFacet = '';
      const lower = cleanBrand.toLowerCase();
      if (lower.startsWith('philips')) brandFacet = 'p_89%3APhilips';
      else if (lower.startsWith('tefal')) brandFacet = 'p_89%3ATefal';
      else if (lower.startsWith('bosch')) brandFacet = 'p_89%3ABosch';
      else if (lower.startsWith('braun')) brandFacet = 'p_89%3ABraun';
      else if (lower.startsWith('wmf')) brandFacet = 'p_89%3AWMF';
      else if (lower.startsWith("de'longhi") || lower.startsWith('delonghi')) brandFacet = 'p_89%3ADeLonghi%7CDe%27Longhi';

      const rhParts = ['p_6%3AA3JWKAKR8XB7XF']; // Sadece doğrudan Amazon satıcıları
      if (brandFacet) rhParts.unshift(brandFacet);
      if (maxPriceEur) rhParts.push(`p_36%3A0-${maxPriceEur * 100}`);

      pageUrl = `https://www.amazon.de/-/tr/s?k=${searchKeyword}${iParam}&rh=${rhParts.join('%2C')}&page=${page}&currency=EUR`;
    }

    try {
      let html = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        html = await new Promise<string>((resolve) => {
          const req = https.get(pageUrl, { headers }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
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
          req.setTimeout(8000, () => {
            req.destroy();
            resolve('');
          });
        });

        if (html.length > 5000) break;
        // Kısa bekleme
        await new Promise((r) => setTimeout(r, 800));
      }

      if (!html || html.length < 5000) continue;

      const cardRegex = /<div [^>]*data-asin="([A-Z0-9]{10})"[\s\S]*?(?=<div [^>]*data-asin="[A-Z0-9]{10}"|$)/g;
      let match: RegExpExecArray | null;
      const pageRawItems: {
        asin: string;
        title: string;
        priceNum: number;
        priceStr: string;
        image: string;
      }[] = [];

      while ((match = cardRegex.exec(html)) !== null) {
        const asin = match[1];
        const chunk = match[0];

        const isAd =
          chunk.includes('AdHolder') ||
          chunk.includes('Gesponsert') ||
          chunk.includes('Sponsorlu') ||
          chunk.includes('Sponsored') ||
          chunk.includes('puis-sponsored-label');

        // Kartın düz metni: stok uyarıları etiketlere bölünmüş olabilir.
        const cardText = chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

        const titleMatch =
          chunk.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) ||
          chunk.match(/class="a-text-normal"[^>]*>([\s\S]*?)<\/span>/i);
        const title = titleMatch
          ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
          : '';

        // Satış fiyatı, sınıfı tam olarak "a-price" olan kutudadır. Üstü çizili eski fiyat ve birim
        // fiyat "a-price a-text-price" taşır; kartta ilk bulunan fiyatı almak onları yakalayabiliyordu.
        const mainPrice = chunk.match(/<span class="a-price"[^>]*>\s*<span class="a-offscreen">([^<]+)<\/span>/i);
        const priceNum = mainPrice ? parseEuroPrice(mainPrice[1]) : 0;
        const priceStr = mainPrice ? mainPrice[1].trim() : '';

        // Stok elemesi. Fiyatı olmayan ürün (stokta yok / "Şu anda mevcut değil") satın alınamaz;
        // eskiden 50 € varsayılıp listeye giriyordu ve maliyetin altında satışa yol açtı.
        // "Stokta sadece N adet kaldı" elenir; yanında "daha fazla ürün gelecektir" varsa Amazon
        // yeni stok bekliyor, kullanıcının kararıyla kabul edilir.
        const isLowStock = /Stokta sadece \d+ adet kald|Nur noch \d+ (?:Stück )?auf Lager/i.test(cardText);
        const isRestocking = /daha fazla ürün gelecektir|mehr ist unterwegs/i.test(cardText);
        if (priceNum <= 0 || (isLowStock && !isRestocking)) continue;

        const imgMatch =
          chunk.match(/<img [^>]*src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i) ||
          chunk.match(/src="(https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9_\-+%]+)\._/i);
        let rawImg = imgMatch ? imgMatch[1] : '';
        let highResImg = rawImg ? rawImg.replace(/\._[A-Z0-9_,]+_\.jpg$/i, '.jpg') : '';

        const isBlacklisted =
          title.toLowerCase().includes('monitor') ||
          title.toLowerCase().includes('fernseher') ||
          title.toLowerCase().includes('monitör') ||
          title.toLowerCase().includes('televizyon') ||
          title.toLowerCase().includes('television') ||
          title.toLowerCase().includes('oled tv');

        const primaryBrandName = brand ? brand.split(/\s+/)[0].replace(/['']/g, '').toLowerCase() : '';
        const cleanTitle = title.replace(/['']/g, '').toLowerCase();
        const matchesBrand = primaryBrandName ? cleanTitle.includes(primaryBrandName) : true;

        if (
          !isAd &&
          !isBlacklisted &&
          matchesBrand &&
          title &&
          highResImg &&
          !visitedAsins.has(asin)
        ) {
          if (maxPriceEur && priceNum > maxPriceEur) continue;

          visitedAsins.add(asin);
          pageRawItems.push({
            asin,
            title,
            priceNum,
            priceStr,
            image: highResImg,
          });

          // Eğer mükerrer filtresi kapalıysa sayfa içi adeti sınırla; açıksa tüm sayfayı topla ki elenenlerin yerine yenileri gelsin
          if (!options.hideExistingOzon && maxItems && (allItems.length + pageRawItems.length) >= maxItems) {
            break;
          }
        }
      }

      const verifiedResults = await Promise.all(
        pageRawItems.map(async (item) => {
          const status = await verifyImageUrl(item.image);
          if (status === 200) {
            // Amazon EUR alış fiyatının 3 katına ek %15 USD kur tamponu
            const ozonPrice = Math.round(item.priceNum * 3 * 1.15);
            const ozonOldPrice = Math.round(ozonPrice * 1.2);
            const modelCode = extractModelCode(item.title, brand);

            // Mükerrer Ozon Kontrolü (Hafıza + Canlı Mağaza)
            const dup = checkIsProductInOzon(item.title, item.asin, modelCode, brand);

            return {
              asin: item.asin,
              title: item.title,
              modelCode,
              brand,
              buyPriceNum: item.priceNum,
              buyPriceStr: item.priceStr,
              ozonPrice,
              ozonOldPrice,
              imageUrl: item.image,
              imageStatus: 200,
              page,
              isAvailable: true,
              selected: !dup.isUploaded, // Zaten yüklüyse seçimi otomatik kaldır
              isAlreadyInOzon: dup.isUploaded,
              ozonDuplicateReason: dup.reason,
            } as AmazonProductItem;
          }
          return null;
        })
      );

      let cleanVerified = verifiedResults.filter((r): r is AmazonProductItem => r !== null);

      if (options.hideExistingOzon) {
        cleanVerified = cleanVerified.filter((r) => !r.isAlreadyInOzon);
      }

      allItems.push(...cleanVerified);

      if (pageRawItems.length === 0 || (maxItems && allItems.length >= maxItems)) break;
    } catch (pageErr) {
      console.error(`Page ${page} crawl error:`, pageErr);
      break;
    }
  }

  const finalItems = maxItems ? allItems.slice(0, maxItems) : allItems;

  return {
    success: true,
    totalFound: finalItems.length,
    pagesScanned: maxPages,
    items: finalItems,
  };
}
