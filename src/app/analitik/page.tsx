'use client';

import React, { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertCircle, RefreshCw } from 'lucide-react';

import DateRangePicker from '@/components/DateRangePicker';
import { RecentOrdersCard } from '@/components/RecentOrdersCard';
import { useAnalytics } from './useAnalytics';
import { SegmentedControl } from '@/components/ui/Panel';
import { StatStrip } from './_components/StatStrip';
import { TrendPanel } from './_components/TrendPanel';
import { FunnelPanel } from './_components/FunnelPanel';
import { TopProductsPanel } from './_components/TopProductsPanel';
import { ProductTableModal } from './_components/ProductTableModal';
import { GeographyModal } from './_components/GeographyModal';
import { formatClock } from '@/lib/format';
import styles from '@/styles/console.module.css';

const OrdersMap = dynamic(
  () => import('@/components/RussiaLeafletMap').then((mod) => mod.RussiaLeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] rounded-panel border border-hairline bg-panel" />
    ),
  }
);

const STORES = [
  { value: 'store1' as const, label: 'Avrupa' },
  { value: 'store2' as const, label: 'Türkiye' },
];

function AnalyticsPageContent() {
  const [isProductsModalOpen, setIsProductsModalOpen] = useState(false);
  const [isGeographyModalOpen, setIsGeographyModalOpen] = useState(false);

  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    store,
    setStore,
    summary,
    days,
    hourlyOrders,
    recentOrders,
    updatedAt,
    summaryLoading,
    productsLoading,
    loading,
    error,
    sortBy,
    sortOrder,
    handleSort,
    applySort,
    searchQuery,
    setSearchQuery,
    topProducts,
    filteredProducts,
    fetchAnalytics,
  } = useAnalytics();

  const storeLabel = STORES.find((s) => s.value === store)?.label ?? '';
  const stamp = formatClock(updatedAt);

  /** Kategori sırası kartı tabloyu doğrudan sıraya göre dizili açar. */
  const openRanking = () => {
    applySort('position', 'asc');
    setIsProductsModalOpen(true);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {/* Dar ekranda başlık ve kontroller alt alta geçer; tek satırda
            sıkıştırmak başlığı "Anal…" hâline getiriyordu. */}
        <div
          className={`${styles.shell} flex flex-col gap-2.5 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0`}
        >
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Analitik</h1>
            <p className="mt-0.5 truncate text-2xs text-ink-subtle">
              {storeLabel} mağazası
              {stamp && ` · ${stamp} itibarıyla`}
            </p>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
            <SegmentedControl options={STORES} value={store} onChange={setStore} size="md" />

            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
            />

            <button
              type="button"
              onClick={() => fetchAnalytics(true)}
              disabled={loading}
              title="Verileri yenile"
              aria-label="Verileri yenile"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-hairline bg-panel-sunken text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink disabled:cursor-default disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className={`${styles.shell} space-y-4 pb-16 pt-5`}>
        {error && (
          <div className="flex items-center justify-between gap-4 rounded-panel border border-loss/30 bg-loss-soft px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-loss" />
              <p className="truncate text-2xs text-ink-muted">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => fetchAnalytics(true)}
              className="shrink-0 cursor-pointer rounded-md border border-hairline-strong px-2.5 py-1 text-2xs font-medium text-ink transition-colors hover:bg-white/5"
            >
              Tekrar dene
            </button>
          </div>
        )}

        <StatStrip
          summary={summary}
          loading={summaryLoading}
          onOpenRanking={openRanking}
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <TrendPanel days={days} hourlyOrders={hourlyOrders} loading={summaryLoading} />
          </div>
          <FunnelPanel summary={summary} loading={summaryLoading} />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <OrdersMap
              orders={recentOrders}
              loading={summaryLoading}
              onOpenGeography={() => setIsGeographyModalOpen(true)}
            />
          </div>
          <div className="min-h-[420px] xl:h-[420px]">
            <TopProductsPanel
              products={topProducts}
              loading={productsLoading}
              onOpenAll={() => setIsProductsModalOpen(true)}
            />
          </div>
        </div>

        <RecentOrdersCard orders={recentOrders} loading={summaryLoading} />
      </main>

      <ProductTableModal
        open={isProductsModalOpen}
        onClose={() => setIsProductsModalOpen(false)}
        products={filteredProducts}
        loading={productsLoading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        avgPosition={summary?.avgPositionCategory ?? 0}
      />

      <GeographyModal
        open={isGeographyModalOpen}
        onClose={() => setIsGeographyModalOpen(false)}
        orders={recentOrders}
        dateRange={{ from: startDate, to: endDate }}
        loading={summaryLoading}
      />
    </div>
  );
}

/**
 * `useAnalytics` mağaza seçimini URL'den okuyor; `useSearchParams` statik
 * sayfada Suspense sınırı olmadan production build'ini kırıyor.
 */
export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <AnalyticsPageContent />
    </Suspense>
  );
}
