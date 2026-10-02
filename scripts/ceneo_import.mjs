// Ceneo tarama sonucunu ProductSource tablosuna yazar ve Amazon'la karşılaştırmalı özet verir.
// Tarama uygulamanın tarayıcısında yapılır, sonuç JSON olarak indirilir (skill ceneo-scan).
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/ceneo_import.mjs <ceneo.json> [--dry-run]
//   --max-change 0.5   en iyi teklifin fiyatı bu orandan fazla oynayan ürün yazılmaz (otomatik tarama)
//   --summary <dosya>  sayıları JSON olarak yazar (scripts/supply_scan.mjs okur)

import fs from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import { pickBestOffer } from '../src/lib/sourcing/ceneoRules.ts';

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const argVal = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const maxChange = argVal('--max-change') != null ? Number(argVal('--max-change')) : null;
const summaryFile = argVal('--summary');
if (!file) throw new Error('Tarama dosyası verilmedi');
const results = JSON.parse(fs.readFileSync(file, 'utf8'));

const prisma = new PrismaClient();
const rows = new Map((await prisma.productSource.findMany({ where: { storeId: 'store1' } })).map((r) => [r.ozonProductId, r]));

// ECB: 1 EUR kaç PLN
const xml = await (await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml')).text();
const eurPln = Number(xml.match(/currency=['"]PLN['"]\s+rate=['"]([\d.]+)['"]/)?.[1]);
if (!eurPln) throw new Error('ECB PLN kuru okunamadı');

const count = {};
let cheaper = 0, onlyCeneo = 0, written = 0;
const examples = [];
const keptOnError = [], held = [], priceChanged = [], appeared = [], vanished = [];
for (const r of results) {
  const row = rows.get(String(r.id));
  // "Ceneo'da yok" (NOT_IN_POLAND) kullanıcı kararı: eski bir tarama dosyası bile onu ezmez
  if (!row || row.ceneoStatus === 'NOT_IN_POLAND') continue;
  count[r.status] = (count[r.status] || 0) + 1;
  // Bağlı üründe okuma hatası (sayfa yok, ağ hatası): eşleşme ve eski teklifler olduğu gibi kalır
  if (r.status === 'ERROR' && row.ceneoProductId) {
    keptOnError.push(`${row.offerId} (Ceneo ${row.ceneoProductId}): ${r.error ?? ''}`);
    continue;
  }
  // Elle verilmiş karar tarama sonucuyla ezilmez; yalnız teklifleri tazelenir
  const status = row.ceneoStatus === 'MANUAL' && r.status !== 'ERROR' ? 'MANUAL' : r.status;
  const linked = status === 'EXACT' || status === 'MANUAL';
  const pick = r.offers?.length ? pickBestOffer(r.offers, row.ozonBrand) : null;
  const oldPick = Array.isArray(row.ceneoOffers) && row.ceneoOffers.length ? pickBestOffer(row.ceneoOffers, row.ozonBrand) : null;
  const oldPln = oldPick?.best.totalPln ?? null, newPln = pick?.best.totalPln ?? null;
  // Otomatik taramada en iyi teklifin aşırı oynaması (yanlış ürün sayfası, hatalı teklif) yazılmaz
  if (maxChange != null && oldPln && newPln && Math.abs(newPln / oldPln - 1) > maxChange) {
    held.push(`${row.offerId} (Ceneo ${row.ceneoProductId}): ${oldPln} zł → ${newPln} zł`);
    continue;
  }
  if (oldPln && newPln && Math.abs(newPln - oldPln) >= 0.01) priceChanged.push({ offer: row.offerId, from: oldPln, to: newPln });
  if (!oldPln && newPln) appeared.push(row.offerId);
  if (oldPln && !newPln) vanished.push(row.offerId);
  if (pick) {
    const eur = pick.best.totalPln / eurPln;
    const amazonOk = row.asin && row.inStock && row.soldByAmazon && row.priceGrossEur;
    if (!amazonOk) onlyCeneo++;
    else if (eur < row.priceGrossEur) {
      cheaper++;
      examples.push({ offer: row.offerId, amazon: row.priceGrossEur, ceneo: +eur.toFixed(2), shop: pick.best.shop, saving: +(row.priceGrossEur - eur).toFixed(2) });
    }
  }
  if (dryRun) continue;
  await prisma.productSource.update({
    where: { id: row.id },
    data: {
      ceneoStatus: status,
      ceneoProductId: r.ceneoId ?? (linked ? row.ceneoProductId : null),
      ceneoName: r.ceneoName ?? (linked ? row.ceneoName : null),
      ceneoMatchedCode: r.matchedCode ?? (linked ? row.ceneoMatchedCode : null),
      ceneoWeightG: r.weightG ?? null,
      // Json alanına düz null yazılamaz (Prisma): boş = DbNull
      ceneoOffers: r.offers ?? Prisma.DbNull,
      ceneoCandidates: r.candidates ?? (linked ? row.ceneoCandidates ?? Prisma.DbNull : Prisma.DbNull),
      ceneoCheckedAt: r.scannedAt ? new Date(r.scannedAt) : new Date(),
    },
  });
  written++;
}

console.log(`Kur: 1 € = ${eurPln} zł`);
console.log('Durum:', count);
console.log(`Ceneo'da güvenilir teklif Amazon'dan ucuz: ${cheaper} ürün | Amazon'dan alınamıyor ama Ceneo'da var: ${onlyCeneo} ürün`);
examples.sort((a, b) => b.saving - a.saving).slice(0, 15).forEach((e) => console.log(`  ${e.offer}: Amazon ${e.amazon} € → ${e.shop} ${e.ceneo} € (−${e.saving} €)`));
if (keptOnError.length) {
  console.log(`Okunamadı, eski bağ korundu (${keptOnError.length}):`);
  keptOnError.forEach((e) => console.log(`  ${e}`));
}
console.log(`En iyi teklifi değişen: ${priceChanged.length} | teklifi yeni çıkan: ${appeared.length} | teklifi kalmayan: ${vanished.length}`);
if (held.length) { console.log(`Fiyatı %${Math.round(maxChange * 100)}'den fazla oynadığı için yazılmayan: ${held.length}`); held.forEach((x) => console.log('  ' + x)); }
console.log(dryRun ? 'Deneme: tabloya yazılmadı' : `${written} ürün yazıldı`);
if (summaryFile) {
  const errors = count.ERROR || 0;
  fs.writeFileSync(summaryFile, JSON.stringify({
    total: results.length, scanned: results.length - errors, unreadable: errors, written,
    priceChanged: priceChanged.length, stockChanged: appeared.length + vanished.length, held: held.length,
    count, cheaper, onlyCeneo, price: priceChanged.slice(0, 30), appeared, vanished, heldList: held, keptOnError,
  }));
}
await prisma.$disconnect();
