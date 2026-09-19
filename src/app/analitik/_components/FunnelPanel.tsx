'use client';

import React from 'react';
import { AnalyticsSummary } from '@/types/analytics';
import { Panel } from '@/components/ui/Panel';
import { formatNumber, formatPercent, rate } from '@/lib/format';

interface FunnelPanelProps {
  summary: AnalyticsSummary | null;
  loading: boolean;
}

/**
 * Gösterimden siparişe kadar olan dört aşama. Her aşamanın çubuğu ilk
 * aşamaya oranlıdır; sağdaki yüzde ise bir önceki aşamadan devam etme
 * oranını verir — asıl okunması gereken sayı budur.
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

  const top = stages[0].value || 1;
  const searchShare = rate(searchViews, views) ?? 0;
  const recommendationShare = 100 - searchShare;

  return (
    <Panel
      title="Dönüşüm hunisi"
      caption="Gösterimden siparişe geçiş oranları"
      className="h-full"
    >
      <div className="flex h-full flex-col justify-between gap-6">
        <ol className="space-y-3.5">
          {stages.map((stage, index) => {
            const previous = index === 0 ? null : stages[index - 1].value;
            const step = index === 0 ? null : rate(stage.value, previous);
            const width = Math.max(1.5, (stage.value / top) * 100);
            const isLast = index === stages.length - 1;

            return (
              <li key={stage.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-2xs text-ink-muted">{stage.label}</span>

                  {loading ? (
                    <span className="skeleton h-3.5 w-16" />
                  ) : (
                    <span className="flex items-baseline gap-2">
                      <span
                        className={`text-[13px] font-semibold tabular-nums ${
                          isLast ? 'text-gain' : 'text-ink'
                        }`}
                      >
                        {formatNumber(stage.value)}
                      </span>
                      {step !== null && (
                        <span className="w-11 text-right text-2xs tabular-nums text-ink-subtle">
                          {formatPercent(step)}
                        </span>
                      )}
                    </span>
                  )}
                </div>

                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                  {!loading && (
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                        isLast ? 'bg-gain' : 'bg-brand'
                      }`}
                      style={{ width: `${width}%`, opacity: isLast ? 1 : 1 - index * 0.22 }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>

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
