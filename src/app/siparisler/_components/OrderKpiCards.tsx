'use client';

import React from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
import { cn } from '@/lib/utils';
import { formatNumber, formatTL, formatUSD } from '@/lib/format';
import { OrderStats } from '../types';

interface OrderKpiCardsProps {
  stats: OrderStats | null;
  ordersCount: number;
  activeFilter: string;
  onSelectFilter: (filterKey: string) => void;
  totalBuyCost?: number;
}

interface Kpi {
  label: string;
  value: string;
  dot?: string;
  /** Tıklanınca uygulanan durum filtresi. */
  filter?: string;
  hint?: string;
}

export const OrderKpiCards: React.FC<OrderKpiCardsProps> = React.memo(function OrderKpiCards({
  stats,
  ordersCount,
  activeFilter,
  onSelectFilter,
  totalBuyCost,
}) {
  const uncalculatedCount =
    stats?.uncalculatedOrders ??
    Math.max(0, (stats?.totalOrders || ordersCount) - (stats?.recordedBuyCount || 0));

  const displayedBuyCost = totalBuyCost !== undefined ? totalBuyCost : stats?.totalBuyCostTry || 0;

  const kpis: Kpi[] = [
    { label: 'Toplam sipariş', value: formatNumber(stats?.totalOrders || ordersCount), filter: 'all', hint: 'Tüm siparişleri listele' },
    { label: 'Toplam alım', value: formatTL(displayedBuyCost) },
    { label: 'Toplam ciro', value: formatUSD(stats?.totalRevenueUsd) },
    { label: 'Sevk bekleyen', value: formatNumber(stats?.awaitingOrders || 0), dot: 'bg-amber-500', filter: 'awaiting', hint: 'Sevk bekleyenleri filtrele' },
    { label: 'İptaller', value: formatNumber(stats?.cancelledOrders || 0), dot: 'bg-rose-500', filter: 'cancelled', hint: 'İptalleri filtrele' },
    { label: 'Hesaplanmayan', value: formatNumber(uncalculatedCount), dot: 'bg-purple-500', filter: 'uncalculated', hint: 'Alış fiyatı girilmemişleri filtrele' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      {kpis.map((kpi) => {
        const active = kpi.filter !== undefined && kpi.filter !== 'all' && activeFilter === kpi.filter;
        const body = (
          <Card
            className={cn(
              'h-full gap-0 py-4 transition-colors',
              kpi.filter && 'group-hover:bg-muted/50',
              active && 'border-primary bg-muted/50'
            )}
          >
            <CardHeader className="gap-2 px-4">
              <CardDescription className="flex items-center gap-2">
                {kpi.dot && <span className={cn('size-2 rounded-full', kpi.dot)} />}
                {kpi.label}
              </CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">{kpi.value}</CardTitle>
            </CardHeader>
          </Card>
        );

        if (!kpi.filter) return <div key={kpi.label}>{body}</div>;

        return (
          <button
            key={kpi.label}
            type="button"
            title={kpi.hint}
            aria-pressed={kpi.filter === 'all' ? undefined : active}
            // Seçili karta yeniden tıklamak filtreyi kaldırır.
            onClick={() => onSelectFilter(kpi.filter === 'all' || active ? 'all' : kpi.filter!)}
            className="group rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {body}
          </button>
        );
      })}
    </div>
  );
});
