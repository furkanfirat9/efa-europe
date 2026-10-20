'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/shadcn/skeleton';
import { formatDecimal, formatNumber, formatPercent, formatUSD } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Change, usd, type MarketData, type PayoutData, type ProfitData, type PulseData } from './shared';
import { GoalDetail, OpenOrdersDetail, PayoutDetail, PriceIndexDetail, ProfitDetail, SalesDetail, openOrderRows } from './SnapshotDetails';

type TileKey = 'sales' | 'goal' | 'open' | 'profit' | 'priceIndex' | 'payout';

interface Source<T> {
  data: T | null;
  error: string | null;
}

interface Tile {
  key: TileKey;
  label: string;
  /** null: veri yükleniyor */
  value: React.ReactNode | null;
  sub?: React.ReactNode;
  error: string | null;
  detail: () => React.ReactNode;
}

const OPEN_KEY = 'dashboard_snapshot_open';

/**
 * Amazon satıcı panelindeki "Global Snapshot" gibi: altı ana rakam tek şeritte. Bir rakama
 * tıklanınca ayrıntısı şeridin altında açılır; açık olana yeniden tıklamak kapatır.
 * Açık bırakılan ayrıntı tarayıcıda hatırlanır.
 */
export function Snapshot({
  pulse,
  profit,
  market,
  payout,
}: {
  pulse: Source<PulseData>;
  profit: Source<ProfitData>;
  market: Source<MarketData>;
  payout: Source<PayoutData>;
}) {
  const [open, setOpen] = useState<TileKey | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(OPEN_KEY) as TileKey | null;
      if (saved) setOpen(saved);
    } catch {}
  }, []);

  const toggle = (key: TileKey) => {
    const next = open === key ? null : key;
    setOpen(next);
    try {
      if (next) localStorage.setItem(OPEN_KEY, next);
      else localStorage.removeItem(OPEN_KEY);
    } catch {}
  };

  const p = pulse.data;
  const month = profit.data?.periods.find((x) => x.key === 'month');
  const share = market.data?.priceIndex?.share;
  const balance = payout.data?.balance;
  const open_ = p ? openOrderRows(p) : null;

  const tiles: Tile[] = [
    {
      key: 'sales',
      label: 'Bugün satış',
      value: p ? formatUSD(p.todayRevenueUsd) : null,
      sub: p && (
        <>
          {p.today} sipariş <Change now={p.todayRevenueUsd} before={p.yesterdaySoFar.revenueUsd} />
        </>
      ),
      error: pulse.error,
      detail: () => p && <SalesDetail pulse={p} />,
    },
    {
      key: 'goal',
      label: 'Günlük hedef',
      value: p ? (
        <>
          {p.today}
          <span className="text-base font-normal text-muted-foreground">
            {' '}
            / {p.target.min}–{p.target.max}
          </span>
        </>
      ) : null,
      sub: p && (
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('size-1.5 rounded-full', p.today >= p.target.min ? 'bg-emerald-500' : 'bg-amber-500')} />7 gün ort.{' '}
          {formatDecimal(p.avg7)}
        </span>
      ),
      error: pulse.error,
      detail: () => p && <GoalDetail pulse={p} />,
    },
    {
      key: 'open',
      label: 'Açık sipariş',
      value: open_ ? formatNumber(open_[0].count + open_[1].count) : null,
      sub: open_ && `${open_[0].count} bekleyen · ${open_[1].count} yolda`,
      error: pulse.error,
      detail: () => p && <OpenOrdersDetail pulse={p} />,
    },
    {
      key: 'profit',
      label: 'Bu ay kâr',
      value: month ? <span className={cn(month.profitUsd < 0 && 'text-destructive')}>{usd(month.profitUsd)}</span> : null,
      sub: month && profit.data && (
        <>
          hedef %{Math.round(Math.max(0, (month.profitUsd / profit.data.targetUsd) * 100))}{' '}
          <Change now={month.profitUsd} before={month.prevProfitUsd} />
        </>
      ),
      error: profit.error,
      detail: () => profit.data && <ProfitDetail profit={profit.data} />,
    },
    {
      key: 'priceIndex',
      label: 'Kazançlı pay',
      value: market.data ? (share?.now ? formatPercent(share.now.pct, 0) : '—') : null,
      sub:
        share?.now &&
        (share.dayAgo ? (
          <>
            dün <Change now={share.now.pct} before={share.dayAgo.pct} unit="pt" />
          </>
        ) : (
          'fiyat endeksi'
        )),
      error: market.error,
      detail: () => market.data && <PriceIndexDetail market={market.data} />,
    },
    {
      key: 'payout',
      label: 'Ozon bakiye',
      value: payout.data ? (balance?.usd != null ? `≈ ${formatUSD(balance.usd)}` : '—') : null,
      sub:
        payout.data && balance?.usd != null
          ? payout.data.thresholdUsd - balance.usd > 0
            ? `eşiğe ${formatUSD(payout.data.thresholdUsd - balance.usd)}`
            : 'eşik aşıldı'
          : payout.data && 'bakiye alınamadı',
      error: payout.error,
      detail: () => payout.data && <PayoutDetail payout={payout.data} />,
    },
  ];

  const active = tiles.find((t) => t.key === open);

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* gap-px + bg-border: satır kırılsa da her rakamın arasında ince çizgi kalır */}
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => {
          const selected = open === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => toggle(t.key)}
              aria-expanded={selected}
              className={cn(
                'group relative flex flex-col items-start gap-1 bg-background px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40',
                selected && 'bg-muted/50 hover:bg-muted/50'
              )}
            >
              <span className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
                {t.label}
                <ChevronDown className={cn('size-3.5 opacity-0 transition group-hover:opacity-100', selected && 'rotate-180 opacity-100')} />
              </span>
              <span className="text-2xl font-semibold tabular-nums">
                {t.value ?? (t.error ? <span className="text-sm font-normal text-muted-foreground">Alınamadı</span> : <Skeleton className="my-1 h-6 w-20" />)}
              </span>
              <span className="min-h-4 text-xs text-muted-foreground tabular-nums">{t.value !== null ? t.sub : null}</span>
              {selected && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
            </button>
          );
        })}
      </div>

      {active && (
        <div className="border-t bg-background p-4 md:p-6">
          {active.value !== null ? (
            active.detail()
          ) : active.error ? (
            <p className="text-sm text-muted-foreground">{active.error}</p>
          ) : (
            <Skeleton className="h-24 w-full" />
          )}
        </div>
      )}
    </div>
  );
}
