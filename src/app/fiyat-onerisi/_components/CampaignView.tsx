'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ImageOff, RefreshCw, Send, XCircle } from 'lucide-react';
import type { ApplyResult, CampaignChange, ChangeGroup, ChangeTag } from '@/lib/pricing/campaign';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/shadcn/alert-dialog';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Checkbox } from '@/components/shadcn/checkbox';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs';
import { cn } from '@/lib/utils';

const GROUPS: { key: ChangeGroup; label: string; hint: string; preselect: boolean; selectable: boolean }[] = [
  {
    key: 'send',
    label: 'Gönderilecek',
    hint: 'Acil olanlar üstte: rakipten pahalıyız ya da zarar riski var. Altında fırsatlar: gereğinden ucuz satıyoruz ya da maliyet düştü.',
    preselect: true,
    selectable: true,
  },
  { key: 'add', label: 'Kampanyaya ekle', hint: 'Kampanyada değil ama girebilir. İstediklerini seç.', preselect: false, selectable: true },
  {
    key: 'small',
    label: 'Küçük fark',
    hint: 'Kur oynaması kadar küçük fark; göndermek fiyatı boşuna gidip getirir. İstersen tek tek seçebilirsin.',
    preselect: false,
    selectable: true,
  },
  {
    key: 'check',
    label: 'Elle kontrol',
    hint: 'Öneri abartılı görünüyor ya da Ozon tavanını aşıyor; buradan gönderilmez.',
    preselect: false,
    selectable: false,
  },
];

/** "Gönderilecek" satırlarının nedeni: kırmızı acil, yeşil fırsat */
const TAGS: Record<ChangeTag, { label: string; urgent: boolean }> = {
  'above-rival': { label: 'Rakipten pahalı', urgent: true },
  'below-floor': { label: 'Zarar riski', urgent: true },
  'profit-up': { label: 'Kâr fırsatı', urgent: false },
  cheaper: { label: 'Ucuzlama fırsatı', urgent: false },
};

const usd = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} $`);

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
      {src ? (
        <img src={src} alt={alt} className="size-full object-contain p-0.5" loading="lazy" />
      ) : (
        <ImageOff className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}

/** Vitrinde rakiple fark (₽), tek satır: "13.279 → 62". Yeşil = rakibin altı, kırmızı = üstü; ayrıntı ipucunda. */
function Gap({ now, next }: { now: number | null; next: number | null }) {
  if (next == null) return null;
  const part = (rub: number) => (
    <span className={rub <= 0 ? 'text-emerald-600' : 'text-destructive'}>{Math.abs(rub).toLocaleString('tr-TR')}</span>
  );
  const say = (rub: number) => `rakibin ${Math.abs(rub).toLocaleString('tr-TR')} ₽ ${rub <= 0 ? 'altı' : 'üstü'}`;
  return (
    <div className="text-xs tabular-nums" title={`Vitrinde ${now != null ? `şimdi ${say(now)}, ` : ''}gönderince ${say(next)}`}>
      {now != null && <>{part(now)} → </>}
      {part(next)} ₽
    </div>
  );
}

/** Elastik boosting kampanyasına fiyat gönderimi. Gruplar ve kurallar: src/lib/pricing/campaign.ts */
export function CampaignView() {
  const [plan, setPlan] = useState<{ changes: CampaignChange[]; inCampaign: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<ChangeGroup>('send');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<ApplyResult[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const j = await (await fetch('/api/kampanya-fiyat')).json();
      if (!j.success) throw new Error(j.error_message);
      setPlan(j);
      setSelected(
        new Set(
          j.changes.filter((c: CampaignChange) => GROUPS.find((g) => g.key === c.group)?.preselect).map((c: CampaignChange) => c.productId)
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Plan alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changes = useMemo(() => plan?.changes ?? [], [plan]);
  const rows = changes.filter((c) => c.group === group);
  const picked = changes.filter((c) => selected.has(c.productId));
  const summary = {
    down: picked.filter((c) => c.current != null && c.next < c.current).length,
    up: picked.filter((c) => c.current != null && c.next > c.current).length,
    add: picked.filter((c) => c.current == null).length,
  };
  const groupInfo = GROUPS.find((g) => g.key === group)!;
  const allInGroup = rows.length > 0 && rows.every((c) => selected.has(c.productId));

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleGroup = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of rows)
        if (on) next.add(c.productId);
        else next.delete(c.productId);
      return next;
    });

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const j = await (
        await fetch('/api/kampanya-fiyat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds: [...selected] }),
        })
      ).json();
      if (!j.success) throw new Error(j.error_message);
      setResults(j.results);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setSending(false);
      setConfirm(false);
    }
  };

  if (loading && !plan) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Kampanya</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {results && (
        <Alert>
          {results.every((r) => r.ok) ? <CheckCircle2 /> : <AlertCircle />}
          <AlertTitle>
            Gönderildi: {results.filter((r) => r.ok).length} / {results.length} ürün Ozon'da doğrulandı
          </AlertTitle>
          <AlertDescription>
            {results
              .filter((r) => !r.ok)
              .slice(0, 10)
              .map((r) => (
                <div key={r.productId}>
                  {r.offerId}: {r.error}
                </div>
              ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={group} onValueChange={(v) => setGroup(v as ChangeGroup)}>
          <TabsList className="h-auto flex-wrap">
            {GROUPS.map((g) => (
              <TabsTrigger key={g.key} value={g.key}>
                {g.label} ({changes.filter((c) => c.group === g.key).length})
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} /> Yeniden hesapla
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{groupInfo.hint}</p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                {groupInfo.selectable && (
                  <Checkbox
                    checked={allInGroup}
                    onCheckedChange={(v) => toggleGroup(v === true)}
                    aria-label="Bu gruptakilerin hepsini seç"
                  />
                )}
              </TableHead>
              <TableHead>Ürün</TableHead>
              <TableHead className="text-right">Kampanyada</TableHead>
              <TableHead className="text-right">Gönderilecek</TableHead>
              <TableHead className="text-right">Rakip</TableHead>
              <TableHead className="text-right">Kâr</TableHead>
              <TableHead>Neden</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                  Bu grupta ürün yok.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => {
                const diff = c.current != null ? c.next - c.current : null;
                return (
                  <TableRow key={c.productId}>
                    <TableCell>
                      {groupInfo.selectable && (
                        <Checkbox
                          checked={selected.has(c.productId)}
                          onCheckedChange={(v) => toggle(c.productId, v === true)}
                          aria-label={`${c.offerId} seç`}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Thumb src={c.image} alt={c.offerId} />
                        <div className="min-w-0 max-w-64">
                          <div className="truncate font-mono text-xs font-medium">{c.offerId}</div>
                          <div className="truncate text-xs text-muted-foreground" title={c.name ?? ''}>
                            {c.name}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{usd(c.current)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.group === 'check' ? (
                        // Gönderilemez: fiyat yalnız bilgi olarak, tavan aşılıyorsa tavanla birlikte
                        <>
                          <div className="text-sm text-muted-foreground">gönderilemez</div>
                          <div className="text-xs text-muted-foreground">öneri {usd(c.proposal)}</div>
                          {c.maxAction != null && c.next > c.maxAction && (
                            <div className="text-xs text-destructive">Ozon tavanı {usd(c.maxAction)}</div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="font-medium">{usd(c.next)}</div>
                          {diff != null && diff !== 0 && (
                            <div className={cn('text-xs', diff < 0 ? 'text-emerald-600' : 'text-amber-600')}>
                              {diff > 0 ? '+' : ''}
                              {diff} $ ({((diff / c.current!) * 100).toFixed(1)}%)
                            </div>
                          )}
                          {c.next !== c.proposal && <div className="text-xs text-muted-foreground">öneri {usd(c.proposal)}</div>}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usd(c.rivalUsd)}
                      {c.group !== 'check' && <Gap now={c.rivalGapRubNow} next={c.rivalGapRubNext} />}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usd(c.group === 'check' || c.profitAtNext == null ? null : Math.round(c.profitAtNext * 100) / 100)}
                      {c.floorPrice != null && <div className="text-xs text-muted-foreground">taban {usd(c.floorPrice)}</div>}
                    </TableCell>
                    <TableCell className="max-w-64 text-sm">
                      {c.tag && (
                        <Badge
                          variant="outline"
                          className={cn('mb-1 gap-1.5', TAGS[c.tag].urgent ? 'text-destructive' : 'text-emerald-600')}
                        >
                          <span className={cn('size-1.5 rounded-full', TAGS[c.tag].urgent ? 'bg-destructive' : 'bg-emerald-500')} />
                          {TAGS[c.tag].label}
                        </Badge>
                      )}
                      <div className="text-xs text-muted-foreground">{c.reason}</div>
                      {c.atCeiling && (
                        <Badge
                          variant="outline"
                          className="ml-1 text-amber-600"
                          title="Öneri Ozon'un kampanya tavanını aşıyordu; kâr kaldığı için tavana çekildi"
                        >
                          Ozon tavanı
                        </Badge>
                      )}
                      {c.lowBoost && c.group !== 'check' && (
                        <Badge
                          variant="outline"
                          className="ml-1 text-amber-600"
                          title={`Boost sınırı ${usd(c.maxElastic)}; fiyat üstünde kaldığı için boost %55'ten düşük olur`}
                        >
                          düşük boost
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Gönderim çubuğu */}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3">
        <div className="text-sm">
          <span className="font-medium">{selected.size} ürün seçili</span>
          <span className="text-muted-foreground">
            {' '}
            · {summary.down} düşüyor · {summary.up} artıyor · {summary.add} kampanyaya ekleniyor · {plan?.inCampaign ?? 0} ürün kampanyada
          </span>
        </div>
        <Button onClick={() => setConfirm(true)} disabled={!selected.size || sending}>
          <Send /> Kampanyaya gönder
        </Button>
      </div>

      <AlertDialog open={confirm} onOpenChange={(o) => !sending && setConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selected.size} ürünün kampanya fiyatı Ozon'a gönderilsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              {summary.down} ürün düşüyor, {summary.up} ürün artıyor, {summary.add} ürün kampanyaya ekleniyor. Fiyatlar gönderim anında
              yeniden hesaplanır; Ozon'un kabul ettiği fiyat ürün ürün doğrulanır. Ana fiyat değişmez, yalnız Elastik boosting kampanya
              fiyatı.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                send();
              }}
              disabled={sending}
            >
              {sending ? <RefreshCw className="animate-spin" /> : <Send />} Gönder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {results && results.some((r) => !r.ok) && (
        <div className="flex items-center gap-1 text-sm text-destructive">
          <XCircle className="size-4" /> {results.filter((r) => !r.ok).length} ürün gönderilemedi; ayrıntı yukarıda.
        </div>
      )}
    </div>
  );
}
