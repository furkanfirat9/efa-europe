// data/catalog_memory.json'daki kayıtları CatalogMemory tablosuna bir kez aktarır.
//
// Hafıza artık veri tabanında (src/lib/db/catalogMemory.ts). Tablo boş değilse hiçbir şey
// yapmaz; böylece yanlışlıkla ikinci kez çalıştırılırsa kayıtlar çoğalmaz.
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/seed_catalog_memory.mjs
//   (--dry-run: yazmadan ne aktarılacağını gösterir)

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

const file = path.join(process.cwd(), 'data', 'catalog_memory.json');
const records = JSON.parse(fs.readFileSync(file, 'utf8'));

const toDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const toInt = (v) => (Number.isInteger(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const toStr = (v) => (v === undefined || v === null || v === '' ? null : String(v));

// Dosyada yeni kayıt başa eklenirdi. Tarihi olmayan kayıtlar dosyadaki sırayı koruyacak
// şekilde en eskiden geriye doğru sıralanır.
const fallbackBase = new Date('2026-01-01T00:00:00Z').getTime();

const rows = records.map((r, i) => {
  const createdAt = toDate(r.createdAt) || toDate(r.verifiedAt) || new Date(fallbackBase - i * 1000);
  return {
    asin: toStr(r.asin)?.toUpperCase() ?? null,
    brand: toStr(r.brand) ?? '',
    modelNo: toStr(r.modelNo) ?? '',
    categoryId: toInt(r.categoryId),
    typeId: toInt(r.typeId),
    categoryName: toStr(r.categoryName),
    typeName: toStr(r.typeName),
    seriesMergeCode: toStr(r.seriesMergeCode),
    namingTemplateModel: toStr(r.namingTemplateModel),
    partNumber: toStr(r.partNumber),
    aspects: r.aspects ?? undefined,
    finalTitle: toStr(r.finalTitle),
    productQuery: toStr(r.productQuery),
    ozonTaskId: toStr(r.ozonTaskId),
    offerId: toStr(r.offerId),
    ozonProductId: toStr(r.ozonProductId),
    source: toStr(r.source),
    verifiedAt: toDate(r.verifiedAt),
    createdAt,
    updatedAt: toDate(r.updatedAt) || createdAt,
  };
});

const existing = await prisma.catalogMemory.count();
console.log(`Dosyada ${rows.length} kayıt, tabloda ${existing} kayıt.`);
console.log(`ASIN'li kayıt: ${rows.filter((r) => r.asin).length}, farklı ASIN: ${new Set(rows.map((r) => r.asin).filter(Boolean)).size}`);

if (existing > 0) {
  console.log('Tablo boş değil, aktarım yapılmadı.');
} else if (dryRun) {
  console.log('--dry-run: yazılmadı. Örnek:', JSON.stringify(rows[0]).slice(0, 300));
} else {
  const { count } = await prisma.catalogMemory.createMany({ data: rows });
  console.log(`${count} kayıt aktarıldı.`);
}

await prisma.$disconnect();
