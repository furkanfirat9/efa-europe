'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Equal, X } from 'lucide-react';
import { PillBadge } from '@/components/ui/PillBadge';
import { formatTL, formatUSD } from '@/lib/format';
import type { EuropeAccounting } from '@/hooks/useEuropeAccounting';

/** "₺143.161,16" → ["₺143.161", ",16"]; kuruş kısmı daha sönük gösterilir. */
function splitDecimals(formatted: string): [string, string] {
  const i = formatted.lastIndexOf(',');
  return i === -1 ? [formatted, ''] : [formatted.slice(0, i), formatted.slice(i)];
}

function Term({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="min-w-0 flex-1 rounded-inner bg-surface-muted px-4 py-3">
      <p className="text-[12px] text-text-muted">{label}</p>
      <p className="mt-1 truncate text-[15px] font-medium tabular-nums text-text-primary">
        {loading ? <span className="skeleton-soft inline-block h-4 w-20 align-middle" /> : value}
      </p>
    </div>
  );
}

function Operator({ children }: { children: React.ReactNode }) {
  return (
    <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-text-muted shadow-hairline sm:flex">
      {children}
    </span>
  );
}

export function InvoiceHeroCard({ data }: { data: EuropeAccounting }) {
  const { activeMonth, invoiceTotalTry, totalRevenueUsd, tcmbUsdRate, ordersLoading, rateLoading } = data;
  const loading = ordersLoading || rateLoading;
  const [whole, decimals] = splitDecimals(formatTL(invoiceTotalTry, true));

  return (
    <section className="relative flex h-full flex-col justify-between gap-8 overflow-hidden rounded-card bg-surface p-6 shadow-hairline md:p-7">
      <div className="card-cutout">
        <Link
          href="/siparisler"
          aria-label="Avrupa siparişlerine git"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-text-secondary transition-colors hover:bg-ink hover:text-ink-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/30"
        >
          <ArrowUpRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </Link>
      </div>

      {/* Dekoratif taralı ışık — kartı düz bir kutudan ayırır, veri taşımaz. */}
      <div
        aria-hidden
        className="hatch pointer-events-none absolute -right-24 -bottom-28 h-72 w-72 rounded-full opacity-60 mask-[radial-gradient(circle,black_30%,transparent_70%)]"
      />

      <div className="relative pr-14">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[20px] font-normal tracking-tight text-text-primary md:text-[22px]">
            Kesilecek fatura tutarı
          </h2>
          <PillBadge tone="success" dot>KDV %0</PillBadge>
          <PillBadge tone="info">351 · Transit</PillBadge>
        </div>
        <p className="mt-1 text-[13px] text-text-secondary">
          {activeMonth.label} dönemi · fatura tarihi {activeMonth.invoiceDate}
        </p>
      </div>

      <div className="relative">
        {loading ? (
          <span className="skeleton-soft block h-14 w-72 max-w-full" />
        ) : (
          <p className="text-[44px] font-light leading-none tracking-[-0.03em] text-text-primary tabular-nums sm:text-[56px] lg:text-[64px]">
            {whole}
            <span className="text-text-muted">{decimals}</span>
          </p>
        )}
        <p className="mt-3 text-[13px] text-text-muted">
          Brüt tutar · Türkiye gümrük bölgesine girmeyen teslimat, KDV istisnası kapsamında
        </p>
      </div>

      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center">
        <Term label="Döviz hasılatı" value={formatUSD(totalRevenueUsd)} loading={ordersLoading} />
        <Operator><X className="h-3.5 w-3.5" strokeWidth={1.75} /></Operator>
        <Term label="TCMB döviz alış" value={`${tcmbUsdRate.toFixed(4)} ₺`} loading={rateLoading} />
        <Operator><Equal className="h-3.5 w-3.5" strokeWidth={1.75} /></Operator>
        <Term label="Fatura (TL)" value={formatTL(invoiceTotalTry, true)} loading={loading} />
      </div>
    </section>
  );
}
