const fs = require('fs');
const path = require('path');

function inspectUpdateCandidates() {
  const satistakiPath = path.join(process.cwd(), 'data', 'satistaki_urunler.json');
  const memoryPath = path.join(process.cwd(), 'data', 'catalog_memory.json');

  const satistaki = JSON.parse(fs.readFileSync(satistakiPath, 'utf8'));
  const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));

  const candidates = [];
  const excluded = [];
  const noAsin = [];

  for (const p of satistaki) {
    const offerId = (p.offerId || '').trim();

    // Özel İstisna: EP2220/10 hariç tutulmalı
    if (offerId.toLowerCase().includes('ep2220/10') || offerId.toLowerCase() === 'ep2220/10') {
      excluded.push({ offerId, reason: 'Kullanıcı özel istisnası (Manuel görsel yüklendi)' });
      continue;
    }

    // ASIN bul
    const match = memory.find(
      (m) =>
        (m.asin && m.asin.toLowerCase() === offerId.toLowerCase()) ||
        (m.modelNo && m.modelNo.toLowerCase() === offerId.toLowerCase()) ||
        (m.offerId && m.offerId.toLowerCase() === offerId.toLowerCase()) ||
        (m.ozonProductId && String(m.ozonProductId) === String(p.productId))
    );

    if (match && match.asin && match.asin.startsWith('B0')) {
      candidates.push({
        productId: p.productId,
        offerId: p.offerId,
        name: p.name,
        asin: match.asin,
      });
    } else {
      noAsin.push({
        productId: p.productId,
        offerId: p.offerId,
        name: p.name,
      });
    }
  }

  console.log(`=== Galeri Güncelleme Aday Analizi ===`);
  console.log(`Satıştaki Toplam Ürün: ${satistaki.length}`);
  console.log(`✅ Güncellenecek ASIN'li Ürün Sayısı: ${candidates.length}`);
  console.log(`⛔ Hariç Tutulan (İstisna): ${excluded.length} (${excluded.map(e => e.offerId).join(', ')})`);
  console.log(`❓ ASIN'i Olmayan: ${noAsin.length}`);
  console.log(`\nİlk 5 Aday Örneği:`);
  console.log(candidates.slice(0, 5));
}

inspectUpdateCandidates();
