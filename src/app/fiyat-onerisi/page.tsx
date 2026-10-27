'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs';
import { cn } from '@/lib/utils';
import type { Proposal } from '@/lib/pricing/proposals';
import { CampaignView } from './_components/CampaignView';
import { ScanStatus } from './_components/ScanStatus';

/**
 * Fiyat önerisi: otomatik fiyatlandırmanın ilk çalıştırması. Hiçbir şey yazmaz;
 * her ürün için mevcut ve önerilen fiyatı, rakibi, kârı, stok kararını ve tedarik kanallarını gösterir.
 * Kurallar src/lib/pricing/rules.ts içindedir. Görünüm /asin-kontrol ile aynı: ürün başına bir kart,
 * solda Ozon ürünü ve fiyat, sağda tedarik kanalları.
 */

const RULE_LABEL: Record<string, string> = {
  rival: 'Rakibin 11 ₽ altı',
  'rival-cap': 'Rakip pahalı, %20 marjda durdu',
  'no-beat': 'Rakip çok ucuz, %15 marj',
  'no-rival': 'Rakip yok, %20 marj',
  'fake-rival': 'Rakip alışımızın altında (sahte sayıldı), %20 marj',
  check: 'Kontrol et (fiyat olağandışı yüksek)',
};

const SOURCE_LABEL: Record<string, string> = { 'amazon-de': 'Amazon.de', 'amazon-pl': 'amazon.pl', ceneo: 'Ceneo' };

// Fiyat hesabındaki kargo ağırlığının kaynağı (src/lib/pricing/rules.ts shippingWeight, öncelik sırasıyla)
const WEIGHT_LABEL: Record<string, string> = {
  'ozon-real': "Ozon'un kestiği kargodan",
  researched: 'Araştırılmış kutu ağırlığı',
  'amazon-package': 'Amazon kutulu ağırlığı',
  'icecat-package': 'Icecat kutulu ağırlığı',
  'amazon-item': 'Amazon ürün ağırlığı + paket payı',
  'ozon-card': 'Ozon kartı',
  'small-item': 'Küçük ürün + paket payı',
  none: 'Bilinmiyor',
};

const kg = (g: number) => `${(g / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg`;

const PAGE_SIZE = 50;

const usd = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : `${n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} $`;
const pct = (n: number | null | undefined) => (n == null ? '—' : `%${Math.round(n * 100)}`);
const eur = (n: number) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function channelUrl(p: Proposal, source: string) {
  if (source === 'amazon-de' && p.asin) return `https://www.amazon.de/dp/${p.asin}`;
  if (source === 'amazon-pl' && p.asin) return `https://www.amazon.pl/dp/${p.asin}`;
  if (source === 'ceneo' && p.ceneoId) return `https://www.ceneo.pl/${p.ceneoId}`;
  return null;
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline">
      {children} <ExternalLink className="size-3" />
    </a>
  );
}

function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src)
    return (
      <div className="flex size-28 shrink-0 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
        Görsel yok
      </div>
    );
  return <img src={src} alt={alt} loading="lazy" className="size-28 shrink-0 rounded-md border bg-white object-contain p-1" />;
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('tabular-nums', strong && 'font-semibold')}>{value}</p>
      {sub && <p className="text-xs tabular-nums text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ProposalCard({ p }: { p: Proposal }) {
  const change = p.newPrice != null ? p.newPrice - p.customerPrice : 0;
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="font-mono text-sm">{p.offerId}</CardTitle>
          {p.rule && <Badge variant={p.rule === 'check' ? 'destructive' : 'outline'}>{RULE_LABEL[p.rule]}</Badge>}
          {p.skipReason && <Badge variant="outline">Hesaplanamadı: {p.skipReason}</Badge>}
          {p.stockAction === 'close' && <Badge variant="destructive">Stok {p.stock} → 0</Badge>}
          {p.stockAction === 'open' && <Badge>Stok 0 → 1</Badge>}
          {p.weightCheck && <Badge variant="outline">Ağırlığı kontrol et</Badge>}
          {p.exportCapped && <Badge variant="outline">750 € ihracat sınırına çekildi</Badge>}
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 px-4 md:grid-cols-2">
        <div className="flex gap-3">
          <ProductImage src={p.image} alt={`Ozon: ${p.offerId}`} />
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">Ozon</p>
              <p className="line-clamp-2">{p.name ?? '—'}</p>
              <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {p.brand && <span>{p.brand}</span>}
                {p.sku && <ExtLink href={`https://www.ozon.ru/product/${p.sku}`}>Ozon'da aç</ExtLink>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              <Stat label="Şu an" value={usd(p.customerPrice)} sub={`marj ${pct(p.currentMargin)}`} />
              <Stat
                label="Önerilen"
                value={p.newPrice != null ? usd(p.newPrice) : '—'}
                sub={change !== 0 ? `${change > 0 ? '+' : ''}${usd(change)}` : undefined}
                strong
              />
              <Stat label="Rakip" value={usd(p.rivalUsd, 2)} />
              <Stat label="Kâr" value={usd(p.newProfit, 2)} sub={`marj ${pct(p.newMargin)}`} />
              <Stat
                label="Kargo ağırlığı"
                value={p.weightG ? kg(p.weightG) : '—'}
                sub={`${WEIGHT_LABEL[p.weightSource] ?? p.weightSource}${p.weightPadded ? ' · %15 kutu payıyla' : ''}`}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">Tedarik</p>
          {p.channels.length ? (
            p.channels.map((ch) => {
              const chosen = ch.source === p.source;
              const url = channelUrl(p, ch.source);
              return (
                <div
                  key={ch.source}
                  className={cn('flex items-center justify-between gap-3 rounded-md border px-3 py-2', chosen && 'border-primary')}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{SOURCE_LABEL[ch.source]}</span>
                      {ch.shop && <span className="text-xs text-muted-foreground">{ch.shop}</span>}
                      {chosen && <Badge>{p.buyable ? 'Seçildi' : 'Alınamıyor'}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ch.buyable ? 'Alınabilir' : 'Şu an alınamıyor'} · kargo {ch.shippingEur ? eur(ch.shippingEur) : 'ücretsiz'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn('tabular-nums', chosen && 'font-semibold', !ch.buyable && 'text-muted-foreground line-through')}>
                      {eur(ch.eur)}
                    </p>
                    {url && <ExtLink href={url}>Aç</ExtLink>}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="rounded-md border px-3 py-2 text-muted-foreground">Hiçbir kanalda fiyat yok</p>
          )}
          {p.landedUsd != null && (
            <p className="text-xs text-muted-foreground">
              Depoya gelmiş {usd(p.landedUsd)} + Ozon kargo/depo {usd((p.ozonShippingUsd ?? 0) + (p.depotUsd ?? 0))}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FiyatOnerisiPage() {
  const [data, setData] = useState<{ proposals: Proposal[]; eurUsd: number; eurUsdDate: string; eurPln: number; vatMode: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [view, setView] = useState<'proposals' | 'campaign'>('proposals');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fiyat-onerisi');
      const json = await res.json();
      if (!json.success) throw new Error(json.error_message);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Öneriler alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Siparişler sayfasındaki ürün okundan gelinir (?sekme=tedarik&q=<offer_id>): sekme açılır, arama
  // kutusu o kodla dolar. Adres temizlenir ki arama değiştikten sonra yenileme eski kodu geri getirmesin.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sekme = params.get('sekme');
    const q = params.get('q')?.trim();
    if (!sekme && !q) return;
    if (sekme) setView(sekme === 'kampanya' ? 'campaign' : 'proposals');
    if (q) setQuery(q);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  // Arama değişince liste baştan gösterilir
  useEffect(() => setShown(PAGE_SIZE), [query]);

  const all = useMemo(() => data?.proposals ?? [], [data]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (p) => !q || p.offerId.toLowerCase().includes(q) || (p.name ?? '').toLowerCase().includes(q) || (p.asin ?? '').toLowerCase().includes(q)
    );
  }, [all, query]);

  return (
    <div className="flex-1 space-y-4 bg-background p-4 pt-6 text-foreground md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Fiyat önerisi</h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} /> Yeniden hesapla
        </Button>
      </div>

      <ScanStatus />

      <Tabs value={view} onValueChange={(v) => setView(v as 'proposals' | 'campaign')}>
        <TabsList>
          <TabsTrigger value="proposals">Tedarik</TabsTrigger>
          <TabsTrigger value="campaign">Kampanyaya gönder</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === 'campaign' ? (
        <CampaignView />
      ) : (
        <>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Öneriler hesaplanamadı</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kod, ad ya da ASIN ara"
            className="h-9 w-56"
            aria-label="Ürün ara"
          />

          {!data && !error && (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          )}

          {data && visible.length === 0 && (
            <Card className="py-8">
              <CardContent className="text-center text-muted-foreground">Ürün bulunamadı.</CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {visible.slice(0, shown).map((p) => (
              <ProposalCard key={p.productId} p={p} />
            ))}
          </div>

          {visible.length > shown && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                Daha fazla göster ({visible.length - shown} ürün kaldı)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
