'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, ImageOff, RefreshCw, Undo2 } from 'lucide-react';
import type { ApplyResult, CampaignChange, CheckKind } from '@/lib/pricing/campaign';
import type { SupplySource } from '@/lib/pricing/proposals';
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
import { Input } from '@/components/shadcn/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { cn } from '@/lib/utils';

/** Bölümler (kullanıcıyla 2026-10-10). Sınıflandırma: checkKindOf, src/lib/pricing/campaign.ts */
const SECTIONS: { kind: CheckKind; title: string; hint: string; dot: string; collapsed?: boolean }[] = [
  {
    kind: 'loss',
    title: 'Zararına satıyor',
    hint: 'Şu anki kampanya fiyatında zarar ediyoruz ve Ozon fiyatı kâr edecek seviyeye çıkarmaya izin vermiyor. Kampanyadan çıkarmak zararı durdurur; satış da büyük ihtimalle durur.',
    dot: 'bg-destructive',
  },
  {
    kind: 'thin',
    title: 'Ozon fiyatı yükseltmeye izin vermiyor',
    hint: "Ozon'un bu ürün için izin verdiği en yüksek kampanya fiyatı, asgari kâr fiyatımızın altında. Kâr az; kampanyada bırakmak ya da çıkarmak senin kararın.",
    dot: 'bg-amber-500',
  },
  {
    kind: 'opportunity',
    title: 'Rakipten çok ucuzuz',
    hint: "Ozon'daki en ucuz rakip bizden kat kat pahalı; rakip verisi yanlış ürünü gösteriyor olabilir. Hazır fiyatlardan birini seçebilir ya da elle fiyat girebilirsin; fiyat asgari kâr ile Ozon tavanı arasında olmalı.",
    dot: 'bg-sky-500',
  },
  {
    kind: 'blocked',
    title: 'Kampanyaya giremiyor',
    hint: "Kampanyada değil; Ozon'un izin verdiği en yüksek fiyat asgari kâr fiyatımızın altında. Yalnız bilgi.",
    dot: 'bg-muted-foreground',
    collapsed: true,
  },
];

const SOURCE: Record<SupplySource, string> = { 'amazon-de': 'Amazon.de', 'amazon-pl': 'amazon.pl', ceneo: 'Ceneo' };

const usd = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} $`);
const day = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

type Pending =
  { type: 'remove'; c: CampaignChange } | { type: 'price'; c: CampaignChange; price: number; label: string; profit: number | null };

function Product({ c }: { c: CampaignChange }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
        {c.image ? (
          <img src={c.image} alt={c.offerId} className="size-full object-contain p-0.5" loading="lazy" />
        ) : (
          <ImageOff className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 max-w-56">
        <div className="truncate font-mono text-xs font-medium">{c.offerId}</div>
        <div className="truncate text-xs text-muted-foreground" title={c.name ?? ''}>
          {c.name}
        </div>
      </div>
    </div>
  );
}

function Profit({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('font-medium', value < 0 ? 'text-destructive' : value < 5 ? 'text-amber-600' : 'text-emerald-600')}>
      {usd(value)}
    </span>
  );
}

/** "Elle kontrol" sekmesi: otomatik gönderilmeyen ürünler dört bölümde, her satırda yapılabilecek işlemle */
export function ManualCheckView({ rows, onChanged }: { rows: CampaignChange[]; onChanged: () => Promise<void> }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<ApplyResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [manual, setManual] = useState<Record<string, string>>({});

  const post = async (key: string, body: object) => {
    setBusy(key);
    setError(null);
    try {
      const j = await (
        await fetch('/api/kampanya-fiyat/elle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).json();
      if (!j.success) throw new Error(j.error_message);
      if (j.results) setResults(j.results);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem yapılamadı');
    } finally {
      setBusy(null);
      setPending(null);
    }
  };

  const run = () => {
    if (!pending) return;
    if (pending.type === 'remove') post(pending.c.productId, { action: 'remove', productIds: [pending.c.productId] });
    else post(pending.c.productId, { action: 'price', productId: pending.c.productId, price: pending.price });
  };

  const KeepCell = ({ c }: { c: CampaignChange }) =>
    c.keptAt ? (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        Olduğu gibi kalsın · {day(c.keptAt)}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          disabled={!!busy}
          onClick={() => post(c.productId, { action: 'unkeep', productId: c.productId })}
        >
          <Undo2 /> Geri al
        </Button>
      </div>
    ) : (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        disabled={!!busy}
        onClick={() => post(c.productId, { action: 'keep', productId: c.productId })}
      >
        Olduğu gibi kalsın
      </Button>
    );

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Elle kontrol</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {results && (
        <Alert>
          {results.every((r) => r.ok) ? <CheckCircle2 /> : <AlertCircle />}
          <AlertTitle>
            {results.filter((r) => r.ok).length} / {results.length} ürün Ozon'da doğrulandı
          </AlertTitle>
          <AlertDescription>
            {results.map((r) => (
              <div key={r.productId}>
                {r.offerId}: {r.ok ? (r.to ? `kampanya fiyatı ${usd(r.to)}` : 'kampanyadan çıktı') : r.error}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {SECTIONS.map((s) => {
        const list = rows.filter((c) => c.checkKind === s.kind);
        const isOpen = open[s.kind] ?? !s.collapsed;
        const kept = list.filter((c) => c.keptAt).length;
        return (
          <section key={s.kind} className="space-y-2">
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left"
              onClick={() => setOpen((o) => ({ ...o, [s.kind]: !isOpen }))}
              aria-expanded={isOpen}
            >
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              <span className={cn('size-2 rounded-full', s.dot)} />
              <h3 className="font-medium">{s.title}</h3>
              <Badge variant="secondary">{list.length}</Badge>
              {kept > 0 && <span className="text-xs text-muted-foreground">{kept} karar verildi</span>}
            </button>
            {isOpen && (
              <>
                <p className="text-sm text-muted-foreground">{s.hint}</p>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ürün</TableHead>
                        <TableHead className="text-right">{s.kind === 'blocked' ? 'Öneri' : 'Kampanyada'}</TableHead>
                        {s.kind !== 'blocked' && <TableHead className="text-right">Kâr (şimdi)</TableHead>}
                        {s.kind === 'opportunity' && <TableHead className="text-right">En ucuz rakip</TableHead>}
                        <TableHead className="text-right">Ozon tavanı</TableHead>
                        <TableHead className="text-right">Asgari kâr fiyatı</TableHead>
                        <TableHead className="text-right">Alış</TableHead>
                        <TableHead className="text-right">Satış (60 g)</TableHead>
                        {s.kind !== 'blocked' && <TableHead>İşlem</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="h-14 text-center text-muted-foreground">
                            Bu bölümde ürün yok.
                          </TableCell>
                        </TableRow>
                      ) : (
                        list.map((c) => (
                          <TableRow key={c.productId} className={cn(c.keptAt && 'opacity-60')}>
                            <TableCell>
                              <Product c={c} />
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{usd(s.kind === 'blocked' ? c.proposal : c.current)}</TableCell>
                            {s.kind !== 'blocked' && (
                              <TableCell className="text-right tabular-nums">
                                <Profit value={c.profitNow} />
                              </TableCell>
                            )}
                            {s.kind === 'opportunity' && (
                              <TableCell className="text-right tabular-nums">
                                {usd(c.rivalUsd)}
                                {c.rivalUsd != null && c.current && (
                                  <div className="text-xs text-muted-foreground">{(c.rivalUsd / c.current).toFixed(1)} kat</div>
                                )}
                              </TableCell>
                            )}
                            <TableCell className="text-right tabular-nums">{usd(c.maxAction)}</TableCell>
                            <TableCell className="text-right tabular-nums">{usd(c.floorPrice)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {c.purchaseEur != null ? `${c.purchaseEur.toFixed(0)} €` : '—'}
                              {c.source && <div className="text-xs text-muted-foreground">{SOURCE[c.source]}</div>}
                            </TableCell>
                            <TableCell className={cn('text-right tabular-nums', !c.sold && 'text-muted-foreground')}>{c.sold}</TableCell>
                            {s.kind !== 'blocked' && (
                              <TableCell>
                                {s.kind === 'opportunity' ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {c.options.map((o) => (
                                      <Button
                                        key={o.key}
                                        variant="outline"
                                        size="sm"
                                        className="h-auto flex-col items-start gap-0 py-1"
                                        disabled={!!busy}
                                        onClick={() => setPending({ type: 'price', c, price: o.price, label: o.label, profit: o.profit })}
                                      >
                                        <span className="text-xs text-muted-foreground">{o.label}</span>
                                        <span className="tabular-nums">
                                          {usd(o.price)} · kâr {usd(o.profit)}
                                        </span>
                                      </Button>
                                    ))}
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        inputMode="numeric"
                                        className="h-8 w-20"
                                        placeholder="$"
                                        aria-label={`${c.offerId} elle fiyat`}
                                        value={manual[c.productId] ?? ''}
                                        onChange={(e) => setManual((m) => ({ ...m, [c.productId]: e.target.value }))}
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!!busy || !Number(manual[c.productId])}
                                        onClick={() =>
                                          setPending({
                                            type: 'price',
                                            c,
                                            price: Math.round(Number(manual[c.productId])),
                                            label: 'Elle fiyat',
                                            profit: null,
                                          })
                                        }
                                      >
                                        Uygula
                                      </Button>
                                    </div>
                                    <KeepCell c={c} />
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2 text-destructive"
                                      disabled={!!busy}
                                      onClick={() => setPending({ type: 'remove', c })}
                                    >
                                      {busy === c.productId && <RefreshCw className="animate-spin" />} Kampanyadan çıkar
                                    </Button>
                                    <KeepCell c={c} />
                                  </div>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </section>
        );
      })}

      <AlertDialog open={!!pending} onOpenChange={(o) => !busy && !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.type === 'remove'
                ? `${pending.c.offerId} kampanyadan çıkarılsın mı?`
                : pending && `${pending.c.offerId} kampanya fiyatı ${usd(pending.c.current)} → ${usd(pending.price)} olsun mu?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.type === 'remove'
                ? `Elastik boosting kampanyasından çıkar; müşteri ürünün ana fiyatını görür. Şu anki kâr ${usd(pending.c.profitNow)}.`
                : pending &&
                  `${pending.label}${pending.profit != null ? `, bu fiyatta kâr ${usd(pending.profit)}` : ''}. Fiyat sunucuda asgari kâr ve Ozon tavanıyla yeniden kontrol edilir, Ozon'un kabul ettiği fiyat doğrulanır. Ana fiyat değişmez.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
              disabled={!!busy}
            >
              {busy && <RefreshCw className="animate-spin" />}
              {pending?.type === 'remove' ? 'Kampanyadan çıkar' : 'Uygula'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
