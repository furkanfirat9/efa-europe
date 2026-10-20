'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { formatUSD } from '@/lib/format';
import type { TopProduct } from '@/lib/orders/periodProfit';
import { cn } from '@/lib/utils';
import { SectionHeading } from './shared';
import { useDashboardData } from './useDashboardData';

interface TopResponse {
  items: TopProduct[];
  productCount: number;
  orderCount: number;
}

/** Bu ayın en çok satan 5 ürünü; satır, Siparişler'i o ürünle süzülmüş açar. */
export function TopSellersTable() {
  const { data, error } = useDashboardData<TopResponse>('/api/dashboard/en-cok-satanlar');

  return (
    <section className="space-y-1">
      <SectionHeading
        title="En çok satanlar"
        aside={data && <span className="text-xs font-normal text-muted-foreground">bu ay · {data.productCount} ürün satıldı</span>}
      />
      {error && !data ? (
        <p className="py-2 text-sm text-muted-foreground">{error}</p>
      ) : !data ? (
        [0, 1, 2].map((i) => <Skeleton key={i} className="my-2 h-10" />)
      ) : data.items.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Bu ay henüz sipariş yok.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8 px-0">#</TableHead>
              <TableHead>Ürün</TableHead>
              <TableHead className="text-right">Sipariş</TableHead>
              <TableHead className="text-right">Ciro</TableHead>
              <TableHead className="text-right">Kâr</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((p, i) => (
              <TableRow key={p.offerId}>
                <TableCell className="px-0 text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell className="max-w-0 w-full">
                  <Link
                    href={`/siparisler?product=${encodeURIComponent(p.offerId)}`}
                    className="flex items-center gap-3 outline-none hover:underline focus-visible:underline"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background p-0.5">
                      {p.image ? <img src={p.image} alt="" className="size-full object-contain" /> : <Package className="size-4 text-muted-foreground" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.offerId}</span>
                      <span className="block truncate text-xs text-muted-foreground" title={p.title ?? undefined}>
                        {p.title || '—'}
                      </span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.orders}
                  {p.units > p.orders && <span className="block text-xs text-muted-foreground">{p.units} adet</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatUSD(p.revenueUsd)}</TableCell>
                <TableCell
                  className={cn('text-right tabular-nums', p.profitUsd < 0 && 'text-destructive')}
                  title={p.estimated ? 'Alışı girilmemiş siparişlerin kârı tahmini' : undefined}
                >
                  {p.estimated && '≈ '}
                  {formatUSD(p.profitUsd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
