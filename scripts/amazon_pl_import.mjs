// Amazon.pl taramasını ProductSource tablosunun pl* alanlarına yazar ve Amazon.de ile karşılaştırır.
// Tarama uygulamanın tarayıcısında amazon.pl sekmesinde yapılır (skill amazon-scan, window.__runScanPl),
// sonuç JSON olarak indirilir. Amazon.pl'de hesap Business değil: fiyat %23 KDV dahil zloti.
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/amazon_pl_import.mjs <tarama.json> [--dry-run]

import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!file) throw new Error('Tarama dosyası verilmedi');
const scanByAsin = new Map(JSON.parse(fs.readFileSync(file, 'utf8')).map((s) => [s.asin, s]));

const prisma = new PrismaClient();
const rows = await prisma.productSource.findMany({ where: { storeId: 'store1', asin: { not: null } }, orderBy: { offerId: 'asc' } });

// ECB: 1 EUR kaç PLN
const xml = await (await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml')).text();
const eurPln = Number(xml.match(/currency=['"]PLN['"]\s+rate=['"]([\d.]+)['"]/)?.[1]);
if (!eurPln) throw new Error('ECB PLN kuru okunamadı');

function parsePl(s) {
  // Amazon.pl'de bu ASIN'in sayfası yok: ürün orada satılmıyor
  if (s.status === 404) {
    return { plTitle: null, plPricePln: null, plListPricePln: null, plAvailability: 'amazon.pl sayfası yok (404)', plInStock: false, plSoldBy: null, plSoldByAmazon: null, plDeliveryText: null };
  }
  const text = s.availability || '';
  // Amazon.de'deki "Nur noch N" kuralıyla aynı: "Dostępne sztuki: 3 – zamów teraz." (yalnız 3 adet) az stoktur;
  // "Liczba dostępnych szt.: 3. Zapasy zostaną niedługo uzupełnione." (yenisi geliyor) stoktur
  const lowStock = /dostępne sztuki:\s*\d+|(zostało|pozostał[oa]?)\s+tylko\s+\d+/i.test(text) && !/uzupełnione|w drodze/i.test(text);
  const unavailable = /niedostępn/i.test(text);
  const soldBy = s.merchant || null;
  return {
    plTitle: s.title || null,
    plPricePln: s.pricePln ?? null,
    plListPricePln: s.listPricePln ?? null,
    plAvailability: text || null,
    plInStock: !!s.buyable && s.pricePln != null && !unavailable && !lowStock,
    plSoldBy: soldBy,
    // Yalnız Amazon'un kendi yeni teklifi kaynak sayılır (iade / pazar yeri satıcısı değil)
    plSoldByAmazon: soldBy ? /^amazon(\.pl)?$/i.test(soldBy.trim()) : null,
    plDeliveryText: s.delivery || null,
  };
}

const eur = (n) => (n == null ? '—' : n.toFixed(2) + ' €');
const unreadable = [], cheaper = [], onlyPl = [], texts = {};
let written = 0, plBuyable = 0, gone = 0;
for (const r of rows) {
  const s = scanByAsin.get(r.asin);
  if (!s || s.error || (s.blocked && s.status !== 404)) { unreadable.push(`${r.offerId} (${r.asin}): ${s?.error || (s ? 'engellendi' : 'taranmadı')}`); continue; }
  const pl = parsePl(s);
  if (s.status === 404) gone++;
  texts[pl.plAvailability ?? '(boş)'] = (texts[pl.plAvailability ?? '(boş)'] || 0) + 1;
  const plOk = pl.plInStock && pl.plSoldByAmazon;
  if (plOk) plBuyable++;
  const deOk = r.inStock && r.soldByAmazon && r.priceGrossEur;
  const plEur = pl.plPricePln != null ? pl.plPricePln / eurPln : null;
  if (plOk && !deOk) onlyPl.push(`${r.offerId}: amazon.pl ${eur(plEur)} (Amazon.de: ${r.priceGrossEur ? eur(r.priceGrossEur) + ', alınamıyor' : 'fiyat yok'})`);
  else if (plOk && deOk && plEur < r.priceGrossEur) cheaper.push({ offer: r.offerId, de: r.priceGrossEur, pl: plEur, pct: (1 - plEur / r.priceGrossEur) * 100 });
  if (dryRun) continue;
  await prisma.productSource.update({ where: { id: r.id }, data: { ...pl, plCheckedAt: s.scannedAt ? new Date(s.scannedAt) : new Date() } });
  written++;
}

cheaper.sort((a, b) => b.de - b.pl - (a.de - a.pl));
console.log(`Kur: 1 € = ${eurPln} zł | ASIN'li ürün: ${rows.length} | amazon.pl'de sayfası yok: ${gone} | okunamayan: ${unreadable.length}`);
console.log(`amazon.pl'den alınabilir (stokta + Amazon satıyor): ${plBuyable}`);
console.log(`\nİki sitede de alınabilir ve amazon.pl daha ucuz (KDV dahil): ${cheaper.length}`);
cheaper.forEach((c) => console.log(`  ${c.offer}: Amazon.de ${eur(c.de)} → amazon.pl ${eur(c.pl)} (−${(c.de - c.pl).toFixed(2)} €, %${c.pct.toFixed(0)})`));
console.log(`\nYalnız amazon.pl'den alınabilir: ${onlyPl.length}`);
onlyPl.forEach((x) => console.log('  ' + x));
console.log('\nStok yazıları:', texts);
if (unreadable.length) { console.log(`\nOkunamayan: ${unreadable.length}`); unreadable.forEach((x) => console.log('  ' + x)); }
console.log(dryRun ? '\ndry-run: tabloya yazılmadı' : `\ntabloya yazıldı: ${written}`);
await prisma.$disconnect();
