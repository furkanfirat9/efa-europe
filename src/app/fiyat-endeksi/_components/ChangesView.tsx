'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, ImageOff, TrendingDown, TrendingUp } from 'lucide-react';
import type { ColorChange, SharePoint } from '@/lib/pricing/indexHistory';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Badge } from '@/components/shadcn/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs';
import { cn } from '@/lib/utils';
import { direction, reasonTexts } from './reasons';
import { StatusBadge, when } from './status';

export interface ProductLookup {
  productId: number;
  offerId: string;
  name: string;
  image: string;
  currency: string;
}

type Dir = 'ALL' | 'WORSE' | 'BETTER';
type Share = { now: SharePoint | null; dayAgo: SharePoint | null; weekAgo: SharePoint | null };

const DAYS = [1, 7, 30] as const;

const pctText = (n: number) => `%${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;

function ShareCell({ label, point, now }: { label: string; point: SharePoint | null; now?: SharePoint | null }) {
  const diff = point && now ? now.pct - point.pct : null;
  return (
    <div className="min-w-36 flex-1 rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">
        {label}
        {point && ` · ${when(point.at)}`}
      </div>
      {point ? (
        <div className="flex items-baseline gap-2">
          <span className={cn('tabular-nums', now ? 'text-base' : 'text-2xl font-semibold')}>{pctText(point.pct)}</span>
          {diff != null && Math.abs(diff) >= 0.05 && (
            // Fark "o zamandan bugüne": şimdiki pay daha yüksekse iyileşme
            <span className={cn('text-xs tabular-nums', diff > 0 ? 'text-emerald-600' : 'text-destructive')}>
              {diff > 0 ? '▲' : '▼'} {Math.abs(diff).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} puan
            </span>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">kayıt yok</div>
      )}
      {point && (
        <div className="text-xs text-muted-foreground tabular-nums">
          {point.green} / {point.indexed} ürün
        </div>
      )}
    </div>
  );
}

export function ChangesView({
  store,
  products,
  refreshKey,
  onOpenHistory,
}: {
  store: 'store1' | 'store2';
  products: ProductLookup[];
  /** Ana liste her yenilendiğinde değişir; yeni kayıt düşmüş olabilir */
  refreshKey: number;
  onOpenHistory: (p: ProductLookup) => void;
}) {
  const [days, setDays] = useState<(typeof DAYS)[number]>(7);
  const [dir, setDir] = useState<Dir>('ALL');
  const [data, setData] = useState<{ changes: ColorChange[]; share: Share } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/ozon/price-index/changes?store=${store}&days=${days}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.error || 'Değişimler alınamadı.');
        setData({ changes: j.changes, share: j.share });
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message || 'Hata');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [store, days, refreshKey]);

  const byId = useMemo(() => new Map(products.map((p) => [String(p.productId), p])), [products]);
  const changes = data?.changes ?? [];
  const counts = useMemo(
    () => ({ WORSE: changes.filter((c) => direction(c) > 0).length, BETTER: changes.filter((c) => direction(c) < 0).length }),
    [changes]
  );
  const shown = changes.filter((c) => dir === 'ALL' || (dir === 'WORSE' ? direction(c) > 0 : direction(c) < 0));
  const share = data?.share;

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Değişimler alınamadı</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Kazançlı payı geçmişi */}
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">Kazançlı payı</CardTitle>
          <CardDescription>Endeksi olan ürünler içinde yeşil olanların oranı; en yeni kayıt ve 24 saat / 7 gün öncesine en yakın kayıt.</CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          {loading && !data ? (
            <Skeleton className="h-16 w-full" />
          ) : !share?.now ? (
            <p className="text-sm text-muted-foreground">Henüz kayıt yok.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <ShareCell label="Şimdi" point={share.now} />
              <ShareCell label="Dün" point={share.dayAgo} now={share.now} />
              <ShareCell label="Geçen hafta" point={share.weekAgo} now={share.now} />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={dir} onValueChange={(v) => setDir(v as Dir)}>
          <TabsList>
            <TabsTrigger value="ALL">Tümü ({changes.length})</TabsTrigger>
            <TabsTrigger value="WORSE">Kötüleşen ({counts.WORSE})</TabsTrigger>
            <TabsTrigger value="BETTER">İyileşen ({counts.BETTER})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as (typeof DAYS)[number])}>
          <TabsList>
            {DAYS.map((d) => (
              <TabsTrigger key={d} value={String(d)}>
                {d === 1 ? 'Son 24 saat' : `Son ${d} gün`}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ürün</TableHead>
              <TableHead>Zaman</TableHead>
              <TableHead>Renk</TableHead>
              <TableHead>Sebep</TableHead>
              <TableHead className="text-right">Ozon endeksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Bu dönemde renk değiştiren ürün yok.
                </TableCell>
              </TableRow>
            ) : (
              shown.map((c) => {
                const p = byId.get(c.productId);
                const lookup: ProductLookup = p ?? { productId: Number(c.productId), offerId: c.offerId, name: c.offerId, image: '', currency: 'USD' };
                const d = direction(c);
                return (
                  <TableRow key={`${c.productId}-${c.at}`} className="cursor-pointer" onClick={() => onOpenHistory(lookup)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                          {lookup.image ? (
                            <img src={lookup.image} alt={lookup.name} className="size-full object-contain p-0.5" loading="lazy" />
                          ) : (
                            <ImageOff className="size-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 max-w-64">
                          <div className="truncate font-mono text-xs font-medium">{c.offerId}</div>
                          <div className="truncate text-xs text-muted-foreground" title={lookup.name}>
                            {lookup.name}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">{when(c.at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {d > 0 ? (
                          <TrendingDown className="size-4 text-destructive" aria-label="Kötüleşti" />
                        ) : d < 0 ? (
                          <TrendingUp className="size-4 text-emerald-600" aria-label="İyileşti" />
                        ) : null}
                        <StatusBadge index={c.from} />
                        <ArrowRight className="size-3 text-muted-foreground" />
                        <StatusBadge index={c.to} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {reasonTexts(c, c.before, c.after, lookup.currency).map((t) => (
                          <span key={t} className="text-sm">
                            {t}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge variant="secondary" className="tabular-nums">
                        {c.before.ozonIndex ?? '—'} → {c.after.ozonIndex ?? '—'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Sebep, önceki rengin başladığı andaki durumla karşılaştırılarak bulunur: Ozon endeksi fiyat değişikliğinden saatler sonra
        güncelleyebiliyor. Kayıt, bu sayfa açıldığında (en fazla 30 dakikada bir) ve günlük kontrolde alınır.
      </p>
    </div>
  );
}
