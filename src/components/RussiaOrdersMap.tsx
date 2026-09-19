'use client';

import React, { useState, useMemo, memo, useRef, useCallback, useEffect } from 'react';
import { geoConicEqualArea, geoPath } from 'd3-geo';
import {
  MapPin,
  Globe2,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  Tag,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Move,
  Compass,
} from 'lucide-react';
import { RecentOrder } from '@/types/analytics';
import russiaGeoJson from '@/data/russia_geojson.json';
import { getTurkishRegionName } from '@/data/russiaTurkishNames';

interface RussiaOrdersMapProps {
  orders: RecentOrder[];
  loading?: boolean;
}

type ZoomZone = 'all' | 'west' | 'central' | 'east';

const WIDTH = 960;
const HEIGHT = 500;
const MAX_SCALE = 12; // 12 Kat Süper Yüksek Çözünürlüklü Yakınlaşma
const MIN_SCALE = 1;

// 3 Bölgenin Merkez Hedef Koordinatları ve İdeal Büyütme Oranları
const ZONE_TARGETS: Record<ZoomZone, { scale: number; centerX: number; centerY: number; title: string; subtitle: string }> = {
  all: {
    scale: 1,
    centerX: WIDTH / 2,
    centerY: HEIGHT / 2,
    title: 'Tüm Rusya',
    subtitle: 'Kaliningrad’dan Çukotka ve Kamçatka’ya 83 Bölge',
  },
  west: {
    scale: 3.8,
    centerX: 210,
    centerY: 270,
    title: '1. Batı (Avrupa Rusyası & Urallar)',
    subtitle: 'Moskova, St. Petersburg, Kazan, Samara, Rostov, Yekaterinburg',
  },
  central: {
    scale: 3.5,
    centerX: 480,
    centerY: 280,
    title: '2. Sibirya & Orta Rusya',
    subtitle: 'Tyumen, Hantı-Mansiysk (Yugra), Novosibirsk, Krasnoyarsk, Altay',
  },
  east: {
    scale: 3.2,
    centerX: 750,
    centerY: 250,
    title: '3. Uzak Doğu & Pasifik',
    subtitle: 'Yakutistan (Saha), Vladivostok, Habarovsk, Kamçatka, Çukotka',
  },
};

export const RussiaOrdersMap = memo(function RussiaOrdersMap({ orders = [], loading = false }: RussiaOrdersMapProps) {
  const [hoveredOrder, setHoveredOrder] = useState<RecentOrder | null>(null);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [activeZone, setActiveZone] = useState<ZoomZone>('all');

  // Pan & Zoom Durumları (GPU Destekli)
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  // 1. D3 Projeksiyonu: Tek Seferlik Tam Rusya Haritası Hesaplaması
  const { pathGenerator, projection } = useMemo(() => {
    const proj = geoConicEqualArea()
      .parallels([50, 70])
      .rotate([-100, 0])
      .fitSize([WIDTH, HEIGHT], russiaGeoJson as any);

    const pathGen = geoPath().projection(proj);
    return { pathGenerator: pathGen, projection: proj };
  }, []);

  // 2. Performans: SVG Yollarını ve Türkçe Etiketleri Önbelleğe Al
  const { regionPaths, regionLabels } = useMemo(() => {
    const paths: { id: string | number; trName: string; d: string }[] = [];
    const labels: { id: string | number; trName: string; x: number; y: number; priority: boolean }[] = [];

    (russiaGeoJson as any).features.forEach((feature: any, idx: number) => {
      const d = pathGenerator(feature);
      if (!d) return;

      const ruName = feature.properties?.name || feature.properties?.NAME || `Bölge ${idx}`;
      const trName = getTurkishRegionName(ruName);
      const id = feature.id || feature.properties?.id || idx;

      paths.push({ id, trName, d });

      const centroid = pathGenerator.centroid(feature);
      const bounds = pathGenerator.bounds(feature);

      if (centroid && !isNaN(centroid[0]) && !isNaN(centroid[1])) {
        const spanX = bounds[1][0] - bounds[0][0];
        const spanY = bounds[1][1] - bounds[0][1];
        const area = spanX * spanY;

        // "Moskova Bölgesi" (Oblast) etiketini kaldır, sadece ana "Moskova" kalsın
        if (trName === 'Moskova Bölgesi' || ruName === 'Московская область') {
          return;
        }

        if (
          area > 180 ||
          trName === 'Moskova' ||
          trName === 'St. Petersburg' ||
          trName === 'Kırım' ||
          trName === 'Kaliningrad' ||
          trName === 'Çukotka'
        ) {
          labels.push({
            id,
            trName,
            x: Math.round(centroid[0]),
            y: Math.round(centroid[1]),
            priority:
              area > 1200 ||
              trName === 'Moskova' ||
              trName === 'St. Petersburg' ||
              trName === 'Yakutistan (Saha)' ||
              trName === 'Çukotka',
          });
        }
      }
    });

    return { regionPaths: paths, regionLabels: labels };
  }, [pathGenerator]);

  // 3. Sipariş GPS Koordinatlarını Projelendir
  const pinnedOrders = useMemo(() => {
    return orders
      .map((order) => {
        if (!order.latitude || !order.longitude) return null;
        const coords = projection([order.longitude, order.latitude]);
        if (!coords || isNaN(coords[0]) || isNaN(coords[1])) return null;
        return {
          order,
          x: Math.round(coords[0] * 10) / 10,
          y: Math.round(coords[1] * 10) / 10,
        };
      })
      .filter(Boolean) as { order: RecentOrder; x: number; y: number }[];
  }, [orders, projection]);

  // 4. Şehirlere Göre Dağılım Özeti
  const citySummary = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    orders.forEach((o) => {
      const city = o.customerCity || 'Bilinmeyen Şehir';
      if (!map[city]) map[city] = { count: 0, total: 0 };
      map[city].count += 1;
      map[city].total += o.totalPrice || 0;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
  }, [orders]);

  // Bölgeye Yumuşak Animasyonla Yakınlaşma Fonksiyonu
  const flyToZone = useCallback((zone: ZoomZone) => {
    const target = ZONE_TARGETS[zone];
    setActiveZone(zone);
    setIsAnimating(true);

    if (zone === 'all') {
      setScale(1);
      setPan({ x: 0, y: 0 });
    } else {
      const newScale = target.scale;
      const targetPanX = WIDTH / 2 - target.centerX * newScale;
      const targetPanY = HEIGHT / 2 - target.centerY * newScale;

      setScale(newScale);
      setPan({ x: Math.round(targetPanX), y: Math.round(targetPanY) });
    }

    setTimeout(() => {
      setIsAnimating(false);
    }, 700);
  }, []);

  // Haritayı Sıfırla (Çıkış)
  const resetZoom = useCallback(() => {
    flyToZone('all');
  }, [flyToZone]);

  // Fare Tekeriyle İmleç Odaklı Yakınlaşma (Google Maps Stili)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault(); // Sayfanın aşağı kaymasını engelle

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Yakınlaşma katsayısı
      const zoomFactor = e.deltaY < 0 ? 1.25 : 0.8;
      
      setScale((prevScale) => {
        const nextScale = Math.min(Math.max(prevScale * zoomFactor, MIN_SCALE), MAX_SCALE);
        
        if (nextScale === MIN_SCALE) {
          setPan({ x: 0, y: 0 });
          setActiveZone('all');
          return MIN_SCALE;
        }

        // İmlecin altındaki noktanın sabit kalmasını sağlayan matematiksel kaydırma
        const scaleRatio = nextScale / prevScale;
        setPan((prevPan) => ({
          x: Math.round(mouseX - (mouseX - prevPan.x) * scaleRatio),
          y: Math.round(mouseY - (mouseY - prevPan.y) * scaleRatio),
        }));

        return nextScale;
      });

      setIsAnimating(false);
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, []);

  // Manuel Zoom Butonları (+ / -)
  const handleZoomIn = () => {
    setIsAnimating(true);
    setScale((prev) => Math.min(prev * 1.4, MAX_SCALE));
    setTimeout(() => setIsAnimating(false), 300);
  };

  const handleZoomOut = () => {
    setIsAnimating(true);
    setScale((prev) => {
      const next = Math.max(prev / 1.4, MIN_SCALE);
      if (next === MIN_SCALE) {
        setPan({ x: 0, y: 0 });
        setActiveZone('all');
      }
      return next;
    });
    setTimeout(() => setIsAnimating(false), 300);
  };

  // Fareyle Sürükleyerek Dolaşma (Pan / Drag)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setIsAnimating(false);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    setPan({
      x: dragStartRef.current.panX + deltaX,
      y: dragStartRef.current.panY + deltaY,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Klavye ESC ile Yakınlaştırmadan Çıkış
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && scale > 1) {
        resetZoom();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scale, resetZoom]);

  // Çözünürlük ve Netliği Koruyan Dinamik Vektör Hesaplamaları
  const strokeWidth = useMemo(() => {
    return Math.max(0.15, 0.75 / Math.sqrt(scale));
  }, [scale]);

  const labelFontSize = useMemo(() => {
    return Math.max(3.8, 7.5 / Math.pow(scale, 0.38));
  }, [scale]);

  const pinCoreRadius = useMemo(() => {
    return Math.max(1.8, 5.5 / Math.sqrt(scale));
  }, [scale]);

  const pinPingRadius = useMemo(() => {
    return Math.max(4.5, 14 / Math.sqrt(scale));
  }, [scale]);

  const getStatusBadge = (status: string, statusName: string) => {
    switch (status) {
      case 'awaiting_packaging':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-2.5 h-2.5" />
            {statusName || 'Paketleme Bekliyor'}
          </span>
        );
      case 'awaiting_deliver':
      case 'awaiting_registration':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Package className="w-2.5 h-2.5" />
            {statusName || 'Sevkiyat Bekliyor'}
          </span>
        );
      case 'delivering':
      case 'driver_pickup':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Truck className="w-2.5 h-2.5" />
            {statusName || 'Kargoda'}
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-2.5 h-2.5" />
            {statusName || 'Teslim Edildi'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
            {statusName || 'İşleniyor'}
          </span>
        );
    }
  };

  return (
    <div className="w-full bg-[#0D1320] rounded-2xl border border-slate-800/80 p-5 sm:p-6 shadow-xl backdrop-blur-md transition-all relative overflow-hidden">
      {/* Kart Başlığı & Kontrol Araç Çubuğu */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <Globe2 className="w-4.5 h-4.5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                Sipariş Coğrafyası (İnteraktif Rusya Haritası)
              </h3>
              {scale > 1 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                  <Move className="w-2.5 h-2.5 animate-pulse" />
                  {scale.toFixed(1)}x Zoom (Fare Tekeri & Sürükleme)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {scale > 1
                ? 'Fare tekeriyle istediğiniz noktaya yakınlaşabilir ve basılı tutarak serbestçe gezinebilirsiniz'
                : ZONE_TARGETS[activeZone].subtitle}
            </p>
          </div>
        </div>

        {/* 3 Bölge Hızlı Yakınlaşma Seçicisi & Araçlar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Bölge Butonları Grubu */}
          <div className="inline-flex p-1 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-medium shadow-inner">
            <button
              type="button"
              onClick={() => flyToZone('all')}
              className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeZone === 'all' && scale === 1
                  ? 'bg-slate-800 text-cyan-400 shadow-xs font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Tüm Rusya</span>
            </button>

            <button
              type="button"
              onClick={() => flyToZone('west')}
              className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeZone === 'west'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-xs font-semibold'
                  : 'text-slate-400 hover:text-cyan-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span>1. Batı (Avrupa)</span>
            </button>

            <button
              type="button"
              onClick={() => flyToZone('central')}
              className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeZone === 'central'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-xs font-semibold'
                  : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>2. Sibirya</span>
            </button>

            <button
              type="button"
              onClick={() => flyToZone('east')}
              className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeZone === 'east'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-xs font-semibold'
                  : 'text-slate-400 hover:text-purple-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              <span>3. Uzak Doğu</span>
            </button>
          </div>

          {/* İsimleri Aç/Kapat */}
          <button
            type="button"
            onClick={() => setShowLabels(!showLabels)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              showLabels
                ? 'bg-slate-800 border-slate-700 text-cyan-400'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Eyalet ve Bölge İsimlerini Aç/Kapat"
          >
            <Tag className="w-3 h-3" />
            <span>Türkçe İsimler</span>
          </button>
        </div>
      </div>

      {/* Harita SVG Konteyneri (12x Vektör Süper Çözünürlük & Fare Tekeri) */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`relative w-full bg-black rounded-xl border border-slate-800/80 p-0 overflow-hidden flex items-center justify-center min-h-[380px] sm:min-h-[480px] select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ contain: 'paint' }}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto max-h-[500px] select-none pointer-events-none"
          style={{ shapeRendering: 'geometricPrecision' }}
        >
          {/* Donanım Hızlandırmalı Zoom & Pan Katmanı */}
          <g
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              transition: isAnimating ? 'transform 0.65s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
              willChange: 'transform',
            }}
            className="pointer-events-auto"
          >
            {/* 1. Rusya Eyaletleri & Bölgeleri (Ultra Keskin Vektör) */}
            <g className="regions">
              {regionPaths.map(({ id, trName, d }) => (
                <path
                  key={id}
                  d={d}
                  fill="#162238"
                  stroke="#2A3B58"
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="hover:fill-[#28416B] hover:stroke-[#60a5fa] transition-colors duration-75 cursor-pointer"
                >
                  <title>{trName}</title>
                </path>
              ))}
            </g>

            {/* 2. Türkçe Eyalet & Bölge İsimleri Katmanı (Dinamik Ölçeklenen Netlik) */}
            {showLabels && (
              <g className="region-labels pointer-events-none">
                {regionLabels.map(({ id, trName, x, y, priority }) => (
                  <text
                    key={`label-${id}`}
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`font-semibold tracking-wider select-none ${
                      scale > 2.5
                        ? 'fill-slate-100'
                        : priority
                        ? 'fill-slate-200/95'
                        : 'fill-slate-300/80'
                    }`}
                    style={{
                      fontSize: `${labelFontSize}px`,
                      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.95))',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {trName}
                  </text>
                ))}
              </g>
            )}

            {/* 3. Sipariş Konum Pinleri (Dinamik Boyutlanan Kristal Beacon) */}
            <g className="order-pins">
              {pinnedOrders.map(({ order, x, y }, i) => (
                <g
                  key={order.postingNumber || i}
                  transform={`translate(${x}, ${y})`}
                  className="cursor-pointer group pointer-events-auto"
                  onMouseEnter={() => setHoveredOrder(order)}
                  onMouseLeave={() => setHoveredOrder(null)}
                >
                  {/* Dış Radar Halkası (Pulsing Ping) */}
                  <circle
                    r={pinPingRadius}
                    className="animate-ping fill-emerald-400/20 stroke-emerald-400/50 pointer-events-none"
                    style={{ animationDuration: '2.4s' }}
                  />

                  {/* Orta Parlayan Çekirdek */}
                  <circle
                    r={pinCoreRadius}
                    fill="#10b981"
                    stroke="#047857"
                    strokeWidth={Math.max(0.4, 1.2 / Math.sqrt(scale))}
                    className="opacity-95 group-hover:scale-130 transition-transform"
                  />

                  {/* İç Beyaz Nokta */}
                  <circle
                    r={Math.max(0.8, pinCoreRadius * 0.38)}
                    fill="#ffffff"
                    className="pointer-events-none"
                  />
                </g>
              ))}
            </g>
          </g>
        </svg>

        {/* Sol Üst: Yakınlaştırmadan Çıkış / Sıfırla Floating Butonu */}
        {scale > 1 && (
          <div className="absolute top-4 left-4 flex items-center gap-2 z-20 animate-in fade-in slide-in-from-top-2 duration-200">
            <button
              type="button"
              onClick={resetZoom}
              className="px-3 py-1.5 rounded-xl bg-slate-900/95 hover:bg-slate-800 border border-cyan-500/40 text-xs font-semibold text-cyan-300 shadow-2xl backdrop-blur-md flex items-center gap-1.5 transition-all cursor-pointer hover:border-cyan-400"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tam Haritaya Dön (ESC)</span>
            </button>

            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/80 border border-slate-800 text-[11px] text-slate-400 backdrop-blur-md pointer-events-none">
              <Move className="w-3 h-3 text-cyan-400" />
              <span>Fare Tekeriyle Zoom / Sürükleyin</span>
            </div>
          </div>
        )}

        {/* Sağ Alt: Hassas Zoom (+ / -) ve Sıfırlama Butonları */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-20">
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-white flex items-center justify-center shadow-lg backdrop-blur-md transition-all cursor-pointer hover:text-cyan-400"
            title="Yakınlaş (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-white flex items-center justify-center shadow-lg backdrop-blur-md transition-all cursor-pointer hover:text-cyan-400"
            title="Uzaklaş (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          {scale > 1 && (
            <button
              type="button"
              onClick={resetZoom}
              className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 flex items-center justify-center shadow-lg backdrop-blur-md transition-all cursor-pointer hover:text-emerald-400"
              title="Görünümü Sıfırla (1x)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sipariş Detay Kartı Tooltip (Hover Floating Card) */}
        {hoveredOrder && (
          <div
            className="absolute z-30 p-3.5 rounded-xl bg-[#0B111E]/95 border border-cyan-500/40 shadow-2xl backdrop-blur-md text-white max-w-xs animate-in zoom-in-95 fade-in duration-100 pointer-events-none"
            style={{
              top: '15px',
              right: '15px',
            }}
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 shrink-0 overflow-hidden p-0.5 flex items-center justify-center">
                {hoveredOrder.products?.[0]?.primaryImage ? (
                  <img
                    src={hoveredOrder.products[0].primaryImage}
                    alt={hoveredOrder.products[0].name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Package className="w-6 h-6 text-slate-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate" title={hoveredOrder.products?.[0]?.name}>
                  {hoveredOrder.products?.[0]?.name || 'Ozon Ürünü'}
                </div>
                <div className="text-[10px] font-mono text-cyan-400 mt-0.5">
                  {hoveredOrder.products?.[0]?.offerId || `#${hoveredOrder.postingNumber}`}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                  <span className="text-[11px] font-medium text-slate-200 truncate">
                    {hoveredOrder.customerCity || 'Rusya'}
                    {hoveredOrder.customerRegion && ` (${getTurkishRegionName(hoveredOrder.customerRegion)})`}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <div>{getStatusBadge(hoveredOrder.status, hoveredOrder.statusName)}</div>
              <div className="font-mono font-bold text-emerald-400">
                ${hoveredOrder.totalPrice ? Math.round(hoveredOrder.totalPrice).toLocaleString() : '0'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Şehir Dağılım Çubukları / Özet Listesi */}
      {citySummary.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800/60">
          <div className="text-[11px] uppercase font-semibold text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-cyan-400" />
            <span>En Çok Sipariş Alan Şehirler</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {citySummary.map(([cityName, stat]) => (
              <div
                key={cityName}
                className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center gap-2 text-xs"
              >
                <span className="font-medium text-slate-200">{cityName}</span>
                <span className="px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 font-mono text-[10px] font-bold border border-cyan-500/20">
                  {stat.count} Sipariş
                </span>
                <span className="text-[11px] font-mono text-emerald-400 font-medium">
                  ${Math.round(stat.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
