'use client';

import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs';
import { formatNumber, formatUSD } from '@/lib/format';
import { Change, SectionHeading, dayLabel, usd, type ProfitData, type PulseData } from './shared';

type Metric = 'orders' | 'revenue' | 'profit';
type Period = 7 | 30;

const METRICS: { value: Metric; label: string }[] = [
  { value: 'orders', label: 'Sipariş' },
  { value: 'revenue', label: 'Ciro' },
  { value: 'profit', label: 'Kâr' },
];

interface Point {
  date: string;
  /** Sipariş ya da ciro; kârda kesin kısım */
  value: number;
  /** Kârda tahmini kısım */
  estimated: number;
  orders: number;
}

const fmt = (metric: Metric, n: number) => (metric === 'orders' ? formatNumber(n) : usd(n));

/**
 * Tek satış grafiği: Sipariş / Ciro / Kâr ve 7 / 30 gün seçilir (Amazon'daki satış özeti gibi).
 * Sipariş ve ciro Ozon'dan canlı (son 30 gün), kâr veri tabanından (kesin + tahmini). Bugün soluk.
 */
export function SalesChart({ pulse, profit }: { pulse: PulseData | null; profit: ProfitData | null }) {
  const [metric, setMetric] = useState<Metric>('orders');
  const [period, setPeriod] = useState<Period>(30);

  const series = useMemo<Point[] | null>(() => {
    if (metric === 'profit') {
      return profit ? profit.last30.map((d) => ({ date: d.date, value: d.knownUsd, estimated: d.estimatedUsd, orders: d.orders })) : null;
    }
    return pulse
      ? pulse.daily.map((d) => ({ date: d.date, value: metric === 'orders' ? d.orders : d.revenueUsd, estimated: 0, orders: d.orders }))
      : null;
  }, [metric, pulse, profit]);

  const points = series?.slice(-period) ?? null;
  // 7 günlükte önceki 7 günle karşılaştırılır; 30 günlük için daha eski veri okunmuyor
  const previous = period === 7 ? series?.slice(-14, -7) : null;
  const sum = (list: Point[]) => list.reduce((s, p) => s + p.value + p.estimated, 0);
  const total = points ? sum(points) : 0;
  const prevTotal = previous?.length === 7 ? sum(previous) : null;

  const dailyProfitTarget = profit ? profit.targetUsd / profit.monthDays : null;
  const ticks = points
    ? period === 7
      ? points.map((p) => p.date)
      : points.filter((_, i) => i % 6 === 0 || i === points.length - 1).map((p) => p.date)
    : [];

  return (
    <section className="space-y-3">
      <SectionHeading title="Satışlar">
        <div className="flex items-center gap-2">
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList className="h-8">
              {METRICS.map((m) => (
                <TabsTrigger key={m.value} value={m.value} className="px-3 text-xs">
                  {m.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs value={String(period)} onValueChange={(v) => setPeriod(Number(v) as Period)}>
            <TabsList className="h-8">
              <TabsTrigger value="7" className="px-3 text-xs">
                7 gün
              </TabsTrigger>
              <TabsTrigger value="30" className="px-3 text-xs">
                30 gün
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </SectionHeading>

      {!points ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-semibold tabular-nums">{fmt(metric, total)}</span>
            <span className="text-sm text-muted-foreground">son {period} gün</span>
            {prevTotal !== null && (
              <span className="text-sm text-muted-foreground tabular-nums">
                · önceki 7 gün {fmt(metric, prevTotal)} <Change now={total} before={prevTotal} />
              </span>
            )}
            {metric === 'profit' && (
              <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-chart-2" />
                  Kesin
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-chart-2 opacity-35" />
                  Tahmini
                </span>
              </span>
            )}
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap={period === 7 ? '25%' : 3}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  ticks={ticks}
                  tickFormatter={(v: string) => dayLabel(v, period === 7 ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' })}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={metric === 'orders' ? 28 : 52}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                  allowDecimals={false}
                  tickFormatter={(v: number) => (metric === 'orders' ? String(v) : usd(v))}
                  domain={
                    metric === 'orders'
                      ? [0, (max: number) => Math.max(max, pulse!.target.max + 1)]
                      : metric === 'profit' && dailyProfitTarget
                        ? [(min: number) => Math.min(0, min), (max: number) => Math.max(max, dailyProfitTarget * 1.15)]
                        : [0, 'auto']
                  }
                />
                {metric === 'orders' && pulse && (
                  <ReferenceArea y1={pulse.target.min} y2={pulse.target.max} fill="var(--muted-foreground)" fillOpacity={0.12} />
                )}
                {metric === 'profit' && dailyProfitTarget && (
                  <ReferenceLine y={dailyProfitTarget} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.7} />
                )}
                <Tooltip
                  cursor={{ fill: 'var(--muted)' }}
                  content={({ active, payload }) => {
                    const d = payload?.[0]?.payload as Point | undefined;
                    if (!active || !d) return null;
                    return (
                      <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md">
                        <div className="font-medium">{dayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'long' })}</div>
                        {metric === 'orders' && <div className="tabular-nums">{d.orders} sipariş</div>}
                        {metric === 'revenue' && (
                          <div className="tabular-nums">
                            {formatUSD(d.value)} · {d.orders} sipariş
                          </div>
                        )}
                        {metric === 'profit' && (
                          <>
                            <div className="tabular-nums">
                              {usd(d.value + d.estimated, 2)} · {d.orders} sipariş
                            </div>
                            {d.estimated !== 0 && <div className="text-muted-foreground tabular-nums">{usd(d.estimated, 2)} tahmini</div>}
                          </>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" stackId="v" fill="var(--chart-2)" radius={metric === 'profit' ? 0 : [3, 3, 0, 0]}>
                  {points.map((p, i) => (
                    // Bugün henüz bitmedi: soluk
                    <Cell key={p.date} fillOpacity={i === points.length - 1 ? 0.45 : 1} />
                  ))}
                </Bar>
                {metric === 'profit' && <Bar dataKey="estimated" stackId="v" fill="var(--chart-2)" fillOpacity={0.35} radius={[3, 3, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">
            {metric === 'orders' && `Gri bant günlük hedef (${pulse?.target.min}–${pulse?.target.max} sipariş). `}
            {metric === 'profit' && dailyProfitTarget && `Kesik çizgi aylık hedefin günlük payı (${usd(dailyProfitTarget)}). `}
            {metric === 'profit' ? 'Kâr veri tabanından; alışı girilmemiş siparişler tahmini.' : 'Ozon’dan canlı; iptaller sayılmaz.'}
          </p>
        </>
      )}
    </section>
  );
}
