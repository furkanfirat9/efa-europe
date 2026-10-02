// Ozon ürünlerini Amazon taramasıyla karşılaştırıp ProductSource tablosuna yazar.
//
// Amazon sayfaları Node'dan çekilince engelleniyor; tarama uygulamanın tarayıcısında
// amazon.de üzerinde yapılır ve sonuç JSON dosyası olarak indirilir. Bu script o dosyayı
// okur, Ozon'dan ürünlerin güncel parmak izini (marka, parça numarası, ana görsel) çeker,
// ASIN'i model numarası + marka + görsel ile doğrular ve tabloya yazar.
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/asin_source_import.mjs <tarama.json> [--dry-run] [--prices-only]
//
// --prices-only: haftalık tazeleme. Yalnızca fiyat, stok, satıcı ve ağırlık yazılır; ASIN durumları (kullanıcının
// /asin-kontrol kararları dahil) ve Ozon karşılaştırması yeniden yapılmaz. Neyin değiştiğini listeler.
//   --max-change 0.5   fiyatı bu orandan fazla oynayan ürün yazılmaz, "bekletilen" olarak listelenir (otomatik tarama)
//   --summary <dosya>  sayıları JSON olarak yazar (scripts/supply_scan.mjs okur)

import fs from 'node:fs';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const scanFile = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const pricesOnly = process.argv.includes('--prices-only');
const argVal = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const maxChange = argVal('--max-change') != null ? Number(argVal('--max-change')) : null;
const summaryFile = argVal('--summary');
if (!scanFile) throw new Error('Tarama dosyası verilmedi');
const scan = JSON.parse(fs.readFileSync(scanFile, 'utf8'));
const scanByAsin = new Map((Array.isArray(scan) ? scan : Object.values(scan)).map(s => [s.asin, s]));

const prisma = new PrismaClient();
const STORE = 'store1';
const H = { 'Client-Id': process.env.OZON_CLIENT_ID, 'Api-Key': process.env.OZON_API_KEY, 'Content-Type': 'application/json' };

if (pricesOnly) {
  await refreshPrices();
  await prisma.$disconnect();
  process.exit(0);
}

async function refreshPrices() {
  const rows = await prisma.productSource.findMany({ where: { storeId: STORE, asin: { not: null } }, orderBy: { offerId: 'asc' } });
  const eur = n => (n == null ? '—' : n.toFixed(2) + ' €');
  const price = [], stockIn = [], stockOut = [], seller = [], unreadable = [], held = [];
  let written = 0;
  for (const r of rows) {
    const s = scanByAsin.get(r.asin);
    if (!s || s.error || s.blocked || !s.title) { unreadable.push(`${r.offerId} (${r.asin}): ${s?.error || (s ? 'engellendi' : 'taranmadı')}`); continue; }
    const next = parseStock(s);
    // Otomatik taramada aşırı fiyat oynaması (yanlış teklif satırı, geçici kampanya, sayfa hatası) yazılmaz
    if (maxChange != null && r.priceGrossEur && next.priceGrossEur && Math.abs(next.priceGrossEur / r.priceGrossEur - 1) > maxChange) {
      held.push(`${r.offerId} (${r.asin}): ${eur(r.priceGrossEur)} → ${eur(next.priceGrossEur)}`);
      continue;
    }
    if ((r.priceGrossEur ?? null) !== (next.priceGrossEur ?? null) && Math.abs((r.priceGrossEur ?? 0) - (next.priceGrossEur ?? 0)) >= 0.01)
      price.push({ offer: r.offerId, from: r.priceGrossEur, to: next.priceGrossEur });
    if (!!r.inStock !== !!next.inStock) (next.inStock ? stockIn : stockOut).push(`${r.offerId} (${next.availability || (s.buyable ? 'sepete eklenebiliyor, stok metni yok' : 'fiyat/sepet yok')})`);
    if ((r.soldByAmazon ?? null) !== (next.soldByAmazon ?? null)) seller.push(`${r.offerId}: ${r.soldBy ?? '—'} → ${next.soldBy ?? '—'}`);
    if (dryRun) continue;
    await prisma.productSource.update({
      where: { id: r.id },
      data: { ...next, ...('itemWeightG' in s ? { amzItemWeightG: s.itemWeightG ?? null, amzPackageWeightG: s.packageWeightG ?? null } : {}) },
    });
    written++;
  }
  price.sort((a, b) => Math.abs((b.to ?? 0) - (b.from ?? 0)) - Math.abs((a.to ?? 0) - (a.from ?? 0)));
  console.log(`ASIN'li ürün: ${rows.length} | okunan: ${rows.length - unreadable.length} | okunamayan: ${unreadable.length}`);
  console.log(`\nFiyatı değişen (KDV dahil): ${price.length}`);
  price.forEach(p => console.log(`  ${p.offer}: ${eur(p.from)} → ${eur(p.to)}${p.from != null && p.to != null ? ` (${p.to > p.from ? '+' : ''}${(p.to - p.from).toFixed(2)})` : ''}`));
  console.log(`\nStoğa giren: ${stockIn.length}`); stockIn.forEach(x => console.log('  ' + x));
  console.log(`\nStoktan çıkan / alınamaz olan: ${stockOut.length}`); stockOut.forEach(x => console.log('  ' + x));
  console.log(`\nSatıcısı değişen: ${seller.length}`); seller.forEach(x => console.log('  ' + x));
  if (unreadable.length) { console.log(`\nOkunamayan (eski değerler korunur): ${unreadable.length}`); unreadable.forEach(x => console.log('  ' + x)); }
  if (held.length) { console.log(`\nFiyatı %${Math.round(maxChange * 100)}'den fazla oynadığı için yazılmayan: ${held.length}`); held.forEach(x => console.log('  ' + x)); }
  console.log(dryRun ? '\ndry-run: tabloya yazılmadı' : `\ntabloya yazıldı: ${written}`);
  if (summaryFile) {
    fs.writeFileSync(summaryFile, JSON.stringify({
      total: rows.length, scanned: rows.length - unreadable.length, unreadable: unreadable.length, written,
      priceChanged: price.length, stockChanged: stockIn.length + stockOut.length, held: held.length,
      price: price.slice(0, 30), stockIn, stockOut, seller, heldList: held, unreadableList: unreadable.slice(0, 30),
    }));
  }
}

// 1. Ozon ürünleri
const products = [];
for (let last_id = ''; ;) {
  const r = await fetch('https://api-seller.ozon.ru/v4/product/info/attributes', { method: 'POST', headers: H, body: JSON.stringify({ filter: { visibility: 'ALL' }, last_id, limit: 1000 }) });
  const j = await r.json();
  if (!r.ok) throw new Error('Ozon: ' + JSON.stringify(j));
  products.push(...j.result);
  if (!j.last_id || j.result.length < 1000) break;
  last_id = j.last_id;
  await new Promise(s => setTimeout(s, 700));
}
const attr = (p, id) => (p.attributes.find(a => a.id === id)?.values || []).map(v => v.value).join(' | ') || null;

// 2. Ürünün şu anki ASIN'i: önce tabloda elle/aramayla düzeltilmiş kayıt, sonra katalog hafızası
const existing = new Map((await prisma.productSource.findMany({ where: { storeId: STORE } })).map(e => [e.ozonProductId, e]));
const mem = await prisma.catalogMemory.findMany({ where: { asin: { not: null } } });
const byPid = new Map(), byOffer = new Map(), byModel = new Map();
for (const m of mem) {
  if (m.ozonProductId) byPid.set(String(m.ozonProductId), m);
  if (m.offerId) byOffer.set(m.offerId.toLowerCase(), m);
  if (m.modelNo) byModel.set(m.modelNo.toLowerCase(), m);
}
function currentLink(p) {
  const e = existing.get(String(p.id));
  // Elle verilen karar ("Amazon'da yok" dahil, asin boş) katalog hafızasına geri düşmez
  if (e?.linkMethod === 'manual') return { asin: e.asin, linkMethod: 'manual' };
  if (e?.asin && e.linkMethod === 'search') return { asin: e.asin, linkMethod: e.linkMethod };
  let m = byPid.get(String(p.id)); if (m) return { asin: m.asin, linkMethod: 'product_id' };
  m = byOffer.get(p.offer_id.toLowerCase()); if (m) return { asin: m.asin, linkMethod: 'offer_id' };
  m = byModel.get(p.offer_id.toLowerCase()); if (m) return { asin: m.asin, linkMethod: 'model' };
  return { asin: null, linkMethod: null };
}

// 3. Karşılaştırma
// WMF kodlarının başındaki 0'ı Amazon bazen atıyor (0733706299 ↔ 733706299)
const norm = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+(?=\d)/, '');
// Başlıkta aranacak yalnızca gerçek kod parçaları: "DiamondClean 9900 Prestige" gibi seri adları
// her başlıkta geçebileceği için kanıt sayılmaz.
const codeTokens = s => (s || '').split(/[\s|,]+/).filter(t => /\d/.test(t) && /^[A-Za-z0-9/.\-]+$/.test(t) && (norm(t).length >= 6 || (/[A-Za-z]/.test(t) && norm(t).length >= 5))).map(norm);
const ACCESSORY = /zubehör|ersatzteil|yedek parça|aksesuar|fırça başlıkları|filter/i;

async function dhash(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('görsel ' + r.status);
  // Ozon görselleri beyaz kenarla kareye tamamlanmış; kenar kırpılmazsa aynı görsel farklı çıkar.
  const trimmed = await sharp(Buffer.from(await r.arrayBuffer())).flatten({ background: '#fff' }).trim({ threshold: 20 }).toBuffer();
  const px = await sharp(trimmed).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] > px[y * 9 + x + 1] ? '1' : '0';
  return bits;
}
const hamming = (a, b) => [...a].filter((c, i) => c !== b[i]).length;

// Paket adedi: model numarası aynı olsa da Amazon teklifi 10'lu paket, Ozon kartı tek adet olabilir.
// Ozon'da ID 6318 (Количество ламп, шт), başlıktaki "N шт" ya da ID 4384 (Комплектация) "— N шт".
function ozonQty(p) {
  const n = Number(attr(p, 6318));
  if (n > 0) return n;
  const m = p.name.match(/(\d+)\s*(?:шт|предм)/i) || (attr(p, 4384) || '').match(/—\s*(\d+)\s*шт/i);
  return m ? Number(m[1]) : null;
}
function amazonQty(title) {
  const t = title || '';
  if (/doppel(pack|blister|packung)/i.test(t)) return 2;
  const m = t.match(/(\d+)\s*(?:er)?[- ]?(?:pack|packung|set|blister)\b/i) || t.match(/(\d+)\s*(?:stück|stk)\b/i) || t.match(/pack of (\d+)/i);
  return m ? Number(m[1]) : null;
}
const IMAGE_FAR = 12;
const amazonImage = u => u?.replace(/\/images\/W\/[^/]+\/images\//, '/images/');

function parseStock(s) {
  if (!s || s.error || s.blocked) return {};
  const text = s.availability || '';
  const raw = (s.soldBy || '').replace(/\s+/g, ' ').trim();
  // "Versand durch: Amazon Verkauft von: X" ya da (Business sayfasında) "... Verkauf und Versand durch Amazon."
  const soldBy = (raw.match(/Verkauft von:\s*(.+?)\s*$/i)?.[1]
    || raw.match(/Verkauf und Versand durch\s+(.+?)\.?\s*$/i)?.[1]
    || raw.match(/Verkauf durch\s+(.+?)(?:\s+und Versand|\.|$)/i)?.[1]
    || raw)?.split(/\. Für weitere Informationen/)[0] || null;
  const lowStock = /nur noch \d+/i.test(text) && !/mehr ist unterwegs/i.test(text);
  const unavailable = /nicht verfügbar|nicht auf lager/i.test(text);
  return {
    priceNetEur: s.netEur ?? null,
    priceGrossEur: s.grossEur ?? null,
    listPriceEur: s.listEur ?? null,
    availability: text || null,
    // "Versandbereit in 1-2 Tagen" de stoktur; yalnızca az stok ve tükenmiş elenir
    inStock: !!s.buyable && !unavailable && !lowStock,
    soldBy,
    // "Amazon Retourenkauf" iade edilmiş ürünler satıcısıdır, Amazon'un kendi yeni teklifi değil
    soldByAmazon: soldBy ? /^amazon(\.de)?$/i.test(soldBy.trim()) : null,
    deliveryText: s.delivery || null,
    checkedAt: s.scannedAt ? new Date(s.scannedAt) : new Date(),
  };
}

const rows = [];
for (const p of products) {
  const o = { offerId: p.offer_id, brand: attr(p, 85), part: attr(p, 4381), name: p.name, image: p.primary_image || p.images?.[0] };
  const { asin, linkMethod } = currentLink(p);
  const s = asin ? scanByAsin.get(asin) : null;
  const row = {
    storeId: STORE, ozonProductId: String(p.id), offerId: p.offer_id, sku: p.sku ? String(p.sku) : null,
    ozonName: p.name, ozonBrand: o.brand, ozonPartNumber: o.part, ozonImage: o.image || null, asin, linkMethod,
  };
  const prev = existing.get(String(p.id));
  // Elle verilen kararlar (onay ekranı) taramayla ezilmez.
  const manualKept = prev?.asinStatus === 'MANUAL' && prev.asin === asin;
  if (!asin) { rows.push({ ...row, asinStatus: prev?.asinStatus === 'NOT_ON_AMAZON' ? 'NOT_ON_AMAZON' : 'MISSING' }); continue; }
  if (!s || s.error || s.blocked || !s.title) {
    // Elle girilen yeni ASIN henüz taranmadıysa onay korunur, Amazon alanları bir sonraki taramada dolar.
    rows.push(manualKept ? { ...row, asinStatus: 'MANUAL' } : { ...row, asinStatus: 'UNREADABLE', checks: { error: s?.error || (s ? 'blocked' : 'not scanned') } });
    continue;
  }

  // "Profi 28 cm (0794689991)" gibi başlıktan kalma kodlarda asıl kod parantez içindedir
  const ozonCodes = [...new Set([norm(o.offerId), ...(o.part || '').split('|').map(norm), ...codeTokens(o.offerId.replace(/[()]/g, ' '))].filter(c => c.length >= 3))];
  const amzCodes = [s.model, s.part].filter(Boolean).map(norm);
  const titleCodes = codeTokens(o.offerId + ' ' + (o.part || ''));
  const b1 = norm(s.brand), b2 = norm(o.brand);
  // Bölge/paket eki farkı: Tefal K13304 ↔ K1330404, GC722D16 ↔ GC722D, Ninja SL451EUSD ↔ SL451EU
  const prefixOf = (a, b) => a.length >= 5 && b.startsWith(a);
  const checks = {
    brand: !!b2 && (b1.includes(b2) || b2.includes(b1 || '#') || norm(s.title).includes(b2)),
    modelExact: ozonCodes.some(c => amzCodes.includes(c)),
    modelPrefix: ozonCodes.some(c => amzCodes.some(x => x !== c && (prefixOf(c, x) || prefixOf(x, c)))),
    modelInTitle: titleCodes.some(c => norm(s.title).includes(c) || norm(s.title).includes(c.replace(/\d{2}$/, ''))),
    accessory: ACCESSORY.test((s.crumb || '').split('>').pop()),
    imageDist: null,
    ozonQty: ozonQty(p),
    amzQty: amazonQty(s.title),
    packMismatch: false,
  };
  // Amazon başlıkları adedi çoğu zaman yazmaz; paket zaten model numarasına gömülüdür (CA6903/22 = 2'li).
  // Bu yüzden yalnızca Amazon adedi açıkça yazıp Ozon'dakinden farklıysa uyarılır.
  if (checks.amzQty != null) checks.packMismatch = (checks.ozonQty ?? 1) !== checks.amzQty;
  try { checks.imageDist = hamming(await dhash(o.image), await dhash(amazonImage(s.image))); } catch { /* görsel yoksa model kanıtı yeter */ }
  // Kesin yalnızca model numarasının birebir tutması. Ek farkı ya da yalnızca başlıkta geçen kod
  // "muhtemel"dir: aynı gövdenin başka rengi (NA550/00 ↔ NA552/00) de böyle görünebilir.
  let asinStatus;
  if (!checks.brand) asinStatus = 'SUSPECT';
  // Model birebir tutsa da Ozon kartının görseli ya da paket adedi farklıysa kart başka bir ürünü
  // gösteriyor olabilir (NA552/00 kartında NA550/00 fotoğrafları vardı); karar elle verilir.
  else if (checks.modelExact && (checks.packMismatch || (checks.imageDist ?? 0) > IMAGE_FAR)) asinStatus = 'SUSPECT';
  else if (checks.modelExact) asinStatus = 'VERIFIED';
  else if (checks.modelPrefix || checks.modelInTitle) asinStatus = 'LIKELY';
  else if (amzCodes.length) asinStatus = 'MODEL_MISMATCH';
  else asinStatus = 'SUSPECT';
  // Elle onaylanmış kayıt, kurallar ne derse desin onaylı kalır.
  if (manualKept) asinStatus = 'MANUAL';

  rows.push({
    ...row, asinStatus, checks,
    amzTitle: s.title, amzBrand: s.brand, amzModel: s.model || s.part || null, amzImage: amazonImage(s.image),
    // Eski taramalarda ağırlık yok; alan hiç gelmediyse mevcut değer korunur
    ...('itemWeightG' in s ? { amzItemWeightG: s.itemWeightG ?? null, amzPackageWeightG: s.packageWeightG ?? null } : {}),
    ...parseStock(s),
    verifiedAt: asinStatus === 'VERIFIED' ? new Date() : prev?.verifiedAt ?? null,
  });
}

// Aynı ASIN'e bağlı birden fazla ürün: model tutan kalır, diğerleri zaten MODEL_MISMATCH olur.
const count = {};
for (const r of rows) count[r.asinStatus] = (count[r.asinStatus] || 0) + 1;
console.log('Ozon ürünü:', products.length, '| tarama:', scanByAsin.size, '|', count);

if (dryRun) {
  fs.writeFileSync(scanFile.replace(/\.json$/, '') + '.result.json', JSON.stringify(rows, null, 1));
  console.log('dry-run: tabloya yazılmadı');
} else {
  for (const r of rows) {
    await prisma.productSource.upsert({ where: { storeId_ozonProductId: { storeId: r.storeId, ozonProductId: r.ozonProductId } }, create: r, update: r });
  }
  console.log('tabloya yazıldı:', rows.length);
}
await prisma.$disconnect();
