import type { StyleSpecification } from 'maplibre-gl';

/**
 * Analitik haritasının koyu stili: openmaptiles/dark-matter-gl-style,
 * kaynağı anahtarsız OpenFreeMap tile'larına çevrilmiş hâliyle.
 */

/** Hazır stillerin üzerine yazdığımız renkler. */
export const MAP_COLORS = {
  water: '#2b2b2b',
};

/**
 * Eyalet/oblast sınırlarının açılacağı zoom. Hazır stiller bunu z0'dan çiziyor,
 * o yüzden dünya görünümünde ülkeler iç çizgilerle dolu görünüyordu.
 */
export const ADMIN_BORDER_MIN_ZOOM = 4;

/**
 * Yer adlarının açılacağı zoom seviyeleri. Ülke adları hariç hepsi hazır
 * stillerde z0'dan çiziliyor; açılış ekranı isim kaynamasın diye geciktiriyoruz.
 */
export const PLACE_LABEL_MIN_ZOOM = {
  /** Eyalet / oblast adları — odak seviyesinden bir tık yakında. */
  state: 5,
  /** Şehir ve kasabalar — bir tık daha yakında. */
  city: 6,
  /** Köy, mahalle, mezra. */
  minor: 8,
};

const OPENFREEMAP_TILES = 'https://tiles.openfreemap.org/planet';
const OPENFREEMAP_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

// ─────────────────────────────────────────────────────────────
// Ortak yamalar
// ─────────────────────────────────────────────────────────────

const fetchStyle = async (url: string, label: string): Promise<StyleSpecification> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} alınamadı (HTTP ${res.status})`);
  return (await res.json()) as StyleSpecification;
};

/**
 * Suyu `MAP_COLORS.water` tonuna çeker. OpenMapTiles şemasında okyanus/göl
 * `water`, nehirler `waterway` kaynak katmanından gelir; ikisini de aynı renge
 * boyuyoruz ki ayrışmasınlar.
 */
const applyWaterColor = (style: StyleSpecification) => {
  for (const layer of style.layers) {
    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'];
    const paint = (layer as { paint?: Record<string, unknown> }).paint;
    if (!paint) continue;
    if (sourceLayer === 'water' && layer.type === 'fill') paint['fill-color'] = MAP_COLORS.water;
    if (sourceLayer === 'waterway' && layer.type === 'line') {
      paint['line-color'] = MAP_COLORS.water;
      /**
       * Nehirler varsayılan 1px ile çizildiği için uzakta kayboluyordu.
       * Veri z3'ten önce zaten yok; z3-6 arasında çizgiyi kalınlaştırıyoruz.
       */
      paint['line-width'] = ['interpolate', ['linear'], ['zoom'], 3, 1.4, 6, 1.8, 10, 2.4, 14, 3.5];
    }
  }
};

/**
 * Ülke altı sınırları odak seviyesinde açar, bir tık uzakta kapatır.
 *
 * İki hazır stil de yalnızca admin_level 4'ü (eyalet/oblast) çiziyor; veride
 * 6 (ilçe/şehir) da var. Filtreyi 3-6 aralığına genişletiyoruz ki şehir
 * sınırları da gelsin. Ülke sınırına (level 2) dokunmuyoruz.
 */
export const isSubCountryBorderLayer = (layer: {
  type?: string;
  filter?: unknown;
  'source-layer'?: string;
}) => {
  if (layer.type !== 'line') return false;
  if (layer['source-layer'] !== 'boundary') return false;
  // admin_level 2'ye eşitlik arayan katman ülke sınırıdır.
  return !/"admin_level"\]?,\s*2\]/.test(JSON.stringify(layer.filter ?? ''));
};

const delayAdminBorders = (style: StyleSpecification) => {
  for (const layer of style.layers) {
    if (!isSubCountryBorderLayer(layer)) continue;

    (layer as { minzoom?: number }).minzoom = ADMIN_BORDER_MIN_ZOOM;
    // Modern ifade sözdizimi, stilin eski filtre yazımından bağımsız çalışır.
    (layer as { filter?: unknown }).filter = [
      'all',
      ['>=', ['get', 'admin_level'], 3],
      ['<=', ['get', 'admin_level'], 6],
      ['!=', ['get', 'maritime'], 1],
    ];
  }
};

/** Symbol katmanı ülke adı mı çiziyor? */
const isCountryLabelLayer = (layer: {
  type?: string;
  filter?: unknown;
  'source-layer'?: string;
}) =>
  layer.type === 'symbol' &&
  layer['source-layer'] === 'place' &&
  JSON.stringify(layer.filter ?? '').includes('"country"');

/**
 * `name:en`in istediğimiz karşılığı vermediği ülkeler. ISO 3166-1 alpha-2 kodu
 * ile eşleşir. Değerler zaten büyük harfle yazılır: stil `text-transform`
 * uygulasa da Türkçe'de "i" büyütülünce "I" olacağı için doğrudan "İ" yazıyoruz.
 */
export const COUNTRY_LABEL_OVERRIDES: Record<string, string> = {
  TR: 'TÜRKİYE',
  IL: 'PALESTINE',
};

/**
 * Ülke adlarını İngilizceye sabitler. İki stil de `name:latin` kullanıyor —
 * o alan yerel adın Latin harfli hâli, yani "EESTI", "SUOMI" çıkıyor.
 * Veride `name:en` mevcut; yoksa sırayla latin ve ham ada düşülür.
 */
const useEnglishCountryLabels = (style: StyleSpecification) => {
  const fallback = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
  const overrides = Object.entries(COUNTRY_LABEL_OVERRIDES);

  const textField = overrides.length
    ? [
        'match',
        ['get', 'iso_a2'],
        ...overrides.flatMap(([code, label]) => [code, label]),
        fallback,
      ]
    : fallback;

  for (const layer of style.layers) {
    if (!isCountryLabelLayer(layer)) continue;
    const layout = (layer as { layout?: Record<string, unknown> }).layout;
    if (!layout) continue;
    layout['text-field'] = textField;
  }
};

/**
 * Yer adlarını kademeli olarak geciktirir. Ülke adlarına dokunmuyoruz —
 * filtresinde `country` geçen katmanlar onlar.
 */
const delayPlaceLabels = (style: StyleSpecification) => {
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue;
    if ((layer as { 'source-layer'?: string })['source-layer'] !== 'place') continue;

    const filter = JSON.stringify((layer as { filter?: unknown }).filter ?? '');
    if (filter.includes('"country"')) continue;

    const minzoom = filter.includes('"state"')
      ? PLACE_LABEL_MIN_ZOOM.state
      : /"city"|"town"/.test(filter)
        ? PLACE_LABEL_MIN_ZOOM.city
        : PLACE_LABEL_MIN_ZOOM.minor;

    const current = (layer as { minzoom?: number }).minzoom ?? 0;
    (layer as { minzoom?: number }).minzoom = Math.max(current, minzoom);
  }
};

// ─────────────────────────────────────────────────────────────
// openmaptiles/dark-matter-gl-style
// Depodaki style.json kaynağı MapTiler'a bağlı ve `{key}` bekliyor.
// Şema OpenMapTiles olduğu için kaynağı anahtarsız OpenFreeMap'e çeviriyoruz.
// ─────────────────────────────────────────────────────────────

const DARK_MATTER_STYLE_URL =
  'https://raw.githubusercontent.com/openmaptiles/dark-matter-gl-style/master/style.json';

export const loadDarkMatter = async (): Promise<StyleSpecification> => {
  const style = await fetchStyle(DARK_MATTER_STYLE_URL, 'Dark Matter stili');

  style.sources = {
    ...style.sources,
    openmaptiles: { type: 'vector', url: OPENFREEMAP_TILES },
  };
  style.glyphs = OPENFREEMAP_GLYPHS;
  // Depo sprite'ı MapTiler'da; anahtarsız çalışsın diye kaldırıyoruz.
  delete (style as { sprite?: unknown }).sprite;

  /**
   * Stil "Metropolis" ailesini istiyor, OpenFreeMap yalnızca Noto Sans sunuyor.
   * Eşlemezsek her etiket isteği 404 dönüyor ve harita tamamen yazısız kalıyor.
   */
  for (const layer of style.layers) {
    const layout = (layer as { layout?: Record<string, unknown> }).layout;
    const font = layout?.['text-font'];
    if (!Array.isArray(font)) continue;
    const joined = font.join(' ');
    layout!['text-font'] = [
      /Italic/i.test(joined)
        ? 'Noto Sans Italic'
        : /Bold|Black|SemiBold|Medium/i.test(joined)
          ? 'Noto Sans Bold'
          : 'Noto Sans Regular',
    ];
  }

  applyWaterColor(style);
  delayAdminBorders(style);
  delayPlaceLabels(style);
  useEnglishCountryLabels(style);

  return style;
};
