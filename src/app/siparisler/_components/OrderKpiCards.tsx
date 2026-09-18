'use client';

import React from 'react';
import { OrderStats } from '../types';
import { formatNumber, formatUSD, formatTL } from '@/lib/format';
import { PillBadge } from '@/components/ui/PillBadge';

interface OrderKpiCardsProps {
  stats: OrderStats | null;
  ordersCount: number;
  activeFilter: string;
  onSelectFilter: (filterKey: string) => void;
  totalBuyCost?: number;
}

export const OrderKpiCards: React.FC<OrderKpiCardsProps> = React.memo(
  function OrderKpiCards({ stats, ordersCount, activeFilter, onSelectFilter, totalBuyCost }) {
    const handleFilterClick = (key: string) => {
      if (activeFilter === key) {
        onSelectFilter('all');
      } else {
        onSelectFilter(key);
      }
    };

    const uncalculatedCount =
      stats?.uncalculatedOrders ??
      Math.max(0, (stats?.totalOrders || ordersCount) - (stats?.recordedBuyCount || 0));

    const displayedBuyCost =
      totalBuyCost !== undefined ? totalBuyCost : stats?.totalBuyCostTry || 0;

    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Kart 1: Toplam Sipariş (Vurgulanmaz, sade Soft UI kart) */}
        <div
          onClick={() => onSelectFilter('all')}
          className="group rounded-[24px] bg-surface p-4.5 sm:p-5 transition-all cursor-pointer border border-border-subtle hover:border-border-subtle hover:shadow-hairline shadow-hairline"
          title="Tüm siparişleri listele"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-text-muted">Toplam Sipariş</span>
          </div>
          <div className="mt-2 text-2xl sm:text-[28px] font-medium leading-none tracking-tight tabular-nums text-text-primary">
            {formatNumber(stats?.totalOrders || ordersCount)}
          </div>
        </div>

        {/* Kart 2: Toplam Alım (Maliyet) */}
        <div className="rounded-[24px] bg-surface p-4.5 sm:p-5 border border-border-subtle shadow-hairline">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-text-muted">Toplam Alım</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#D14343]" />
          </div>
          <div className="mt-2 text-2xl sm:text-[28px] font-medium leading-none tracking-tight tabular-nums text-[#D14343]">
            {formatTL(displayedBuyCost)}
          </div>
        </div>

        {/* Kart 3: Toplam Ciro */}
        <div className="rounded-[24px] bg-surface p-4.5 sm:p-5 border border-border-subtle shadow-hairline">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-text-muted">Toplam Ciro</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#2E8B57]" />
          </div>
          <div className="mt-2 text-2xl sm:text-[28px] font-medium leading-none tracking-tight tabular-nums text-[#2E8B57]">
            {formatUSD(stats?.totalRevenueUsd)}
          </div>
        </div>

        {/* Kart 4: Sevk Bekleyen Siparişler */}
        <div
          onClick={() => handleFilterClick('awaiting')}
          className={`group rounded-[24px] p-4.5 sm:p-5 transition-all cursor-pointer border ${
            activeFilter === 'awaiting'
              ? 'bg-[#FDF0E2]/60 border-[#C47A2C]/40 ring-2 ring-[#C47A2C]/20 shadow-xs'
              : 'bg-surface border-border-subtle hover:border-border-subtle hover:shadow-hairline'
          }`}
          title="Sevk bekleyen siparişleri filtrele"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-text-muted">Sevk Bekleyen</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#C47A2C]" />
          </div>
          <div className="mt-2 text-2xl sm:text-[28px] font-medium leading-none tracking-tight tabular-nums text-[#C47A2C]">
            {formatNumber(stats?.awaitingOrders || 0)}
          </div>
        </div>

        {/* Kart 5: İptaller */}
        <div
          onClick={() => handleFilterClick('cancelled')}
          className={`group rounded-[24px] p-4.5 sm:p-5 transition-all cursor-pointer border ${
            activeFilter === 'cancelled'
              ? 'bg-[#FDE7E7]/60 border-[#D14343]/40 ring-2 ring-[#D14343]/20 shadow-xs'
              : 'bg-surface border-border-subtle hover:border-border-subtle hover:shadow-hairline'
          }`}
          title="İptal edilen siparişleri filtrele"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-text-muted">İptaller</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#D14343]" />
          </div>
          <div className="mt-2 text-2xl sm:text-[28px] font-medium leading-none tracking-tight tabular-nums text-[#D14343]">
            {formatNumber(stats?.cancelledOrders || 0)}
          </div>
        </div>

        {/* Kart 6: Hesaplanmayanlar (Alış Fiyatı Eksik Siparişler) */}
        <div
          onClick={() => handleFilterClick('uncalculated')}
          className={`group rounded-[24px] p-4.5 sm:p-5 transition-all cursor-pointer border ${
            activeFilter === 'uncalculated'
              ? 'bg-[#ECEBFD]/60 border-[#5856D6]/40 ring-2 ring-[#5856D6]/20 shadow-xs'
              : 'bg-surface border-border-subtle hover:border-border-subtle hover:shadow-hairline'
          }`}
          title="Alış fiyatı girilmemiş siparişleri filtrele"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-text-muted">Hesaplanmayan</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#5856D6]" />
          </div>
          <div className="mt-2 text-2xl sm:text-[28px] font-medium leading-none tracking-tight tabular-nums text-[#5856D6]">
            {formatNumber(uncalculatedCount)}
          </div>
        </div>
      </div>
    );
  }
);
