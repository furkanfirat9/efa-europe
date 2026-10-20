'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProfitData } from './shared';

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

/**
 * Kâr verisi (/api/dashboard/kar): önce veri tabanındakini gösterir, sonra Ozon'la eşitleyip
 * değiştiyse yeniden okur. 5 dakikada bir tekrarlar; sekme arkadayken durur.
 */
export function useProfitData() {
  const [data, setData] = useState<ProfitData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/dashboard/kar', { cache: 'no-store' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error_message || 'Kâr hesaplanamadı.');
    setData(json);
    setError(null);
    return json as ProfitData;
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const current = await load();
        const week = current.periods.find((p) => p.key === 'week');
        if (alive && week && (await syncMonths(week.from)) && alive) await load();
      } catch (err) {
        console.error('Kâr verisi alınamadı:', err);
        if (alive) setError(err instanceof Error ? err.message : 'Kâr hesaplanamadı.');
      }
    };

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(run, 5 * 60 * 1000);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearInterval(timer);
        timer = null;
      } else {
        run();
        start();
      }
    };

    run();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  return { data, error };
}
