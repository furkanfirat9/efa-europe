const fs = require('fs');
const path = require('path');

function inspectCatalogMemoryContaminations() {
  const memPath = path.join(process.cwd(), 'data', 'catalog_memory.json');
  const memory = JSON.parse(fs.readFileSync(memPath, 'utf8'));

  const ACCESSORY_KEYWORDS = [
    'backpapier', 'silikonform', 'silikon', 'zubehör', 'passend für', 'kompatibel mit',
    'ersatzteil', 'für philips', 'für tefal', 'für ninja', 'stück luftfritteusen',
    'ha bin', 'kalkfilter', 'feinsieb für', 'ersatzfilter für wmf', 'silikonmatte',
    'zubehör set für', 'reinigungsbürste für'
  ];

  const contaminated = [];
  const clean = [];

  for (const item of memory) {
    const title = (item.finalTitle || item.matchedTitle || '').toLowerCase();
    const query = (item.productQuery || item.modelNo || '').toLowerCase();

    // Check if store product is an actual airfryer/shaver/iron/machine, but matched an accessory
    const isContaminated = ACCESSORY_KEYWORDS.some(kw => title.includes(kw));

    if (isContaminated) {
      contaminated.push({
        modelNo: item.modelNo,
        asin: item.asin,
        title: item.finalTitle || item.matchedTitle,
      });
    } else {
      clean.push(item);
    }
  }

  console.log(`=== Katalog Hafızası Kirlilik Taraması ===`);
  console.log(`Toplam Kayıt: ${memory.length}`);
  console.log(`❌ Aksesuar / Yan Sanayi Eşleşmesi Olan Hatalı Kayıt: ${contaminated.length}`);
  console.log(`✅ Temiz Cihaz Kayıtları: ${clean.length}\n`);

  console.log('--- Hatalı Eşleşen Aksesuarların Listesi ---');
  contaminated.forEach((c, idx) => {
    console.log(`[${idx + 1}] Model: ${c.modelNo} | ASIN: ${c.asin}`);
    console.log(`    👉 Eşleşen Başlık: ${c.title}`);
  });
}

inspectCatalogMemoryContaminations();
