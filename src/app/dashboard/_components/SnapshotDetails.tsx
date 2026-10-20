'use client';

import React, { useEffect, useState } from 'react';
import { Progress } from '@/components/shadcn/progress';
import { Skeleton } from '@/components/shadcn/skeleton';
import { formatDecimal, formatNumber, formatPercent, formatRub, formatTL, formatUSD } from '@/lib/format';
import { useEuropeAccounting } from '@/hooks/useEuropeAccounting';
import { cn } from '@/lib/utils';
import { STATUS, STATUS_ORDER } from '@/app/fiyat-endeksi/_components/status';
import type { BucketTotal } from '@/lib/dashboard/orderPulse';
import type { SharePoint } from '@/lib/pricing/indexHistory';
import { Change, dayLabel, PageLink, StatRow, usd, type MarketData, type PayoutData, type ProfitData, type PulseData } from './shared';

/**
 * Özet şeridinde bir rakama tıklanınca altında açılan ayrıntılar (Amazon satıcı panelindeki gibi).
 * Her panel kendi sayfasına bir bağlantıyla biter; ayrıntının tamamı orada.
 */

const DAY_MS = 86_400_000;

function Column({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      {title && <div className="text-xs font-medium text-muted-foreground">{title}</div>}
      {children}
    </div>
  );
}

function DetailGrid({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{children}</div>
      <div className="flex flex-wrap gap-2">{footer}</div>
    </div>
  );
}

// ─── Bugün satış ────────────────────────────────────────────────────────────

/** Bu ayın cirosu, iki mağaza (Ozon sipariş listesinden; /analitik'in hafif ucu). */
function useMonthRevenue() {
  const [value, setValue] = useState<{ europe: number; turkiye: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const local = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
    const fetchStore = async (store: 'store1' | 'store2') => {
      const res = await fetch('/api/ozon/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store, date_from: `${local.slice(0, 8)}01`, date_to: local, mode: 'orders' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Number((await res.json()).totalRevenue || 0);
    };
    Promise.all([fetchStore('store1'), fetchStore('store2')])
      .then(([europe, turkiye]) => alive && setValue({ europe, turkiye }))
      .catch((err) => console.error('Aylık ciro alınamadı:', err));
    return () => {
      alive = false;
    };
  }, []);
  return value;
}

export function SalesDetail({ pulse }: { pulse: PulseData }) {
  const month = useMonthRevenue();
  const total = month ? month.europe + month.turkiye : 0;
  const avgOrder = pulse.today > 0 ? pulse.todayRevenueUsd / pulse.today : null;
  const last7 = pulse.daily.slice(-8, -1);

  return (
    <DetailGrid footer={<PageLink href="/analitik">Analitik</PageLink>}>
      <Column title="Bugün · dünün aynı saatine göre">
        <StatRow label="Ciro">
          {formatUSD(pulse.todayRevenueUsd)}{' '}
          <Change now={pulse.todayRevenueUsd} before={pulse.yesterdaySoFar.revenueUsd} className="ml-1 text-xs" />
        </StatRow>
        <StatRow label="Sipariş">
          {pulse.today} <span className="text-muted-foreground">· dün {pulse.yesterdaySoFar.orders}</span>
        </StatRow>
        <StatRow label="Ortalama sipariş">{avgOrder !== null ? formatUSD(avgOrder) : '—'}</StatRow>
      </Column>
      <Column title="Son 7 gün">
        <StatRow label="Ciro">{formatUSD(last7.reduce((s, d) => s + d.revenueUsd, 0))}</StatRow>
        <StatRow label="Sipariş">{formatNumber(last7.reduce((s, d) => s + d.orders, 0))}</StatRow>
        <StatRow label="En iyi gün">
          {(() => {
            const best = [...last7].sort((a, b) => b.revenueUsd - a.revenueUsd)[0];
            return best && best.revenueUsd > 0 ? `${dayLabel(best.date)} · ${formatUSD(best.revenueUsd)}` : '—';
          })()}
        </StatRow>
      </Column>
      <Column title="Bu ay ciro · iki mağaza">
        {month ? (
          <>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              {total > 0 && (
                <>
                  <div className="bg-chart-2" style={{ width: `${(month.europe / total) * 100}%` }} />
                  <div className="bg-chart-4" style={{ width: `${(month.turkiye / total) * 100}%` }} />
                </>
              )}
            </div>
            <StatRow label="Europe" dot="bg-chart-2">{formatUSD(month.europe)}</StatRow>
            <StatRow label="Türkiye" dot="bg-chart-4">{formatUSD(month.turkiye)}</StatRow>
            <StatRow label="Toplam">
              <span className="font-medium">{formatUSD(total)}</span>
            </StatRow>
          </>
        ) : (
          <>
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </>
        )}
      </Column>
    </DetailGrid>
  );
}

// ─── Günlük hedef ───────────────────────────────────────────────────────────

export function GoalDetail({ pulse }: { pulse: PulseData }) {
  const { min, max } = pulse.target;
  const past14 = pulse.daily.slice(-15, -1);
  const hit = past14.filter((d) => d.orders >= min).length;
  const last7 = pulse.daily.slice(-8, -1);

  return (
    <DetailGrid footer={<PageLink href="/siparisler">Siparişler</PageLink>}>
      <Column title="Bugün">
        <Progress value={Math.min(100, (pulse.today / min) * 100)} aria-label="Günlük sipariş hedefine ilerleme" />
        <p className="text-sm text-muted-foreground">
          {pulse.today >= min ? (
            <>Hedefe ulaşıldı ({min}–{max} sipariş).</>
          ) : (
            <>
              Hedefe <span className="font-medium text-foreground">{min - pulse.today} sipariş</span> kaldı.
            </>
          )}
        </p>
      </Column>
      <Column title="Son 14 gün">
        <StatRow label="Hedefe ulaşılan gün">
          <span className="font-medium">{hit}</span> / 14
        </StatRow>
        <StatRow label="7 gün ortalaması">
          {formatDecimal(pulse.avg7)} <span className="text-muted-foreground">· hedefin %{Math.round((pulse.avg7 / min) * 100)}&apos;i</span>
        </StatRow>
      </Column>
      <Column title="Son 7 gün, gün gün">
        <div className="grid grid-cols-7 gap-1">
          {last7.map((d) => (
            <div
              key={d.date}
              className={cn(
                'flex flex-col items-center rounded-md border py-1.5 text-xs tabular-nums',
                d.orders >= min ? 'border-emerald-500/40 bg-emerald-500/10' : 'bg-muted/40'
              )}
              title={`${dayLabel(d.date, { day: 'numeric', month: 'long' })}: ${d.orders} sipariş`}
            >
              <span className="text-muted-foreground">{dayLabel(d.date, { weekday: 'short' })}</span>
              <span className="font-medium">{d.orders}</span>
            </div>
          ))}
        </div>
      </Column>
    </DetailGrid>
  );
}

// ─── Açık siparişler ────────────────────────────────────────────────────────

const add = (a: BucketTotal, b: BucketTotal): BucketTotal => ({ count: a.count + b.count, amountUsd: a.amountUsd + b.amountUsd });

/** Renkler Siparişler sayfasındaki durum rozetleriyle aynı */
export function openOrderRows(pulse: PulseData) {
  return [
    { key: 'awaiting', label: 'Sevkiyat bekleyen', dot: 'bg-amber-500', ...add(pulse.live.awaiting, pulse.older.awaiting) },
    { key: 'delivering', label: 'Kargoda', dot: 'bg-blue-500', ...add(pulse.live.delivering, pulse.older.delivering) },
  ];
}

export function OpenOrdersDetail({ pulse }: { pulse: PulseData }) {
  const rows = [
    ...openOrderRows(pulse),
    { key: 'delivered', label: `Teslim edildi · ${pulse.liveDays} gün`, dot: 'bg-emerald-500', ...pulse.live.delivered },
  ];
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <DetailGrid footer={<PageLink href="/siparisler">Siparişler</PageLink>}>
      <Column title={`Son ${pulse.liveDays} gün · Ozon canlı`} className="xl:col-span-2">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          {total > 0 && rows.map((r) => <div key={r.key} className={r.dot} style={{ width: `${(r.count / total) * 100}%` }} />)}
        </div>
        {rows.map((r) => (
          <StatRow key={r.key} label={r.label} dot={r.dot}>
            <span className="font-medium">{formatNumber(r.count)}</span>
            <span className="ml-2 text-muted-foreground">{formatUSD(r.amountUsd)}</span>
          </StatRow>
        ))}
      </Column>
      <Column title="Toplam">
        <StatRow label="Teslim edilen (tümü)">
          <span className="font-medium">{formatNumber(pulse.live.delivered.count + pulse.older.delivered.count)}</span>
        </StatRow>
        <StatRow label={`İptal · ${pulse.liveDays} gün`}>{formatNumber(pulse.live.cancelled.count)}</StatRow>
        <p className="text-xs text-muted-foreground">
          {pulse.liveDays} günden eski siparişler veri tabanından gelir; durumları saatte bir Ozon&apos;dan tazelenir.
        </p>
      </Column>
    </DetailGrid>
  );
}

// ─── Bu ay kâr ──────────────────────────────────────────────────────────────

function AccountingColumn() {
  const { activeMonth, invoiceTotalTry, netProfitAfterTax, corporateTaxToPay, loading } = useEuropeAccounting();
  const rows = [
    { label: 'Satış faturaları', value: invoiceTotalTry },
    { label: 'Vergi sonrası net kâr', value: netProfitAfterTax },
    { label: 'Kurumlar vergisi', value: corporateTaxToPay },
  ];
  return (
    <Column title={`Muhasebe · ${activeMonth.label}`}>
      {rows.map((r) => (
        <StatRow key={r.label} label={r.label}>
          {loading ? <Skeleton className="h-4 w-20" /> : formatTL(r.value, false)}
        </StatRow>
      ))}
    </Column>
  );
}

export function ProfitDetail({ profit }: { profit: ProfitData }) {
  const month = profit.periods.find((p) => p.key === 'month')!;
  const short = profit.periods.filter((p) => p.key !== 'month');
  const pct = Math.max(0, (month.profitUsd / profit.targetUsd) * 100);
  const elapsedDays = (new Date(profit.asOf).getTime() - new Date(month.from).getTime()) / DAY_MS;
  // İlk günün kârı bütün aya yayılınca anlamsız büyük ya da küçük çıkıyor; tahmin 2. günden sonra
  const projection = elapsedDays >= 2 ? (month.profitUsd / elapsedDays) * profit.monthDays : null;
  const margin = month.revenueUsd > 0 ? (month.profitUsd / month.revenueUsd) * 100 : null;

  return (
    <DetailGrid
      footer={
        <>
          <PageLink href="/siparisler">Siparişler</PageLink>
          <PageLink href="/muhasebe">Muhasebe</PageLink>
        </>
      }
    >
      <Column title={`Aylık hedef · ${usd(profit.targetUsd)}`}>
        <Progress value={Math.min(100, pct)} aria-label="Aylık kâr hedefine ilerleme" />
        <StatRow label="Tamamlanan">
          <span className="font-medium">%{Math.round(pct)}</span>
        </StatRow>
        {projection !== null && <StatRow label="Bu hızla ay sonu">≈ {usd(projection)}</StatRow>}
        <StatRow label="Marj">{margin !== null ? formatPercent(margin, 0) : '—'}</StatRow>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatTL(month.profitTry, false)} · {month.orders} sipariş · {usd(month.revenueUsd)} ciro
        </p>
      </Column>
      <Column title="Kâr · önceki döneme göre">
        {short.map((p) => (
          <StatRow key={p.key} label={p.label}>
            {usd(p.profitUsd, 2)} <Change now={p.profitUsd} before={p.prevProfitUsd} className="ml-1 text-xs" />
          </StatRow>
        ))}
        <StatRow label="Bu ay">
          {usd(month.profitUsd, 2)} <Change now={month.profitUsd} before={month.prevProfitUsd} className="ml-1 text-xs" />
        </StatRow>
        <p className="text-xs text-muted-foreground tabular-nums">
          {usd(month.knownUsd, 2)} kesin
          {month.estimatedCount > 0 && ` · ${usd(month.estimatedUsd, 2)} tahmini (${month.estimatedCount} alış bekliyor)`}
          {month.unknownCount > 0 && ` · ${month.unknownCount} sipariş hesaplanamadı`}
        </p>
      </Column>
      <AccountingColumn />
    </DetailGrid>
  );
}

// ─── Kazançlı pay ───────────────────────────────────────────────────────────

function ShareRow({ label, now, then }: { label: string; now: number; then: SharePoint | null }) {
  return (
    <StatRow label={label}>
      {then ? (
        <>
          {formatPercent(then.pct, 0)} <Change now={now} before={then.pct} unit="pt" className="ml-1 text-xs" />
        </>
      ) : (
        <span className="text-muted-foreground">kayıt yok</span>
      )}
    </StatRow>
  );
}

export function PriceIndexDetail({ market }: { market: MarketData }) {
  const pi = market.priceIndex;
  if (!pi) return <p className="text-sm text-muted-foreground">Henüz fiyat endeksi kaydı yok.</p>;
  const indexed = pi.total - pi.withoutIndex;
  const share = pi.share.now;

  return (
    <DetailGrid footer={<PageLink href="/fiyat-endeksi">Fiyat endeksi</PageLink>}>
      <Column title={`${formatNumber(pi.total)} ürün · ${new Date(pi.takenAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`} className="xl:col-span-2">
        {/* Ozon panelindeki gibi: renkler endeksi olan ürünler içinde, endekssiz ayrıca */}
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          {indexed > 0 &&
            (['GREEN', 'YELLOW', 'RED'] as const).map((c) => (
              <div key={c} className={STATUS[c].dot} style={{ width: `${(pi[STATUS[c].key] / indexed) * 100}%` }} />
            ))}
        </div>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {STATUS_ORDER.map((c) => (
            <StatRow key={c} label={STATUS[c].label} dot={STATUS[c].dot} title={STATUS[c].hint}>
              <span className="font-medium">{formatNumber(pi[STATUS[c].key])}</span>
            </StatRow>
          ))}
        </div>
      </Column>
      {share && (
        <Column title="Kazançlı pay geçmişi">
          <StatRow label="Şimdi">
            <span className="font-medium">{formatPercent(share.pct, 0)}</span>
          </StatRow>
          <ShareRow label="Dün" now={share.pct} then={pi.share.dayAgo} />
          <ShareRow label="Geçen hafta" now={share.pct} then={pi.share.weekAgo} />
        </Column>
      )}
    </DetailGrid>
  );
}

// ─── Ozon bakiye ────────────────────────────────────────────────────────────

const isoDay = (iso: string | null) => (iso ? dayLabel(iso) : '—');

export function PayoutDetail({ payout }: { payout: PayoutData }) {
  const { balance, thresholdUsd, lastPayout } = payout;
  const usdValue = balance?.usd ?? null;
  const left = usdValue !== null ? thresholdUsd - usdValue : null;

  return (
    <DetailGrid footer={<PageLink href="/belgeler?sekme=ozon">Ozon ödemeleri</PageLink>}>
      <Column title={`Ödeme eşiği · ${formatUSD(thresholdUsd)}`}>
        {usdValue !== null && <Progress value={Math.min(100, Math.max(0, (usdValue / thresholdUsd) * 100))} aria-label="Ödeme eşiğine ilerleme" />}
        <p className="text-sm text-muted-foreground">
          {left === null
            ? 'Bakiye alınamadı.'
            : left > 0
              ? `Eşiğe ${formatUSD(left)} kaldı; Ozon eşik aşılmadan ödeme yapmaz.`
              : 'Eşik aşıldı; bakiye sıradaki ödemede gelir.'}
        </p>
        {payout.warning && <p className="text-xs text-muted-foreground">{payout.warning}</p>}
      </Column>
      <Column title="Bakiye">
        <StatRow label="Ruble">{balance ? formatRub(balance.rub) : '—'}</StatRow>
        <StatRow label="Dolar karşılığı">{usdValue !== null ? `≈ ${formatUSD(usdValue)}` : '—'}</StatRow>
        <StatRow label="Dönem sonu">{balance?.periodEnd ? isoDay(balance.periodEnd) : '—'}</StatRow>
      </Column>
      <Column title="Son ödeme">
        {lastPayout ? (
          <>
            <StatRow label="Ozon">
              {lastPayout.amountRub !== null ? formatRub(lastPayout.amountRub) : '—'}
              <span className="ml-2 text-muted-foreground">{isoDay(lastPayout.paidAt)}</span>
            </StatRow>
            <StatRow label="Bankaya gelen">
              {lastPayout.receivedTry != null ? formatTL(lastPayout.receivedTry, false) : '—'}
              {lastPayout.receivedAt && <span className="ml-2 text-muted-foreground">{isoDay(lastPayout.receivedAt)}</span>}
            </StatRow>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Henüz ödeme yok.</p>
        )}
      </Column>
    </DetailGrid>
  );
}
