'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { calculateShippingCosts } from '@/lib/calculator/profitCalculator';
import { formatPercent, formatTL } from '@/lib/format';
import { OZON_GLOBAL_FEES, PRICING, costBase, marginPrices, profitAt } from '@/lib/pricing/rules';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { Separator } from '@/components/shadcn/separator';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs';

/**
 * Tek ürün için kâr hesabı. Fiyat önerisiyle aynı kurallar (src/lib/pricing/rules.ts): alış € ECB kuruyla
 * dolara (+ banka kur farkı), satış $, Ozon kesintileri, LS kargo ve depo ücreti ağırlıktan.
 * Alış zł de girilebilir (amazon.pl): önce ECB EUR/PLN kuruyla €'ya çevrilir, hesabın geri kalanı aynıdır.
 * Ağırlık tek alandır ve olduğu gibi kullanılır: fiyat önerisinde görünen kargo ağırlığı (LS paketi dahil) girilir
 * (eskiden LS paketi burada bir kez daha ekleniyordu). Alış fiyatı depoya gelmiş tutardır; ayrı "depoya kargo" yok.
 * Görünüm sade (kullanıcı 2026-10-25): açıklama metni yok, kalemler alt alta liste yerine kompakt kutucuklarda.
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
  { value: 'EUR', symbol: '€', label: '€ Euro' },
  { value: 'PLN', symbol: 'zł', label: 'zł Zloti' },
];

const decimal2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimal4 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const usd = (n: number) => `${n < 0 ? '−' : ''}$${decimal2.format(Math.abs(n))}`;
const pct = (p: number) => formatPercent(p * 100, p * 100 < 1 ? 2 : 1);
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
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 pr-12 text-base font-semibold tabular-nums"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

/** Kompakt kalem kutucuğu: renk noktası, etiket, tutar */
function Tile({ label, value, dot, tone, strong }: { label: string; value: string; dot?: string; tone?: 'bad'; strong?: boolean }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {dot && <span className={cn('size-2 shrink-0 rounded-full', dot)} />}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn('mt-0.5 tabular-nums', strong ? 'text-base font-semibold' : 'text-sm font-medium', tone === 'bad' && 'text-destructive')}>
        {value}
      </div>
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
      commissionPct,
      c,
      fees,
      ozonFees,
      tiers: calculateShippingCosts(weightG).weightUnits,
      profit,
      margin,
      prices: marginPrices(c),
      payoutUsd: sell - ozonFees - c.ozonShippingUsd,
      cardTry: buyLocal * (form.currency === 'PLN' ? rates.plnTry : rates.eurTry) * (1 + PRICING.bankFxPct),
    };
  }, [rates, form]);

  const cur = BUY_CURRENCIES.find((c) => c.value === form.currency)!;
  const isPln = form.currency === 'PLN';
  const hasSell = !!calc && calc.sell > 0;
  const loss = hasSell && calc!.profit < 0;

  // Satış fiyatının nereye gittiği (zararda maliyetin toplamına göre)
  const parts = calc
    ? [
        { key: 'buy', label: 'Alış', value: calc.c.landedUsd, color: 'bg-chart-1' },
        { key: 'ship', label: `Ozon kargosu · ${calc.tiers} kademe`, value: calc.c.ozonShippingUsd, color: 'bg-chart-2' },
        { key: 'depot', label: 'LS depo', value: calc.c.depotUsd, color: 'bg-chart-3' },
        { key: 'fees', label: 'Ozon kesintileri', value: calc.ozonFees, color: 'bg-chart-4' },
        { key: 'profit', label: 'Net kâr', value: Math.max(calc.profit, 0), color: 'bg-chart-5' },
      ]
    : [];
  const partsTotal = parts.reduce((s, p) => s + p.value, 0);

  return (
    <div className="flex-1 space-y-6 bg-background p-4 pt-6 text-foreground md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Kâr Hesaplama</h1>
        <div className="flex flex-wrap items-center gap-2">
          {rates && (
            <>
              <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                1 € = <span className="font-semibold tabular-nums text-foreground">{decimal4.format(rates.eurUsd)} $</span>
                <span>· {day(rates.eurUsdDate)}</span>
              </Badge>
              {isPln && (
                <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                  1 € = <span className="font-semibold tabular-nums text-foreground">{decimal4.format(rates.eurPln)} zł</span>
                </Badge>
              )}
              <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                1 $ = <span className="font-semibold tabular-nums text-foreground">{decimal2.format(rates.usdTry)} ₺</span>
                <span>· {day(rates.tryDate)}</span>
              </Badge>
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

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Ürün</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...EMPTY, currency: f.currency }))}>
                <RotateCcw />
                Sıfırla
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v as BuyCurrency }))}>
              <TabsList className="w-full" aria-label="Alış para birimi">
                {BUY_CURRENCIES.map((c) => (
                  <TabsTrigger key={c.value} value={c.value}>
                    {c.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Field id="buy" label="Alış fiyatı" unit={cur.symbol} value={form.buy} onChange={set('buy')} />
            <Field id="sell" label="Ozon satış fiyatı" unit="$" value={form.sell} onChange={set('sell')} />
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <Field id="weight-g" label="Kargo ağırlığı" unit="g" value={form.weightG} onChange={set('weightG')} />
              <Field id="commission" label="Komisyon" unit="%" value={form.commission} onChange={set('commission')} />
            </div>
          </CardContent>
        </Card>

        {!rates && !rateError ? (
          <Skeleton className="h-80" />
        ) : !calc ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">Alış fiyatı ve kargo ağırlığı girin.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Net kâr</p>
                  <p className={cn('text-4xl font-bold tracking-tight tabular-nums', loss && 'text-destructive')}>
                    {hasSell ? usd(calc.profit) : '—'}
                  </p>
                  {hasSell && rates && <p className="text-sm text-muted-foreground tabular-nums">{formatTL(calc.profit * rates.usdTry)}</p>}
                </div>
                {hasSell && (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={loss ? 'destructive' : 'secondary'} className="text-sm">
                      Marj {pct(calc.margin)}
                    </Badge>
                    <Badge variant="outline" className="text-sm font-normal">
                      Satışa göre {pct(calc.profit / calc.sell)}
                    </Badge>
                  </div>
                )}
              </div>

              {hasSell && partsTotal > 0 && (
                <div
                  className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={parts.map((p) => `${p.label} ${usd(p.value)}`).join(', ')}
                >
                  {parts.map((p) =>
                    p.value > 0 ? (
                      <div key={p.key} className={p.color} style={{ width: `${(p.value / partsTotal) * 100}%` }} title={`${p.label}: ${usd(p.value)}`} />
                    ) : null
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <Tile label="Satış" value={hasSell ? usd(calc.sell) : '—'} strong />
                {parts.map((p) => (
                  <Tile
                    key={p.key}
                    label={p.label}
                    dot={p.color}
                    value={p.key === 'profit' ? (hasSell ? usd(calc.profit) : '—') : usd(p.value)}
                    tone={p.key === 'profit' && loss ? 'bad' : undefined}
                    strong={p.key === 'profit'}
                  />
                ))}
              </div>

              {hasSell && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                  <span>Komisyon {whole(calc.commissionPct)} {usd(calc.fees.commission)}</span>
                  <span>Acquiring {usd(calc.fees.acquiring)}</span>
                  <span>Aracılık {usd(calc.fees.intermediary)}</span>
                  <span>Platform {usd(calc.fees.platform)}</span>
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                <Tile label="Asgari kâr fiyatı" value={usd(calc.prices.floorPrice)} />
                <Tile label={`${whole(PRICING.noBeatMargin)} marj fiyatı`} value={usd(calc.prices.noBeatPrice)} />
                <Tile label={`${whole(PRICING.targetMargin)} marj fiyatı`} value={usd(calc.prices.targetPrice)} />
                <Tile label="Ozon hakedişi" value={hasSell ? usd(calc.payoutUsd) : '—'} />
                <Tile label="Karttan çekilecek" value={formatTL(calc.cardTry)} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
