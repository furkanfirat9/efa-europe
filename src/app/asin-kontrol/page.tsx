'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Check, ExternalLink, Loader2, PackageX, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs';

/**
 * ASIN onay ekranı: otomatik kontrolün "kesin" diyemediği Ozon ürünlerine son kararı kullanıcı verir.
 * Solda Ozon kartı, sağda bağlı Amazon ürünü; karar ProductSource tablosuna yazılır, Ozon'a dokunulmaz.
 */

interface Checks {
  brand?: boolean;
  modelExact?: boolean;
  modelPrefix?: boolean;
  modelInTitle?: boolean;
  accessory?: boolean;
  imageDist?: number | null;
  ozonQty?: number | null;
  amzQty?: number | null;
  packMismatch?: boolean;
  error?: string;
}

interface Row {
  id: string;
  offerId: string;
  sku: string | null;
  ozonName: string | null;
  ozonBrand: string | null;
  ozonPartNumber: string | null;
  ozonImage: string | null;
  asin: string | null;
  asinStatus: string;
  checks: Checks | null;
  amzTitle: string | null;
  amzModel: string | null;
  amzImage: string | null;
  priceNetEur: number | null;
  priceGrossEur: number | null;
  inStock: boolean | null;
  soldBy: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  MODEL_MISMATCH: 'Model farklı',
  SUSPECT: 'Şüpheli',
  LIKELY: 'Muhtemel',
  MISSING: 'ASIN yok',
  UNREADABLE: 'Okunamadı',
};
const FILTERS = ['ALL', 'MODEL_MISMATCH', 'SUSPECT', 'LIKELY', 'MISSING'] as const;
type Filter = (typeof FILTERS)[number];

/** Otomatik kontrolün ürünü neden kesin saymadığını okunur cümlelere çevirir. */
function reasons(row: Row): string[] {
  const c = row.checks ?? {};
  if (row.asinStatus === 'MISSING') return ['Amazon aramasında bu kodla ürün bulunamadı'];
  if (row.asinStatus === 'UNREADABLE') return ['Amazon sayfası okunamadı'];
  const out: string[] = [];
  if (c.brand === false) out.push('Marka farklı');
  if (row.asinStatus === 'MODEL_MISMATCH') out.push(`Model numarası farklı: Ozon ${row.offerId} ↔ Amazon ${row.amzModel ?? '—'}`);
  if (row.asinStatus === 'LIKELY')
    out.push(c.modelPrefix ? `Yalnızca ek farkı: ${row.offerId} ↔ ${row.amzModel}` : 'Kod Amazon başlığında geçiyor ama teknik tabloda yok');
  if (row.asinStatus === 'SUSPECT' && c.modelExact === false && !row.amzModel) out.push('Amazon sayfasında model numarası yok');
  if (c.packMismatch) out.push(`Paket adedi farklı: Ozon ${c.ozonQty ?? 1}, Amazon ${c.amzQty}`);
  if ((c.imageDist ?? 0) > 12) out.push('Ana görseller farklı — Ozon kartı başka ürünün fotoğrafını gösteriyor olabilir');
  return out.length ? out : ['Otomatik kontrol kesin karar veremedi'];
}

const euro = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return <div className="flex size-28 shrink-0 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">Görsel yok</div>;
  return <img src={src} alt={alt} loading="lazy" className="size-28 shrink-0 rounded-md border bg-white object-contain p-1" />;
}

function ReviewCard({ row, onDone }: { row: Row; onDone: (id: string) => void }) {
  const [asinInput, setAsinInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (action: 'approve' | 'set-asin' | 'not-on-amazon') => {
    setBusy(action);
    try {
      const res = await fetch(`/api/asin-kaynak/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, asin: asinInput }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error_message);
      toast.success(
        action === 'approve' ? `${row.offerId} onaylandı` : action === 'set-asin' ? `${row.offerId} → ${asinInput.toUpperCase()} kaydedildi` : `${row.offerId} "Amazon'da yok" olarak işaretlendi`
      );
      onDone(row.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kaydedilemedi');
      setBusy(null);
    }
  };

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{STATUS_LABEL[row.asinStatus] ?? row.asinStatus}</Badge>
          <CardTitle className="font-mono text-sm">{row.offerId}</CardTitle>
        </div>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {reasons(row).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </CardHeader>

      <CardContent className="grid gap-4 px-4 md:grid-cols-2">
        <div className="flex gap-3">
          <ProductImage src={row.ozonImage} alt={`Ozon: ${row.offerId}`} />
          <div className="min-w-0 space-y-1 text-sm">
            <p className="text-xs font-medium uppercase text-muted-foreground">Ozon</p>
            <p className="line-clamp-3">{row.ozonName}</p>
            <p className="text-xs text-muted-foreground">
              {row.ozonBrand} {row.ozonPartNumber && row.ozonPartNumber !== row.offerId ? `· ${row.ozonPartNumber}` : ''}
            </p>
            {row.sku && (
              <a href={`https://www.ozon.ru/product/${row.sku}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline">
                Ozon'da aç <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <ProductImage src={row.amzImage} alt={`Amazon: ${row.asin ?? ''}`} />
          <div className="min-w-0 space-y-1 text-sm">
            <p className="text-xs font-medium uppercase text-muted-foreground">Amazon {row.asin && <span className="font-mono normal-case">· {row.asin}</span>}</p>
            {row.asin ? (
              <>
                <p className="line-clamp-3">{row.amzTitle ?? 'Sayfa henüz okunmadı'}</p>
                <p className="text-xs text-muted-foreground">
                  Model: {row.amzModel ?? '—'} · {euro(row.priceNetEur)} KDV hariç · {row.inStock ? 'stokta' : 'stok yok / az'}
                  {row.soldBy && row.soldBy !== 'Amazon' ? ` · satıcı: ${row.soldBy}` : ''}
                </p>
                <a href={`https://www.amazon.de/dp/${row.asin}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline">
                  Amazon'da aç <ExternalLink className="size-3" />
                </a>
              </>
            ) : (
              <p className="text-muted-foreground">Bağlı ASIN yok</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          {row.asin && (
            <Button size="sm" onClick={() => act('approve')} disabled={!!busy}>
              {busy === 'approve' ? <Loader2 className="animate-spin" /> : <Check />}
              Eşleşme doğru
            </Button>
          )}
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              act('set-asin');
            }}
          >
            <Input
              value={asinInput}
              onChange={(e) => setAsinInput(e.target.value)}
              placeholder="Doğru ASIN (B0…)"
              aria-label="Doğru ASIN"
              className="h-8 w-40 font-mono"
              maxLength={10}
            />
            <Button size="sm" variant="outline" type="submit" disabled={!!busy || asinInput.trim().length !== 10}>
              {busy === 'set-asin' && <Loader2 className="animate-spin" />}
              ASIN kaydet
            </Button>
          </form>
          <Button size="sm" variant="ghost" onClick={() => act('not-on-amazon')} disabled={!!busy}>
            {busy === 'not-on-amazon' ? <Loader2 className="animate-spin" /> : <PackageX />}
            Amazon'da yok
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AsinKontrolPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/asin-kaynak');
      const json = await res.json();
      if (!json.success) throw new Error(json.error_message);
      setRows(json.rows);
      setCounts(json.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Liste alınamadı');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const done = (id: string) => {
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? null);
    load();
  };

  const visible = useMemo(() => (rows ?? []).filter((r) => filter === 'ALL' || r.asinStatus === filter), [rows, filter]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const decided = (counts.VERIFIED ?? 0) + (counts.MANUAL ?? 0) + (counts.NOT_ON_AMAZON ?? 0);

  return (
    <div className="flex-1 space-y-4 bg-background p-4 pt-6 text-foreground md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ASIN kontrol</h1>
          <p className="text-muted-foreground">Ozon ürünlerinin Amazon ASIN'leri. Otomatik kontrolün kesin diyemediği ürünlere karar ver.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw /> Yenile
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Kesin (otomatik)', value: counts.VERIFIED ?? 0 },
          { label: 'Senin onayladıkların', value: counts.MANUAL ?? 0 },
          { label: "Amazon'da yok", value: counts.NOT_ON_AMAZON ?? 0 },
          { label: 'Karar bekleyen', value: total - decided },
        ].map((k) => (
          <Card key={k.label} className="gap-1 py-4">
            <CardHeader className="px-4">
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{rows ? k.value : '—'}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Liste alınamadı</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="flex-wrap">
          {FILTERS.map((f) => (
            <TabsTrigger key={f} value={f}>
              {f === 'ALL' ? 'Tümü' : STATUS_LABEL[f]} ({f === 'ALL' ? rows?.length ?? 0 : counts[f] ?? 0})
            </TabsTrigger>
          ))}
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
          <CardContent className="text-center text-muted-foreground">Bu grupta karar bekleyen ürün yok.</CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {visible.map((row) => (
          <ReviewCard key={row.id} row={row} onDone={done} />
        ))}
      </div>
    </div>
  );
}
