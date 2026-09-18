/**
 * MapLibre GL 6, worker'ını ayrı bir ESM dosyası olarak yükler ve adresini
 * `import.meta.url`den türetir. Turbopack bu değeri http(s) URL'ine çevirmediği
 * için worker isteği uygulamanın HTML 404 sayfasına düşüyor ve harita hiç
 * çizilmiyor ("non-JavaScript MIME type" hatası).
 *
 * Çözüm: worker'ı ve yanındaki paylaşılan modülü `public/maplibre/` altına
 * kopyalayıp `setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')` demek.
 * Bu betik dev ve build öncesi çalışır, böylece maplibre-gl güncellendiğinde
 * kopyalar da tazelenir.
 */
import { existsSync, mkdirSync, copyFileSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'node_modules', 'maplibre-gl', 'dist');
const OUT_DIR = join(ROOT, 'public', 'maplibre');

// Worker, kardeşi olan shared modülü './maplibre-gl-shared.mjs' ile çağırıyor;
// ikisi de aynı klasörde durmak zorunda.
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

if (!existsSync(SRC_DIR)) {
  console.warn('[maplibre] node_modules/maplibre-gl bulunamadı, kopyalama atlandı.');
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });

let copied = 0;
for (const file of FILES) {
  const from = join(SRC_DIR, file);
  const to = join(OUT_DIR, file);
  if (!existsSync(from)) {
    console.error(`[maplibre] Kaynak yok: ${file}. maplibre-gl sürümü değişmiş olabilir.`);
    process.exit(1);
  }
  // Aynı içerikse tekrar yazma; dev sunucusu boşuna yeniden derlemesin.
  if (existsSync(to) && statSync(from).size === statSync(to).size) {
    if (readFileSync(from).equals(readFileSync(to))) continue;
  }
  copyFileSync(from, to);
  copied += 1;
}

console.log(
  copied ? `[maplibre] ${copied} worker dosyası public/maplibre/ altına kopyalandı.` : '[maplibre] worker dosyaları güncel.'
);
