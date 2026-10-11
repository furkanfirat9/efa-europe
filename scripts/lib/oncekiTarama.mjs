// Fiyat koruması (--max-change) için bir önceki taramanın sonuçları.
// Tarama dosyaları scripts/supply_scan.mjs'in yazdığı adlarla aynı klasörde: <kanal>_<YYYY-MM-DD>.json.
// Fiyat bir günde %50'den fazla oynarsa yazılmıyor; ama önceki tarama da aynı yeni fiyatı okuduysa değişiklik
// gerçektir (2026-10-10: Prime indirim günlerinden sonra normale dönen 18 fiyat her gün bekletiliyordu).

import fs from 'node:fs';
import path from 'node:path';

export function previousScanByAsin(file) {
  const dir = path.dirname(file);
  const m = path.basename(file).match(/^(.+)_(\d{4}-\d{2}-\d{2})\.json$/);
  if (!m) return new Map();
  const prev = fs
    .readdirSync(dir)
    .filter((f) => new RegExp(`^${m[1]}_\\d{4}-\\d{2}-\\d{2}\\.json$`).test(f) && f < path.basename(file))
    .sort()
    .at(-1);
  if (!prev) return new Map();
  const data = JSON.parse(fs.readFileSync(path.join(dir, prev), 'utf8'));
  return new Map((Array.isArray(data) ? data : Object.values(data)).map((s) => [s.asin, s]));
}

// İki okuma aynı fiyat mı (%1 tolerans: kuruş farkları ve yuvarlama)
export const samePrice = (a, b) => a != null && b != null && Math.abs(a / b - 1) <= 0.01;
