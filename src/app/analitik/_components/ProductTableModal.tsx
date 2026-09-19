'use client';

import React, { useEffect, useMemo } from 'react';
import { ArrowDown, ArrowUp, Package, Search, X } from 'lucide-react';
import { SkuMetric } from '@/types/analytics';
import { SortField } from '../useAnalytics';
import { formatNumber } from '@/lib/format';
import styles from '@/styles/console.module.css';

interface ProductTableModalProps {
  open: boolean;
  onClose: () => void;
  products: SkuMetric[];
  loading: boolean;
  sortBy: SortField;
  sortOrder: 'asc' | 'desc';
  onSort: (field: SortField) => void;
  query: string;
  onQueryChange: (value: string) => void;
  /** Mağaza geneli ortalama kategori sırası (Ozon'un totals değeri). */
  avgPosition?: number;
}

const COLUMNS: {
  field: SortField;
  label: string;
  metric: keyof SkuMetric;
  barColor?: string;
  /** Küçük değerin iyi olduğu sütun: oransal çubuk yanıltıcı olur, konulmaz. */
  rank?: boolean;
  hint?: string;
}[] = [
  { field: 'views', label: 'Gösterim', metric: 'hitsViewSearch', barColor: 'bg-brand/35' },
  { field: 'pdp', label: 'Ürün ziyareti', metric: 'hitsViewPdp', barColor: 'bg-brand' },
  { field: 'cart', label: 'Sepete ekleme', metric: 'hitsToCart', barColor: 'bg-caution' },
  { field: 'orders', label: 'Sipariş', metric: 'orderedUnits', barColor: 'bg-gain' },
  {
    field: 'position',
    label: 'Kategori sırası',
    metric: 'positionCategory',
    rank: true,
    hint: 'Ozon kategori ve arama listesindeki ortalama sıra. Küçük olması iyidir; sıralamak için tıklayın.',
  },
];

export function ProductTableModal({
  open,
  onClose,
  products,
  loading,
  sortBy,
  sortOrder,
  onSort,
  query,
  onQueryChange,
  avgPosition = 0,
}: ProductTableModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  /** Hücre içi çubuklar sütunun kendi maksimumuna göre ölçeklenir. */
  const maxima = useMemo(() => {
    const result = {} as Record<string, number>;
    COLUMNS.forEach(({ field, metric, rank }) => {
      if (rank) return;
      result[field] = Math.max(1, ...products.map((p) => Number(p[metric]) || 0));
    });
    return result;
  }, [products]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Ürün performansı"
      onClick={onClose}
    >
      <div className={styles.dialog} onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              Ürün performansı
            </h2>
            <p className="mt-0.5 text-2xs text-ink-subtle">
              {loading
                ? 'Yükleniyor…'
                : [
                    `${formatNumber(products.length)} ürün`,
                    'seçili tarih aralığı',
                    avgPosition > 0 ? `ortalama sıra #${formatNumber(avgPosition)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Ürün veya SKU ara"
                className="h-8 w-56 rounded-lg border border-hairline bg-panel-sunken pl-8 pr-3 text-2xs text-ink outline-hidden transition-colors placeholder:text-ink-faint focus:border-hairline-strong"
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-white/5 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[880px] table-fixed border-collapse">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="border-b border-hairline">
                <th className="w-[30%] px-5 py-2.5 text-left text-2xs font-medium text-ink-subtle">
                  Ürün
                </th>
                {COLUMNS.map(({ field, label, hint }) => {
                  const active = sortBy === field;
                  return (
                    <th key={field} className="w-[14%] px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => onSort(field)}
                        title={hint}
                        className={`ml-auto flex cursor-pointer items-center gap-1 text-2xs font-medium transition-colors ${
                          active ? 'text-ink' : 'text-ink-subtle hover:text-ink-muted'
                        }`}
                      >
                        {label}
                        {active ? (
                          sortOrder === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <span className="w-3" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index} className="border-b border-hairline">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="skeleton h-9 w-9 shrink-0 rounded-md" />
                        <div className="min-w-0 flex-1">
                          <div className="skeleton h-3 w-3/5" />
                          <div className="skeleton mt-2 h-2.5 w-1/4" />
                        </div>
                      </div>
                    </td>
                    {COLUMNS.map(({ field }) => (
                      <td key={field} className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <div className="skeleton h-3 w-8" />
                          <div className="skeleton mt-1.5 h-[2px] w-12" />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-5 py-16 text-center">
                    <p className="text-[13px] text-ink-muted">Kayıt bulunamadı</p>
                    <p className="mt-1 text-2xs text-ink-subtle">
                      {query
                        ? 'Arama terimini değiştirmeyi deneyin.'
                        : 'Seçili aralıkta ürün performansı oluşmamış.'}
                    </p>
                  </td>
                </tr>
              ) : (
                products.map((product, index) => (
                  <tr
                    key={product.sku || index}
                    className="border-b border-hairline transition-colors last:border-b-0 hover:bg-white/2"
                  >
                    <td className="px-5 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline bg-panel-sunken">
                          {product.primaryImage ? (
                            <img
                              src={product.primaryImage}
                              alt=""
                              className="h-full w-full object-contain p-0.5"
                              loading="lazy"
                            />
                          ) : (
                            <Package className="h-4 w-4 text-ink-faint" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p
                            className="truncate text-2xs font-medium text-ink"
                            title={product.name}
                          >
                            {product.name}
                          </p>
                          <p className="mt-0.5 truncate text-2xs text-ink-subtle">
                            {product.offerId || `SKU ${product.sku}`}
                          </p>
                        </div>
                      </div>
                    </td>

                    {COLUMNS.map(({ field, metric, barColor, rank }) => {
                      const value = Number(product[metric]) || 0;
                      const isOrders = field === 'orders';

                      return (
                        <td key={field} className="px-4 py-2.5 text-right">
                          <div className="flex flex-col items-end">
                            <span
                              className={`text-2xs tabular-nums ${
                                isOrders && value > 0
                                  ? 'font-semibold text-gain'
                                  : value > 0
                                    ? 'text-ink'
                                    : 'text-ink-faint'
                              }`}
                            >
                              {rank
                                ? value > 0
                                  ? `#${formatNumber(value)}`
                                  : '—'
                                : formatNumber(value)}
                            </span>
                            {/* Sıra sütununda çubuk yok; satır yüksekliği ve
                                sayıların hizası bozulmasın diye boşluk kalır. */}
                            <div className="mt-1 h-[2px] w-12 overflow-hidden rounded-full">
                              {!rank && (
                                <div className="h-full w-full rounded-full bg-white/4">
                                  {value > 0 && (
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                      style={{
                                        width: `${Math.max(6, (value / maxima[field]) * 100)}%`,
                                      }}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
