'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/shadcn/skeleton';
import { formatNumber, formatPercent, rate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LOOK, when } from '@/app/fiyat-onerisi/_components/ScanStatus';
import { Change, SectionHeading, type MarketData } from './shared';
import { useDashboardData } from './useDashboardData';

interface AnalyticsDay {
  date: string;
  hitsViewSearch: number;
  hitsViewPdp: number;
  hitsToCart: number;
  orderedUnits: number;
}

type StepKey = 'hitsViewSearch' | 'hitsViewPdp' | 'hitsToCart' | 'orderedUnits';
const KEYS: StepKey[] = ['hitsViewSearch', 'hitsViewPdp', 'hitsToCart', 'orderedUnits'];

const DAY_MS = 86_400_000;
const mskDate = (ms: number) => new Date(ms + 3 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * Satış hunisi, son 7 gün önceki 7 günle. Ozon analitiği bir gün gecikmeli dolduğu için bugün
 * sayılmaz. Tek istek (/api/ozon/analytics, summary) 14 günü getirir; ağır uç, yarım saatte bir.
 */
function useFunnel() {
  const range = useMemo(() => {
    const yesterday = Date.now() - DAY_MS;
    return { from: mskDate(yesterday - 13 * DAY_MS), to: mskDate(yesterday), weekStart: mskDate(yesterday - 6 * DAY_MS) };
  }, []);
  const init = useMemo<RequestInit>(
    () => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store: 'store1', mode: 'summary', date_from: range.from, date_to: range.to }),
    }),
    [range]
  );
  const { data, error } = useDashboardData<{ days: AnalyticsDay[] }>('/api/ozon/analytics', { intervalMs: 30 * 60 * 1000, init });

  const totals = useMemo(() => {
    if (!data) return null;
    const sum = (days: AnalyticsDay[]) =>
      Object.fromEntries(KEYS.map((k) => [k, days.reduce((n, d) => n + (Number(d[k]) || 0), 0)])) as Record<StepKey, number>;
    return { week: sum(data.days.filter((d) => d.date >= range.weekStart)), prev: sum(data.days.filter((d) => d.date < range.weekStart)) };
  }, [data, range]);

  return { totals, error };
}

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1 bg-background px-4 py-3', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Huninin geçiş oranları ve tedarik taramasının durumu tek şeritte; ayrıntı kendi sayfasında. */
export function MarketStrip({ market }: { market: { data: MarketData | null; error: string | null } }) {
  const { totals, error } = useFunnel();

  const steps: { label: string; from: StepKey; to: StepKey }[] = [
    { label: 'Arama → kart', from: 'hitsViewSearch', to: 'hitsViewPdp' },
    { label: 'Kart → sepet', from: 'hitsViewPdp', to: 'hitsToCart' },
    { label: 'Sepet → sipariş', from: 'hitsToCart', to: 'orderedUnits' },
  ];

  return (
    <section className="space-y-3">
      <SectionHeading title="Pazar ve tedarik" aside={<span className="text-xs font-normal text-muted-foreground">son 7 gün, önceki 7 günle</span>}>
        <div className="flex gap-3 text-xs">
          <Link href="/analitik" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Analitik
          </Link>
          <Link href="/fiyat-onerisi" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Fiyat önerisi
          </Link>
        </div>
      </SectionHeading>

      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-3 xl:grid-cols-5">
          <Cell label="Aramada gösterim">
            {totals ? (
              <>
                <span className="text-xl font-semibold tabular-nums">{formatNumber(totals.week.hitsViewSearch)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  önceki {formatNumber(totals.prev.hitsViewSearch)} <Change now={totals.week.hitsViewSearch} before={totals.prev.hitsViewSearch} />
                </span>
              </>
            ) : error ? (
              <span className="text-sm text-muted-foreground">Analitik alınamadı</span>
            ) : (
              <Skeleton className="h-10 w-24" />
            )}
          </Cell>

          {steps.map((s) => {
            const now = totals ? rate(totals.week[s.to], totals.week[s.from]) : null;
            const before = totals ? rate(totals.prev[s.to], totals.prev[s.from]) : null;
            return (
              <Cell key={s.label} label={s.label}>
                {totals ? (
                  <>
                    <span className="text-xl font-semibold tabular-nums">{now !== null ? formatPercent(now) : '—'}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      önceki {before !== null ? formatPercent(before) : '—'}{' '}
                      {now !== null && before !== null && <Change now={now} before={before} unit="pt" />}
                    </span>
                  </>
                ) : error ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  <Skeleton className="h-10 w-20" />
                )}
              </Cell>
            );
          })}

          <Cell label="Tedarik taraması" className="col-span-2 md:col-span-2 xl:col-span-1">
            {market.data ? (
              <div className="space-y-1">
                {market.data.scans.map((c) => {
                  const look = LOOK[c.status] ?? LOOK.none;
                  const Icon = look.icon;
                  const stale = c.stale && c.status !== 'running';
                  return (
                    <div key={c.channel} className="flex items-center justify-between gap-2 text-xs" title={c.error ?? undefined}>
                      <span className="flex items-center gap-1.5">
                        <Icon className={cn('size-3.5', stale ? 'text-amber-600' : look.tone, c.status === 'running' && 'animate-spin')} />
                        {c.label}
                      </span>
                      <span className={cn('tabular-nums', stale ? 'text-amber-600' : 'text-muted-foreground')}>
                        {stale ? 'eski' : when(c.finishedAt ?? c.startedAt ?? c.lastDataAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : market.error ? (
              <span className="text-sm text-muted-foreground">Alınamadı</span>
            ) : (
              <Skeleton className="h-12 w-full" />
            )}
          </Cell>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Ozon analitiği bir gün gecikmeli dolar; bugün sayılmaz.</p>
    </section>
  );
}
