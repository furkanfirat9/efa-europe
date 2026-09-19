'use client';

import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/shadcn/badge';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Skeleton } from '@/components/shadcn/skeleton';

export function MonthlyRevenueCard() {
  const [europeRevenue, setEuropeRevenue] = useState<number | null>(null);
  const [turkiyeRevenue, setTurkiyeRevenue] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function loadMonthlyRevenue() {
      try {
        const now = new Date();
        const localNow = new Date(now.getTime() + 3 * 3600 * 1000);
        const year = localNow.getUTCFullYear();
        const month = String(localNow.getUTCMonth() + 1).padStart(2, '0');
        const day = String(localNow.getUTCDate()).padStart(2, '0');

        const dateFrom = `${year}-${month}-01`;
        const dateTo = `${year}-${month}-${day}`;

        const fetchStore = async (store: 'store1' | 'store2') => {
          const res = await fetch('/api/ozon/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              store,
              date_from: dateFrom,
              date_to: dateTo,
              mode: 'orders',
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          return Number(data.totalRevenue || 0);
        };

        const [europe, turkiye] = await Promise.all([
          fetchStore('store1'),
          fetchStore('store2'),
        ]);

        if (isMounted) {
          setEuropeRevenue(europe);
          setTurkiyeRevenue(turkiye);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch monthly revenue:', err);
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadMonthlyRevenue();

    // 5 dakikada bir sessizce tazele
    const interval = setInterval(loadMonthlyRevenue, 5 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const europe = europeRevenue ?? 0;
  const turkiye = turkiyeRevenue ?? 0;
  const total = europe + turkiye;
  const europeShare = total > 0 ? (europe / total) * 100 : 50;

  const stores = [
    { key: 'europe', label: 'Europe', value: europe, share: europeShare, color: 'bg-chart-2' },
    { key: 'turkiye', label: 'Türkiye', value: turkiye, share: 100 - europeShare, color: 'bg-chart-4' },
  ];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription>Bu ay ciro · iki mağaza</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">
          {loading ? <Skeleton className="h-9 w-36" /> : formatUsd(total)}
        </CardTitle>
        <CardAction>
          <Badge variant="outline">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Canlı
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="mt-auto flex-col items-stretch gap-3 text-sm">
        {/* Mağaza payı */}
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          {!loading &&
            total > 0 &&
            stores.map((s) => <div key={s.key} className={s.color} style={{ width: `${s.share}%` }} />)}
        </div>
        {stores.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className={`size-2 rounded-full ${s.color}`} />
              {s.label}
            </span>
            <span className="font-medium tabular-nums">
              {loading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <>
                  {formatUsd(s.value)}
                  {total > 0 && (
                    <span className="ml-2 font-normal text-muted-foreground">%{s.share.toFixed(0)}</span>
                  )}
                </>
              )}
            </span>
          </div>
        ))}
      </CardFooter>
    </Card>
  );
}

function formatUsd(val: number | null) {
  if (val === null || isNaN(val)) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(val);
}
