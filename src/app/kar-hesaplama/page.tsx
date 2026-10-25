'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { calculateShippingCosts } from '@/lib/calculator/profitCalculator';
import { formatEuro, formatPercent, formatTL } from '@/lib/format';
import { OZON_GLOBAL_FEES, PRICING, costBase, marginPrices, profitAt } from '@/lib/pricing/rules';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { Separator } from '@/components/shadcn/separator';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableRow } from '@/components/shadcn/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs';

/**
 * Tek ürün için kâr hesabı. Fiyat önerisiyle aynı kurallar (src/lib/pricing/rules.ts): alış € ECB kuruyla
 * dolara (+ banka kur farkı), satış $, Ozon kesintileri, LS kargo ve depo ücreti ağırlıktan.
 * Eskiden alış ve satış aynı para biriminde sayılıyordu; dolar seçilince LS'nin € tarifeleri dolar gibi toplanıyordu.
 * Alış zł de girilebilir (amazon.pl): önce ECB EUR/PLN kuruyla €'ya çevrilir, hesabın geri kalanı aynıdır.
 * Ağırlık tek alandır ve olduğu gibi kullanılır: fiyat önerisinde görünen kargo ağırlığı (LS paketi dahil) girilir.
 * Eskiden ürün/kutulu ağırlık girilip LS paketi burada ekleniyordu; fiyat önerisindeki paketli değer girilince
 * paket iki kez sayılıyordu (E3040644: 2 290 g → 2 540 g, bir kargo kademesi fazla, kâr 8,61 $ yerine 5,81 $).
 * "Depoya kargo" alanı kaldırıldı (kullanıcı 2026-10-25): alış fiyatı depoya gelmiş tutar olarak girilir.
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

/** Alışın girildiği para birimi: Amazon.de / Ceneo €, amazon.pl zł */
const BUY_CURRENCIES: { value: BuyCurrency; symbol: string; label: string; buyHint: string }[] = [
  { value: 'EUR', symbol: '€', label: '€ Euro', buyHint: 'Amazon.de / Ceneo, KDV dahil; kargo ücretliyse ekleyin' },
  { value: 'PLN', symbol: 'zł', label: 'zł Zloti', buyHint: 'amazon.pl, KDV dahil; kargo ücretliyse ekleyin' },
];

const decimal2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimal4 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const usd = (n: number) => `${n < 0 ? '−' : ''}$${decimal2.format(Math.abs(n))}`;
const zloty = (n: number) => `${decimal2.format(n)} zł`;
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
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Line({ label, note, value, strong }: { label: React.ReactNode; note?: string; value: string; strong?: boolean }) {
  return (
    <TableRow>
      <TableCell className="py-2.5">
        <div className={cn('text-sm', strong && 'font-semibold')}>{label}</div>
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </TableCell>
      <TableCell className={cn('py-2.5 text-right text-sm tabular-nums', strong ? 'font-semibold' : 'font-medium')}>{value}</TableCell>
    </TableRow>
  );
}

/** Hedef fiyat kutusu: asgari kâr, rakibi yenemeyince ve üst sınır fiyatları */
function PriceTarget({ title, value, note, active }: { title: string; value: string; note: string; active?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-3', active && 'border-primary')}>
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
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
      weightG,
      c,
      fees,
      ozonFees,
      platformCapped: rates.platformCapUsd != null && platformRaw > rates.platformCapUsd,
      tiers: calculateShippingCosts(weightG).weightUnits,
      profit,
      margin,
      prices: marginPrices(c),
      payoutUsd: sell - ozonFees - c.ozonShippingUsd,
      cardTry: buyLocal * (form.currency === 'PLN' ? rates.plnTry : rates.eurTry) * (1 + PRICING.bankFxPct),
      buyEur: buy,
      buyLocal,
    };
  }, [rates, form]);

  const cur = BUY_CURRENCIES.find((c) => c.value === form.currency)!;
  const isPln = form.currency === 'PLN';
  const loss = !!calc && calc.sell > 0 && calc.profit < 0;

  // Satış fiyatının nereye gittiği: zararda maliyetin toplamına göre
  const parts = calc
    ? [
        { key: 'buy', label: 'Alış', value: calc.c.landedUsd, color: 'bg-chart-1' },
        { key: 'ship', label: 'Ozon kargosu', value: calc.c.ozonShippingUsd, color: 'bg-chart-2' },
        { key: 'depot', label: 'LS depo', value: calc.c.depotUsd, color: 'bg-chart-3' },
        { key: 'fees', label: 'Ozon kesintileri', value: calc.ozonFees, color: 'bg-chart-4' },
        { key: 'profit', label: 'Net kâr', value: Math.max(calc.profit, 0), color: 'bg-chart-5' },
      ]
    : [];
  const partsTotal = parts.reduce((s, p) => s + p.value, 0);

  return (
    <div className="flex-1 space-y-6 bg-background p-4 pt-6 text-foreground md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kâr Hesaplama</h1>
          <p className="mt-1 text-sm text-muted-foreground">Fiyat önerisiyle aynı hesap: alış € ya da zł, Ozon satışı $, kargo ve depo ücreti ağırlıktan.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rates && (
            <>
              <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                1 € = <span className="font-semibold tabular-nums text-foreground">{decimal4.format(rates.eurUsd)} $</span>
                <span>· ECB {day(rates.eurUsdDate)}</span>
              </Badge>
              {isPln && (
                <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                  1 € = <span className="font-semibold tabular-nums text-foreground">{decimal4.format(rates.eurPln)} zł</span>
                </Badge>
              )}
              <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                1 € = <span className="font-semibold tabular-nums text-foreground">{decimal2.format(rates.eurTry)} ₺</span>, 1 $ ={' '}
                <span className="font-semibold tabular-nums text-foreground">{decimal2.format(rates.usdTry)} ₺</span>
                <span>· TCMB {day(rates.tryDate)}</span>
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
          <AlertDescription>{rateError} Hesap kur olmadan yapılamıyor; biraz sonra yeniden deneyin.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Ürün</CardTitle>
            <CardDescription>Alış, satış ve kargo ağırlığı</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...EMPTY, currency: f.currency }))}>
                <RotateCcw />
                Sıfırla
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Alış para birimi</Label>
              <Tabs value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v as BuyCurrency }))}>
                <TabsList className="w-full">
                  {BUY_CURRENCIES.map((c) => (
                    <TabsTrigger key={c.value} value={c.value}>
                      {c.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <Field id="buy" label="Alış fiyatı" hint={cur.buyHint} unit={cur.symbol} value={form.buy} onChange={set('buy')} />
            <Field id="sell" label="Ozon satış fiyatı" hint="Müşterinin gördüğü fiyat" unit="$" value={form.sell} onChange={set('sell')} />
            <Separator />
            <Field
              id="weight-g"
              label="Kargo ağırlığı"
              hint={`Fiyat önerisindeki kargo ağırlığı; LS paketi (${PRICING.boxPadG} g) dahil, olduğu gibi kullanılır`}
              unit="g"
              value={form.weightG}
              onChange={set('weightG')}
            />
            <Field id="commission" label="Ozon komisyonu" hint="Kategoriye göre, çoğunlukla %5" unit="%" value={form.commission} onChange={set('commission')} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {!rates && !rateError ? (
            <div className="space-y-4">
              <Skeleton className="h-44" />
              <Skeleton className="h-72" />
            </div>
          ) : !calc ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">Alış fiyatı ve kargo ağırlığı girin.</CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="space-y-5">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Net kâr</p>
                      <p className={cn('text-4xl font-bold tracking-tight tabular-nums', loss && 'text-destructive')}>
                        {calc.sell ? usd(calc.profit) : '—'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {calc.sell && rates ? formatTL(calc.profit * rates.usdTry) : 'Satış fiyatı girin'}
                      </p>
                    </div>
                    {calc.sell > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={loss ? 'destructive' : 'secondary'} className="text-sm">
                          Marj {pct(calc.margin)}
                        </Badge>
                        <Badge variant="outline" className="text-sm font-normal">
                          satışa göre {pct(calc.profit / calc.sell)}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {calc.sell > 0 && partsTotal > 0 && (
                    <div className="space-y-2">
                      <div
                        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
                        role="img"
                        aria-label={`Satış fiyatının dağılımı: ${parts.map((p) => `${p.label} ${usd(p.value)}`).join(', ')}`}
                      >
                        {parts.map((p) =>
                          p.value > 0 ? (
                            <div key={p.key} className={p.color} style={{ width: `${(p.value / partsTotal) * 100}%` }} title={`${p.label}: ${usd(p.value)}`} />
                          ) : null
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {parts.map((p) => (
                          <span key={p.key} className="inline-flex items-center gap-1.5">
                            <span className={cn('size-2 rounded-full', p.color)} />
                            {p.label} <span className="tabular-nums text-foreground">{usd(p.value)}</span>
                          </span>
                        ))}
                        {loss && <span className="text-destructive">zarar {usd(-calc.profit)}</span>}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <PriceTarget
                      title="Asgari kâr fiyatı"
                      value={usd(calc.prices.floorPrice)}
                      note={`maliyetin ${whole(PRICING.minProfitPct)}'i, en az ${PRICING.minProfitUsd} $`}
                      active={calc.sell > 0 && calc.sell < calc.prices.floorPrice}
                    />
                    <PriceTarget
                      title="Rakip yenilemezse"
                      value={usd(calc.prices.noBeatPrice)}
                      note={`${whole(PRICING.noBeatMargin)} marj`}
                    />
                    <PriceTarget
                      title="Üst sınır / rakipsiz"
                      value={usd(calc.prices.targetPrice)}
                      note={`${whole(PRICING.targetMargin)} marj`}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
                <Card>
                  <CardHeader>
                    <CardTitle>Döküm</CardTitle>
                    <CardDescription>
                      Kargo ağırlığı {grams(calc.weightG)} (LS paketi dahil) · {calc.tiers} kademe
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableBody>
                        <Line label="Ozon satış fiyatı" value={usd(calc.sell)} strong />
                        <Line
                          label="Alış"
                          note={`${isPln ? `${zloty(calc.buyLocal)} ÷ ${decimal4.format(rates!.eurPln)} = ` : ''}${formatEuro(calc.buyEur)} × ${decimal4.format(rates!.eurUsd)}, ${pct(PRICING.bankFxPct)} kur farkıyla`}
                          value={usd(-calc.c.landedUsd)}
                        />
                        <Line label="Ozon kargosu" note={`10,30 € + ${calc.tiers} × 2,50 €`} value={usd(-calc.c.ozonShippingUsd)} />
                        <Line label="Depo ücreti (LS)" note="kabul + sevk + paket" value={usd(-calc.c.depotUsd)} />
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
                          <TableCell className="py-3 text-sm font-semibold">Net kâr</TableCell>
                          <TableCell className={cn('py-3 text-right text-sm font-bold tabular-nums', calc.profit < 0 && 'text-destructive')}>
                            {usd(calc.profit)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="gap-2">
                    <CardHeader>
                      <CardDescription>Ozon hakedişi</CardDescription>
                      <CardTitle className="text-2xl tabular-nums">{usd(calc.payoutUsd)}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      {formatTL(calc.payoutUsd * rates!.usdTry)} · satış − Ozon kesintileri − kargo
                    </CardContent>
                  </Card>
                  <Card className="gap-2">
                    <CardHeader>
                      <CardDescription>Kartından çekilecek (tahmini)</CardDescription>
                      <CardTitle className="text-2xl tabular-nums">{formatTL(calc.cardTry)}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      {isPln
                        ? `${zloty(calc.buyLocal)} × ${decimal4.format(rates!.plnTry)} ₺`
                        : `${formatEuro(calc.buyEur)} × ${decimal2.format(rates!.eurTry)} ₺`}
                      , {pct(PRICING.bankFxPct)} kur farkıyla
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
