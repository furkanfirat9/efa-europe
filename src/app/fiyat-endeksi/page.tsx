'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle, ArrowUpDown, ChevronLeft, ChevronRight, History, ImageOff, RefreshCw, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Button } from '@/components/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs';
import { cn } from '@/lib/utils';
import { ChangesView, type ProductLookup } from './_components/ChangesView';
import { HistorySheet } from './_components/HistorySheet';
import { money, STATUS, STATUS_ORDER, StatusBadge, type ColorIndex } from './_components/status';

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
  /** Kampanyalar dahil satış fiyatı */
  price: number;
  /** Kampanyasız fiyat */
  basePrice: number;
  /** Sitedeki fiyat, Ozon indirimi dahil. Mağazada uç kapalıysa null. */
  sitePrice: number | null;
  oldPrice: number;
  currency: string;
  colorIndex: 'GREEN' | 'YELLOW' | 'RED' | 'WITHOUT_INDEX';
  /** Rakibin fiyatı, ruble */
  ozonMinPrice: number;
  /** Aynı fiyat, mağaza para biriminde (Ozon'un çevirdiği) */
  ozonMinPriceSeller: number;
  ozonIndexValue: number;
  externalMinPrice: number;
  externalMinPriceSeller: number;
  externalIndexValue: number;
  stock: number;
  commissionPercent: number;
}

type StatusFilter = 'ALL' | ColorIndex;
type SortField = 'index' | 'price' | 'ozonDiff' | 'name';

/**
 * Fiyatımızın en ucuz Ozon rakibine oranı. İki USD fiyattan hesaplanır:
 * Ozon'un price_index_value'su üstten kırpılıyor (399 $ / 37,83 $ için 1,90 dönüyor).
 */
function ozonRatioOf(p: PriceIndexProduct): number | null {
  const ours = p.sitePrice ?? p.price;
  if (p.ozonMinPriceSeller > 0 && ours > 0) return ours / p.ozonMinPriceSeller;
  return p.ozonIndexValue > 0 ? p.ozonIndexValue : null;
}

/** Rakip fiyatı mağaza para biriminde; Ozon çevirmemişse rubleye düşer. */
function sellerPrice(seller: number, rub: number, currency: string) {
  if (seller > 0) return `${seller.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${currency}`;
  return `${rub.toLocaleString('tr-TR')} ₽`;
}

export default function FiyatEndeksiPage() {
  const [rates, setRates] = useState<{
    usd?: CurrencyRate;
    eur?: CurrencyRate;
    cny?: CurrencyRate;
  } | null>(null);
  const [loadingRates, setLoadingRates] = useState<boolean>(true);
  const [rateError, setRateError] = useState<string | null>(null);

  const [selectedStore, setSelectedStore] = useState<'store1' | 'store2'>('store2');
  const [indexSummary, setIndexSummary] = useState<PriceIndexSummary | null>(null);
  const [products, setProducts] = useState<PriceIndexProduct[]>([]);
  const [sitePriceAvailable, setSitePriceAvailable] = useState<boolean>(true);
  const [loadingIndex, setLoadingIndex] = useState<boolean>(true);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [view, setView] = useState<'products' | 'changes'>('products');
  const [historyProduct, setHistoryProduct] = useState<ProductLookup | null>(null);
  /** Her endeks yüklemesinde artar: Değişimler sekmesi yeni kaydı çeker */
  const [loadCount, setLoadCount] = useState(0);

  // Filtreleme ve Sıralama
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortField>('ozonDiff');
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
        setSitePriceAvailable(data.sitePriceAvailable !== false);
        setLoadCount((n) => n + 1);
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
    return products
      .filter((p) => {
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
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'ozonDiff') {
          comparison = (ozonRatioOf(b) || 0) - (ozonRatioOf(a) || 0);
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

  const lookups = useMemo<ProductLookup[]>(
    () =>
      products.map((p) => ({
        productId: p.productId,
        offerId: p.offerId,
        name: p.name,
        image: p.image,
        currency: p.currency,
      })),
    [products]
  );

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const selectStatus = (value: StatusFilter) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const rateText = (r?: CurrencyRate) => (r ? `${r.rate.toFixed(4)} ₽` : loadingRates ? '…' : '—');

  const sortableHead = (field: SortField, label: string) => (
    <TableHead>
      <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort(field)}>
        {label}
        <ArrowUpDown className={sortBy === field ? 'text-foreground' : 'text-muted-foreground'} />
      </Button>
    </TableHead>
  );

  return (
    <div className="flex-1 space-y-4 bg-background p-4 pt-6 text-foreground md:p-8">
      {/* Başlık + Ozon kurları */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fiyat endeksi</h1>
          <p className="text-muted-foreground">Ürünlerimizin fiyatının Ozon ve dış piyasadaki en iyi fiyatlarla karşılaştırması.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-8 items-center gap-3 rounded-md border px-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className={cn('size-1.5 rounded-full', rateError ? 'bg-destructive' : 'bg-emerald-500')} />
              Ozon kuru
            </span>
            <span>
              1 $ = <span className="font-medium tabular-nums text-foreground">{rateText(rates?.usd)}</span>
            </span>
            <span>
              1 € = <span className="font-medium tabular-nums text-foreground">{rateText(rates?.eur)}</span>
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchExchangeRates} disabled={loadingRates} title="Ozon canlı kurlarını güncelle">
            <RefreshCw className={loadingRates ? 'animate-spin' : undefined} />
            <span className="hidden sm:inline">Kurları yenile</span>
          </Button>
        </div>
      </div>

      {/* Mağaza seçimi */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={selectedStore} onValueChange={(v) => setSelectedStore(v as 'store1' | 'store2')}>
          <TabsList>
            <TabsTrigger value="store2">Türkiye mağazası</TabsTrigger>
            <TabsTrigger value="store1">Avrupa mağazası</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={() => fetchPriceIndex(selectedStore)} disabled={loadingIndex}>
          <RefreshCw className={loadingIndex ? 'animate-spin' : undefined} />
          Endeksi yenile
        </Button>
      </div>

      {!loadingIndex && !indexError && !sitePriceAvailable && (
        <p className="text-sm text-muted-foreground">
          Bu mağazada sitedeki fiyat (Ozon indirimi dahil) alınamıyor; Ozon bu veriyi yalnızca Premium Pro mağazalara veriyor. Satış fiyatı
          olarak kampanyalı fiyat gösteriliyor.
        </p>
      )}

      {indexError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Fiyat endeksi alınamadı</AlertTitle>
          <AlertDescription>{indexError}</AlertDescription>
        </Alert>
      )}

      {/* Dağılım barı + durum kartları */}
      {loadingIndex && !indexSummary ? (
        <div className="space-y-4">
          <Skeleton className="h-2 w-full" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {STATUS_ORDER.map((s) => (
              <Skeleton key={s} className="h-28" />
            ))}
          </div>
        </div>
      ) : indexSummary && !indexError ? (
        <div className="space-y-4">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {STATUS_ORDER.map((s) => {
              const g = indexSummary[STATUS[s].key];
              return g.percent > 0 ? (
                <div
                  key={s}
                  style={{ width: `${g.percent}%` }}
                  className={cn('h-full transition-all', STATUS[s].dot)}
                  title={`${STATUS[s].label}: %${g.percent} (${g.count} ürün)`}
                />
              ) : null;
            })}
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {STATUS_ORDER.map((s) => {
              const g = indexSummary[STATUS[s].key];
              const active = statusFilter === s;
              // Ozon'un satıcı panelindeki gibi: renkler endeksi olan ürünler içindeki pay; endekssiz, tüm ürünlerin payı.
              const indexed = indexSummary.total - indexSummary.withoutIndex.count;
              const share =
                s === 'WITHOUT_INDEX' ? g.percent : indexed > 0 ? Number(((g.count / indexed) * 100).toFixed(1)) : 0;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => selectStatus(active ? 'ALL' : s)}
                  aria-pressed={active}
                  className="rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Card
                    className={cn('h-full gap-1 py-4 transition-colors hover:bg-muted/50', active && 'border-foreground/40 bg-muted/50')}
                  >
                    <CardHeader className="px-4">
                      <CardDescription className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <span className={cn('size-1.5 rounded-full', STATUS[s].dot)} />
                          {STATUS[s].label}
                        </span>
                        <span
                          className="tabular-nums"
                          title={s === 'WITHOUT_INDEX' ? 'Tüm ürünlerin payı' : `Endeksi olan ${indexed} ürün içindeki pay`}
                        >
                          %{share.toLocaleString('tr-TR')}
                        </span>
                      </CardDescription>
                      <CardTitle className="text-2xl tabular-nums">
                        {g.count} <span className="text-sm font-normal text-muted-foreground">ürün</span>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{STATUS[s].hint}</p>
                    </CardHeader>
                  </Card>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <Tabs value={view} onValueChange={(v) => setView(v as 'products' | 'changes')}>
        <TabsList>
          <TabsTrigger value="products">Ürünler</TabsTrigger>
          <TabsTrigger value="changes">Değişimler</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === 'changes' ? (
        <ChangesView store={selectedStore} products={lookups} refreshKey={loadCount} onOpenHistory={setHistoryProduct} />
      ) : (
        <>
          {/* Filtre ve arama */}
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={statusFilter} onValueChange={(v) => selectStatus(v as StatusFilter)}>
              <TabsList className="flex-wrap">
                <TabsTrigger value="ALL">Tümü ({products.length})</TabsTrigger>
                {STATUS_ORDER.map((s) => (
                  <TabsTrigger key={s} value={s}>
                    {STATUS[s].short} ({indexSummary?.[STATUS[s].key].count || 0})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Model kodu, SKU veya ürün adı"
                className="h-9 w-72 pl-8"
                aria-label="Ürün ara"
              />
            </div>
          </div>

          {/* Ürün tablosu */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  {sortableHead('price', 'Satış fiyatımız')}
                  {sortableHead('ozonDiff', 'Ozon en iyi fiyat')}
                  <TableHead>Dış piyasa</TableHead>
                  {sortableHead('index', 'Endeks durumu')}
                  <TableHead className="text-right">Komisyon</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingIndex ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-10 shrink-0" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-3 w-28" />
                            <Skeleton className="h-3 w-48" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="ml-auto h-4 w-10" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="ml-auto h-4 w-8" />
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))
                ) : paginatedProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      Aradığınız kriterlere uygun ürün bulunamadı.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedProducts.map((p) => {
                    const ozonRatio = ozonRatioOf(p);
                    const extRatio = p.externalIndexValue > 0 ? p.externalIndexValue : null;

                    return (
                      <TableRow key={p.productId}>
                        {/* Ürün görseli, model ve başlık */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                              {p.image ? (
                                <img src={p.image} alt={p.name} className="size-full object-contain p-0.5" loading="lazy" />
                              ) : (
                                <ImageOff className="size-4 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 max-w-72">
                              <div className="flex items-baseline gap-2">
                                <span className="truncate font-mono text-xs font-medium">{p.offerId}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">SKU {p.sku}</span>
                              </div>
                              <div className="truncate text-xs text-muted-foreground" title={p.name}>
                                {p.name}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Bizim satış fiyatımız */}
                        <TableCell className="tabular-nums">
                          <div
                            className="font-medium"
                            title={p.sitePrice != null ? 'Sitedeki fiyat (Ozon indirimi dahil)' : 'Kampanyalı fiyat'}
                          >
                            {money(p.sitePrice ?? p.price)} {p.currency}
                          </div>
                          {p.sitePrice != null && p.sitePrice < p.price && (
                            <div className="text-xs text-muted-foreground">
                              Kampanyalı {money(p.price)} {p.currency}
                            </div>
                          )}
                          {p.basePrice > p.price && (
                            <div className="text-xs text-muted-foreground">
                              Kampanyasız {money(p.basePrice)} {p.currency}
                            </div>
                          )}
                        </TableCell>

                        {/* Ozon içi en iyi fiyat */}
                        <TableCell className="tabular-nums">
                          {p.ozonMinPrice > 0 ? (
                            <>
                              <div title={`${p.ozonMinPrice.toLocaleString('tr-TR')} ₽`}>
                                {sellerPrice(p.ozonMinPriceSeller, p.ozonMinPrice, p.currency)}
                              </div>
                              {ozonRatio !== null && (
                                <div
                                  className={cn(
                                    'text-xs',
                                    ozonRatio > 1.05 ? 'text-destructive' : ozonRatio >= 1.0 ? 'text-amber-600' : 'text-emerald-600'
                                  )}
                                >
                                  {ozonRatio > 1.0
                                    ? `+${((ozonRatio - 1) * 100).toFixed(0)}% pahalı`
                                    : `${((1 - ozonRatio) * 100).toFixed(0)}% ucuz`}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Dış piyasa en iyi fiyat */}
                        <TableCell className="tabular-nums">
                          {p.externalMinPrice > 0 ? (
                            <>
                              <div title={`${p.externalMinPrice.toLocaleString('tr-TR')} ₽`}>
                                {sellerPrice(p.externalMinPriceSeller, p.externalMinPrice, p.currency)}
                              </div>
                              {extRatio !== null && <div className="text-xs text-muted-foreground">{extRatio.toFixed(2)}x endeks</div>}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell>
                          <StatusBadge index={p.colorIndex} />
                        </TableCell>

                        <TableCell className="text-right tabular-nums text-muted-foreground">%{p.commissionPercent}</TableCell>

                        <TableCell className="text-right font-medium tabular-nums">{p.stock}</TableCell>

                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Endeks geçmişi"
                            title="Endeks geçmişi"
                            onClick={() =>
                              setHistoryProduct({
                                productId: p.productId,
                                offerId: p.offerId,
                                name: p.name,
                                image: p.image,
                                currency: p.currency,
                              })
                            }
                          >
                            <History />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Sayfalama */}
          {!loadingIndex && filteredProducts.length > pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <div>
                {filteredProducts.length} üründen {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filteredProducts.length)} arası
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft />
                  Önceki
                </Button>
                <span className="tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Sonraki
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <HistorySheet store={selectedStore} product={historyProduct} onClose={() => setHistoryProduct(null)} />
    </div>
  );
}
