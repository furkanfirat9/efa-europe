'use client';

import React, { useMemo } from 'react';
import { ArrowRight, Package } from 'lucide-react';
import { SkuMetric } from '@/types/analytics';
import { Panel } from '@/components/ui/Panel';
import { formatRub, formatNumber } from '@/lib/format';

interface TopProductsPanelProps {
  products: SkuMetric[];
  loading: boolean;
  onOpenAll: () => void;
}

const TOP_COUNT = 30;

export function TopProductsPanel({ products, loading, onOpenAll }: TopProductsPanelProps) {
  /** Sipariş yoksa ilgi düzeyi (ürün ziyareti) sıralamayı belirler. */
  const top = useMemo(() => {
    return [...(products || [])]
      .sort(
        (a, b) =>
          (b.orderedUnits || 0) - (a.orderedUnits || 0) ||
          (b.revenue || 0) - (a.revenue || 0) ||
          (b.hitsViewPdp || 0) - (a.hitsViewPdp || 0)
      )
      .slice(0, TOP_COUNT);
  }, [products]);

  return (
    <Panel
      title="Öne çıkan ürünler"
      caption={
        loading
          ? 'Yükleniyor…'
          : products.length > TOP_COUNT
            ? `${products.length} üründen ilk ${TOP_COUNT}'u · sipariş ve ilgiye göre`
            : 'Sipariş ve ilgiye göre sıralı'
      }
      flush
      className="h-full"
      actions={
        <button
          type="button"
          onClick={onOpenAll}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-2xs font-medium text-ink-muted transition-colors hover:bg-white/4 hover:text-ink"
        >
          Tümü
          <ArrowRight className="h-3 w-3" />
        </button>
      }
    >
      <div className="scroll-thin h-full overflow-y-auto">
        {loading ? (
          <ul>
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={index} className="flex items-center gap-3 border-b border-hairline px-5 py-3 last:border-b-0">
                <div className="skeleton h-9 w-9 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <div className="skeleton h-3 w-3/4" />
                  <div className="skeleton mt-2 h-2.5 w-1/3" />
                </div>
                <div className="skeleton h-3 w-10 shrink-0" />
              </li>
            ))}
          </ul>
        ) : top.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
            <p className="text-[13px] text-ink-muted">Ürün performansı oluşmadı</p>
            <p className="text-2xs text-ink-subtle">
              Seçili aralıkta hiçbir ürün gösterim almamış.
            </p>
          </div>
        ) : (
          <ul>
            {top.map((product, index) => (
              <li
                key={product.sku || index}
                className="flex items-center gap-3 border-b border-hairline px-5 py-2.5 transition-colors last:border-b-0 hover:bg-white/2"
              >
                <span className="w-4 shrink-0 text-right text-2xs tabular-nums text-ink-faint">
                  {index + 1}
                </span>

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

                <div className="min-w-0 flex-1">
                  <p className="truncate text-2xs font-medium text-ink" title={product.name}>
                    {product.name}
                  </p>
                  {/* Metrikler (shrink-0) her genişlikte tam görünür kalır;
                      yalnızca model kodu kısalır. Telefonda kalan yer bir
                      kırıntıya yetmediği için kod tamamen gizlenir — ürün adı
                      zaten hemen üstünde duruyor. */}
                  <p className="mt-0.5 flex items-center gap-1 text-2xs text-ink-subtle">
                    <span
                      className="hidden truncate text-ink-faint sm:inline"
                      title={product.offerId || `SKU ${product.sku}`}
                    >
                      {product.offerId || `SKU ${product.sku}`}
                    </span>
                    <span className="hidden shrink-0 text-ink-faint sm:inline">·</span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums">
                      {formatNumber(product.hitsViewPdp)} ziyaret
                    </span>
                    <span className="shrink-0 text-ink-faint">·</span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums">
                      {formatNumber(product.hitsToCart)} sepete ekleme
                    </span>
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-2xs font-semibold tabular-nums text-ink">
                    {formatNumber(product.orderedUnits)}
                    <span className="ml-1 font-normal text-ink-subtle">sipariş</span>
                  </p>
                  {product.revenue > 0 && (
                    <p className="mt-0.5 text-2xs tabular-nums text-gain">
                      {formatRub(product.revenue)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
