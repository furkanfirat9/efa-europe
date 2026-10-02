// Amazon aramasında model numarası birebir tutan adayı ürünün ASIN'i olarak ProductSource'a yazar.
//
// Arama tarayıcıda yapılır (window.__srch); indirilen dosya { res, scans } biçimindedir.
// Yalnızca tek bir aday birebir tutuyorsa yazılır; birden fazla ya da hiç yoksa elle onaya kalır.
// Ardından asin_source_import.mjs, eski tarama + bu dosyadaki sayfalarla yeniden çalıştırılır.
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/asin_source_search_apply.mjs <arama.json> [--dry-run]

import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const { res } = JSON.parse(fs.readFileSync(file, 'utf8'));
const prisma = new PrismaClient();

let applied = 0;
const review = [];
for (const r of res) {
  const exact = [...new Set(r.checked.filter(c => c.exact).map(c => c.asin))];
  if (exact.length !== 1) { review.push(r); continue; }
  const row = await prisma.productSource.findUnique({ where: { storeId_ozonProductId: { storeId: 'store1', ozonProductId: r.id } } });
  if (!row) continue;
  if (row.asin === exact[0] && row.asinStatus === 'VERIFIED') continue;
  console.log(`${row.offerId.padEnd(28)} ${row.asin || '(yok)'} → ${exact[0]}`);
  if (!dryRun) await prisma.productSource.update({ where: { id: row.id }, data: { asin: exact[0], linkMethod: 'search' } });
  applied++;
}
console.log(`\nyazılan: ${applied} | elle bakılacak: ${review.length}`);
await prisma.$disconnect();
