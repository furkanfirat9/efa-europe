'use client';

import React, { useEffect, useState } from 'react';

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

  const formatUsd = (val: number | null) => {
    if (val === null || isNaN(val)) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="inline-flex items-center gap-6 rounded-[24px] bg-surface px-6 py-3.5 shadow-hairline border border-border-subtle">
      {/* Europe */}
      <div className="flex flex-col">
        <span className="text-xs font-medium text-text-secondary">
          Europe
        </span>
        <span className="mt-0.5 text-xl font-medium tracking-tight text-text-primary tabular-nums">
          {loading ? (
            <span className="inline-block h-6 w-16 animate-pulse rounded-md bg-surface-muted" />
          ) : (
            formatUsd(europeRevenue)
          )}
        </span>
      </div>

      {/* Dikey Çizgi */}
      <div className="h-8 w-px bg-border-subtle" />

      {/* Turkiye */}
      <div className="flex flex-col">
        <span className="text-xs font-medium text-text-secondary">
          Turkiye
        </span>
        <span className="mt-0.5 text-xl font-medium tracking-tight text-text-primary tabular-nums">
          {loading ? (
            <span className="inline-block h-6 w-20 animate-pulse rounded-md bg-surface-muted" />
          ) : (
            formatUsd(turkiyeRevenue)
          )}
        </span>
      </div>
    </div>
  );
}
