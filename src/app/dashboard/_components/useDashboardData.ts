'use client';

import { useEffect, useState } from 'react';

/**
 * Dashboard kartlarının veri kancası: açılışta okur, `intervalMs`'de bir sessizce tazeler.
 * Sekme arkadayken yoklama durur, sekmeye dönülünce beklemeden bir kez tazelenir (/analitik gibi).
 * Tazeleme hata verirse ekrandaki veri yerinde kalır; hata yalnız hiç veri yokken gösterilir.
 */
export function useDashboardData<T>(url: string, { intervalMs = 5 * 60 * 1000, init }: { intervalMs?: number; init?: RequestInit } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // İstek iptal edilmez (AbortController geliştirme modunda efekt iki kez çalışınca hata ekranı açıyordu);
    // yalnızca en son isteğin yanıtı uygulanır, gecikmiş eski yanıt yenisini ezmez.
    let latest = 0;

    const load = async () => {
      const id = ++latest;
      try {
        const res = await fetch(url, { cache: 'no-store', ...init });
        const json = await res.json();
        if (json.success === false || json.error) throw new Error(json.error_message || json.error || 'Veri alınamadı.');
        if (alive && id === latest) {
          setData(json as T);
          setError(null);
        }
      } catch (err) {
        if (!alive || id !== latest) return;
        console.error(`Dashboard verisi alınamadı (${url}):`, err);
        setError(err instanceof Error ? err.message : 'Veri alınamadı.');
      }
    };

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(load, intervalMs);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearInterval(timer);
        timer = null;
      } else {
        load();
        start();
      }
    };

    load();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // `init` yalnız ilk istek için; her render'da yeni nesne gelmesi yoklamayı yeniden başlatmasın
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, intervalMs]);

  return { data, error };
}
