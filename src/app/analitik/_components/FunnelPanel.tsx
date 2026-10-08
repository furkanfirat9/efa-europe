'use client';

import React from 'react';
import { ArrowDown } from 'lucide-react';
import { AnalyticsSummary } from '@/types/analytics';
import { Panel } from '@/components/ui/Panel';
import { formatNumber, formatPercent, rate } from '@/lib/format';

interface FunnelPanelProps {
  summary: AnalyticsSummary | null;
  loading: boolean;
}

const SLICE_HEIGHT = 52;
const SLICE_GAP = 4;
/** Huninin alt ucu, ağız genişliğine oranla. */
const FUNNEL_TIP = 0.3;
/** 1'den büyüdükçe kenarlar içe kavislenir: ağız geniş, gövde dar. */
const FUNNEL_CURVE = 1.4;

/**
 * Huninin y derinliğindeki yarı genişliği, çizim alanının yüzdesi olarak (0–50).
 * Biçim sabittir, değere oranlı değildir: aşamalar arasında yüzlerce kat fark
 * var, oranlı çizilse alt dilimler görünmez olurdu. Sayılar dilimin içinde yazar.
 */
function halfWidthAt(y: number, height: number) {
  const t = y / height;
  return 50 * (FUNNEL_TIP + (1 - FUNNEL_TIP) * (1 - t) ** FUNNEL_CURVE);
}

/** Bir dilimin yolu. Kenarlar örneklenir; dilimler tek bir kavisli huninin parçaları olur. */
function slicePath(top: number, bottom: number, height: number) {
  const samples = 8;
  const ys = Array.from({ length: samples + 1 }, (_, i) => top + ((bottom - top) * i) / samples);
  const point = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const right = ys.map((y) => point(50 + halfWidthAt(y, height), y));
  const left = [...ys].reverse().map((y) => point(50 - halfWidthAt(y, height), y));
  return `M${[...right, ...left].join('L')}Z`;
}

/**
 * Gösterimden siparişe kadar olan dört aşama, huni biçiminde. Dilimlerin
 * arasındaki yüzde bir önceki aşamadan devam etme oranını verir — asıl
 * okunması gereken sayı budur.
 */
export function FunnelPanel({ summary, loading }: FunnelPanelProps) {
  const views = summary?.hitsViewTotal ?? 0;
  const searchViews = summary?.hitsViewSearch ?? 0;
  const recommendationViews = Math.max(0, views - searchViews);

  const stages = [
    { label: 'Gösterim', value: views },
    { label: 'Ürün ziyareti', value: summary?.hitsViewPdp ?? 0 },
    { label: 'Sepete ekleme', value: summary?.hitsToCart ?? 0 },
    { label: 'Sipariş', value: summary?.orderedUnits ?? 0 },
  ];

  const height = stages.length * SLICE_HEIGHT + (stages.length - 1) * SLICE_GAP;
  const slices = stages.map((stage, index) => {
    const top = index * (SLICE_HEIGHT + SLICE_GAP);
    const step = index === 0 ? null : rate(stage.value, stages[index - 1].value);
    // Geçiş oranı iki dilimin arasındaki boşluğun hizasında durur.
    const seam = top - SLICE_GAP / 2;
    return {
      ...stage,
      top,
      step: loading ? null : step,
      seam,
      path: slicePath(top, top + SLICE_HEIGHT, height),
      edge: 50 + halfWidthAt(seam, height),
      isLast: index === stages.length - 1,
    };
  });
  const lastTop = slices[slices.length - 1].top;

  const searchShare = rate(searchViews, views) ?? 0;
  const recommendationShare = 100 - searchShare;

  return (
    <Panel
      title="Dönüşüm hunisi"
      caption="Gösterimden siparişe geçiş oranları"
      className="h-full"
    >
      <div className="flex h-full flex-col justify-between gap-6">
        {/* Sağdaki boşluk geçiş oranlarına ayrılır; geniş ekranda huni yayvanlaşmasın diye sınırlı. */}
        <div className="relative mx-auto w-full max-w-[26rem] pr-16">
          <div className="absolute inset-y-0 left-0 right-16" aria-hidden>
            <svg
              className="h-full w-full"
              viewBox={`0 0 100 ${height}`}
              preserveAspectRatio="none"
            >
              <defs>
                {/* Mavi dilimler aşağı doğru koyulaşır; sipariş dilimi yeşil kalır. */}
                <linearGradient
                  id="funnel-fill"
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2={lastTop}
                >
                  <stop offset="0" style={{ stopColor: 'var(--color-brand)' }} />
                  <stop
                    offset="1"
                    style={{ stopColor: 'var(--color-brand)', stopOpacity: 0.55 }}
                  />
                </linearGradient>
              </defs>

              {slices.map((slice) => (
                <path
                  key={slice.label}
                  d={slice.path}
                  className={loading ? 'fill-white/5' : slice.isLast ? 'fill-gain' : undefined}
                  fill={loading || slice.isLast ? undefined : 'url(#funnel-fill)'}
                />
              ))}

              {slices.map(
                (slice) =>
                  slice.step !== null && (
                    <line
                      key={slice.label}
                      x1={slice.edge + 2}
                      x2={100}
                      y1={slice.seam}
                      y2={slice.seam}
                      className="stroke-hairline-strong"
                      strokeDasharray="2 3"
                      vectorEffect="non-scaling-stroke"
                    />
                  ),
              )}
            </svg>
          </div>

          <ol className="relative flex flex-col" style={{ gap: SLICE_GAP }}>
            {slices.map((slice) => (
              <li
                key={slice.label}
                className="flex flex-col items-center justify-center"
                style={{ height: SLICE_HEIGHT }}
              >
                <span
                  className={`text-2xs leading-tight ${
                    loading
                      ? 'text-ink-subtle'
                      : slice.isLast
                        ? 'text-ink-foreground/70'
                        : 'text-white/75'
                  }`}
                >
                  {slice.label}
                </span>
                {loading ? (
                  <span className="skeleton mt-1 h-4 w-12" />
                ) : (
                  <span
                    className={`text-[15px] font-semibold leading-snug tabular-nums ${
                      slice.isLast ? 'text-ink-foreground' : 'text-white'
                    }`}
                  >
                    {formatNumber(slice.value)}
                  </span>
                )}

                {slice.step !== null && (
                  <span
                    title="Önceki aşamadan geçiş oranı"
                    className="absolute left-full ml-1.5 inline-flex -translate-y-1/2 items-center gap-0.5 whitespace-nowrap rounded-full border border-hairline-strong bg-panel-sunken px-1.5 py-px text-2xs font-medium tabular-nums text-ink-muted"
                    style={{ top: slice.seam }}
                  >
                    <ArrowDown className="h-2.5 w-2.5 text-ink-subtle" aria-hidden />
                    {formatPercent(slice.step)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="border-t border-hairline pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-2xs font-medium text-ink-muted">Gösterim kaynağı</span>
            <span className="text-2xs tabular-nums text-ink-subtle">
              {formatNumber(views)} toplam
            </span>
          </div>

          <div className="mt-2.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-white/5">
            {!loading && views > 0 && (
              <>
                <div className="h-full rounded-full bg-brand" style={{ width: `${searchShare}%` }} />
                <div
                  className="h-full rounded-full bg-brand/35"
                  style={{ width: `${recommendationShare}%` }}
                />
              </>
            )}
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <div className="min-w-0">
                <dt className="truncate text-2xs text-ink-subtle">Arama</dt>
                <dd className="text-2xs font-medium tabular-nums text-ink">
                  {loading ? '—' : `${formatNumber(searchViews)} · ${formatPercent(searchShare, 0)}`}
                </dd>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand/35" />
              <div className="min-w-0">
                <dt className="truncate text-2xs text-ink-subtle">Öneri &amp; vitrin</dt>
                <dd className="text-2xs font-medium tabular-nums text-ink">
                  {loading
                    ? '—'
                    : `${formatNumber(recommendationViews)} · ${formatPercent(recommendationShare, 0)}`}
                </dd>
              </div>
            </div>
          </dl>
        </div>
      </div>
    </Panel>
  );
}
