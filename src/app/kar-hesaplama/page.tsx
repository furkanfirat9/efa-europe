'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { formatPercent, formatTL } from '@/lib/format';
import { OZON_GLOBAL_FEES, PRICING, costBase, marginPrices, profitAt } from '@/lib/pricing/rules';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { Skeleton } from '@/components/shadcn/skeleton';

/**
 * Tek ürün için kâr hesabı. Fiyat önerisiyle aynı kurallar (src/lib/pricing/rules.ts): alış € ECB kuruyla
 * dolara (+ banka kur farkı), satış $, Ozon kesintileri, LS kargo ve depo ücreti ağırlıktan.
 * Alış zł de girilebilir (amazon.pl): önce ECB EUR/PLN kuruyla €'ya çevrilir, hesabın geri kalanı aynıdır.
 * Ağırlık tek alandır ve olduğu gibi kullanılır: fiyat önerisinde görünen kargo ağırlığı (LS paketi dahil) girilir
 * (eskiden LS paketi burada bir kez daha ekleniyordu). Alış fiyatı depoya gelmiş tutardır; ayrı "depoya kargo" yok.
 * Görünüm (kullanıcı 2026-10-25): açıklama metni yok, yalnız değerin ne olduğunu söyleyen başlıklar. Sağda tek panel:
 * üstte net kâr ve oranlar, altta gider dökümü (satışın yüzdesiyle).
 */

interface Rates {
  eurUsd: number;
  eurUsdDate: string;
  eurPln: number;
  eurTry: number;
  usdTry: number;
  plnTry: number;
  tryDate: string;
  platformCapUsd: number | null;
}

type BuyCurrency = 'EUR' | 'PLN';
type Form = { currency: BuyCurrency; buy: string; sell: string; weightG: string; commission: string };

const EMPTY: Form = { currency: 'EUR', buy: '', sell: '', weightG: '', commission: '5' };
const START: Form = { currency: 'EUR', buy: '50', sell: '120', weightG: '1250', commission: '5' };

const BUY_CURRENCIES: { value: BuyCurrency; symbol: string; label: string }[] = [
  { value: 'EUR', symbol: '€', label: 'Euro' },
  { value: 'PLN', symbol: 'zł', label: 'Zloti' },
];

const decimal2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimal4 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const usd = (n: number) => `${n < 0 ? '−' : ''}$${decimal2.format(Math.abs(n))}`;
const pct = (p: number) => formatPercent(p * 100, 1);
/** 0.25 → "%25" (0.07 × 100 gibi kayan nokta artıklarını atar) */
const whole = (p: number) => `%${Math.round(p * 100)}`;
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

/** Boş ya da geçersiz giriş 0 sayılır */
function num(value: string) {
  const n = parseFloat(value.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function Field({ id, label, unit, value, onChange }: { id: string; label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 pr-12 text-lg font-semibold tabular-nums"
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

/** Başlık + değer; oranlar ve hedef fiyatlar için */
function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-1 text-xl font-semibold tracking-tight tabular-nums',
          tone === 'good' && 'text-emerald-600',
          tone === 'bad' && 'text-destructive'
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** Döküm sütunları: kalem, çubuk (dar ekranda gizli), satışın yüzdesi, tutar */
const ROW_COLS = 'grid grid-cols-[minmax(0,1fr)_4rem_5.5rem] gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,7rem)_4rem_6rem]';

/** Gider dökümünün bir satırı: renk, kalem, satışın yüzdesi (çubukla), tutar */
function CostRow({ label, value, sell, color, sub }: { label: string; value: number; sell: number; color: string; sub?: boolean }) {
  const share = sell > 0 ? value / sell : 0;
  return (
    <div className={cn(ROW_COLS, 'items-center py-2', sub && 'py-1.5')}>
      <div className={cn('flex min-w-0 items-center gap-2', sub && 'pl-4')}>
        <span className={cn('shrink-0 rounded-full', sub ? 'size-1.5 opacity-60' : 'size-2.5', color)} />
        <span className={cn('truncate', sub ? 'text-xs text-muted-foreground' : 'text-sm font-medium')}>{label}</span>
      </div>
      <div className="hidden h-1.5 overflow-hidden rounded-full bg-muted sm:block">
        <div className={cn('h-full rounded-full', color, sub && 'opacity-60')} style={{ width: `${Math.min(share, 1) * 100}%` }} />
      </div>
      <div className={cn('text-right tabular-nums', sub ? 'text-xs text-muted-foreground' : 'text-sm text-muted-foreground')}>
        {sell > 0 ? pct(share) : '—'}
      </div>
      <div className={cn('text-right tabular-nums', sub ? 'text-xs text-muted-foreground' : 'text-sm font-semibold')}>{usd(-value)}</div>
    </div>
  );
}

export default function KarHesaplamaPage() {
  const [form, setForm] = useState<Form>(START);
  const [rates, setRates] = useState<Rates | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/kar-hesaplama', { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error_message || 'Kurlar alınamadı.');
      setRates(data);
      setRateError(null);
    } catch (err) {
      setRateError(err instanceof Error ? err.message : 'Kurlar alınamadı.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  const calc = useMemo(() => {
    if (!rates) return null;
    // zł girildiyse € karşılığı (ECB); hesabın geri kalanı € üzerinden
    const buyLocal = num(form.buy);
    const buy = form.currency === 'PLN' ? buyLocal / rates.eurPln : buyLocal;
    const sell = num(form.sell);
    const commissionPct = num(form.commission) / 100;
    const weightG = Math.round(num(form.weightG));
    if (!buy || !weightG) return null;

    const c = costBase({
      purchaseEur: buy,
      shippingEur: 0,
      weightG,
      eurUsd: rates.eurUsd,
      feePct: commissionPct + PRICING.acquiringPct + OZON_GLOBAL_FEES.intermediaryPct,
      platformPct: OZON_GLOBAL_FEES.platformPct,
      platformCapUsd: rates.platformCapUsd,
    });
    const platformRaw = sell * OZON_GLOBAL_FEES.platformPct;
    const fees = {
      commission: sell * commissionPct,
      acquiring: sell * PRICING.acquiringPct,
      intermediary: sell * OZON_GLOBAL_FEES.intermediaryPct,
      platform: rates.platformCapUsd == null ? platformRaw : Math.min(platformRaw, rates.platformCapUsd),
    };
    const ozonFees = fees.commission + fees.acquiring + fees.intermediary + fees.platform;
    const { profit, margin } = profitAt(sell, c);
    return {
      sell,
      c,
      fees,
      ozonFees,
      totalCost: c.landedUsd + c.ozonShippingUsd + c.depotUsd + ozonFees,
      profit,
      margin,
      prices: marginPrices(c),
      payoutUsd: sell - ozonFees - c.ozonShippingUsd,
      cardTry: buyLocal * (form.currency === 'PLN' ? rates.plnTry : rates.eurTry) * (1 + PRICING.bankFxPct),
    };
  }, [rates, form]);

  const cur = BUY_CURRENCIES.find((c) => c.value === form.currency)!;
  const hasSell = !!calc && calc.sell > 0;
  const loss = hasSell && calc!.profit < 0;
  const profitTone = !hasSell ? undefined : loss ? 'bad' : 'good';

  // Satış fiyatının dağılımı: üstteki çubuk ve dökümün renkleri aynı
  const bar = calc
    ? [
        { key: 'buy', value: calc.c.landedUsd, color: 'bg-chart-1' },
        { key: 'ship', value: calc.c.ozonShippingUsd, color: 'bg-chart-2' },
        { key: 'depot', value: calc.c.depotUsd, color: 'bg-chart-3' },
        { key: 'fees', value: calc.ozonFees, color: 'bg-chart-4' },
        { key: 'profit', value: Math.max(calc.profit, 0), color: 'bg-emerald-500' },
      ]
    : [];
  const barTotal = bar.reduce((s, b) => s + b.value, 0);

  return (
    <div className="flex-1 space-y-6 bg-background p-4 pt-6 text-foreground md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Kâr Hesaplama</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {rates && (
            <>
              <span>
                EUR/USD <span className="font-semibold tabular-nums text-foreground">{decimal4.format(rates.eurUsd)}</span>
              </span>
              {form.currency === 'PLN' && (
                <span>
                  EUR/PLN <span className="font-semibold tabular-nums text-foreground">{decimal4.format(rates.eurPln)}</span>
                </span>
              )}
              <span>
                USD/TRY <span className="font-semibold tabular-nums text-foreground">{decimal2.format(rates.usdTry)}</span>
              </span>
              <span>{day(rates.eurUsdDate)}</span>
            </>
          )}
          <Button variant="outline" size="sm" onClick={loadRates} disabled={loading}>
            <RefreshCw className={cn(loading && 'animate-spin')} />
            Kurları yenile
          </Button>
        </div>
      </div>

      {rateError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Kurlar alınamadı</AlertTitle>
          <AlertDescription>{rateError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* Girdiler */}
        <section className="rounded-xl border bg-card p-5 shadow-xs">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold">Ürün</h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              onClick={() => setForm((f) => ({ ...EMPTY, currency: f.currency }))}
            >
              <RotateCcw />
              Sıfırla
            </Button>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Alış para birimi</div>
              <div role="radiogroup" aria-label="Alış para birimi" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {BUY_CURRENCIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={form.currency === c.value}
                    onClick={() => setForm((f) => ({ ...f, currency: c.value }))}
                    className={cn(
                      'h-8 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      form.currency === c.value ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {c.symbol} {c.label}
                  </button>
                ))}
              </div>
            </div>
            <Field id="buy" label="Alış fiyatı" unit={cur.symbol} value={form.buy} onChange={set('buy')} />
            <Field id="sell" label="Ozon satış fiyatı" unit="$" value={form.sell} onChange={set('sell')} />
            <Field id="weight-g" label="Kargo ağırlığı" unit="g" value={form.weightG} onChange={set('weightG')} />
            <Field id="commission" label="Komisyon" unit="%" value={form.commission} onChange={set('commission')} />
          </div>
        </section>

        {/* Sonuç */}
        {!rates && !rateError ? (
          <Skeleton className="h-[30rem] rounded-xl" />
        ) : !calc ? (
          <section className="flex h-64 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground shadow-xs">
            Alış fiyatı ve kargo ağırlığı girin
          </section>
        ) : (
          <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
            {/* Net kâr ve oranlar */}
            <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-center">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Net kâr</div>
                <div
                  className={cn(
                    'mt-1 text-5xl font-bold tracking-tight tabular-nums',
                    profitTone === 'good' && 'text-emerald-600',
                    profitTone === 'bad' && 'text-destructive'
                  )}
                >
                  {hasSell ? usd(calc.profit) : '—'}
                </div>
                <div className="mt-1 text-sm tabular-nums text-muted-foreground">{hasSell && rates ? formatTL(calc.profit * rates.usdTry) : ''}</div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:border-l md:pl-6">
                <Metric label="Maliyete göre marj" value={hasSell ? pct(calc.margin) : '—'} tone={profitTone} />
                <Metric label="Satışa göre marj" value={hasSell ? pct(calc.profit / calc.sell) : '—'} tone={profitTone} />
                <Metric label="Ozon hakedişi" value={hasSell ? usd(calc.payoutUsd) : '—'} />
                <Metric label="Karttan çekilecek" value={formatTL(calc.cardTry)} />
              </div>
            </div>

            {/* Hedef fiyatlar */}
            <div className="grid grid-cols-3 gap-4 border-t bg-muted/40 px-6 py-4">
              <Metric label="Asgari kâr fiyatı" value={usd(calc.prices.floorPrice)} tone={hasSell && calc.sell < calc.prices.floorPrice ? 'bad' : undefined} />
              <Metric label={`${whole(PRICING.noBeatMargin)} marj fiyatı`} value={usd(calc.prices.noBeatPrice)} />
              <Metric label={`${whole(PRICING.targetMargin)} marj fiyatı`} value={usd(calc.prices.targetPrice)} />
            </div>

            {/* Gider dökümü */}
            <div className="border-t p-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-base font-semibold">Gider dökümü</h2>
                <div className="text-sm text-muted-foreground">
                  Satış fiyatı <span className="font-semibold tabular-nums text-foreground">{hasSell ? usd(calc.sell) : '—'}</span>
                </div>
              </div>

              {hasSell && barTotal > 0 && (
                <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Satış fiyatının dağılımı">
                  {bar.map((b) => (b.value > 0 ? <div key={b.key} className={b.color} style={{ width: `${(b.value / barTotal) * 100}%` }} /> : null))}
                </div>
              )}

              <div className={cn(ROW_COLS, 'mt-4 border-b pb-2 text-xs font-medium text-muted-foreground')}>
                <span>Kalem</span>
                <span className="hidden sm:block" />
                <span className="text-right">Satışın %'si</span>
                <span className="text-right">Tutar</span>
              </div>
              <div className="divide-y">
                <CostRow label="Alış" value={calc.c.landedUsd} sell={calc.sell} color="bg-chart-1" />
                <CostRow label="Ozon kargosu" value={calc.c.ozonShippingUsd} sell={calc.sell} color="bg-chart-2" />
                <CostRow label="Depo (LS)" value={calc.c.depotUsd} sell={calc.sell} color="bg-chart-3" />
                <div>
                  <CostRow label="Ozon kesintileri" value={calc.ozonFees} sell={calc.sell} color="bg-chart-4" />
                  <div className="pb-1.5">
                    <CostRow label="Komisyon" value={calc.fees.commission} sell={calc.sell} color="bg-chart-4" sub />
                    <CostRow label="Acquiring" value={calc.fees.acquiring} sell={calc.sell} color="bg-chart-4" sub />
                    <CostRow label="Aracılık" value={calc.fees.intermediary} sell={calc.sell} color="bg-chart-4" sub />
                    <CostRow label="Platform" value={calc.fees.platform} sell={calc.sell} color="bg-chart-4" sub />
                  </div>
                </div>
              </div>

              <div className="mt-2 space-y-1 border-t pt-3">
                <div className={cn(ROW_COLS, 'items-center')}>
                  <span className="text-sm font-medium">Toplam gider</span>
                  <span className="hidden sm:block" />
                  <span className="text-right text-sm tabular-nums text-muted-foreground">{hasSell ? pct(calc.totalCost / calc.sell) : '—'}</span>
                  <span className="text-right text-sm font-semibold tabular-nums">{usd(-calc.totalCost)}</span>
                </div>
                <div className={cn(ROW_COLS, 'items-center')}>
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="size-2.5 rounded-full bg-emerald-500" />
                    Net kâr
                  </span>
                  <span className="hidden sm:block" />
                  <span className="text-right text-sm tabular-nums text-muted-foreground">{hasSell ? pct(calc.profit / calc.sell) : '—'}</span>
                  <span
                    className={cn(
                      'text-right text-base font-bold tabular-nums',
                      profitTone === 'good' && 'text-emerald-600',
                      profitTone === 'bad' && 'text-destructive'
                    )}
                  >
                    {hasSell ? usd(calc.profit) : '—'}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
