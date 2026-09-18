'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowRight, Layers, MapPin, Package, X } from 'lucide-react';
import { RecentOrder } from '@/types/analytics';
import { getTurkishRegionName } from '@/data/russiaTurkishNames';
import { Panel } from '@/components/ui/Panel';
import { OrderStatus } from '@/components/OrderStatus';
import { formatMoney, formatNumber } from '@/lib/format';
import { ADMIN_BORDER_MIN_ZOOM, isSubCountryBorderLayer, loadDarkMatter } from '@/lib/mapStyles';
import { ensureMapLibreWorker } from '@/lib/maplibre';
import styles from './RussiaLeafletMap.module.css';

interface RussiaLeafletMapProps {
  orders: RecentOrder[];
  loading?: boolean;
  onOpenGeography?: () => void;
}

/** Aynı koordinattaki siparişler tek bir işaret altında toplanır. */
interface OrderGroup {
  key: string;
  lat: number;
  lng: number;
  city: string;
  region?: string;
  /** En yeni sipariş başta. */
  orders: RecentOrder[];
  latestTime: number;
  total: number;
}

/** Tooltip popup'a HTML string olarak verilir; kaçış yapılmazsa ürün adı düzeni bozar. */
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string
  );

const timeOf = (order: RecentOrder) =>
  order.inProcessAt ? new Date(order.inProcessAt).getTime() : 0;

/**
 * Ozon siparişlerin bir kısmında şehri boş döndürüyor ama bölgeyi veriyor.
 * Haritanın tamamı Rusya olduğu için "Rusya" etiketi hiçbir şey söylemiyor;
 * sırayla şehir → bölge → Rusya denenir.
 */
const placeLabel = (order: RecentOrder) =>
  order.customerCity || getTurkishRegionName(order.customerRegion || '') || 'Rusya';

/** Ekranda bu piksel mesafesinden yakın kartlar tek kartta birleşir. */
const CLUSTER_RADIUS_PX = 80;

/** Kümede en fazla kaç konum satırı yazılır; gerisi "+N konum daha" olur. */
const MAX_CLUSTER_ROWS = 3;

/** Ekran koordinatında birleştirilmiş kart. */
interface FlagCluster {
  key: string;
  lngLat: [number, number];
  point: { x: number; y: number };
  groups: OrderGroup[];
  /** Üyelerin en yenisinin `groups` içindeki sırası; dalga vurgusu buna bakar. */
  latestIndex: number;
}

/** Bağlayıcı çizginin dikey yüksekliği. */
const CONNECTOR_HEIGHT = 20;

/** Çakışan kartlar arasında bırakılan boşluk. */
const CARD_GAP_PX = 10;

/** Kart bu kadar piksellik kaymayı aşarsa çizgi okunmaz olur; kaydırma durur. */
const MAX_CARD_SHIFT_PX = 180;

/**
 * Kartı koordinata bağlayan çizgiyi çizer. Kart yana kaymamışsa düz dikey
 * çizgi; kaymışsa noktadan yukarı çıkıp yana kırılan ve kartın altına varan
 * dirsek. SVG merkezi noktanın üstünde durur, bu yüzden genişlik kaymanın
 * iki katı alınır.
 */
const drawConnector = (svg: SVGSVGElement, shift: number) => {
  const half = Math.max(Math.abs(shift), 1);
  const width = half * 2 + 2;
  const height = CONNECTOR_HEIGHT;
  const cx = width / 2;
  const tx = cx + shift;
  const mid = height / 2;

  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML =
    shift === 0
      ? `<path d="M ${cx} 0 V ${height}" />`
      : `<path d="M ${tx} 0 V ${mid} H ${cx} V ${height}" />`;
};

/**
 * Çerçeveleme payı. `fitBounds` yalnızca koordinatları hesaba katıyor, oysa
 * kart noktanın yukarısına ve iki yanına taşıyor; sabit pay verilince kenardaki
 * kartlar panelin dışında kalıyordu. Pay kart kutusundan türetiliyor:
 * yukarıda çizgi + kart yüksekliği, yanlarda kart genişliğinin yarısı.
 *
 * Panel 420px yüksekliğinde olduğu için pay konteyner oranıyla sınırlanıyor;
 * aksi hâlde küçük ekranda pay tuvali yutup görünümü aşırı uzaklaştırırdı.
 */
const fitPadding = (map: maplibregl.Map) => {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  return {
    top: Math.min(CONNECTOR_HEIGHT + 66, height * 0.34),
    bottom: Math.min(30, height * 0.12),
    left: Math.min(124, width * 0.28),
    right: Math.min(124, width * 0.28),
  };
};

/** Koordinattaki noktanın çapı; kartı taşıyan çizgi bunun üstünde durur. */
const FLAG_DOT_SIZE = 7;

/** Halka animasyonunun tur süresi; gecikmeler bu aralığa yayılır (CSS ile aynı). */
const RIPPLE_CYCLE_MS = 3600;

/** Ürün görseli yoksa kutu kalmasın diye sade bir paket simgesi. */
const THUMB_FALLBACK =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">' +
  '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/></svg>'

export function RussiaLeafletMap({
  orders = [],
  loading = false,
  onOpenGeography,
}: RussiaLeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const pinElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  /** Kart çakışması ölçüm sonrası çözülür; iptal edilebilmesi için tutuluyor. */
  const resolveRef = useRef<number | null>(null);
  /** Stil ağdan geldiği için pinleri harita hazır olmadan basamayız. */
  const [mapReady, setMapReady] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const located = useMemo(
    () =>
      orders.filter(
        (order) => Number.isFinite(order.latitude) && Number.isFinite(order.longitude)
      ),
    [orders]
  );

  const unlocatedCount = orders.length - located.length;

  /**
   * Gruplar eskiden yeniye sıralanır: pinler bu sırayla belirir ve listenin
   * sonundaki (en yeni) grup dalga yayan işaret olur.
   */
  const groups = useMemo<OrderGroup[]>(() => {
    const byCoordinate = new Map<string, OrderGroup>();

    located.forEach((order) => {
      const lat = order.latitude as number;
      const lng = order.longitude as number;
      const key = `${lat},${lng}`;

      let group = byCoordinate.get(key);
      if (!group) {
        group = {
          key,
          lat,
          lng,
          city: placeLabel(order),
          region: order.customerRegion,
          orders: [],
          latestTime: 0,
          total: 0,
        };
        byCoordinate.set(key, group);
      }

      group.orders.push(order);
      group.total += order.totalPrice || 0;
      group.latestTime = Math.max(group.latestTime, timeOf(order));
    });

    const list = Array.from(byCoordinate.values());
    list.forEach((group) => group.orders.sort((a, b) => timeOf(b) - timeOf(a)));
    return list.sort((a, b) => a.latestTime - b.latestTime);
  }, [located]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.key === selectedKey) ?? null,
    [groups, selectedKey]
  );

  /** Şehir zaten bölge adına düşmüşse başlıkta aynı adı iki kez yazmayalım. */
  const selectedRegionLabel = useMemo(() => {
    if (!selectedGroup?.region) return null;
    const label = getTurkishRegionName(selectedGroup.region);
    return label && label !== selectedGroup.city ? label : null;
  }, [selectedGroup]);

  /**
   * 1. Haritayı bir kez kur. Stil (dark-matter, OpenFreeMap verisiyle) ağdan
   * geldiği için kurulum asenkron; hazır olunca `mapReady` ile pinler basılır.
   */
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    let cancelled = false;
    let map: maplibregl.Map | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const start = async () => {
      ensureMapLibreWorker();
      const style = await loadDarkMatter();
      if (cancelled || !mapContainerRef.current) return;

      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style,
        center: [60.0, 58.0],
        zoom: 3,
        minZoom: 2,
        maxZoom: 16,
        attributionControl: false,
      });

      map.on('error', (event) => {
        console.error('[maplibre:analitik]', event.error?.message ?? event);
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

      // Panel açılıp kapandığında container yeniden ölçülür.
      resizeObserver = new ResizeObserver(() => map?.resize());
      resizeObserver.observe(mapContainerRef.current);

      mapInstanceRef.current = map;
      /**
       * `load` beklenmezse fitBounds henüz varsayılan boyuttaki tuvale göre
       * hesaplanıyor ve görünüm siparişlere oturmuyor.
       */
      map.once('load', () => {
        if (!cancelled) setMapReady(true);
      });
    };

    void start().catch((err) => {
      console.error('[maplibre:analitik] stil yüklenemedi', err);
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      map?.remove();
      mapInstanceRef.current = null;
      setMapReady(false);
    };
  }, []);

  // 2. Grupları işaretle ve görünümü bunlara göre çerçevele.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    const bounds = new maplibregl.LngLatBounds();
    let hasPoint = false;
    groups.forEach((group) => {
      bounds.extend([group.lng, group.lat]);
      hasPoint = true;
    });

    /**
     * Kartlar noktadan çok daha geniş; aynı şehirdeki siparişlerde üst üste
     * biniyorlar. Ekran koordinatında birbirine yakın olanları tek kartta
     * topluyoruz. Küme sabit coğrafi yarıçapla değil piksel mesafesiyle
     * kuruluyor, dolayısıyla yaklaştıkça kümeler kendiliğinden çözülüyor.
     * Kart ilk üyenin koordinatına oturur — böylece nokta hep gerçek bir
     * siparişin üstünde durur, ortalama bir noktada değil.
     */
    const buildClusters = (): FlagCluster[] => {
      const clusters: FlagCluster[] = [];

      groups.forEach((group, index) => {
        const point = map.project([group.lng, group.lat]);
        const near = clusters.find(
          (cluster) => Math.hypot(cluster.point.x - point.x, cluster.point.y - point.y) <= CLUSTER_RADIUS_PX
        );

        if (near) {
          near.groups.push(group);
          near.latestIndex = Math.max(near.latestIndex, index);
          return;
        }

        clusters.push({
          key: group.key,
          lngLat: [group.lng, group.lat],
          point,
          groups: [group],
          latestIndex: index,
        });
      });

      return clusters;
    };

    const rowHtml = (group: OrderGroup) => {
      const product = group.orders[0].products?.[0];
      const count = group.orders.length;
      const thumb = product?.primaryImage
        ? `<img src="${escapeHtml(product.primaryImage)}" alt="" loading="lazy" />`
        : THUMB_FALLBACK;
      const countSuffix =
        count > 1 ? ` <span class="${styles.flagCount}">· ${formatNumber(count)} sipariş</span>` : '';

      return `
        <div class="${styles.flagRow}">
          <div class="${styles.flagThumb}">${thumb}</div>
          <div class="${styles.flagText}">
            <span class="${styles.flagName}" title="${escapeHtml(product?.name || '')}">${escapeHtml(
              product?.name || 'Ozon ürünü'
            )}</span>
            <span class="${styles.flagPrice}">${formatMoney(group.total)}${countSuffix}</span>
          </div>
        </div>`;
    };

    /** `animate` yalnızca ilk çizimde açık; zoom sonrası yeniden kurulumda
     *  giriş animasyonu baştan oynamasın diye kapatılıyor. */
    const render = (animate: boolean) => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      pinElementsRef.current.clear();

      const clusters = buildClusters();
      const connectors: { element: HTMLElement; connector: SVGSVGElement }[] = [];

      clusters.forEach((cluster, index) => {
        const isLatest = cluster.latestIndex === groups.length - 1;
        // Toplam giriş süresi sabit kalsın; 60 kart da 6 kart da ~700ms'de yerleşir.
        const delay = animate ? Math.round((index / Math.max(1, clusters.length - 1)) * 700) : 0;
        /**
         * Dalga gecikmesi döngü boyunca eşit dağıtılır: noktalar birlikte değil
         * sırayla atar, böylece hareket metronom yerine akış gibi okunur.
         */
        const rippleDelay =
          delay + 420 + Math.round((index / Math.max(1, clusters.length)) * RIPPLE_CYCLE_MS);

        const wrapper = document.createElement('div');
        /**
         * Kart koordinatın yukarısına doğru uzandığı için kuzeydeki bir işaretin
         * noktası ve çizgisi, güneydeki kartın üstüne biniyordu. Güneydeki
         * (enlemi küçük olan) işaret daha yüksek z-index alır, böylece kart
         * kendi kuzeyindeki her şeyin önünde kalır.
         */
        wrapper.style.zIndex = String(Math.round((90 - cluster.lngLat[1]) * 100));

        const element = document.createElement('div');
        element.className = `${styles.flag}${isLatest ? ` ${styles.latest}` : ''}`;
        element.style.setProperty('--flag-delay', `${delay}ms`);
        element.style.setProperty('--ripple-delay', `${rippleDelay}ms`);

        const shown = cluster.groups.slice(0, MAX_CLUSTER_ROWS);
        const hidden = cluster.groups.length - shown.length;
        const more =
          hidden > 0
            ? `<div class="${styles.flagMore}">+${formatNumber(hidden)} konum daha</div>`
            : '';
        const title = cluster.groups.map((group) => group.city).join(' · ');

        element.innerHTML = `
          <div class="${styles.flagCard}" title="${escapeHtml(title)}">
            ${shown.map(rowHtml).join('')}
            ${more}
          </div>
          <svg class="${styles.flagConnector}"></svg>
          <span class="${styles.flagDot}"></span>`;

        const connector = element.querySelector('svg') as SVGSVGElement;
        drawConnector(connector, 0);
        connectors.push({ element, connector });
        wrapper.appendChild(element);

        element.addEventListener('click', (event) => {
          event.stopPropagation();
          if (cluster.groups.length === 1) {
            setSelectedKey(cluster.groups[0].key);
            map.easeTo({ center: cluster.lngLat, zoom: Math.max(map.getZoom(), 6) });
            return;
          }
          // Küme tıklanınca panel yerine yakınlaştırılır; kartlar kendiliğinden ayrılır.
          map.easeTo({ center: cluster.lngLat, zoom: map.getZoom() + 2 });
        });

        /**
         * `anchor: bottom` elemanın alt kenarını koordinata oturtur; noktanın
         * yarıçapı kadar aşağı ötelenince nokta merkezi tam koordinata denk gelir.
         * Kart ürünü ve tutarı zaten gösterdiği için ayrıca tooltip yok; şehir
         * adı kartın `title` özniteliğinde ve tıklanınca açılan panelde duruyor.
         */
        const marker = new maplibregl.Marker({
          element: wrapper,
          anchor: 'bottom',
          offset: [0, FLAG_DOT_SIZE / 2],
        })
          .setLngLat(cluster.lngLat)
          .addTo(map);

        markersRef.current.push(marker);
        if (cluster.groups.length === 1) {
          pinElementsRef.current.set(cluster.groups[0].key, element);
        }
      });

      /**
       * Kartlar noktadan geniş olduğu için ayrı şehirlerde bile yatayda
       * birbirini kısmen örtebiliyor. Yerleşim tamamlandıktan sonra ölçüp
       * batıdan doğuya tarıyoruz: örtüşen kart, önündekinin sağına kadar
       * kaydırılıyor ve bağlayıcı çizgi dirseğe dönüyor.
       */
      resolveRef.current = requestAnimationFrame(() => {
        const placed: DOMRect[] = [];
        const measured = connectors
          .map((entry) => ({ ...entry, rect: entry.element.getBoundingClientRect() }))
          .sort((a, b) => a.rect.left - b.rect.left);

        for (const item of measured) {
          const card = item.element.firstElementChild as HTMLElement | null;
          if (!card) continue;

          let rect = card.getBoundingClientRect();
          let shift = 0;

          for (const other of placed) {
            const overlapsY = rect.top < other.bottom && rect.bottom > other.top;
            const overlapsX = rect.left < other.right && rect.right > other.left;
            if (!overlapsY || !overlapsX) continue;
            const needed = other.right - rect.left + CARD_GAP_PX;
            shift = Math.min(shift + needed, MAX_CARD_SHIFT_PX);
            card.style.setProperty('--flag-shift', `${shift}px`);
            rect = card.getBoundingClientRect();
          }

          if (shift !== 0) drawConnector(item.connector, shift);
          placed.push(rect);
        }
      });
    };

    render(true);
    // Zoom değişince kümeler yeniden hesaplanır; yaklaştıkça kartlar ayrılır.
    const onZoomEnd = () => render(false);
    map.on('zoomend', onZoomEnd);

    if (hasPoint) {
      const fit = { padding: fitPadding(map), maxZoom: 6 } as const;
      /**
       * Eyalet/şehir sınırları odak seviyesinde görünsün. Odak zoom'u sipariş
       * yayılımıyla değiştiği için sabit eşik tutmuyor: çerçeveyi önce
       * hesaplayıp katmanların alt sınırını ona indiriyoruz. Bir tık uzaklaşınca
       * sınırlar yine kaybolur.
       */
      const camera = map.cameraForBounds(bounds, fit);
      if (camera?.zoom !== undefined && camera.center) {
        /**
         * Kesirli zoom olduğu gibi kullanılıyor. Kart kutusu artık `fitPadding`
         * ile hesaba katıldığı için çerçeve zaten geniş; ayrıca tam sayıya
         * yuvarlamak bir seviye daha uzaklaştırıp görünümü gereksiz açıyordu.
         */
        const zoom = camera.zoom;
        // Eşiği azıcık altına alıyoruz ki kayan noktalı fark sınırları gizlemesin.
        const threshold = Math.min(ADMIN_BORDER_MIN_ZOOM, zoom - 0.05);
        for (const layer of map.getStyle()?.layers ?? []) {
          if (isSubCountryBorderLayer(layer)) {
            map.setLayerZoomRange(layer.id, threshold, (layer as { maxzoom?: number }).maxzoom ?? 24);
          }
        }
        map.easeTo({ center: camera.center, zoom });
      } else {
        map.fitBounds(bounds, fit);
      }
    } else {
      map.jumpTo({ center: [95.0, 61.5], zoom: 3 });
    }

    return () => {
      map.off("zoomend", onZoomEnd);
      if (resolveRef.current !== null) cancelAnimationFrame(resolveRef.current);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      pinElementsRef.current.clear();
    };
  }, [groups, mapReady]);

  // Seçili grup listeden düşerse açık kalan panel yanıltıcı olur.
  useEffect(() => {
    if (selectedKey && !groups.some((group) => group.key === selectedKey)) {
      setSelectedKey(null);
    }
  }, [groups, selectedKey]);

  /**
   * Seçili noktanın halkası sınıfla açılıp kapanır. Marker'ları yeniden
   * kurmak giriş animasyonunu her tıklamada baştan oynatırdı.
   */
  useEffect(() => {
    pinElementsRef.current.forEach((element, key) => {
      element.classList.toggle(styles.selected, key === selectedKey);
    });
  }, [selectedKey, groups]);

  /** Nokta sayısı sipariş sayısından az olduğunda sebebi başlıkta yazar. */
  const caption = loading
    ? 'Yükleniyor…'
    : located.length === 0
      ? orders.length > 0
        ? `${formatNumber(orders.length)} siparişin hiçbirinde konum bilgisi yok`
        : 'Konum bilgisi olan sipariş yok'
      : [
          `${formatNumber(located.length)} sipariş`,
          `${formatNumber(groups.length)} konum`,
          unlocatedCount > 0 ? `${formatNumber(unlocatedCount)} konumsuz` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <Panel
      title="Sipariş coğrafyası"
      caption={caption}
      flush
      className="h-[420px]"
      onHeaderClick={onOpenGeography}
      actions={
        onOpenGeography ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenGeography();
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-hairline bg-panel-sunken/80 px-2.5 py-1 text-2xs font-medium text-ink-muted transition-colors hover:border-hairline-strong hover:bg-white/[0.04] hover:text-ink"
            title="Bölge, Eyalet ve Şehir Dağılımını Görüntüle"
          >
            <Layers className="h-3.5 w-3.5 text-brand" />
            <span>Bölge &amp; Şehir Dağılımı</span>
            <ArrowRight className="h-3 w-3 text-ink-faint" />
          </button>
        ) : undefined
      }
    >
      {/* isolate: harita kontrolleri ve popup'ların z-index'i sayfa köküne sızıp
          sabit başlığın üzerine çıkmasın diye kendi yığın bağlamında kalır. */}
      <div className="relative isolate h-full overflow-hidden rounded-b-panel">
        <div ref={mapContainerRef} className={`${styles.map} h-full w-full`} />

        {selectedGroup && (
          <div className="absolute left-4 top-4 z-[1100] flex max-h-[calc(100%-2rem)] w-[min(22rem,calc(100%-2rem))] flex-col rounded-panel border border-hairline-strong bg-panel/95 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.75)] backdrop-blur-sm">
            <div className="flex items-start justify-between gap-2 border-b border-hairline px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                <span className="truncate text-2xs font-medium text-ink">
                  {selectedGroup.city}
                </span>
                {selectedRegionLabel && (
                  <span className="truncate text-2xs text-ink-subtle">
                    {selectedRegionLabel}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                aria-label="Kapat"
                className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-white/[0.06] hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              {selectedGroup.orders.map((order, index) => {
                const product = order.products?.[0];
                const extra = Math.max(0, (order.products?.length || 0) - 1);

                return (
                  <li
                    key={order.postingNumber || index}
                    className="border-b border-hairline px-3.5 py-3 last:border-b-0"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline bg-panel-sunken">
                        {product?.primaryImage ? (
                          <img
                            src={product.primaryImage}
                            alt=""
                            className="h-full w-full object-contain p-0.5"
                            loading="lazy"
                          />
                        ) : (
                          <Package className="h-4 w-4 text-ink-faint" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-2xs font-medium text-ink" title={product?.name}>
                          {product?.name || 'Ozon ürünü'}
                          {extra > 0 && (
                            <span className="ml-1.5 font-normal text-ink-subtle">
                              +{extra} ürün
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-2xs tabular-nums text-ink-subtle">
                          {product?.offerId || order.postingNumber}
                        </p>
                      </div>
                      <span className="shrink-0 text-2xs font-semibold tabular-nums text-gain">
                        {formatMoney(order.totalPrice)}
                      </span>
                    </div>

                    <div className="mt-2 pl-[46px]">
                      <OrderStatus status={order.status} statusName={order.statusName} />
                    </div>
                  </li>
                );
              })}
            </ul>

            {selectedGroup.orders.length > 1 && (
              <div className="flex items-center justify-between border-t border-hairline px-3.5 py-2.5">
                <span className="text-2xs text-ink-subtle">
                  {formatNumber(selectedGroup.orders.length)} sipariş
                </span>
                <span className="text-2xs font-semibold tabular-nums text-gain">
                  {formatMoney(selectedGroup.total)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
