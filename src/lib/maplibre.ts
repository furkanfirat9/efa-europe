import * as maplibregl from 'maplibre-gl';

let configured = false;

/**
 * MapLibre 6 worker'ını ayrı bir ESM dosyasından yükler ve adresini
 * `import.meta.url`den türetir. Turbopack altında o değer http(s) URL'i
 * olmadığı için istek uygulamanın HTML 404 sayfasına düşüyor ve harita hiç
 * çizilmiyor. Dosyalar `scripts/sync_maplibre_worker.mjs` ile public/ altına
 * kopyalanıyor; adresi burada elle veriyoruz.
 *
 * Harita kuran her bileşen, `new maplibregl.Map` çağırmadan önce bunu çağırır.
 */
export const ensureMapLibreWorker = () => {
  if (configured) return;
  maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
  configured = true;
};
