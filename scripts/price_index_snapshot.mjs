// Ozon fiyat endeksini geçmişe kaydeder (Fiyat endeksi → Değişimler sekmesi).
// Sayfa açıldığında da kayıt alınıyor (30 dk'da bir); bu script günlük görev ve eski anlık görüntüler içindir.
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/price_index_snapshot.mjs [--store store1]
//   ... scripts/price_index_snapshot.mjs --file <v5-items.json> --at 2026-10-02T16:23:00+03:00   (eski görüntüyü yükle)

import fs from 'node:fs';
import { createJiti } from 'jiti';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};
const store = arg('--store') === 'store2' ? 'store2' : 'store1';
const file = arg('--file');
const at = arg('--at');

const jiti = createJiti(import.meta.url, { alias: { '@': new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') } });
const { recordPriceIndex } = await jiti.import('@/lib/pricing/indexHistory');

async function fetchItems() {
  const id = store === 'store2' ? process.env.OZON_STORE_2_CLIENT_ID : process.env.OZON_CLIENT_ID;
  const key = store === 'store2' ? process.env.OZON_STORE_2_API_KEY : process.env.OZON_API_KEY;
  const items = [];
  let cursor = '';
  for (;;) {
    const r = await fetch('https://api-seller.ozon.ru/v5/product/info/prices', {
      method: 'POST',
      headers: { 'Client-Id': id, 'Api-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { visibility: 'ALL' }, limit: 1000, cursor }),
    });
    if (!r.ok) throw new Error(`Ozon ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    items.push(...j.items);
    if (!j.cursor || j.items.length < 1000) break;
    cursor = j.cursor;
  }
  return items;
}

if (file && !at) throw new Error('--file ile --at (kayıt zamanı) gerekli');
const items = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : await fetchItems();
const res = await recordPriceIndex(store, items, { force: true, takenAt: at ? new Date(at) : undefined });
const colors = items.reduce((m, i) => ((m[i.price_indexes?.color_index || 'WITHOUT_INDEX'] = (m[i.price_indexes?.color_index || 'WITHOUT_INDEX'] || 0) + 1), m), {});
console.log(JSON.stringify({ store, items: items.length, colors, ...res }));
process.exit(0);
