'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Separator } from '@/components/shadcn/separator';
import { Skeleton } from '@/components/shadcn/skeleton';
import { formatTL } from '@/lib/format';
import type { PeriodProfit } from '@/lib/orders/periodProfit';
import { cn } from '@/lib/utils';

const usd = (n: number) =>
  `${n < 0 ? '−' : ''}$${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))}`;

/** Siparişler sayfasının dönem çekmesi: bu ay ve (hafta önceki aya taşıyorsa) önceki ay. Değişiklik olduysa true. */
async function syncMonths(weekStart: string) {
  const local = (d: Date) => new Date(d.getTime() + 3 * 3600 * 1000);
  const months = new Map<string, { year: number; month: number }>();
  for (const d of [local(new Date(weekStart)), local(new Date())]) {
    months.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  let changed = false;
  for (const body of months.values()) {
    const res = await fetch('/api/siparisler/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (data?.success && (!data.skipped || data.profitsUpdated > 0)) changed = true;
  }
  return changed;
}

/** Dashboard'un sağ sütunu: bugün, bu hafta ve bu ayın sipariş kârı (Avrupa mağazası). */
export function OrderProfitCard() {
  const [periods, setPeriods] = useState<PeriodProfit[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/dashboard/kar', { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error_message);
    setPeriods(data.periods);
    setError(false);
    return data.periods as PeriodProfit[];
  }, []);

  useEffect(() => {
    let alive = true;
    // Önce veri tabanındakini göster, sonra Ozon'la eşitleyip değiştiyse yeniden oku
    const run = async () => {
      try {
        const current = await load();
        const week = current.find((p) => p.key === 'week');
        if (alive && week && (await syncMonths(week.from)) && alive) await load();
      } catch (err) {
        console.error('Kâr kartı yüklenemedi:', err);
        if (alive) setError(true);
      }
    };
    run();
    const interval = setInterval(run, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [load]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription>Sipariş kârı · Europe</CardDescription>
        <CardTitle>Kâr</CardTitle>
        <CardAction>
          <Badge variant="outline">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Canlı
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && !periods ? (
          <p className="text-sm text-muted-foreground">Kâr hesaplanamadı.</p>
        ) : (
          (periods ?? [null, null, null]).map((p, i) => (
            <React.Fragment key={p?.key ?? i}>
              {i > 0 && <Separator />}
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">{p?.label ?? <Skeleton className="h-4 w-16" />}</div>
                {p ? (
                  <>
                    <div className={cn('text-3xl font-semibold tabular-nums', p.profitUsd < 0 && 'text-destructive')}>
                      {usd(p.profitUsd)}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatTL(p.profitTry, false)} · {p.orders} sipariş · {usd(p.revenueUsd)} ciro
                    </div>
                    {(p.estimatedCount > 0 || p.unknownCount > 0) && (
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {usd(p.knownUsd)} kesin
                        {p.estimatedCount > 0 && ` · ${usd(p.estimatedUsd)} tahmini (${p.estimatedCount} alış bekliyor)`}
                        {p.unknownCount > 0 && ` · ${p.unknownCount} sipariş hesaplanamadı`}
                      </div>
                    )}
                  </>
                ) : (
                  <Skeleton className="h-9 w-32" />
                )}
              </div>
            </React.Fragment>
          ))
        )}
      </CardContent>
      <CardFooter className="mt-auto flex-col items-start gap-3">
        <p className="text-xs text-muted-foreground">
          Tahmini: alışı girilmemiş siparişler, fiyat önerisindeki maliyetle. Alış girilince kesinleşir.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/siparisler">
            Siparişler
            <ArrowUpRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
