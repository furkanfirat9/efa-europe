import { BORDERS, COAST, LAND, MAP_HEIGHT, MAP_WIDTH } from './europeMapData';

/**
 * Giriş sayfasının sağ yarısındaki harita: Avrupa ve Rusya'nın gerçek ülke sınırları
 * (Natural Earth), tek renk. Renk `currentColor`'dan gelir, yani bulunduğu yüzeyin
 * metin rengini alır.
 */
export function EuropeMap({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className={className} aria-hidden="true">
      {/* Harita kesim kutusunda bitmesin, kenarlara doğru zemine karışsın. */}
      <defs>
        <radialGradient id="europe-map-fade" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </radialGradient>
        <mask id="europe-map-mask">
          <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#europe-map-fade)" />
        </mask>
      </defs>

      {/* Kara, kenarlarda da tam opak: arkadaki yıldızlar karanın içinden görünmesin.
          Rengi panelin zeminiyle aynı olduğu için kendisi görünmez, yalnızca örter. */}
      <path d={LAND} fill="var(--primary)" />

      <g mask="url(#europe-map-mask)">
        <path d={LAND} fill="currentColor" fillOpacity={0.08} />
        <path d={BORDERS} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={0.6} />
        <path d={COAST} fill="none" stroke="currentColor" strokeOpacity={0.4} strokeWidth={0.6} />
      </g>
    </svg>
  );
}
