'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { PillTabs } from '@/components/ui/PillTabs';
import { PillBadge } from '@/components/ui/PillBadge';
import { StatCard } from '@/components/ui/StatCard';
import { formatTL, formatUSD } from '@/lib/format';
import { useEuropeAccounting } from '@/hooks/useEuropeAccounting';
import { InvoiceHeroCard } from './InvoiceHeroCard';
import { TaxBreakdownCard } from './TaxBreakdownCard';
import { InvoiceDetailsCard } from './InvoiceDetailsCard';

/** Girilen alış fiyatı oranını 10 noktalık dizi olarak gösterir (AGENTS.md §5.6). */
function CoverageDots({ done, total }: { done: number; total: number }) {
  const filled = total > 0 ? Math.round((done / total) * 10) : 0;
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < filled ? 'bg-ink' : 'bg-border-subtle'}`} />
      ))}
    </span>
  );
}

function Skeleton({ className }: { className: string }) {
  return <span className={`skeleton-soft inline-block align-middle ${className}`} />;
}

export function MuhasebeView() {
  const data = useEuropeAccounting();
  const {
    monthOptions,
    selectedMonthKey,
    setSelectedMonthKey,
    activeMonth,
    fetchData,
    loading,
    ordersLoading,
    rateLoading,
    siparisLoading,
    totalRevenueUsd,
    totalOrdersCount,
    tcmbUsdRate,
    tcmbDate,
    ordersBuyCostTry,
    recordedBuyCount,
    ordersPageTotalCount,
    netProfitAfterTax,
  } = data;

  const buyTotal = ordersPageTotalCount || totalOrdersCount;

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Başlık */}
      <header className="flex flex-col gap-5 pb-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[13px] text-text-muted">Ozon Avrupa · {activeMonth.label}</p>
          <h1 className="mt-1 text-[32px] font-normal leading-[1.15] tracking-tight text-text-primary sm:text-[36px]">
            Muhasebe
          </h1>
          <p className="mt-1 text-[14px] text-text-secondary">
            Avrupa mağazasının aylık istisna faturası, kurumlar vergisi ve vergi sonrası net kârı.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PillTabs
            ariaLabel="Dönem seçimi"
            value={selectedMonthKey}
            onChange={setSelectedMonthKey}
            options={monthOptions.map((m) => ({ value: m.key, label: m.shortLabel, title: m.label }))}
          />
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            aria-label="Verileri yenile"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface text-text-secondary shadow-hairline transition-colors hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </button>
          <Link
            href="/siparisler"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-ink pl-1.5 pr-5 text-[14px] font-medium text-ink-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-foreground text-ink">
              <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
            </span>
            Alış maliyetleri
          </Link>
        </div>
      </header>

      {/* Bento grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
        <div className="md:col-span-6 xl:col-span-12">
          <InvoiceHeroCard data={data} />
        </div>

        <StatCard
          className="md:col-span-3 xl:col-span-3"
          label="Döviz hasılatı"
          value={ordersLoading ? <Skeleton className="h-8 w-28" /> : formatUSD(totalRevenueUsd)}
          subValue={ordersLoading ? '…' : `${totalOrdersCount} sipariş · Avrupa teslimatları`}
        />
        <StatCard
          className="md:col-span-3 xl:col-span-3"
          label="TCMB döviz alış"
          badge={
            <PillBadge tone={activeMonth.isCurrent ? 'success' : 'neutral'} dot>
              {activeMonth.isCurrent ? 'Canlı' : 'Kapanış'}
            </PillBadge>
          }
          value={rateLoading ? <Skeleton className="h-8 w-28" /> : `${tcmbUsdRate.toFixed(4)} ₺`}
          subValue={
            activeMonth.isCurrent
              ? `Bugünün kuru${tcmbDate ? ` · ${tcmbDate}` : ''}`
              : `Ay sonu · ${tcmbDate || activeMonth.invoiceDate}`
          }
        />
        <StatCard
          className="md:col-span-3 xl:col-span-3"
          label="Ürün alış maliyeti"
          cutoutHref="/siparisler"
          value={siparisLoading ? <Skeleton className="h-8 w-32" /> : formatTL(ordersBuyCostTry, false)}
          subValue={
            siparisLoading ? (
              '…'
            ) : recordedBuyCount > 0 ? (
              <span className="flex items-center gap-2">
                <CoverageDots done={recordedBuyCount} total={buyTotal} />
                {recordedBuyCount} / {buyTotal} girildi
              </span>
            ) : (
              'Alış fiyatı henüz girilmedi'
            )
          }
        />
        <StatCard
          className="md:col-span-3 xl:col-span-3"
          label="Vergi sonrası net kâr"
          badge={<PillBadge tone="success">%1,25 vergi</PillBadge>}
          value={loading ? <Skeleton className="h-8 w-32" /> : formatTL(netProfitAfterTax, false)}
          subValue="Kurumlar vergisi düşülmüş"
        />

        <div className="md:col-span-6 xl:col-span-7">
          <TaxBreakdownCard data={data} />
        </div>
        <div className="md:col-span-6 xl:col-span-5">
          <InvoiceDetailsCard data={data} />
        </div>
      </div>
    </div>
  );
}
