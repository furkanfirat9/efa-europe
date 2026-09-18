'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnalyticsSummary, DayMetric, SkuMetric, HourlyOrderMetric, RecentOrder } from '@/types/analytics';

export type SortField = 'name' | 'pdp' | 'views' | 'cart' | 'conv' | 'position' | 'orders';

/** Sipariş listesi ucuz (~135ms) ve Ozon'da anlık; sık yoklanabilir. */
const ORDERS_POLL_MS = 60 * 1000;

/**
 * Analitik çağrısı ~4 saniye sürüyor ve Ozon bu veriyi toplu üretiyor.
 * Sunucudaki önbellek 5 dakika olduğu için aralık biraz daha uzun tutuldu;
 * aksi hâlde yoklama önbelleğe çarpıp aynı sayıyı geri getirirdi.
 */
const ANALYTICS_POLL_MS = 5.5 * 60 * 1000;

export type StoreKey = 'store1' | 'store2';

/**
 * Seçili mağaza URL'de tutulur; aksi hâlde sayfa yenilenince varsayılana
 * (Avrupa) dönüyor ve Türkiye'de çalışırken her F5 mağazayı değiştiriyordu.
 */
const STORE_PARAM = 'magaza';

const isStoreKey = (value: string | null): value is StoreKey =>
  value === 'store1' || value === 'store2';

export function useAnalytics() {
  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Varsayılan olarak BUGÜN (Today)
  const [startDate, setStartDate] = useState<string>(getTodayStr());
  const [endDate, setEndDate] = useState<string>(getTodayStr());
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeParam = searchParams.get(STORE_PARAM);

  const [store, setStoreState] = useState<StoreKey>(() =>
    isStoreKey(storeParam) ? storeParam : 'store1'
  );

  /** Seçim URL'e yazılır ki yenileme ve geri/ileri tuşları seçimi korusun. */
  const setStore = useCallback(
    (next: StoreKey) => {
      setStoreState(next);
      const params = new URLSearchParams(window.location.search);
      params.set(STORE_PARAM, next);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  // Geri/ileri ile URL değişirse durum onu takip eder.
  useEffect(() => {
    if (isStoreKey(storeParam) && storeParam !== store) setStoreState(storeParam);
  }, [storeParam, store]);

  // Aşamalı Yükleme Durumları (Progressive Loading)
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [days, setDays] = useState<DayMetric[]>([]);
  const [hourlyOrders, setHourlyOrders] = useState<HourlyOrderMetric[]>([]);
  const [topProducts, setTopProducts] = useState<SkuMetric[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>('');

  const [summaryLoading, setSummaryLoading] = useState<boolean>(true);
  const [productsLoading, setProductsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedChartMetric, setSelectedChartMetric] = useState<'all' | 'pdp' | 'views' | 'cart'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortField>('pdp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  /**
   * Sunucu tarafında Ozon istekleri sıraya alındığı için yanıtlar gecikebilir.
   * Mağaza/tarih değiştiğinde önceki tur iptal edilmezse, eski turun geç gelen
   * yanıtı yeni seçimin verisini ezip yanlış mağazanın rakamlarını gösterir.
   */
  const inFlightRef = useRef<AbortController | null>(null);

  const fetchAnalytics = useCallback(async (forceRefresh = false, silent = false) => {
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    const { signal } = controller;

    // Sessiz turda iskeletlere düşülmez: ekrandaki sayılar yerinde kalır ve
    // yeni veri geldiğinde sessizce değişir. Aksi hâlde her arka plan
    // yenilemesinde sayfa boşalıp doluyor gibi görünürdü.
    if (!silent) {
      setSummaryLoading(true);
      setProductsLoading(true);
    }
    setError(null);

    const payloadBase = {
      store,
      date_from: startDate,
      date_to: endDate,
      force_refresh: forceRefresh,
    };

    const request = async (body: Record<string, unknown>) => {
      const res = await fetch('/api/ozon/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payloadBase, ...body }),
        signal,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Sunucu hatası (HTTP ${res.status})`);
      return data;
    };

    // 1. Kademe: KPI özeti, günlük huni ve gerçek siparişler (öncelikli)
    await request({ mode: 'summary' })
      .then((data) => {
        if (signal.aborted) return;
        if (data.summary) setSummary(data.summary);
        if (data.days) setDays(data.days);
        if (data.hourlyOrders) setHourlyOrders(data.hourlyOrders);
        if (data.recentOrders) setRecentOrders(data.recentOrders);
        setUpdatedAt(data.updatedAt || new Date().toISOString());
        setSummaryLoading(false);
      })
      .catch((err) => {
        if (signal.aborted || err.name === 'AbortError') return;
        console.error('Summary Fetch Error:', err);
        // Arka plan turunda banner açılmaz; ekrandaki veri geçerliliğini
        // korur ve bir sonraki tur sessizce toparlamayı dener.
        if (!silent) setError(err.message);
        setSummaryLoading(false);
      });

    if (signal.aborted) return;

    // 2. Kademe: Ürün listesi dağılımı (özet tamamlandıktan sonra arka planda)
    await request({ mode: 'products', limit: 100 })
      .then((data) => {
        if (signal.aborted) return;
        if (data.topProducts) setTopProducts(data.topProducts);
        setProductsLoading(false);
      })
      .catch((err) => {
        if (signal.aborted || err.name === 'AbortError') return;
        console.error('Products Fetch Error:', err);
        setProductsLoading(false);
      });
  }, [startDate, endDate, store]);

  /**
   * Yalnızca siparişleri tazeler (~135ms). Harita ve sipariş tablosu buradan
   * beslendiği için yeni sipariş dakikada bir kendiliğinden görünür; pahalı
   * analitik çağrısı bu turda hiç yapılmaz.
   */
  const ordersPollRef = useRef<AbortController | null>(null);

  const refreshOrders = useCallback(async () => {
    ordersPollRef.current?.abort();
    const controller = new AbortController();
    ordersPollRef.current = controller;

    try {
      const res = await fetch('/api/ozon/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store,
          date_from: startDate,
          date_to: endDate,
          mode: 'orders',
          force_refresh: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok || controller.signal.aborted) return;
      const data = await res.json();
      if (controller.signal.aborted) return;

      if (data.recentOrders) setRecentOrders(data.recentOrders);
      if (data.hourlyOrders) setHourlyOrders(data.hourlyOrders);
      if (typeof data.totalOrders === 'number') {
        setSummary((prev) =>
          prev
            ? {
                ...prev,
                orderedUnits: data.totalOrders,
                revenue: typeof data.totalRevenue === 'number' ? data.totalRevenue : prev.revenue,
              }
            : null
        );
      }
      if (data.updatedAt) setUpdatedAt(data.updatedAt);
    } catch {
      // Arka plan turu sessizdir: geçici bir hata ekranda banner açmamalı,
      // bir sonraki turda kendiliğinden toparlar.
    }
  }, [startDate, endDate, store]);

  // Tarih veya Mağaza Değiştiğinde Otomatik Çek (Debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAnalytics();
    }, 350);
    return () => clearTimeout(timer);
  }, [fetchAnalytics]);

  /**
   * Arka plan yenilemesi. İki farklı ritim, çünkü iki veri farklı:
   * siparişler ucuz ve gerçekten anlık, analitik pahalı ve Ozon tarafında
   * zaten toplu üretiliyor. Sekme arkadayken hiçbiri çalışmaz — kimse
   * bakmıyorken kota harcamanın anlamı yok.
   */
  useEffect(() => {
    let ordersTimer: ReturnType<typeof setInterval> | null = null;
    let analyticsTimer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (ordersTimer) clearInterval(ordersTimer);
      if (analyticsTimer) clearInterval(analyticsTimer);
      ordersTimer = null;
      analyticsTimer = null;
    };

    const start = () => {
      stop();
      ordersTimer = setInterval(() => refreshOrders(), ORDERS_POLL_MS);
      analyticsTimer = setInterval(() => fetchAnalytics(false, true), ANALYTICS_POLL_MS);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
        return;
      }
      // Sekmeye dönüldüğünde beklemeden bir kez tazele, sonra ritme gir.
      refreshOrders();
      start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshOrders, fetchAnalytics]);

  // Bileşen kaldırıldığında uçuştaki istekleri bırak.
  useEffect(
    () => () => {
      inFlightRef.current?.abort();
      ordersPollRef.current?.abort();
    },
    []
  );

  // İstemci Tarafı Arama & Sıralama (Anında Tepki)
  const filteredProducts = useMemo(() => {
    if (!topProducts) return [];

    let list = [...topProducts];

    // Arama Filtresi
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.includes(q));
    }

    // Sıralama
    list.sort((a, b) => {
      if (sortBy === 'name') {
        return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      if (sortBy === 'pdp') {
        const diff = b.hitsViewPdp - a.hitsViewPdp;
        return sortOrder === 'asc' ? -diff : diff;
      }
      if (sortBy === 'views') {
        const diff = b.hitsViewSearch - a.hitsViewSearch;
        return sortOrder === 'asc' ? -diff : diff;
      }
      if (sortBy === 'cart') {
        const diff = b.hitsToCart - a.hitsToCart;
        return sortOrder === 'asc' ? -diff : diff;
      }
      if (sortBy === 'orders') {
        const diff = (b.orderedUnits || 0) - (a.orderedUnits || 0);
        return sortOrder === 'asc' ? -diff : diff;
      }
      if (sortBy === 'conv') {
        const diff = b.convToCart - a.convToCart;
        return sortOrder === 'asc' ? -diff : diff;
      }
      if (sortBy === 'position') {
        const valA = a.positionCategory || 999;
        const valB = b.positionCategory || 999;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      return 0;
    });

    return list;
  }, [topProducts, searchQuery, sortBy, sortOrder]);

  // Zaman serisinde maksimum değerler
  const maxDayViews = useMemo(() => {
    if (!days || days.length === 0) return 100;
    return Math.max(...days.map((d) => d.hitsViewTotal), 10);
  }, [days]);

  const maxDayPdp = useMemo(() => {
    if (!days || days.length === 0) return 50;
    return Math.max(...days.map((d) => d.hitsViewPdp), 5);
  }, [days]);

  /** Sıralamayı doğrudan kurar (toggle etmez): kartlardan tabloya geçişte kullanılır. */
  const applySort = useCallback((field: SortField, order: 'asc' | 'desc') => {
    setSortBy(field);
    setSortOrder(order);
  }, []);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder(field === 'name' || field === 'position' ? 'asc' : 'desc');
    }
  };

  return {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    store,
    setStore,
    summary,
    days,
    hourlyOrders,
    summaryLoading,
    productsLoading,
    loading: summaryLoading || productsLoading,
    error,
    selectedChartMetric,
    setSelectedChartMetric,
    searchQuery,
    setSearchQuery,
    sortBy,
    sortOrder,
    handleSort,
    applySort,
    topProducts,
    filteredProducts,
    maxDayViews,
    maxDayPdp,
    recentOrders,
    updatedAt,
    fetchAnalytics,
  };
}
