'use client';

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { ColorChange, StatePoint } from '@/lib/pricing/indexHistory';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/shadcn/sheet';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { cn } from '@/lib/utils';
import type { ProductLookup } from './ChangesView';
import { reasonTexts } from './reasons';
import { money, StatusBadge, when } from './status';

/** Tek ürünün endeks geçmişi: her kayıtta renk, fiyatımız, rakip ve endeks; renk değiştiği yerde sebep. */
export function HistorySheet({ store, product, onClose }: { store: 'store1' | 'store2'; product: ProductLookup | null; onClose: () => void }) {
  const [data, setData] = useState<{ points: StatePoint[]; changes: ColorChange[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!product) return;
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    fetch(`/api/ozon/price-index/history?store=${store}&productId=${product.productId}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.error || 'Geçmiş alınamadı.');
        setData({ points: j.points, changes: j.changes });
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message || 'Hata');
      });
    return () => ctrl.abort();
  }, [store, product]);

  const changeAt = new Map((data?.changes ?? []).map((c) => [c.at, c]));
  const points = [...(data?.points ?? [])].reverse();
  const cur = product?.currency ?? 'USD';

  return (
    <Sheet open={!!product} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        {product && (
          <>
            <SheetHeader className="border-b p-6">
              <div className="flex items-center gap-3 pr-6">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="size-full object-contain p-0.5" />
                  ) : (
                    <ImageOff className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="font-mono">{product.offerId}</SheetTitle>
                  <SheetDescription className="truncate">{product.name}</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-6">
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : !data ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : points.length === 0 ? (
                <p className="text-sm text-muted-foreground">Bu ürün için henüz kayıt yok.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zaman</TableHead>
                      <TableHead>Renk</TableHead>
                      <TableHead className="text-right">Fiyatımız</TableHead>
                      <TableHead className="text-right">Rakip</TableHead>
                      <TableHead className="text-right">Endeks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {points.map((p) => {
                      const c = changeAt.get(p.at);
                      return (
                        <TableRow key={p.at} className={cn(c && 'bg-muted/50')}>
                          <TableCell className="align-top whitespace-nowrap text-sm text-muted-foreground tabular-nums">{when(p.at)}</TableCell>
                          <TableCell className="align-top">
                            <StatusBadge index={p.color} />
                            {c && (
                              <div className="mt-1 flex flex-col text-xs text-muted-foreground">
                                {reasonTexts(c, c.before, c.after, cur).map((t) => (
                                  <span key={t}>{t}</span>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right align-top tabular-nums">
                            {money(p.price)} {cur}
                          </TableCell>
                          <TableCell className="text-right align-top tabular-nums">
                            {p.rivalUsd != null ? `${money(p.rivalUsd)} ${cur}` : '—'}
                            {p.rivalRub != null && <div className="text-xs text-muted-foreground">{p.rivalRub.toLocaleString('tr-TR')} ₽</div>}
                          </TableCell>
                          <TableCell className="text-right align-top tabular-nums">{p.ozonIndex ?? '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <p className="mt-4 text-xs text-muted-foreground">Satır yalnızca fiyat, rakip ya da endeks değiştiğinde eklenir.</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
