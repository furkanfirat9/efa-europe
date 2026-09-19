'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, ArrowUpDown, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { Panel, SegmentedControl } from '@/components/ui/Panel';
import { StatusDot } from '@/components/ui/StatusDot';
import { Button } from '@/components/ui/Field';
import styles from '@/styles/console.module.css';

interface CurrencyRate {
  rate: number;
  rawRate: number;
  fromDate: string;
  toDate: string;
}

interface IndexGroup {
  count: number;
  percent: number;
  label: string;
}

interface PriceIndexSummary {
  total: number;
  green: IndexGroup;
  yellow: IndexGroup;
  red: IndexGroup;
  withoutIndex: IndexGroup;
}

export interface PriceIndexProduct {
  productId: number;
  offerId: string;
  sku: number;
  name: string;
  image: string;
  price: number;
  oldPrice: number;
  currency: string;
  colorIndex: 'GREEN' | 'YELLOW' | 'RED' | 'WITHOUT_INDEX';
  ozonMinPrice: number;
  ozonIndexValue: number;
  externalMinPrice: number;
  externalIndexValue: number;
  stock: number;
  commissionPercent: number;
}

export default function FiyatEndeksiPage() {
  const [rates, setRates] = useState<{ usd?: CurrencyRate; eur?: CurrencyRate; cny?: CurrencyRate } | null>(null);
  const [loadingRates, setLoadingRates] = useState<boolean>(true);
  const [rateError, setRateError] = useState<string | null>(null);

  const [selectedStore, setSelectedStore] = useState<'store1' | 'store2'>('store2');
  const [indexSummary, setIndexSummary] = useState<PriceIndexSummary | null>(null);
  const [products, setProducts] = useState<PriceIndexProduct[]>([]);
  const [loadingIndex, setLoadingIndex] = useState<boolean>(true);
  const [indexError, setIndexError] = useState<string | null>(null);

  // Filtreleme ve Sıralama
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'GREEN' | 'YELLOW' | 'RED' | 'WITHOUT_INDEX'>('ALL');
  const [sortBy, setSortBy] = useState<'index' | 'price' | 'ozonDiff' | 'name'>('ozonDiff');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 25;

  // Kurları Çek
  const fetchExchangeRates = useCallback(async () => {
    setLoadingRates(true);
    setRateError(null);
    try {
      const res = await fetch('/api/ozon/exchange-rates');
      const data = await res.json();
      if (data.success && data.today) {
        setRates(data.today);
      } else {
        throw new Error(data.error || 'Kurlar alınamadı.');
      }
    } catch (err: any) {
      console.error('Kurlar yüklenirken hata:', err);
      setRateError(err.message || 'Hata');
    } finally {
      setLoadingRates(false);
    }
  }, []);

  // Fiyat Endeksini ve Ürünleri Çek
  const fetchPriceIndex = useCallback(async (store: 'store1' | 'store2') => {
    setLoadingIndex(true);
    setIndexError(null);
    try {
      const res = await fetch(`/api/ozon/price-index?store=${store}`);
      const data = await res.json();
      if (data.success && data.summary) {
        setIndexSummary(data.summary);
        setProducts(data.products || []);
      } else {
        throw new Error(data.error || 'Fiyat endeksi alınamadı.');
      }
    } catch (err: any) {
      console.error('Fiyat endeksi çekilirken hata:', err);
      setIndexError(err.message || 'Hata');
    } finally {
      setLoadingIndex(false);
    }
  }, []);

  useEffect(() => {
    fetchExchangeRates();
  }, [fetchExchangeRates]);

  useEffect(() => {
    fetchPriceIndex(selectedStore);
    setCurrentPage(1);
  }, [selectedStore, fetchPriceIndex]);

  // Filtrelenmiş ve Sıralanmış Ürünler
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Durum Filtresi
      if (statusFilter !== 'ALL' && p.colorIndex !== statusFilter) {
        return false;
      }
      // Arama Filtresi
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (p.name || '').toLowerCase().includes(q);
        const matchOffer = (p.offerId || '').toLowerCase().includes(q);
        const matchSku = String(p.sku || '').includes(q);
        if (!matchName && !matchOffer && !matchSku) return false;
      }
      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'ozonDiff') {
        comparison = (b.ozonIndexValue || 0) - (a.ozonIndexValue || 0);
      } else if (sortBy === 'price') {
        comparison = (b.price || 0) - (a.price || 0);
      } else if (sortBy === 'name') {
        comparison = (a.name || '').localeCompare(b.name || '');
      } else if (sortBy === 'index') {
        const orderWeight = { RED: 3, YELLOW: 2, GREEN: 1, WITHOUT_INDEX: 0 };
        comparison = orderWeight[b.colorIndex] - orderWeight[a.colorIndex];
      }
      return sortOrder === 'desc' ? comparison : -comparison;
    });
  }, [products, statusFilter, searchQuery, sortBy, sortOrder]);

  // Sayfalama
  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  const handleSort = (field: 'index' | 'price' | 'ozonDiff' | 'name') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      {/* 1. Üst Bar (Sticky Header) */}
      <header className="sticky top-0 z-30 flex min-h-[60px] items-center justify-between border-b border-hairline bg-canvas px-5 py-3 lg:px-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-semibold tracking-[-0.01em] text-ink lg:text-base">
              Fiyat Endeksi
            </h1>
            <span className="rounded-sm border border-hairline bg-panel-sunken px-2 py-0.5 text-2xs font-medium text-ink-subtle">
              Piyasa Takibi
            </span>
          </div>
        </div>

        {/* Sağ Üst: Günün Ozon Dönüşüm Kurları (USD & EUR) */}
        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-hairline bg-panel px-3 py-1.5 text-2xs font-medium text-ink-muted">
            <StatusDot tone={rateError ? 'loss' : 'brand'} label="Ozon Kuru" />
            
            {/* 1 Dolar Karşılığı */}
            <div className="flex items-baseline gap-1">
              <span>1$ =</span>
              <span className="tabular-nums font-semibold text-ink">
                {rates?.usd ? `${rates.usd.rate.toFixed(4)} ₽` : loadingRates ? '...' : '-'}
              </span>
            </div>

            <span className="text-hairline-strong">|</span>

            {/* 1 Euro Karşılığı */}
            <div className="flex items-baseline gap-1">
              <span>1€ =</span>
              <span className="tabular-nums font-semibold text-ink">
                {rates?.eur ? `${rates.eur.rate.toFixed(4)} ₽` : loadingRates ? '...' : '-'}
              </span>
            </div>
          </div>

          {/* Kurları Yenile Butonu */}
          <Button
            variant="secondary"
            onClick={fetchExchangeRates}
            disabled={loadingRates}
            className="h-8 px-2.5"
            title="Ozon canlı kurlarını güncelle"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingRates ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Kurları Yenile</span>
          </Button>
        </div>
      </header>

      {/* 2. Ana Gövde */}
      <main className="flex-1 p-5 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6">

          {/* Mağaza Seçimi & Canlı Durum Başlığı */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SegmentedControl
              options={[
                { value: 'store2', label: 'Türkiye Mağazası' },
                { value: 'store1', label: 'Avrupa Mağazası' },
              ]}
              value={selectedStore}
              onChange={(val) => setSelectedStore(val as 'store1' | 'store2')}
            />

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => fetchPriceIndex(selectedStore)}
                disabled={loadingIndex}
                className="h-8 text-2xs"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loadingIndex ? 'animate-spin' : ''}`} />
                Endeksi Yenile
              </Button>
            </div>
          </div>

          {/* Üst Kısım: Ozon Fiyat Endeksi Dağılım Barı & Kartları */}
          <div className="rounded-panel border border-hairline bg-panel p-5">
            {loadingIndex && !indexSummary ? (
              <div className="space-y-4 py-2">
                <div className="skeleton h-3 w-full rounded-full" />
                <div className={styles.hairlineRow}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={styles.hairlineCell}>
                      <div className="skeleton h-4 w-20" />
                      <div className="skeleton mt-2 h-7 w-16" />
                      <div className="skeleton mt-2 h-3 w-32" />
                    </div>
                  ))}
                </div>
              </div>
            ) : indexError ? (
              <div className="rounded-panel border border-loss/30 bg-loss-soft p-4 text-xs text-loss">
                {indexError}
              </div>
            ) : indexSummary ? (
              <div className="space-y-5">
                {/* 1. Yüzdesel Çok Segmentli Endeks Barı */}
                <div className="flex h-3 w-full overflow-hidden rounded-full border border-hairline bg-panel-sunken p-0.5">
                  {/* Kazançlı */}
                  {indexSummary.green.percent > 0 && (
                    <div
                      style={{ width: `${indexSummary.green.percent}%` }}
                      className="h-full bg-gain transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                      title={`Kazançlı: %${indexSummary.green.percent} (${indexSummary.green.count} ürün)`}
                    />
                  )}

                  {/* Orta Düzey */}
                  {indexSummary.yellow.percent > 0 && (
                    <div
                      style={{ width: `${indexSummary.yellow.percent}%` }}
                      className="h-full bg-caution transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                      title={`Orta Düzey: %${indexSummary.yellow.percent} (${indexSummary.yellow.count} ürün)`}
                    />
                  )}

                  {/* Kazançsız */}
                  {indexSummary.red.percent > 0 && (
                    <div
                      style={{ width: `${indexSummary.red.percent}%` }}
                      className="h-full bg-loss transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                      title={`Kazançsız: %${indexSummary.red.percent} (${indexSummary.red.count} ürün)`}
                    />
                  )}

                  {/* Endekssiz */}
                  {indexSummary.withoutIndex.percent > 0 && (
                    <div
                      style={{ width: `${indexSummary.withoutIndex.percent}%` }}
                      className="h-full bg-ink-faint/30 transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                      title={`Endekssiz: %${indexSummary.withoutIndex.percent} (${indexSummary.withoutIndex.count} ürün)`}
                    />
                  )}
                </div>

                {/* 2. 4'lü KPI Kartları (Renkli Çerçeveli) */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  
                  {/* 1. KAZANÇLI */}
                  <div
                    onClick={() => setStatusFilter(statusFilter === 'GREEN' ? 'ALL' : 'GREEN')}
                    className={`flex cursor-pointer flex-col justify-between rounded-xl border bg-panel p-4 transition-all ${
                      statusFilter === 'GREEN'
                        ? 'border-gain ring-1 ring-gain'
                        : 'border-gain/40 hover:border-gain'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <StatusDot tone="gain" label="Kazançlı" />
                        <span className="tabular-nums text-xs font-semibold text-gain">
                          %{indexSummary.green.percent}
                        </span>
                      </div>
                      <div className="mt-2.5 text-2xl font-semibold tabular-nums text-ink">
                        {indexSummary.green.count}{' '}
                        <span className="text-xs font-normal text-ink-subtle">ürün</span>
                      </div>
                    </div>
                    <p className="mt-3 text-2xs leading-relaxed text-ink-subtle">
                      Piyasadaki en iyi fiyata eşit veya daha ucuz.
                    </p>
                  </div>

                  {/* 2. ORTA DÜZEY */}
                  <div
                    onClick={() => setStatusFilter(statusFilter === 'YELLOW' ? 'ALL' : 'YELLOW')}
                    className={`flex cursor-pointer flex-col justify-between rounded-xl border bg-panel p-4 transition-all ${
                      statusFilter === 'YELLOW'
                        ? 'border-caution ring-1 ring-caution'
                        : 'border-caution/40 hover:border-caution'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <StatusDot tone="caution" label="Orta Düzey" />
                        <span className="tabular-nums text-xs font-semibold text-caution">
                          %{indexSummary.yellow.percent}
                        </span>
                      </div>
                      <div className="mt-2.5 text-2xl font-semibold tabular-nums text-ink">
                        {indexSummary.yellow.count}{' '}
                        <span className="text-xs font-normal text-ink-subtle">ürün</span>
                      </div>
                    </div>
                    <p className="mt-3 text-2xs leading-relaxed text-ink-subtle">
                      Piyasa fiyatının %0 ile %5 üzerinde.
                    </p>
                  </div>

                  {/* 3. KAZANÇSIZ */}
                  <div
                    onClick={() => setStatusFilter(statusFilter === 'RED' ? 'ALL' : 'RED')}
                    className={`flex cursor-pointer flex-col justify-between rounded-xl border bg-panel p-4 transition-all ${
                      statusFilter === 'RED'
                        ? 'border-loss ring-1 ring-loss'
                        : 'border-loss/40 hover:border-loss'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <StatusDot tone="loss" label="Kazançsız" />
                        <span className="tabular-nums text-xs font-semibold text-loss">
                          %{indexSummary.red.percent}
                        </span>
                      </div>
                      <div className="mt-2.5 text-2xl font-semibold tabular-nums text-ink">
                        {indexSummary.red.count}{' '}
                        <span className="text-xs font-normal text-ink-subtle">ürün</span>
                      </div>
                    </div>
                    <p className="mt-3 text-2xs leading-relaxed text-ink-subtle">
                      Piyasa fiyatının %5 üzerinde (revizyon önerilir).
                    </p>
                  </div>

                  {/* 4. ENDEKSSİZ */}
                  <div
                    onClick={() => setStatusFilter(statusFilter === 'WITHOUT_INDEX' ? 'ALL' : 'WITHOUT_INDEX')}
                    className={`flex cursor-pointer flex-col justify-between rounded-xl border bg-panel p-4 transition-all ${
                      statusFilter === 'WITHOUT_INDEX'
                        ? 'border-ink-muted ring-1 ring-ink-muted'
                        : 'border-hairline hover:border-hairline-strong'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <StatusDot tone="neutral" label="Endekssiz" />
                        <span className="tabular-nums text-xs font-semibold text-ink-muted">
                          %{indexSummary.withoutIndex.percent}
                        </span>
                      </div>
                      <div className="mt-2.5 text-2xl font-semibold tabular-nums text-ink">
                        {indexSummary.withoutIndex.count}{' '}
                        <span className="text-xs font-normal text-ink-subtle">ürün</span>
                      </div>
                    </div>
                    <p className="mt-3 text-2xs leading-relaxed text-ink-subtle">
                      Piyasada eşleşen ürün bulunamadı.
                    </p>
                  </div>

                </div>

              </div>
            ) : null}
          </div>

          {/* 3. Ürün Fiyat ve Endeks Karşılaştırma Tablosu */}
          <div className="rounded-panel border border-hairline bg-panel p-5 space-y-4">
            
            {/* Filtre ve Arama Araç Çubuğu */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              
              {/* Sol: Arama Kutusu */}
              <div className="relative min-w-[280px] max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Model kodu, SKU veya ürün adı ara..."
                  className="h-8 w-full rounded-lg border border-hairline bg-panel-sunken pl-9 pr-3 text-xs text-ink placeholder:text-ink-subtle focus:border-hairline-strong focus:outline-hidden"
                />
              </div>

              {/* Sağ: Durum Filtre Butonları */}
              <div className="flex flex-wrap items-center gap-1.5 text-2xs">
                <button
                  onClick={() => {
                    setStatusFilter('ALL');
                    setCurrentPage(1);
                  }}
                  className={`rounded-md border px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === 'ALL'
                      ? 'border-hairline-strong bg-panel-sunken text-ink'
                      : 'border-hairline text-ink-muted hover:border-hairline-strong hover:text-ink'
                  }`}
                >
                  Tümü ({products.length})
                </button>
                <button
                  onClick={() => {
                    setStatusFilter('GREEN');
                    setCurrentPage(1);
                  }}
                  className={`rounded-md border px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === 'GREEN'
                      ? 'border-gain/50 bg-gain/10 text-gain'
                      : 'border-hairline text-ink-muted hover:border-gain/40 hover:text-gain'
                  }`}
                >
                  Kazançlı ({indexSummary?.green.count || 0})
                </button>
                <button
                  onClick={() => {
                    setStatusFilter('YELLOW');
                    setCurrentPage(1);
                  }}
                  className={`rounded-md border px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === 'YELLOW'
                      ? 'border-caution/50 bg-caution/10 text-caution'
                      : 'border-hairline text-ink-muted hover:border-caution/40 hover:text-caution'
                  }`}
                >
                  Orta ({indexSummary?.yellow.count || 0})
                </button>
                <button
                  onClick={() => {
                    setStatusFilter('RED');
                    setCurrentPage(1);
                  }}
                  className={`rounded-md border px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === 'RED'
                      ? 'border-loss/50 bg-loss/10 text-loss'
                      : 'border-hairline text-ink-muted hover:border-loss/40 hover:text-loss'
                  }`}
                >
                  Kazançsız ({indexSummary?.red.count || 0})
                </button>
                <button
                  onClick={() => {
                    setStatusFilter('WITHOUT_INDEX');
                    setCurrentPage(1);
                  }}
                  className={`rounded-md border px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === 'WITHOUT_INDEX'
                      ? 'border-hairline-strong bg-panel-sunken text-ink'
                      : 'border-hairline text-ink-muted hover:border-hairline-strong hover:text-ink'
                  }`}
                >
                  Endekssiz ({indexSummary?.withoutIndex.count || 0})
                </button>
              </div>
            </div>

            {/* Ürün Tablosu */}
            <div className="overflow-x-auto rounded-lg border border-hairline">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-hairline bg-panel-sunken text-2xs font-medium text-ink-muted">
                    <th className="py-2.5 pl-4 pr-3">Ürün</th>
                    <th
                      onClick={() => handleSort('price')}
                      className="cursor-pointer py-2.5 px-3 hover:text-ink"
                    >
                      <div className="flex items-center gap-1">
                        <span>Satış Fiyatımız</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('ozonDiff')}
                      className="cursor-pointer py-2.5 px-3 hover:text-ink"
                    >
                      <div className="flex items-center gap-1">
                        <span>Ozon En İyi Fiyat</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </th>
                    <th className="py-2.5 px-3">Dış Piyasa</th>
                    <th
                      onClick={() => handleSort('index')}
                      className="cursor-pointer py-2.5 px-3 hover:text-ink"
                    >
                      <div className="flex items-center gap-1">
                        <span>Endeks Durumu</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </th>
                    <th className="py-2.5 px-3">Komisyon</th>
                    <th className="py-2.5 pl-3 pr-4 text-right">Stok</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {loadingIndex ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-3 pl-4 pr-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 shrink-0 rounded-md bg-panel-sunken" />
                            <div className="space-y-1.5">
                              <div className="h-3 w-28 rounded-sm bg-panel-sunken" />
                              <div className="h-2.5 w-48 rounded-sm bg-panel-sunken" />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3"><div className="h-4 w-16 rounded-sm bg-panel-sunken" /></td>
                        <td className="py-3 px-3"><div className="h-4 w-20 rounded-sm bg-panel-sunken" /></td>
                        <td className="py-3 px-3"><div className="h-4 w-20 rounded-sm bg-panel-sunken" /></td>
                        <td className="py-3 px-3"><div className="h-4 w-16 rounded-sm bg-panel-sunken" /></td>
                        <td className="py-3 px-3"><div className="h-4 w-10 rounded-sm bg-panel-sunken" /></td>
                        <td className="py-3 pl-3 pr-4"><div className="ml-auto h-4 w-8 rounded-sm bg-panel-sunken" /></td>
                      </tr>
                    ))
                  ) : paginatedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-ink-subtle text-xs">
                        Aradığınız kriterlere uygun ürün bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    paginatedProducts.map((p) => {
                      const ozonRatio = p.ozonIndexValue > 0 ? p.ozonIndexValue : null;
                      const extRatio = p.externalIndexValue > 0 ? p.externalIndexValue : null;

                      let statusTone: 'gain' | 'caution' | 'loss' | 'neutral' = 'neutral';
                      let statusLabel = 'Endekssiz';

                      if (p.colorIndex === 'GREEN') {
                        statusTone = 'gain';
                        statusLabel = 'Kazançlı';
                      } else if (p.colorIndex === 'YELLOW') {
                        statusTone = 'caution';
                        statusLabel = 'Orta Düzey';
                      } else if (p.colorIndex === 'RED') {
                        statusTone = 'loss';
                        statusLabel = 'Kazançsız';
                      }

                      return (
                        <tr key={p.productId} className="transition-colors hover:bg-panel-sunken/40">
                          {/* Ürün Görseli, Model ve Başlık */}
                          <td className="py-3 pl-4 pr-3">
                            <div className="flex items-center gap-3">
                              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-hairline bg-white/3">
                                {p.image ? (
                                  <img
                                    src={p.image}
                                    alt={p.name}
                                    className="h-full w-full object-contain p-1"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-ink-faint">
                                    <ImageOff className="h-4 w-4" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 max-w-[260px] sm:max-w-xs">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-ink truncate">{p.offerId}</span>
                                  <span className="text-2xs text-ink-subtle">SKU: {p.sku}</span>
                                </div>
                                <p className="truncate text-2xs text-ink-subtle mt-0.5">{p.name}</p>
                              </div>
                            </div>
                          </td>

                          {/* Bizim Satış Fiyatımız */}
                          <td className="py-3 px-3">
                            <div className="tabular-nums font-semibold text-ink">
                              {p.price} {p.currency}
                            </div>
                            {p.oldPrice > p.price && (
                              <div className="tabular-nums text-2xs text-ink-faint line-through">
                                {p.oldPrice} {p.currency}
                              </div>
                            )}
                          </td>

                          {/* Ozon İçi En İyi Fiyat */}
                          <td className="py-3 px-3">
                            {p.ozonMinPrice > 0 ? (
                              <div>
                                <div className="tabular-nums font-medium text-ink">
                                  {p.ozonMinPrice.toLocaleString('tr-TR')} ₽
                                </div>
                                {ozonRatio !== null && (
                                  <div
                                    className={`tabular-nums text-2xs font-medium ${
                                      ozonRatio > 1.05
                                        ? 'text-loss'
                                        : ozonRatio >= 1.0
                                        ? 'text-caution'
                                        : 'text-gain'
                                    }`}
                                  >
                                    {ozonRatio > 1.0
                                      ? `+${((ozonRatio - 1) * 100).toFixed(0)}% pahalı`
                                      : `${((1 - ozonRatio) * 100).toFixed(0)}% ucuz`}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-2xs text-ink-faint">—</span>
                            )}
                          </td>

                          {/* Dış Piyasa En İyi Fiyat */}
                          <td className="py-3 px-3">
                            {p.externalMinPrice > 0 ? (
                              <div>
                                <div className="tabular-nums font-medium text-ink">
                                  {p.externalMinPrice.toLocaleString('tr-TR')} ₽
                                </div>
                                {extRatio !== null && (
                                  <div className="tabular-nums text-2xs text-ink-subtle">
                                    {extRatio.toFixed(2)}x endeks
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-2xs text-ink-faint">—</span>
                            )}
                          </td>

                          {/* Endeks Durumu */}
                          <td className="py-3 px-3">
                            <StatusDot tone={statusTone} label={statusLabel} />
                          </td>

                          {/* Ozon Satış Komisyonu */}
                          <td className="py-3 px-3 tabular-nums text-ink-muted">
                            %{p.commissionPercent}
                          </td>

                          {/* Stok Adedi */}
                          <td className="py-3 pl-3 pr-4 text-right tabular-nums font-medium text-ink">
                            {p.stock}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Sayfalama Kontrolleri */}
            {!loadingIndex && filteredProducts.length > pageSize && (
              <div className="flex items-center justify-between pt-2 text-2xs text-ink-muted">
                <div>
                  Toplam <span className="tabular-nums font-semibold text-ink">{filteredProducts.length}</span> üründen{' '}
                  <span className="tabular-nums font-semibold text-ink">{(currentPage - 1) * pageSize + 1}</span> -{' '}
                  <span className="tabular-nums font-semibold text-ink">
                    {Math.min(currentPage * pageSize, filteredProducts.length)}
                  </span>{' '}
                  arası gösteriliyor
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-7 px-2"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Önceki
                  </Button>

                  <span className="px-2 tabular-nums">
                    {currentPage} / {totalPages}
                  </span>

                  <Button
                    variant="secondary"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-7 px-2"
                  >
                    Sonraki
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

          </div>

        </div>
      </main>
    </div>
  );
}



