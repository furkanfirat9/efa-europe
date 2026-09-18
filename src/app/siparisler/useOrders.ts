'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { OrderItem, OrderStats, MONTHS } from './types';

export type SortField = 'date' | 'salePrice' | 'buyPrice';
export type SortDirection = 'asc' | 'desc';

export interface AvailableProduct {
  offerId: string;
  title: string;
  count: number;
}

export interface AvailableSupplier {
  name: string;
  label: string;
  count: number;
}

/**
 * Yerel hafızadaki siparişleri anlık (0ms) filtreler ve sıralar
 */
function filterAndSortOrdersLocally(
  items: OrderItem[],
  status: string,
  search: string,
  productFilter: string,
  supplierFilter: string,
  sortField: SortField,
  sortDirection: SortDirection
): OrderItem[] {
  let res = items;

  // 1. Durum Filtresi
  if (status !== 'all') {
    if (status === 'awaiting') {
      res = res.filter((o) =>
        ['awaiting_deliver', 'awaiting_packaging', 'awaiting_registration'].includes(o.status)
      );
    } else if (status === 'uncalculated') {
      res = res.filter(
        (o) =>
          o.status !== 'cancelled' &&
          (o.buyPrice === null || o.buyPrice === undefined || Number(o.buyPrice) <= 0)
      );
    } else if (status === 'delivering') {
      res = res.filter((o) => ['delivering', 'driver_pickup'].includes(o.status));
    } else if (status === 'delivered') {
      res = res.filter((o) => o.status === 'delivered');
    } else if (status === 'cancelled') {
      res = res.filter((o) => o.status === 'cancelled');
    } else {
      res = res.filter((o) => o.status === status);
    }
  } else {
    // Varsayılan görünüm: İptal edilen siparişler gizlenir (İptaller kartına tıklandığında gösterilir)
    res = res.filter((o) => o.status !== 'cancelled');
  }

  // 2. Ürün Filtresi
  if (productFilter !== 'all') {
    res = res.filter((o) => (o.productOfferId || '') === productFilter);
  }

  // 3. Tedarikçi Filtresi
  if (supplierFilter !== 'all') {
    if (supplierFilter === '__empty__') {
      res = res.filter((o) => !o.supplier || !o.supplier.trim());
    } else {
      res = res.filter(
        (o) => (o.supplier || '').trim().toLowerCase() === supplierFilter.trim().toLowerCase()
      );
    }
  }

  // 4. Arama
  if (search.trim()) {
    const s = search.trim().toLowerCase();
    res = res.filter((o) => {
      const posting = o.postingNumber?.toLowerCase() || '';
      const offerId = o.productOfferId?.toLowerCase() || '';
      const title = o.productTitle?.toLowerCase() || '';
      const supp = o.supplier?.toLowerCase() || '';
      const supplierOrderId = o.supplierOrderId?.toLowerCase() || '';
      const city = o.customerCity?.toLowerCase() || '';
      const card = o.paymentCard?.toLowerCase() || '';
      return (
        posting.includes(s) ||
        offerId.includes(s) ||
        title.includes(s) ||
        supp.includes(s) ||
        supplierOrderId.includes(s) ||
        city.includes(s) ||
        card.includes(s)
      );
    });
  }

  // 5. Sıralama
  return [...res].sort((a, b) => {
    if (sortField === 'salePrice') {
      const priceA = Number(a.salePrice ?? a.totalPrice ?? 0);
      const priceB = Number(b.salePrice ?? b.totalPrice ?? 0);
      return sortDirection === 'asc' ? priceA - priceB : priceB - priceA;
    }

    if (sortField === 'buyPrice') {
      const priceA = Number(a.buyPrice ?? 0);
      const priceB = Number(b.buyPrice ?? 0);
      return sortDirection === 'asc' ? priceA - priceB : priceB - priceA;
    }

    // Default: 'date'
    const dateA = a.inProcessAt ? new Date(a.inProcessAt).getTime() : 0;
    const dateB = b.inProcessAt ? new Date(b.inProcessAt).getTime() : 0;
    return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
  });
}

export function useOrders() {
  const searchParams = useSearchParams();

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12

  // 1. URL Arama Parametrelerinden Başlangıç Değerlerini Belirle (F5 yenilemesinde filtreler korunur)
  const initialYear = useMemo(() => {
    const y = searchParams.get('year');
    if (y) {
      const parsed = parseInt(y, 10);
      if (!isNaN(parsed) && parsed >= 2024 && parsed <= currentYear) return parsed;
    }
    return currentYear;
  }, [searchParams, currentYear]);

  const initialMonth = useMemo(() => {
    const m = searchParams.get('month');
    if (m) {
      const parsed = parseInt(m, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) {
        if (initialYear >= currentYear && parsed > currentMonth) return currentMonth;
        return parsed;
      }
    }
    return currentMonth;
  }, [searchParams, initialYear, currentYear, currentMonth]);

  const initialStatus = useMemo(() => {
    const s = searchParams.get('status')?.trim();
    return s || 'all';
  }, [searchParams]);

  const initialProduct = useMemo(() => {
    const p = searchParams.get('product')?.trim();
    return p || 'all';
  }, [searchParams]);

  const initialSupplier = useMemo(() => {
    const s = searchParams.get('supplier')?.trim();
    return s || 'all';
  }, [searchParams]);

  const initialSearch = useMemo(() => {
    const q = searchParams.get('search') || searchParams.get('q');
    return q ? q.trim() : '';
  }, [searchParams]);

  const initialSortField = useMemo<SortField>(() => {
    const s = searchParams.get('sort');
    if (s === 'salePrice' || s === 'buyPrice' || s === 'date') return s;
    return 'date';
  }, [searchParams]);

  const initialSortDirection = useMemo<SortDirection>(() => {
    const d = searchParams.get('dir');
    if (d === 'asc' || d === 'desc') return d;
    return 'asc';
  }, [searchParams]);

  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth);

  // Gelecekteki bir ayı seçmeyi engelle: Mevcut yıl seçiliyse sadece bugüne kadarki aylar geçerlidir
  const availableMonths = useMemo(() => {
    if (selectedYear >= currentYear) {
      return MONTHS.filter((m) => m.value <= currentMonth);
    }
    return MONTHS;
  }, [selectedYear, currentYear, currentMonth]);

  // Yıl değiştiğinde, eğer seçili ay gelecekte kalıyorsa otomatik olarak mevcut aya çek
  const handleYearChange = useCallback(
    (year: number) => {
      setSelectedYear(year);
      if (year >= currentYear && selectedMonth > currentMonth) {
        setSelectedMonth(currentMonth);
      }
    },
    [currentYear, currentMonth, selectedMonth]
  );

  const handleMonthChange = useCallback(
    (month: number) => {
      if (selectedYear >= currentYear && month > currentMonth) {
        setSelectedMonth(currentMonth);
      } else {
        setSelectedMonth(month);
      }
    },
    [selectedYear, currentYear, currentMonth]
  );

  const [allOrders, setAllOrders] = useState<OrderItem[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Filtreler (URL parametreleri ile başlar)
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [productFilter, setProductFilter] = useState(initialProduct);
  const [supplierFilter, setSupplierFilter] = useState(initialSupplier);

  // Sıralama (URL parametreleri ile başlar)
  const [sortField, setSortField] = useState<SortField>(initialSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSortDirection);

  // 2. Filtre veya Sıralama Değiştiğinde URL'yi Anında Senkronize Et (0ms - Sayfa Yenilenmelerini Destekler)
  const isFirstMountRef = useRef(true);

  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    if (typeof window === 'undefined') return;

    const params = new URLSearchParams();

    if (statusFilter && statusFilter !== 'all') {
      params.set('status', statusFilter);
    }
    if (productFilter && productFilter !== 'all') {
      params.set('product', productFilter);
    }
    if (supplierFilter && supplierFilter !== 'all') {
      params.set('supplier', supplierFilter);
    }
    if (searchTerm && searchTerm.trim()) {
      params.set('search', searchTerm.trim());
    }
    if (sortField !== 'date') {
      params.set('sort', sortField);
    }
    if (sortDirection !== 'asc') {
      params.set('dir', sortDirection);
    }
    if (selectedYear !== currentYear || selectedMonth !== currentMonth) {
      params.set('year', String(selectedYear));
      params.set('month', String(selectedMonth));
    }

    const qs = params.toString();
    const targetUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (currentUrl !== targetUrl) {
      window.history.replaceState(null, '', targetUrl);
    }
  }, [
    statusFilter,
    productFilter,
    supplierFilter,
    searchTerm,
    sortField,
    sortDirection,
    selectedYear,
    selectedMonth,
    currentYear,
    currentMonth,
  ]);

  // 3. Tarayıcı Geri/İleri Tuşları İle URL Değiştiğinde Durumu Senkron Tut
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const s = urlParams.get('status')?.trim() || 'all';
      setStatusFilter(s);

      const p = urlParams.get('product')?.trim() || 'all';
      setProductFilter(p);

      const supp = urlParams.get('supplier')?.trim() || 'all';
      setSupplierFilter(supp);

      const q = (urlParams.get('search') || urlParams.get('q'))?.trim() || '';
      setSearchTerm(q);

      const sort = urlParams.get('sort');
      if (sort === 'salePrice' || sort === 'buyPrice' || sort === 'date') {
        setSortField(sort);
      } else {
        setSortField('date');
      }

      const dir = urlParams.get('dir');
      if (dir === 'asc' || dir === 'desc') {
        setSortDirection(dir);
      } else {
        setSortDirection('asc');
      }

      const yStr = urlParams.get('year');
      if (yStr) {
        const y = parseInt(yStr, 10);
        if (!isNaN(y) && y >= 2024 && y <= currentYear) setSelectedYear(y);
      } else {
        setSelectedYear(currentYear);
      }

      const mStr = urlParams.get('month');
      if (mStr) {
        const m = parseInt(mStr, 10);
        if (!isNaN(m) && m >= 1 && m <= 12) setSelectedMonth(m);
      } else {
        setSelectedMonth(currentMonth);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentYear, currentMonth]);

  // Sıralama Toggle Fonksiyonları
  const toggleDateSort = useCallback(() => {
    setSortField('date');
    setSortDirection((prev) => (sortField === 'date' && prev === 'asc' ? 'desc' : 'asc'));
  }, [sortField]);

  const toggleSaleSort = useCallback(() => {
    setSortField('salePrice');
    setSortDirection((prev) => (sortField === 'salePrice' && prev === 'desc' ? 'asc' : 'desc'));
  }, [sortField]);

  const toggleBuySort = useCallback(() => {
    setSortField('buyPrice');
    setSortDirection((prev) => (sortField === 'buyPrice' && prev === 'desc' ? 'asc' : 'desc'));
  }, [sortField]);

  // Benzersiz Ürün Listesi ve Sayıları (Filtre Açılır Menüsü İçin)
  const availableProducts = useMemo<AvailableProduct[]>(() => {
    const map = new Map<string, { offerId: string; title: string; count: number }>();
    for (const o of allOrders) {
      const id = o.productOfferId || 'Bilinmeyen';
      if (!map.has(id)) {
        map.set(id, { offerId: id, title: o.productTitle || '', count: 1 });
      } else {
        map.get(id)!.count++;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [allOrders]);

  // Benzersiz Tedarikçi Listesi ve Sayıları (Filtre Açılır Menüsü İçin)
  const availableSuppliers = useMemo<AvailableSupplier[]>(() => {
    const map = new Map<string, number>();
    let emptyCount = 0;
    for (const o of allOrders) {
      const s = (o.supplier || '').trim();
      if (!s) {
        emptyCount++;
      } else {
        map.set(s, (map.get(s) || 0) + 1);
      }
    }
    const list: AvailableSupplier[] = [];
    map.forEach((count, name) => {
      list.push({ name, label: name, count });
    });
    list.sort((a, b) => b.count - a.count);
    if (emptyCount > 0) {
      list.push({ name: '__empty__', label: 'Girilmemiş', count: emptyCount });
    }
    return list;
  }, [allOrders]);

  // TÜRETİLMİŞ STATE (DERIVED STATE): Tek bir render adımında 0ms anlık hesaplanır, ASLA git-gel yapmaz!
  const orders = useMemo(() => {
    return filterAndSortOrdersLocally(
      allOrders,
      statusFilter,
      searchTerm,
      productFilter,
      supplierFilter,
      sortField,
      sortDirection
    );
  }, [allOrders, statusFilter, searchTerm, productFilter, supplierFilter, sortField, sortDirection]);

  // Toplam Alım: Kullanıcı tabloya ne yazdıysa kur çevirme olmaksızın 0ms anında toplanır
  const totalBuyCost = useMemo(() => {
    if (allOrders.length === 0 && stats?.totalBuyCostTry) {
      return stats.totalBuyCostTry;
    }
    return allOrders.reduce((sum, o) => {
      if (o.status === 'cancelled') return sum;
      const p = Number(o.buyPrice);
      return !isNaN(p) && p > 0 ? sum + p : sum;
    }, 0);
  }, [allOrders, stats?.totalBuyCostTry]);

  // Detay Paneli (Slide-over drawer)
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailNotes, setDetailNotes] = useState('');
  const [savingDetail, setSavingDetail] = useState(false);

  // Toast Bildirimi
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setSuccessToast(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setSuccessToast(null);
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Sunucudan Seçili Ayın Siparişlerini Çek
  const fetchOrders = useCallback(async (yr = selectedYear, mo = selectedMonth) => {
    try {
      setError(null);
      const res = await fetch(`/api/siparisler?status=all&limit=500&year=${yr}&month=${mo}`);
      const data = await res.json();

      if (data.success) {
        setAllOrders(data.items || []);
        if (data.stats) {
          setStats(data.stats);
        }
        setLastUpdated(new Date().toISOString());
      } else {
        setError(data.error_message || 'Siparişler alınamadı.');
      }
    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  // Yıl veya ay değiştiğinde o aya ait siparişleri yükle
  useEffect(() => {
    setLoading(true);
    fetchOrders(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth, fetchOrders]);

  // İlk açılışta arka planda Ozon API senkronizasyonunu başlat (sadece 1 kez)
  const initialSyncedRef = useRef(false);
  const fetchOrdersRef = useRef(fetchOrders);
  fetchOrdersRef.current = fetchOrders;
  const selectedYearRef = useRef(selectedYear);
  selectedYearRef.current = selectedYear;
  const selectedMonthRef = useRef(selectedMonth);
  selectedMonthRef.current = selectedMonth;

  useEffect(() => {
    if (initialSyncedRef.current) return;
    initialSyncedRef.current = true;

    let isCancelled = false;
    const safetyTimer = setTimeout(() => {
      setSyncing(false);
    }, 12000);

    const runAutoSync = async () => {
      try {
        setSyncing(true);
        const syncRes = await fetch('/api/siparisler/sync', { method: 'POST' });
        const syncData = await syncRes.json();
        if (!isCancelled && syncData.success) {
          await fetchOrdersRef.current(selectedYearRef.current, selectedMonthRef.current);
        }
      } catch (err) {
        console.warn('[Ozon Auto-Sync] Arka plan senkronizasyon uyarısı:', err);
      } finally {
        clearTimeout(safetyTimer);
        setSyncing(false);
      }
    };

    runAutoSync();

    return () => {
      isCancelled = true;
      clearTimeout(safetyTimer);
      setSyncing(false);
    };
  }, []);

  // ESC tuşu ile yan paneli kapat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && detailModalOpen) {
        setDetailModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailModalOpen]);

  // İyimser Güncelleme & PATCH
  const handleInlineUpdate = useCallback(
    async (postingNumber: string, payload: Record<string, any>) => {
      // 1. İyimser UI güncellemesi
      setAllOrders((prev) =>
        prev.map((o) => (o.postingNumber === postingNumber ? { ...o, ...payload } : o))
      );

      try {
        const res = await fetch('/api/siparisler', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            postingNumber,
            year: selectedYear,
            month: selectedMonth,
            ...payload,
          }),
        });
        const data = await res.json();
        if (data.success && data.item) {
          const updatedItem = {
            ...data.item,
            productOfferId: data.item.productOfferId || data.item.productOfferId,
            productTitle: data.item.productTitle || data.item.productTitle,
            productImage: data.item.productImage || data.item.productImage,
            salePrice: data.item.salePrice ?? data.item.totalPrice,
          };

          setAllOrders((prev) =>
            prev.map((o) => (o.postingNumber === postingNumber ? { ...o, ...updatedItem } : o))
          );

          if (data.stats) {
            setStats(data.stats);
          }
          showToast('Kaydedildi');
        }
      } catch (err: any) {
        setError('Kaydedilemedi: ' + err.message);
      }
    },
    [showToast]
  );

  // Detay Panelini Aç
  const handleOpenDetail = useCallback((order: OrderItem) => {
    setSelectedOrder(order);
    setDetailNotes(order.notes || '');
    setDetailModalOpen(true);
  }, []);

  // Detay Notlarını Kaydet
  const handleSaveDetailNotes = async () => {
    if (!selectedOrder) return;
    setSavingDetail(true);
    try {
      await handleInlineUpdate(selectedOrder.postingNumber, { notes: detailNotes.trim() });
      setDetailModalOpen(false);
      showToast('Sipariş detayları kaydedildi.');
    } finally {
      setSavingDetail(false);
    }
  };

  return {
    orders,
    allOrdersCount: allOrders.length,
    stats,
    totalBuyCost,
    selectedYear,
    setSelectedYear: handleYearChange,
    selectedMonth,
    setSelectedMonth: handleMonthChange,
    availableMonths,
    currentYear,
    currentMonth,
    loading,
    syncing,
    error,
    setError,
    successToast,
    setSuccessToast,
    lastUpdated,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    productFilter,
    setProductFilter,
    supplierFilter,
    setSupplierFilter,
    sortField,
    sortDirection,
    toggleDateSort,
    toggleSaleSort,
    toggleBuySort,
    availableProducts,
    availableSuppliers,
    selectedOrder,
    detailModalOpen,
    setDetailModalOpen,
    detailNotes,
    setDetailNotes,
    savingDetail,
    handleInlineUpdate,
    handleOpenDetail,
    handleSaveDetailNotes,
  };
}
