'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

export interface AreaChartPoint {
  label: string;
  value: number;
}

interface AreaChartProps {
  points: AreaChartPoint[];
  color: string;
  /** Y ekseni etiketleri (kısaltılmış biçim). */
  formatAxis: (value: number) => string;
  /** İpucu kutusundaki tam değer. */
  formatValue: (value: number) => string;
  /** İpucunun altına düşen ikinci satır. */
  renderMeta?: (index: number) => React.ReactNode;
  /** Grafik kabına yayılır; bu değer yalnızca alt sınırdır. */
  minHeight?: number;
}

const PADDING = { top: 14, right: 10, bottom: 26, left: 54 };
const TICK_COUNT = 4;

/**
 * Ekseni okunur tutan yuvarlak adım. Basamak listesi sık tutuldu: 1 → 2
 * gibi büyük sıçramalar tepe noktasını grafiğin yarısına düşürüp alanı
 * boş bırakıyordu.
 */
const STEP_MULTIPLIERS = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];

function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const exponent = Math.floor(Math.log10(rough));
  const base = 10 ** exponent;
  const normalized = rough / base;
  const multiplier = STEP_MULTIPLIERS.find((m) => normalized <= m) ?? 10;
  return multiplier * base;
}

/**
 * Fritsch–Carlson monoton kübik interpolasyon: eğri yumuşak kalır ama
 * veri noktaları arasında sıfırın altına sarkmaz.
 */
function monotonePath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M${points[0].x},${points[0].y}`;
  if (n === 2) return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    slope[i] = (points[i + 1].y - points[i].y) / dx[i];
  }

  const tangent: number[] = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const sum = a * a + b * b;
    if (sum > 9) {
      const tau = 3 / Math.sqrt(sum);
      tangent[i] = tau * a * slope[i];
      tangent[i + 1] = tau * b * slope[i];
    }
  }

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${points[i].x + h},${points[i].y + tangent[i] * h} ${points[i + 1].x - h},${
      points[i + 1].y - tangent[i + 1] * h
    } ${points[i + 1].x},${points[i + 1].y}`;
  }
  return d;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    setSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

/**
 * Tek serilik alan grafiği. Grafik kütüphanesi yerine doğrudan SVG:
 * eksen, ızgara ve ipucu tipografisi sayfanın geri kalanıyla aynı
 * token'ları kullanır, dışarıdan gelen hiçbir stil araya girmez.
 */
export function AreaChart({
  points,
  color,
  formatAxis,
  formatValue,
  renderMeta,
  minHeight = 248,
}: AreaChartProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const gradientId = useId();

  const width = size.width;
  const height = Math.max(minHeight, size.height);

  const innerWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const innerHeight = height - PADDING.top - PADDING.bottom;

  const { ticks, max } = useMemo(() => {
    const peak = Math.max(...points.map((p) => p.value), 0);
    const step = niceStep(peak / TICK_COUNT || 1);
    return {
      ticks: Array.from({ length: TICK_COUNT + 1 }, (_, i) => i * step),
      max: step * TICK_COUNT,
    };
  }, [points]);

  const coords = useMemo(() => {
    if (points.length === 0 || innerWidth <= 0) return [];
    const stride = points.length > 1 ? innerWidth / (points.length - 1) : 0;

    return points.map((point, index) => ({
      x: PADDING.left + (points.length > 1 ? index * stride : innerWidth / 2),
      y: PADDING.top + innerHeight - (point.value / max) * innerHeight,
    }));
  }, [points, innerWidth, innerHeight, max]);

  const linePath = useMemo(() => monotonePath(coords), [coords]);

  const areaPath = useMemo(() => {
    if (coords.length === 0) return '';
    const baseline = PADDING.top + innerHeight;
    return `${linePath}L${coords[coords.length - 1].x},${baseline}L${coords[0].x},${baseline}Z`;
  }, [coords, linePath, innerHeight]);

  /** Yoğun eksende her etiketi basmak yerine eşit aralıklı ~6 tanesi. */
  const labelIndexes = useMemo(() => {
    if (points.length === 0) return [];
    const desired = Math.min(points.length, innerWidth > 640 ? 8 : 5);
    if (points.length <= desired) return points.map((_, index) => index);

    const gap = (points.length - 1) / (desired - 1);
    return Array.from({ length: desired }, (_, i) => Math.round(i * gap));
  }, [points, innerWidth]);

  const handlePointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (coords.length === 0) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - bounds.left;

      let nearest = 0;
      let best = Infinity;
      coords.forEach((point, index) => {
        const distance = Math.abs(point.x - x);
        if (distance < best) {
          best = distance;
          nearest = index;
        }
      });
      setHoverIndex(nearest);
    },
    [coords]
  );

  const active = hoverIndex !== null ? coords[hoverIndex] : null;
  const tooltipLeft = active
    ? Math.min(Math.max(active.x, PADDING.left + 68), Math.max(width - 76, PADDING.left + 68))
    : 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full min-w-0 overflow-hidden"
      style={{ minHeight }}
      onPointerMove={handlePointer}
      onPointerLeave={() => setHoverIndex(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {ticks.map((tick) => {
            const y = PADDING.top + innerHeight - (tick / max) * innerHeight;
            return (
              <g key={tick}>
                <line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth={1}
                />
                <text
                  x={PADDING.left - 10}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="#949DAA"
                  fontSize={11}
                  className="tabular-nums"
                >
                  {formatAxis(tick)}
                </text>
              </g>
            );
          })}

          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {labelIndexes.map((index) => (
            <text
              key={index}
              x={coords[index]?.x ?? 0}
              y={height - 8}
              textAnchor={
                index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'
              }
              fill="#949DAA"
              fontSize={11}
            >
              {points[index]?.label}
            </text>
          ))}

          {active && (
            <g>
              <line
                x1={active.x}
                x2={active.x}
                y1={PADDING.top}
                y2={PADDING.top + innerHeight}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
              />
              <circle cx={active.x} cy={active.y} r={4} fill={color} stroke="#111317" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}

      {active && hoverIndex !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-[132px] -translate-x-1/2 rounded-lg border border-hairline-strong bg-panel-raised px-3 py-2 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.75)]"
          style={{ left: tooltipLeft, top: 0 }}
        >
          <div className="text-2xs text-ink-subtle">{points[hoverIndex].label}</div>
          <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">
            {formatValue(points[hoverIndex].value)}
          </div>
          {renderMeta?.(hoverIndex)}
        </div>
      )}
    </div>
  );
}
