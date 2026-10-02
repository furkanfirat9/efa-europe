'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Check, ExternalLink, Loader2, MapPinOff, RefreshCw, Search, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs';

/**
 * Ceneo onay ekranı: otomatik eşleşmenin "kesin" diyemediği Ozon ürünlerine son kararı kullanıcı verir.
 * Solda Ozon kartı (ve Amazon kaynağının kodu), sağda Ceneo adayları; karar ProductSource tablosuna yazılır.
 * Görünüm /asin-kontrol ile aynıdır.
 */

interface Candidate {
  id: string;
  name?: string | null;
  // excel: eski Python taramasının raporundan | variant: aynı ana model, farklı "/" eki | exact
  rel?: string | null;
  note?: string | null;
  code?: string | null;
  minPln?: number | null;
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
  amzModel: string | null;
  amzBrand: string | null;
  ceneoStatus: string | null;
  ceneoCandidates: Candidate[] | null;
}

// Boş durum = hiç eşleşmemiş; tarama "bulunamadı" (NOT_FOUND) ile aynı grupta gösterilir
const groupOf = (row: Row) => (row.ceneoStatus === 'VARIANT' || row.ceneoStatus === 'ERROR' ? row.ceneoStatus : 'NONE');

const STATUS_LABEL: Record<string, string> = {
  VARIANT: 'Aday',
  NONE: 'Bulunamadı',
  ERROR: 'Okunamadı',
};
const FILTERS = ['ALL', 'VARIANT', 'NONE', 'ERROR'] as const;
type Filter = (typeof FILTERS)[number];

/** Eşleşmenin neden kesin sayılmadığını okunur cümlelere çevirir. */
function reasons(row: Row): string[] {
  const group = groupOf(row);
  if (group === 'ERROR') return ['Ceneo sayfası okunamadı'];
  if (group === 'NONE') return ['Ceneo\'da bu kodlarla ürün bulunamadı'];
  const out = (row.ceneoCandidates ?? []).map((c) =>
    c.rel === 'excel'
      ? `Eski Ceneo taramasında "${c.note ?? 'kontrol et'}" işaretli`
      : c.rel === 'variant'
        ? `Aynı ana model, farklı ek: ${c.code ?? '—'}`
        : 'Kod birebir tutmadı'
  );
  return out.length ? [...new Set(out)] : ['Otomatik eşleşme kesin karar veremedi'];
}

// Ceneo görsel sunucusu ürün numarasından görsel verir; dosya adı önemsiz (224 px)
const ceneoImage = (id: string) => `https://image.ceneostatic.pl/data/products/${id}/f-ceneo.jpg`;

/** Ceneo'da elle aramak için: marka + en güvenilir kod (Amazon modeli, Ozon parça no., offer_id) */
function searchUrl(row: Row) {
  const brand = (row.ozonBrand || row.amzBrand || '').split(/\s+/)[0];
  const code = row.amzModel || row.ozonPartNumber || row.offerId;
  return `https://www.ceneo.pl/;szukaj-${encodeURIComponent(`${brand} ${code}`.trim())}`;
}

function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return <div className="flex size-28 shrink-0 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">Görsel yok</div>;
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className="size-28 shrink-0 rounded-md border bg-white object-contain p-1" />;
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline">
      {children} <ExternalLink className="size-3" />
    </a>
  );
}

function ReviewCard({ row, onDone }: { row: Row; onDone: (id: string) => void }) {
  const [idInput, setIdInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const candidates = row.ceneoCandidates ?? [];

  const act = async (action: 'approve' | 'set-id' | 'reject' | 'not-in-poland', ceneoId?: string) => {
    setBusy(`${action}:${ceneoId ?? ''}`);
    try {
      const res = await fetch(`/api/ceneo-kaynak/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ceneoId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error_message);
      toast.success(
        action === 'approve'
          ? `${row.offerId} onaylandı`
          : action === 'set-id'
            ? `${row.offerId} → Ceneo ${json.row.ceneoProductId} kaydedildi`
            : action === 'reject'
              ? `${row.offerId}: aday kaldırıldı`
              : `${row.offerId} "Ceneo'da yok" olarak işaretlendi`
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
          <Badge variant="outline">{STATUS_LABEL[groupOf(row)]}</Badge>
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
            <p className="text-xs text-muted-foreground">
              Amazon kaynağı: <span className="font-mono">{row.amzModel ?? '—'}</span>
              {row.asin && <span className="font-mono"> · {row.asin}</span>}
            </p>
            <div className="flex flex-wrap gap-x-3">
              {row.sku && <ExtLink href={`https://www.ozon.ru/product/${row.sku}`}>Ozon'da aç</ExtLink>}
              {row.asin && <ExtLink href={`https://www.amazon.pl/dp/${row.asin}`}>amazon.pl'de aç</ExtLink>}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {candidates.length ? (
            candidates.map((c) => (
              <div key={c.id} className="flex gap-3">
                <ProductImage src={ceneoImage(c.id)} alt={`Ceneo: ${c.id}`} />
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Ceneo <span className="font-mono normal-case">· {c.id}</span>
                  </p>
                  <p className="line-clamp-3">{c.name ?? 'Ad okunmadı'}</p>
                  {c.minPln != null && <p className="text-xs text-muted-foreground">En düşük {c.minPln.toLocaleString('pl-PL')} zł</p>}
                  <ExtLink href={`https://www.ceneo.pl/${c.id}`}>Ceneo'da aç</ExtLink>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" onClick={() => act('approve', c.id)} disabled={!!busy}>
                      {busy === `approve:${c.id}` ? <Loader2 className="animate-spin" /> : <Check />}
                      Eşleşme doğru
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act('reject', c.id)} disabled={!!busy}>
                      {busy === `reject:${c.id}` ? <Loader2 className="animate-spin" /> : <X />}
                      Yanlış
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="flex gap-3">
              <ProductImage src={null} alt="Ceneo" />
              <div className="min-w-0 space-y-1 text-sm">
                <p className="text-xs font-medium uppercase text-muted-foreground">Ceneo</p>
                <p className="text-muted-foreground">Bağlı Ceneo ürünü yok</p>
                <ExtLink href={searchUrl(row)}>
                  <Search className="size-3" /> Ceneo'da ara
                </ExtLink>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              act('set-id', idInput);
            }}
          >
            <Input
              value={idInput}
              onChange={(e) => setIdInput(e.target.value)}
              placeholder="Ceneo no. ya da linki"
              aria-label="Doğru Ceneo ürün numarası ya da linki"
              className="h-8 w-56 font-mono"
            />
            <Button size="sm" variant="outline" type="submit" disabled={!!busy || !/ceneo\.pl\/\d+|^\s*\d{4,12}\s*$/.test(idInput)}>
              {busy?.startsWith('set-id') && <Loader2 className="animate-spin" />}
              Ceneo ürününü kaydet
            </Button>
          </form>
          <Button size="sm" variant="ghost" onClick={() => act('not-in-poland')} disabled={!!busy}>
            {busy?.startsWith('not-in-poland') ? <Loader2 className="animate-spin" /> : <MapPinOff />}
            Ceneo'da yok
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CeneoKontrolPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/ceneo-kaynak');
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

  const visible = useMemo(() => (rows ?? []).filter((r) => filter === 'ALL' || groupOf(r) === filter), [rows, filter]);
  const groupCount = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of rows ?? []) out[groupOf(r)] = (out[groupOf(r)] ?? 0) + 1;
    return out;
  }, [rows]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const decided = (counts.EXACT ?? 0) + (counts.MANUAL ?? 0) + (counts.NOT_IN_POLAND ?? 0);

  return (
    <div className="flex-1 space-y-4 bg-background p-4 pt-6 text-foreground md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ceneo kontrol</h1>
          <p className="text-muted-foreground">Ozon ürünlerinin Ceneo karşılıkları. Otomatik eşleşmenin kesin diyemediği ürünlere karar ver.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw /> Yenile
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Kesin (otomatik)', value: counts.EXACT ?? 0 },
          { label: 'Senin onayladıkların', value: counts.MANUAL ?? 0 },
          { label: "Ceneo'da yok", value: counts.NOT_IN_POLAND ?? 0 },
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
              {f === 'ALL' ? 'Tümü' : STATUS_LABEL[f]} ({f === 'ALL' ? rows?.length ?? 0 : groupCount[f] ?? 0})
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
