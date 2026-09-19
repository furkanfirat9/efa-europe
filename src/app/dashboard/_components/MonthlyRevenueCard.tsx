'use client';

import React, { useEffect, useState } from 'react';
import { PillBadge } from '@/components/ui/PillBadge';

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
    { key: 'europe', label: 'Europe', value: europe, share: europeShare, hatch: 'var(--accent)', dot: 'bg-accent' },
    { key: 'turkiye', label: 'Türkiye', value: turkiye, share: 100 - europeShare, hatch: 'var(--text-muted)', dot: 'bg-text-muted' },
  ];

  return (
    <section className="flex h-full flex-col justify-between gap-6 rounded-card bg-surface p-6 shadow-hairline md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-normal tracking-tight text-text-primary md:text-[22px]">
            Bu ay ciro
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">Ozon · iki mağaza · USD</p>
        </div>
        <PillBadge tone="success" dot>Canlı</PillBadge>
      </div>

      <div>
        <p className="text-[12px] font-medium text-text-muted">Toplam</p>
        {loading ? (
          <span className="skeleton-soft mt-2 block h-10 w-40" />
        ) : (
          <p className="mt-1 text-[40px] font-light leading-none tracking-[-0.03em] text-text-primary tabular-nums">
            {formatUsd(total)}
          </p>
        )}
      </div>

      {/* Mağaza payı: taralı şerit, iki segment arasında boşluk */}
      <div className="space-y-4">
        <div className="flex h-3 gap-1" aria-hidden>
          {stores.map((s) => (
            <div
              key={s.key}
              className="hatch h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max(s.share, 2)}%`, ['--hatch' as string]: s.hatch }}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {stores.map((s) => (
            <div key={s.key}>
              <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                {s.label}
                {!loading && total > 0 && (
                  <span className="text-text-muted tabular-nums">%{s.share.toFixed(0)}</span>
                )}
              </div>
              <p className="mt-1 text-[22px] font-medium tracking-tight text-text-primary tabular-nums">
                {loading ? <span className="skeleton-soft inline-block h-6 w-20 align-middle" /> : formatUsd(s.value)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
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
