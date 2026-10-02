// Amazon.de tarama betiği — uygulamanın tarayıcısında (built-in browser) amazon.de sekmesinde çalışır.
// javascript_tool ile bu dosyanın içeriği olduğu gibi çalıştırılır; fonksiyonlar window'a eklenir.
// Sayfa yenilenir ya da sekme başka adrese giderse fonksiyonlar kaybolur: tekrar yükle.
//
//   window.__scan(asin)            → tek ürün sayfası (model no., marka, KDV hariç/dahil fiyat, stok, satıcı)
//   window.__search(query)         → arama sonucu (reklamsız ilk 6: asin + başlık)
//   window.__gallery(asin)         → ürünün tüm yüksek çözünürlüklü görselleri
//   window.__runScan(asins)        → arka planda 2 kanalla toplu tarama; ilerleme: window.__job
//   window.__runSearch(tasks)      → [{id, brand, code, isName?}] için arama + adayları tarama; window.__job
//   window.__runScanPl(asins)      → amazon.pl sekmesinde aynı ASIN'lerin Polonya fiyatı/stoğu/satıcısı; window.__job
//   window.__download(name, data)  → sonucu JSON dosyası olarak indirir (kullanıcı izni gerekir)

(() => {
  const clean = (s) => s?.replace(/[\s‎‏]+/g, ' ').trim() || null;
  const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+(?=\d)/, '');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const num = (s) => {
    if (!s) return null;
    const m = s.replace(/\./g, '').match(/(\d+),(\d{2})/);
    return m ? Number(m[1] + '.' + m[2]) : null;
  };
  const stripImg = (u) => u?.replace(/\/images\/W\/[^/]+\/images\//, '/images/') || null;
  // "4,9 Kilograms", "465 g", "22.05 Pound", "560 Gramm" → gram
  const grams = (s) => {
    const m = s?.match(/([\d.,]+)\s*(kilogramm|kilograms?|kg|gramm|grams?|g|pounds?|lbs?)\b/i);
    if (!m) return null;
    const n = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    const unit = m[2].toLowerCase();
    const g = unit.startsWith('k') ? n * 1000 : unit.startsWith('p') || unit.startsWith('lb') ? n * 453.6 : n;
    return Number.isFinite(g) ? Math.round(g) : null;
  };

  window.__scan = async (asin) => {
    const r = await fetch('/dp/' + asin + '?th=1&psc=1', { credentials: 'include' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    d.querySelectorAll('script,style').forEach((n) => n.remove());
    const q = (root, s) => clean(root?.querySelector(s)?.textContent);

    const details = {};
    d.querySelectorAll('#productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, #productDetails_detailBullets_sections1 tr, .prodDetTable tr').forEach((tr) => {
      const k = clean(tr.querySelector('th')?.textContent), v = clean(tr.querySelector('td')?.textContent);
      if (k && v) details[k] = v;
    });
    d.querySelectorAll('#detailBullets_feature_div li').forEach((li) => {
      const sp = li.querySelectorAll('span span');
      if (sp.length >= 2) details[clean(sp[0].textContent).replace(/\s*:\s*$/, '')] = clean(sp[1].textContent);
    });
    const pick = (...keys) => { for (const k of keys) if (details[k]) return details[k]; return null; };

    // Yeni ürün teklifi: akordeon varsa "new" satırı (ikinci satır ikinci el / Retourenkauf olabilir)
    const box = d.querySelector('#apex_desktop_newAccordionRow') || d.querySelector('#apex_desktop') || d;
    const img = d.querySelector('#landingImage');
    return {
      asin,
      status: r.status,
      blocked: !d.querySelector('#productTitle'),
      scannedAt: new Date().toISOString(),
      title: q(d, '#productTitle'),
      brand: pick('Marke', 'Marka Adı', 'Hersteller') || q(d, '#bylineInfo'),
      model: pick('Modellnummer', 'Model Numarası', 'Modellname'),
      part: pick('Teilenummer', 'Parça Numarası', 'Herstellerreferenz'),
      color: pick('Farbe', 'Renk'),
      // Ürün ağırlığı; kutulu ağırlık yalnız "Verpackungsabmessungen: … ; 560 Gramm" satırında olur
      itemWeightG: grams(pick('Artikelgewicht', 'Produktgewicht', 'Gewicht', 'Ürünün Ağırlığı')),
      packageWeightG: grams(pick('Verpackungsabmessungen', 'Paketgewicht', 'Versandgewicht')?.split(';').pop()),
      crumb: [...d.querySelectorAll('#wayfinding-breadcrumbs_feature_div li a')].map((a) => clean(a.textContent)).join(' > '),
      image: stripImg(img?.getAttribute('data-old-hires') || img?.getAttribute('src')),
      netEur: num(q(box, '.priceblock_vat_excl_price')),
      grossEur: num(q(box, '.priceblock_vat_inc_price')) ?? num(q(box, '.a-price .a-offscreen')),
      listEur: num(q(box, '.basisPrice .a-offscreen')),
      availability: q(d, '#availability'),
      soldBy:
        q(d, '#merchantInfoFeature_feature_div .offer-display-feature-text-message') ||
        q(d, '#shipFromSoldByAbbreviatedODF_feature_div') ||
        q(d, '#sfsb_accordion_head') ||
        q(d, '#merchant-info') ||
        q(d, '#sellerProfileTriggerId'),
      delivery: q(d, '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE'),
      buyable: !!d.querySelector('#add-to-cart-button'),
    };
  };

  window.__search = async (query) => {
    const r = await fetch('/s?k=' + encodeURIComponent(query), { credentials: 'include' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    // data-component-type seçicisi kullanılır: sınıf adında "s-search-result" yok;
    // outerHTML'de "Sponsored" aramak her kartı eler, yalnız sponsor etiketi aranır.
    return [...d.querySelectorAll('div[data-asin][data-component-type="s-search-result"]')]
      .filter((c) => c.dataset.asin && !c.classList.contains('AdHolder') && !c.querySelector('.puis-sponsored-label-text, .s-sponsored-label-text'))
      .slice(0, 6)
      .map((c) => ({ asin: c.dataset.asin, title: clean(c.querySelector('h2')?.textContent)?.slice(0, 140) }));
  };

  window.__gallery = async (asin) => {
    const h = await (await fetch('/dp/' + asin + '?th=1&psc=1', { credentials: 'include' })).text();
    const m = h.match(/'colorImages':\s*\{\s*'initial':\s*A\.\$\.parseJSON\('(.+?)'\)/s);
    if (!m) return [];
    return JSON.parse(m[1].replace(/\\'/g, "'")).map((i) => stripImg(i.hiRes || i.large));
  };

  // javascript_tool 45 sn'de keser: uzun işler arka planda koşar, window.__job ile izlenir.
  const runQueue = (items, handle) => {
    const job = { total: items.length, done: 0, results: [], finished: false, blockedStreak: 0, started: Date.now() };
    window.__job = job;
    const queue = [...items];
    const worker = async () => {
      // Üst üste 3 engellenen sayfada durur (Amazon hız sınırı)
      while (queue.length && job.blockedStreak < 3) {
        const item = queue.shift();
        try { job.results.push(await handle(item, job)); } catch (e) { job.results.push({ item, error: String(e) }); }
        job.done++;
        await sleep(1200 + Math.random() * 1500);
      }
    };
    Promise.all([worker(), worker()]).then(() => { job.finished = true; });
    return `started ${items.length}`;
  };

  window.__runScan = (asins) =>
    runQueue([...new Set(asins)], async (asin, job) => {
      const s = await window.__scan(asin);
      job.blockedStreak = s.blocked && s.status !== 404 ? job.blockedStreak + 1 : 0;
      return s;
    });

  // Aday ancak Amazon teknik tablosundaki model/parça no. Ozon koduyla birebir aynıysa VE marka tutuyorsa
  // "exact" sayılır: "XV1653/01 uyumlu batarya" gibi başka marka ürünler de aynı kodu taşıyabilir.
  window.__runSearch = (tasks) =>
    runQueue(tasks, async (t) => {
      const c = norm(t.code);
      const cands = await window.__search(t.brand + ' ' + t.code);
      const checked = [];
      for (const cand of cands) {
        const s = await window.__scan(cand.asin);
        await sleep(900 + Math.random() * 800);
        const codes = [s.model, s.part].map(norm).filter(Boolean);
        // Başlığın tamamına bakılmaz: "… Kompatibel mit Philips" başka marka ürünü de geçirir
        const brandOk = s.brand ? norm(s.brand).includes(norm(t.brand)) : norm(s.title).startsWith(norm(t.brand));
        checked.push({ asin: cand.asin, model: s.model || s.part, brandOk, exact: !t.isName && brandOk && codes.includes(c), title: s.title?.slice(0, 90), scan: s });
        if (checked.at(-1).exact) break;
      }
      return { id: t.id, query: t.brand + ' ' + t.code, candidates: cands.length, checked };
    });

  // __runSearch sonucunu scripts/asin_source_search_apply.mjs'in beklediği { res, scans } biçimine çevirir.
  window.__searchExport = () => {
    const res = window.__job.results.filter((r) => r.id);
    return {
      res: res.map((r) => ({ id: r.id, query: r.query, candidates: r.candidates, checked: r.checked.map(({ scan, ...c }) => c) })),
      scans: res.flatMap((r) => r.checked.filter((c) => c.exact).map((c) => c.scan)),
    };
  };

  // ── Amazon.pl (3. tedarik kanalı) — amazon.pl sekmesinde çalıştır. Aynı ASIN'ler orada da açılır;
  // hesap orada Business değil, fiyat %23 KDV dahil zloti. Sonuç: scripts/amazon_pl_import.mjs
  // "1 749,99 zł" (binlik ayırıcı boşluk / nbsp) → 1749.99
  const pln = (s) => { const m = s?.replace(/[\s  .]/g, '').match(/(\d+),(\d{2})/); return m ? Number(m[1] + '.' + m[2]) : null; };

  window.__scanPl = async (asin) => {
    const r = await fetch('/dp/' + asin + '?th=1&psc=1', { credentials: 'include' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    d.querySelectorAll('script,style').forEach((n) => n.remove());
    const q = (root, s) => clean(root?.querySelector(s)?.textContent);
    const box = d.querySelector('#apex_desktop_newAccordionRow') || d.querySelector('#corePriceDisplay_desktop_feature_div') || d.querySelector('#corePrice_feature_div') || d.querySelector('#apex_desktop');
    // Satıcı: "Sprzedawca / Wysyłka" etiketinin yanındaki mesaj ("Amazon" ya da pazar yeri satıcısı)
    const feat = (name) => q(d, `[offer-display-feature-name="${name}"] .offer-display-feature-text-message`) || q(d, `[offer-display-feature-name="${name}"] .offer-display-feature-text`);
    return {
      asin, status: r.status, blocked: !d.querySelector('#productTitle'), scannedAt: new Date().toISOString(),
      title: q(d, '#productTitle')?.slice(0, 160) ?? null,
      pricePln: pln(q(box, '.a-price .a-offscreen') || q(box, '.a-price')),
      listPricePln: pln(q(box, '.basisPrice .a-offscreen') || q(box, '.a-text-price .a-offscreen')),
      availability: q(d, '#availability'),
      merchant: feat('desktop-merchant-info'),
      fulfiller: feat('desktop-fulfiller-info'),
      delivery: q(d, '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE'),
      buyable: !!d.querySelector('#add-to-cart-button'),
    };
  };

  window.__runScanPl = (asins) =>
    runQueue([...new Set(asins)], async (asin, job) => {
      const s = await window.__scanPl(asin);
      job.blockedStreak = s.blocked && s.status !== 404 ? job.blockedStreak + 1 : 0;
      return s;
    });

  window.__download = (name, data) => {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return blob.size;
  };

  return 'amazon-scan yüklendi';
})();
