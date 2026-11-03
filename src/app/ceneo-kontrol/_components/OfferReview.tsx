'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Check, Loader2, MapPinOff, Undo2, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs';
import type { OfferSkip, RejectedOffer } from '@/lib/sourcing/ceneoRules';
import { ExtLink, ProductImage } from './parts';

/**
 * Teklif kontrolü: Ceneo sayfası doğru ama seçilen teklif başka ürün ya da muadil olabilir. Yanlış teklif elenince maliyet
 * sıradaki tekliften hesaplanır; eleme sonraki taramalarda da geçerlidir. Teklifin mağaza linki (Ceneo'nun tıklama başı
 * ücretli reklam linki) burada yoktur; kontrol Ceneo ürün sayfasından yapılır.
 */

interface OfferRow {
  offerId: string | null;
  shop: string | null;
  title: string | null;
  totalPln: number;
  skip: OfferSkip | null;
  selected: boolean;
}

interface Channel {
  source: string;
  eur: number;
  shippingEur: number;
  buyable: boolean;
  shop: string | null;
  outlier: boolean;
}

interface Row {
  id: string;
  offerId: string;
  sku: string | null;
  asin: string | null;
  ozonName: string | null;
  ozonBrand: string | null;
  ozonImage: string | null;
  ceneoId: string | null;
  ceneoName: string | null;
  checkedAt: string | null;
  review: string | null;
  offers: OfferRow[];
  rejectedGone: RejectedOffer[];
  source: string | null;
  channels: Channel[];
}

type Action = 'reject-offer' | 'restore-offer' | 'offers-ok' | 'not-in-poland';

const SKIP_LABEL: Record<OfferSkip, string> = {
  rejected: 'Elendi',
  untrusted: 'Güvenilmeyen mağaza',
  compatible: 'Muadil yazıyor',
  'other-model': 'Başka model kodu',
};
const SOURCE_LABEL: Record<string, string> = { 'amazon-de': 'Amazon.de', 'amazon-pl': 'amazon.pl', ceneo: 'Ceneo' };

const pln = (n: number) => `${n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

function Costs({ row }: { row: Row }) {
  if (!row.channels.length) return <p className="text-xs text-destructive">Hiçbir kanalda fiyat yok</p>;
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {row.channels.map((c) => (
        <li key={c.source} className={c.source === row.source ? 'font-medium text-foreground' : undefined}>
          {SOURCE_LABEL[c.source] ?? c.source}
          {c.shop ? ` · ${c.shop}` : ''}: {(c.eur + c.shippingEur).toFixed(1)} €{c.outlier ? ' (piyasanın çok üstünde, maliyete alınmadı)' : c.buyable ? '' : ' (alınamaz)'}
          {c.source === row.source ? ' · maliyet bu' : ''}
        </li>
      ))}
    </ul>
  );
}

function OfferCard({ row, onChanged }: { row: Row; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const act = async (action: Action, offerId?: string | null) => {
    setBusy(`${action}:${offerId ?? ''}`);
    try {
      const res = await fetch(`/api/ceneo-kaynak/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, offerId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error_message);
      toast.success(
        action === 'reject-offer'
          ? `${row.offerId}: teklif elendi`
          : action === 'restore-offer'
            ? `${row.offerId}: eleme geri alındı`
            : action === 'offers-ok'
              ? `${row.offerId}: kontrol bitti`
              : `${row.offerId} "Ceneo'da yok" olarak işaretlendi`
      );
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kaydedilemedi');
    } finally {
      setBusy(null);
    }
  };

  const active = row.offers.filter((o) => !o.skip || o.skip === 'rejected');
  const visible = showAll ? row.offers : active;
  const hidden = row.offers.length - active.length;

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={row.review ? 'outline' : 'secondary'}>{row.review ? 'Karar bekliyor' : 'Karar verildi'}</Badge>
          <CardTitle className="font-mono text-sm">{row.offerId}</CardTitle>
        </div>
        {row.review && <p className="text-sm text-muted-foreground">{row.review}</p>}
      </CardHeader>

      <CardContent className="grid gap-4 px-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex gap-3">
          <ProductImage src={row.ozonImage} alt={`Ozon: ${row.offerId}`} />
          <div className="min-w-0 space-y-1 text-sm">
            <p className="line-clamp-3">{row.ozonName}</p>
            <p className="text-xs text-muted-foreground">{row.ozonBrand}</p>
            <div className="flex flex-wrap gap-x-3">
              {row.sku && <ExtLink href={`https://www.ozon.ru/product/${row.sku}`}>Ozon'da aç</ExtLink>}
              {row.ceneoId && <ExtLink href={`https://www.ceneo.pl/${row.ceneoId}`}>Ceneo'da aç</ExtLink>}
              {row.asin && <ExtLink href={`https://www.amazon.pl/dp/${row.asin}`}>amazon.pl'de aç</ExtLink>}
            </div>
            <Costs row={row} />
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teklif</TableHead>
                <TableHead>Mağaza</TableHead>
                <TableHead className="text-right">Toplam</TableHead>
                <TableHead>
                  <span className="sr-only">İşlem</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((o) => (
                <TableRow key={o.offerId ?? o.title} className={o.skip ? 'text-muted-foreground' : undefined}>
                  <TableCell className="whitespace-normal">
                    <span className="line-clamp-2">{o.title ?? 'Başlık okunmadı'}</span>
                    {o.selected && <Badge className="mt-1">Seçilen</Badge>}
                    {o.skip && (
                      <Badge variant="outline" className="mt-1">
                        {SKIP_LABEL[o.skip]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">{o.shop ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{pln(o.totalPln)}</TableCell>
                  <TableCell className="text-right">
                    {o.skip === 'rejected' ? (
                      <Button size="sm" variant="ghost" onClick={() => act('restore-offer', o.offerId)} disabled={!!busy}>
                        {busy === `restore-offer:${o.offerId}` ? <Loader2 className="animate-spin" /> : <Undo2 />}
                        Geri al
                      </Button>
                    ) : !o.skip ? (
                      <Button size="sm" variant="ghost" onClick={() => act('reject-offer', o.offerId)} disabled={!!busy || !o.offerId}>
                        {busy === `reject-offer:${o.offerId}` ? <Loader2 className="animate-spin" /> : <X />}
                        Yanlış
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {row.rejectedGone.map((r) => (
                <TableRow key={r.offerId} className="text-muted-foreground">
                  <TableCell className="whitespace-normal">
                    <span className="line-clamp-2">{r.title ?? 'Başlık okunmadı'}</span>
                    <Badge variant="outline" className="mt-1">
                      Elendi, sayfada artık yok
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal">{r.shop ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{pln(r.pricePln)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => act('restore-offer', r.offerId)} disabled={!!busy}>
                      {busy === `restore-offer:${r.offerId}` ? <Loader2 className="animate-spin" /> : <Undo2 />}
                      Geri al
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {hidden > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Yalnız seçime girenleri göster' : `Seçime girmeyen ${hidden} teklifi de göster`}
            </Button>
          )}
        </div>

        {row.review && (
          <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
            <Button size="sm" onClick={() => act('offers-ok')} disabled={!!busy}>
              {busy?.startsWith('offers-ok') ? <Loader2 className="animate-spin" /> : <Check />}
              Kontrol bitti
            </Button>
            <Button size="sm" variant="ghost" onClick={() => act('not-in-poland')} disabled={!!busy}>
              {busy?.startsWith('not-in-poland') ? <Loader2 className="animate-spin" /> : <MapPinOff />}
              Ceneo'da yok
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OfferReview({ onChanged }: { onChanged: () => void | Promise<void> }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'decided'>('pending');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/ceneo-kaynak/teklifler');
      const json = await res.json();
      if (!json.success) throw new Error(json.error_message);
      setRows(json.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Liste alınamadı');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changed = useCallback(async () => {
    await load();
    await onChanged();
  }, [load, onChanged]);

  const pending = useMemo(() => (rows ?? []).filter((r) => r.review), [rows]);
  const decided = useMemo(() => (rows ?? []).filter((r) => !r.review), [rows]);
  const visible = filter === 'pending' ? pending : decided;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Teklifin ürüne ait olup olmadığına bak. Yanlışsa "Yanlış" de; maliyet sıradaki tekliften hesaplanır ve Ozon'a kendiliğinden bir şey
        gitmez. Bakman bitince "Kontrol bitti" de.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Liste alınamadı</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as 'pending' | 'decided')}>
        <TabsList>
          <TabsTrigger value="pending">Karar bekleyen ({pending.length})</TabsTrigger>
          <TabsTrigger value="decided">Elenen teklifi olan ({decided.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {!rows && !error && (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      )}

      {rows && visible.length === 0 && (
        <Card className="py-8">
          <CardContent className="text-center text-muted-foreground">Bu grupta ürün yok.</CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {visible.map((row) => (
          <OfferCard key={row.id} row={row} onChanged={changed} />
        ))}
      </div>
    </div>
  );
}
