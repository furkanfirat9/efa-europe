// Ceneo taraması için görev listesi. Çıktı tarayıcıda window.__runCeneo(<liste>) ile çalıştırılır (skill ceneo-scan).
//   - Ceneo ürünü bağlı olan (EXACT / MANUAL): { id, ceneoId, status } → arama yok, o sayfanın teklifleri okunur
//   - Bağlı olmayan: { id, brand, codes } → Ceneo'da kodla aranır
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/ceneo_tasks.mjs [--only=NONE,ERROR] [--unscanned] > tasks.json
//
// --unscanned: teklifleri henüz okunmamış ürünler. Tarama CAPTCHA yüzünden birkaç oturuma bölünür; her oturumdan
// sonra import edilir, sıradaki oturum kalanlarla başlar.

import { Prisma, PrismaClient } from '@prisma/client';

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const unscanned = process.argv.includes('--unscanned');
const prisma = new PrismaClient();
// "Ceneo'da yok" (NOT_IN_POLAND) kullanıcı kararıdır (/ceneo-kontrol): bu ürünler taranmaz
const rows = await prisma.productSource.findMany({
  where: {
    storeId: 'store1',
    asinStatus: { not: 'ARCHIVED' },
    NOT: { ceneoStatus: 'NOT_IN_POLAND' },
    ...(unscanned ? { ceneoOffers: { equals: Prisma.DbNull } } : {}),
  },
});

const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+(?=\d)/, '');
// offer_id bazen başlıktan kalma ("Philips GC7844/20", "Tefal OptiGrill GC705D"): kod = harf + rakam, ya da
// en az 7 haneli sayı (WMF 0733706299). "DiamondClean 9900" gibi seri numaraları başka ürünlere de uyar.
const codeParts = (s) => (s || '').split(/[\s()]+/).filter((t) => {
  const n = norm(t);
  return n.length >= 4 && /\d/.test(n) && (/[A-Z]/.test(n) || n.length >= 7);
});

const tasks = rows
  .filter((r) => !only || only.includes(r.ceneoStatus ?? 'NONE'))
  .map((r) => {
    if (r.ceneoProductId && (r.ceneoStatus === 'EXACT' || r.ceneoStatus === 'MANUAL'))
      return { id: r.ozonProductId, ceneoId: r.ceneoProductId, status: r.ceneoStatus };
    const seen = new Set();
    const codes = [r.ozonPartNumber, r.amzModel, ...codeParts(r.offerId)]
      .flatMap(codeParts)
      .filter((c) => !seen.has(norm(c)) && seen.add(norm(c)));
    // "PHILIPS AVENT" → Ceneo adında "Philips"
    const brand = (r.ozonBrand || r.amzBrand || '').split(/\s+/)[0];
    return { id: r.ozonProductId, brand, codes };
  })
  .filter((t) => t.ceneoId || t.codes.length);

process.stdout.write(JSON.stringify(tasks));
console.error(`${tasks.length} görev (${rows.length} ürün)`);
await prisma.$disconnect();
