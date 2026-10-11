'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Box, RefreshCw, RotateCcw, Scale, Truck, Wallet } from 'lucide-react';
import { calculateShippingCosts } from '@/lib/calculator/profitCalculator';
import { formatEuro, formatPercent, formatTL } from '@/lib/format';
import { OZON_GLOBAL_FEES, PRICING, costBase, marginPrices, profitAt, shippingWeight } from '@/lib/pricing/rules';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Button } from '@/components/shadcn/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { Separator } from '@/components/shadcn/separator';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableRow } from '@/components/shadcn/table';

/**
 * Tek ürün için kâr hesabı. Fiyat önerisiyle aynı kurallar (src/lib/pricing/rules.ts): alış € ECB kuruyla
 * dolara (+ banka kur farkı), satış $, Ozon kesintileri, LS kargo ve depo ücreti ağırlıktan.
 * Eskiden alış ve satış aynı para biriminde sayılıyordu; dolar seçilince LS'nin € tarifeleri dolar gibi toplanıyordu.
 */

interface Rates {
  eurUsd: number;
  eurUsdDate: string;
  eurTry: number;
  usdTry: number;
  tryDate: string;
  platformCapUsd: number | null;
}

type Form = { buy: string; inbound: string; sell: string; itemG: string; boxG: string; commission: string };

const EMPTY: Form = { buy: '', inbound: '0', sell: '', itemG: '', boxG: '', commission: '5' };
const START: Form = { buy: '50', inbound: '0', sell: '120', itemG: '1000', boxG: '', commission: '5' };

const decimal2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimal4 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const usd = (n: number) => `${n < 0 ? '−' : ''}$${decimal2.format(Math.abs(n))}`;
const grams = (n: number) => `${new Intl.NumberFormat('tr-TR').format(n)} g`;
const pct = (p: number) => formatPercent(p * 100, p * 100 < 1 ? 2 : 1);
/** 0.25 → "%25" (0.07 × 100 gibi kayan nokta artıklarını atar) */
const whole = (p: number) => `%${Math.round(p * 100)}`;
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

/** Boş ya da geçersiz giriş 0 sayılır */
function num(value: string) {
  const n = parseFloat(value.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function Field({
  id,
  label,
  hint,
  unit,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
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
          className="pr-12 font-semibold tabular-nums"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Line({ label, note, value, strong }: { label: React.ReactNode; note?: string; value: string; strong?: boolean }) {
  return (
    <TableRow>
      <TableCell className="py-2.5 text-xs">
        <div className={cn(strong && 'font-semibold')}>{label}</div>
        {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
      </TableCell>
      <TableCell className={cn('py-2.5 text-right text-xs tabular-nums', strong ? 'font-semibold' : 'font-medium')}>{value}</TableCell>
    </TableRow>
  );
}

function Kpi({ title, value, note, tone }: { title: string; value: string; note?: string; tone?: 'bad' }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription className="text-xs">{title}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <div className={cn('text-2xl font-bold tracking-tight tabular-nums', tone === 'bad' && 'text-destructive')}>{value}</div>
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
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
    const buy = num(form.buy);
    const inbound = num(form.inbound);
    const sell = num(form.sell);
    const commissionPct = num(form.commission) / 100;
    const w = shippingWeight({ amzItemG: num(form.itemG) || null, amzPackageG: num(form.boxG) || null });
    if (!buy || !w.grams) return null;

    const c = costBase({
      purchaseEur: buy,
      shippingEur: inbound,
      weightG: w.grams,
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
      w,
      c,
      fees,
      platformCapped: rates.platformCapUsd != null && platformRaw > rates.platformCapUsd,
      tiers: calculateShippingCosts(w.grams).weightUnits,
      profit,
      margin,
      prices: marginPrices(c),
      payoutUsd: sell - ozonFees - c.ozonShippingUsd,
      cardTry: (buy + inbound) * rates.eurTry * (1 + PRICING.bankFxPct),
      buyEur: buy + inbound,
    };
  }, [rates, form]);

  const weightNote = calc
    ? calc.w.source === 'amazon-package'
      ? `kutulu ağırlık + ${PRICING.boxPadG} g LS paketi`
      : `ürün ağırlığı + ${whole(PRICING.packagingPct)} paket payı, en az ${PRICING.packagingMinG} g`
    : '';

  return (
    <div className="flex-1 space-y-6 bg-background p-4 pt-6 text-foreground md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kâr Hesaplama</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fiyat önerisiyle aynı hesap: alış €, Ozon satışı $, kargo ve depo ücreti ağırlıktan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rates && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-xs">
              <span>
                1 € = <span className="font-semibold tabular-nums text-foreground">{decimal4.format(rates.eurUsd)} $</span> · ECB{' '}
                {day(rates.eurUsdDate)}
              </span>
              <span className="text-border">|</span>
              <span>
                1 € = <span className="font-semibold tabular-nums text-foreground">{decimal2.format(rates.eurTry)} ₺</span>, 1 $ ={' '}
                <span className="font-semibold tabular-nums text-foreground">{decimal2.format(rates.usdTry)} ₺</span> · TCMB{' '}
                {day(rates.tryDate)}
              </span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={loadRates} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Kurları yenile
          </Button>
        </div>
      </div>

      {rateError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Kurlar alınamadı</AlertTitle>
          <AlertDescription>{rateError} Hesap kur olmadan yapılamıyor; biraz sonra yeniden deneyin.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle>Ürün</CardTitle>
            <CardDescription>Alış, satış ve ağırlık</CardDescription>
            <CardAction className="flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setForm(EMPTY)} className="h-8 gap-1.5 text-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                Sıfırla
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="buy" label="Alış fiyatı" hint="Amazon / Ceneo, KDV dahil" unit="€" value={form.buy} onChange={set('buy')} />
              <Field
                id="inbound"
                label="Depoya kargo"
                hint="Amazon.de 5,99 €; ücretsizse 0"
                unit="€"
                value={form.inbound}
                onChange={set('inbound')}
              />
            </div>
            <Field id="sell" label="Ozon satış fiyatı" hint="Müşterinin gördüğü fiyat" unit="$" value={form.sell} onChange={set('sell')} />
            <Separator />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="item-g" label="Ürün ağırlığı" hint="Amazon'daki ürün ağırlığı" unit="g" value={form.itemG} onChange={set('itemG')} />
              <Field
                id="box-g"
                label="Kutulu ağırlık"
                hint="Varsa (Icecat / Amazon); bu kullanılır"
                unit="g"
                value={form.boxG}
                onChange={set('boxG')}
              />
            </div>
            <Field id="commission" label="Ozon komisyonu" hint="Kategoriye göre, çoğunlukla %5" unit="%" value={form.commission} onChange={set('commission')} />
          </CardContent>
        </Card>

        <div className="space-y-6 xl:col-span-7">
          {!rates && !rateError ? (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : !calc ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">Alış fiyatı ve ağırlık girin.</CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                <Kpi
                  title="Net kâr"
                  value={calc.sell ? usd(calc.profit) : '—'}
                  note={calc.sell && rates ? formatTL(calc.profit * rates.usdTry) : 'Satış fiyatı girin'}
                  tone={calc.sell && calc.profit < 0 ? 'bad' : undefined}
                />
                <Kpi
                  title="Marj"
                  value={calc.sell ? pct(calc.margin) : '—'}
                  note={calc.sell ? `maliyete göre · satışa göre ${pct(calc.profit / calc.sell)}` : 'maliyete göre'}
                  tone={calc.sell && calc.profit < 0 ? 'bad' : undefined}
                />
                <Kpi title="Asgari kâr fiyatı" value={usd(calc.prices.floorPrice)} note={`maliyetin ${whole(PRICING.minProfitPct)}'i, en az ${PRICING.minProfitUsd} $`} />
                <Kpi
                  title={`${whole(PRICING.targetMargin)} marj fiyatı`}
                  value={usd(calc.prices.targetPrice)}
                  note={`rakipsiz (${whole(PRICING.noRivalMargin)}): ${usd(calc.prices.noRivalPrice)}`}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Döküm</CardTitle>
                  <CardDescription>
                    Kargo ağırlığı {grams(calc.w.grams)} ({weightNote}) · {calc.tiers} kademe
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-lg border">
                    <Table>
                      <TableBody>
                        <Line label="Ozon satış fiyatı" value={usd(calc.sell)} strong />
                        <Line
                          label="Alış + depoya kargo"
                          note={`${formatEuro(calc.buyEur)} × ${decimal4.format(rates!.eurUsd)}, ${pct(PRICING.bankFxPct)} kur farkıyla`}
                          value={usd(-calc.c.landedUsd)}
                        />
                        <Line
                          label={
                            <span className="flex items-center gap-1.5">
                              <Truck className="h-3 w-3 text-muted-foreground" />
                              Ozon kargosu
                            </span>
                          }
                          note={`10,30 € + ${calc.tiers} × 2,50 €`}
                          value={usd(-calc.c.ozonShippingUsd)}
                        />
                        <Line
                          label={
                            <span className="flex items-center gap-1.5">
                              <Box className="h-3 w-3 text-muted-foreground" />
                              Depo ücreti (LS)
                            </span>
                          }
                          note="kabul + sevk + paket"
                          value={usd(-calc.c.depotUsd)}
                        />
                        <Line label={`Komisyon (${pct(calc.commissionPct)})`} value={usd(-calc.fees.commission)} />
                        <Line label={`Acquiring (${pct(PRICING.acquiringPct)})`} value={usd(-calc.fees.acquiring)} />
                        <Line label={`Aracılık (${pct(OZON_GLOBAL_FEES.intermediaryPct)})`} value={usd(-calc.fees.intermediary)} />
                        <Line
                          label={`Platform ücreti (${pct(OZON_GLOBAL_FEES.platformPct)})`}
                          note={calc.platformCapped ? `${OZON_GLOBAL_FEES.platformCapRub} ₽ tavanında` : `en fazla ${OZON_GLOBAL_FEES.platformCapRub} ₽`}
                          value={usd(-calc.fees.platform)}
                        />
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell className="py-3 text-xs font-semibold">Net kâr</TableCell>
                          <TableCell
                            className={cn('py-3 text-right text-xs font-bold tabular-nums', calc.profit < 0 && 'text-destructive')}
                          >
                            {usd(calc.profit)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-lg border p-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Wallet className="h-3.5 w-3.5" />
                        Ozon hakedişi
                      </div>
                      <div className="mt-1 text-xl font-semibold tabular-nums">{usd(calc.payoutUsd)}</div>
                      <p className="text-xs text-muted-foreground">
                        {formatTL(calc.payoutUsd * rates!.usdTry)} · satış − Ozon kesintileri − kargo
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Scale className="h-3.5 w-3.5" />
                        Kartından çekilecek (tahmini)
                      </div>
                      <div className="mt-1 text-xl font-semibold tabular-nums">{formatTL(calc.cardTry)}</div>
                      <p className="text-xs text-muted-foreground">
                        {formatEuro(calc.buyEur)} × {decimal2.format(rates!.eurTry)} ₺, {pct(PRICING.bankFxPct)} kur farkıyla
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
