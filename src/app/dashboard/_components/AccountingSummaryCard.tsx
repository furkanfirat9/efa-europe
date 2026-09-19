'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { PillBadge } from '@/components/ui/PillBadge';
import { formatTL } from '@/lib/format';
import { useEuropeAccounting } from '@/hooks/useEuropeAccounting';

/** Muhasebe sayfasının dashboard özeti: bu ayın fatura tutarı ve vergi sonrası net kâr. */
export function AccountingSummaryCard() {
  const { activeMonth, invoiceTotalTry, netProfitAfterTax, corporateTaxToPay, loading } = useEuropeAccounting();

  return (
    <section className="relative flex h-full flex-col justify-between gap-6 rounded-card bg-surface p-6 shadow-hairline md:p-7">
      <div className="card-cutout">
        <Link
          href="/muhasebe"
          aria-label="Muhasebe sayfasına git"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-text-secondary transition-colors hover:bg-ink hover:text-ink-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/30"
        >
          <ArrowUpRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </Link>
      </div>

      <div className="pr-14">
        <h2 className="text-[20px] font-normal tracking-tight text-text-primary md:text-[22px]">
          Avrupa faturası
        </h2>
        <p className="mt-1 text-[13px] text-text-secondary">{activeMonth.label} · istisna faturası</p>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-medium text-text-muted">Kesilecek tutar</p>
          <PillBadge tone="success" dot>KDV %0</PillBadge>
        </div>
        {loading ? (
          <span className="skeleton-soft mt-2 block h-10 w-44" />
        ) : (
          <p className="mt-1 text-[40px] font-light leading-none tracking-[-0.03em] text-text-primary tabular-nums">
            {formatTL(invoiceTotalTry, false)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-inner bg-surface-muted px-4 py-3">
          <p className="text-[12px] text-text-muted">Net kâr</p>
          <p className="mt-1 text-[15px] font-medium text-text-primary tabular-nums">
            {loading ? <span className="skeleton-soft inline-block h-4 w-20 align-middle" /> : formatTL(netProfitAfterTax, false)}
          </p>
        </div>
        <div className="rounded-inner bg-surface-muted px-4 py-3">
          <p className="text-[12px] text-text-muted">Kurumlar vergisi</p>
          <p className="mt-1 text-[15px] font-medium text-text-primary tabular-nums">
            {loading ? <span className="skeleton-soft inline-block h-4 w-20 align-middle" /> : formatTL(corporateTaxToPay, false)}
          </p>
        </div>
      </div>
    </section>
  );
}
