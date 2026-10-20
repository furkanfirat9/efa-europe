'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import { formatPercent } from '@/lib/format';
import type { OrderPulse } from '@/lib/dashboard/orderPulse';
import type { DailyProfit, PeriodProfit } from '@/lib/orders/periodProfit';
import type { PendingBalance } from '@/lib/ozon/payouts';
import type { SharePoint } from '@/lib/pricing/indexHistory';
import type { ScanStatus } from '@/lib/sourcing/scanStatus';
import { cn } from '@/lib/utils';

// ─── Uç noktaların yanıtları ────────────────────────────────────────────────

/** /api/dashboard/siparisler */
export interface PulseData extends OrderPulse {
  target: { min: number; max: number };
}

/** /api/dashboard/kar */
export interface ProfitData {
  periods: PeriodProfit[];
  daily: DailyProfit[];
  last30: DailyProfit[];
  monthDays: number;
  targetUsd: number;
  asOf: string;
}

/** /api/dashboard/pazar */
export interface MarketData {
  priceIndex: {
    takenAt: string;
    total: number;
    green: number;
    yellow: number;
    red: number;
    withoutIndex: number;
    share: { now: SharePoint | null; dayAgo: SharePoint | null; weekAgo: SharePoint | null };
  } | null;
  scans: ScanStatus[];
}

/** /api/dashboard/odeme */
export interface PayoutData {
  balance: PendingBalance | null;
  thresholdUsd: number;
  lastPayout: { paidAt: string | null; amountRub: number | null; receivedTry: number | null; receivedAt: string | null } | null;
  warning: string | null;
}

// ─── Biçim ──────────────────────────────────────────────────────────────────

/** Dolar, negatifte eksi işaretiyle: −$12 */
export const usd = (n: number, digits = 0) =>
  `${n < 0 ? '−' : ''}$${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(n))}`;

/** YYYY-MM-DD → "14 Eki" gibi */
export const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('tr-TR', { ...opts, timeZone: 'UTC' });

const points = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

/**
 * Önceki döneme göre değişim: artışta yeşil, düşüşte kırmızı.
 * `pct`: yüzde değişim (önceki 0 ya da negatifse yazılmaz); `pt`: oranlar arasındaki puan farkı.
 */
export function Change({ now, before, unit = 'pct', className }: { now: number; before: number; unit?: 'pct' | 'pt'; className?: string }) {
  if (!now && !before) return null;
  const diff = unit === 'pct' ? (before > 0 ? ((now - before) / before) * 100 : null) : now - before;
  if (diff === null) return null;
  const up = diff >= 0;
  return (
    <span className={cn('font-medium tabular-nums', up ? 'text-emerald-600' : 'text-destructive', className)}>
      {up ? '+' : '−'}
      {unit === 'pct' ? formatPercent(Math.abs(diff), 0) : `${points.format(Math.abs(diff))} puan`}
    </span>
  );
}

/** Ayrıntının kendi sayfasına giden küçük bağlantı */
export function PageLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>
        {children}
        <ArrowUpRight />
      </Link>
    </Button>
  );
}

/** Bölüm başlığı: kart yerine başlık + ince çizgi */
export function SectionHeading({ title, aside, children }: { title: string; aside?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {title}
        {aside}
      </h2>
      {children}
    </div>
  );
}

/** Etiket – değer satırı */
export function StatRow({ label, dot, children, title }: { label: React.ReactNode; dot?: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground" title={title}>
        {dot && <span className={cn('size-2 rounded-full', dot)} />}
        {label}
      </span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}
