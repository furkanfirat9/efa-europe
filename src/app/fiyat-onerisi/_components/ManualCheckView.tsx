'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, ImageOff, RefreshCw, Undo2 } from 'lucide-react';
import { MAX_OZON_LIST_PRICE_USD } from '@/lib/amazon/types';
import type { ApplyResult, CampaignChange, CheckKind } from '@/lib/pricing/campaign';
import type { SupplySource } from '@/lib/pricing/proposals';
import { profitAt as costProfitAt } from '@/lib/pricing/rules';
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
    hint: 'Stok açık ve şu anki kampanya fiyatında zarar ediyoruz. Başabaş Ozon tavanının altındaysa fiyatı yükseltmek zararı bitirir. Değilse kampanyadan çıkarmak zararı durdurur; satış da büyük ihtimalle durur.',
    dot: 'bg-destructive',
  },
  {
    kind: 'thin',
    title: 'Ozon tavanı asgari kârın altında',
    hint: "Ozon'un bu ürün için izin verdiği en yüksek kampanya fiyatı, asgari kâr fiyatımızın altında. Kâr az; tavana kadar elle fiyat girmek, kampanyada bırakmak ya da çıkarmak senin kararın.",
    dot: 'bg-amber-500',
  },
  {
    kind: 'opportunity',
    title: 'Rakipten çok ucuzuz',
    hint: "Ozon'daki en ucuz rakip bizden kat kat pahalı; rakip verisi yanlış ürünü gösteriyor olabilir. Hazır fiyatlardan birini seçebilir ya da elle fiyat girebilirsin; fiyat Ozon tavanını geçemez, zarar ettiren fiyat ayrıca onay ister.",
    dot: 'bg-sky-500',
  },
  {
    kind: 'closed',
    title: 'Stoğu kapalı, fiyatı zararda',
    hint: 'Stok 0 olduğu için sipariş gelemez, şu an zarar yok. Stoğu açmadan önce fiyatı düzelt; stok açılır ve fiyat hâlâ zarardaysa kart "Zararına satıyor" bölümüne döner.',
    dot: 'bg-muted-foreground',
    collapsed: true,
  },
  {
    kind: 'blocked',
    title: 'Kampanyaya giremiyor',
    hint: `Kampanyada değil ve giremiyor: Ozon'un izin verdiği en yüksek fiyat asgari kâr fiyatımızın altında ya da alınabilir kaynak yok. Müşteri kartın ana fiyatını görür; buradan değiştirebilirsin, ${MAX_OZON_LIST_PRICE_USD.toLocaleString('tr-TR')} $ lojistik tavanını ve 750 € ihracat sınırını geçemez.`,
    dot: 'bg-muted-foreground',
    collapsed: true,
  },
];

export const SOURCE: Record<SupplySource, string> = { 'amazon-de': 'Amazon.de', 'amazon-pl': 'amazon.pl', ceneo: 'Ceneo' };

const usd = (n: number | null | undefined, digits = 0) => (n == null ? '—' : `${n.toLocaleString('tr-TR', { maximumFractionDigits: digits })} $`);
const day = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

type Pending =
  | { type: 'remove'; c: CampaignChange }
  | { type: 'price'; c: CampaignChange; price: number; label: string; profit: number | null }
  | { type: 'base'; c: CampaignChange; price: number; profit: number | null };

/** Onay penceresinin içeriği. Kâr ve sınırlar onaydan önce görünür; sunucu yine de yeniden kontrol eder. */
function dialogOf(p: Pending) {
  const { c } = p;
  const notes = c.buyable ? [] : ['Alınabilir kaynak yok; kâr tahmini maliyetle hesaplandı.'];
  if (p.type === 'remove') {
    const exit = c.exitPrice;
    const overCap = exit != null && exit > MAX_OZON_LIST_PRICE_USD;
    if (exit == null) notes.push('Ozon kampanya tavanı okunamadı: çıkış fiyatı seçilemez, kart çıkarılamaz.');
    if (overCap) notes.push(`Çıkış fiyatı lojistik tavanını (${usd(MAX_OZON_LIST_PRICE_USD)}) aşıyor: kart satışa kapanır, çıkarılamaz.`);
    else if (exit != null && exit > c.exportLimitUsd) notes.push(`Bu fiyat 750 € ihracat sınırının (${usd(c.exportLimitUsd)}) üstünde.`);
    return {
      title: `${c.offerId} kampanyadan çıkarılsın mı?`,
      text: `Elastik boosting kampanyasından çıkar. ${exit != null ? `Kart ${usd(exit)}'dan satacak, kâr ${usd(c.profitAtExit, 2)}. ` : ''}${c.rivalUsd != null ? `En ucuz rakip ${usd(c.rivalUsd)}. ` : ''}Şu anki kâr ${usd(c.profitNow, 2)}.`,
      notes,
      blocked: exit == null || overCap,
      danger: false,
      action: 'Kampanyadan çıkar',
    };
  }
  const loss = p.profit != null && p.profit < 0;
  if (loss) notes.unshift(`Bu fiyatta zarar: satış başına ${usd(-p.profit!, 2)} kayıp (başabaş ${usd(c.breakEvenUsd)}). Yine de uygulamak için onayla.`);
  if (p.type === 'price' && c.maxAction == null) notes.push('Ozon kampanya tavanı okunamadı: fiyat gönderilemez.');
  // Çıkış fiyatı gibi: ihracat sınırı uyarır, reddetmez (ana fiyat bu pencereye gelmeden baseLimit'e takılır)
  if (p.price > c.exportLimitUsd) notes.push(`Bu fiyat 750 € ihracat sınırının (${usd(c.exportLimitUsd)}) üstünde.`);
  const profit = `bu fiyatta kâr ${usd(p.profit, 2)}.`;
  return p.type === 'base'
    ? {
        title: `${c.offerId} ana fiyatı ${usd(c.basePrice)} → ${usd(p.price)} olsun mu?`,
        text: `Elle fiyat, ${profit} Kartın fiyatı ve asgari fiyatı bu olur; kart kampanyada olmadığı için müşteri bu fiyatı görür. Sınırlar sunucuda yeniden kontrol edilir, Ozon'daki fiyat okunup doğrulanır.`,
        notes,
        blocked: false,
        danger: loss,
        action: loss ? 'Zararına uygula' : 'Uygula',
      }
    : {
        title: `${c.offerId} kampanya fiyatı ${usd(c.current)} → ${usd(p.price)} olsun mu?`,
        text: `${p.label}, ${profit} Fiyat sunucuda Ozon tavanıyla yeniden kontrol edilir, Ozon'un kabul ettiği fiyat doğrulanır. Kart kampanyadayken ana fiyatı da bu fiyat olur.`,
        notes,
        blocked: c.maxAction == null,
        danger: loss,
        action: loss ? 'Zararına uygula' : 'Uygula',
      };
}

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

function Profit({ value, digits = 0 }: { value: number | null; digits?: number }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('font-medium', value < 0 ? 'text-destructive' : value < 5 ? 'text-amber-600' : 'text-emerald-600')}>
      {usd(value, digits)}
    </span>
  );
}

/** Elle fiyat kutusu: yazdıkça o fiyatta kalan kâr görünür, sunucuyla aynı hesapla (rules.ts). limit, aşılan sınırın yazısını döner. */
function PriceBox({
  c,
  value,
  disabled,
  limit,
  onChange,
  onApply,
}: {
  c: CampaignChange;
  value: string;
  disabled: boolean;
  limit: (price: number) => string | null;
  onChange: (value: string) => void;
  onApply: (price: number, profit: number | null) => void;
}) {
  const price = Number(value);
  const valid = Number.isInteger(price) && price > 0;
  const profit = valid && c.cost ? costProfitAt(price, c.cost).profit : null;
  const error = !value ? null : !valid ? 'Tam dolar gir' : limit(price);
  // Kampanya fiyatında yalnız uyarı (çıkış fiyatı gibi), reddetmez; ana fiyatta baseLimit zaten hata döner
  const overExport = valid && !error && price > c.exportLimitUsd;
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        inputMode="numeric"
        className="h-8 w-20"
        placeholder="$"
        aria-label={`${c.offerId} elle fiyat`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button variant="outline" size="sm" disabled={disabled || !valid || !!error} onClick={() => onApply(price, profit)}>
        Uygula
      </Button>
      {error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : (
        valid && (
          <span className="text-xs tabular-nums text-muted-foreground">
            kâr <Profit value={profit} digits={2} />
          </span>
        )
      )}
      {overExport && <span className="text-xs text-destructive">750 € sınırı {usd(c.exportLimitUsd)} üstünde</span>}
    </div>
  );
}

/** Kampanya fiyatı Ozon tavanını geçemez: üstünde kart kampanyadan çıkar. Lojistik tavanını da geçemez: kampanyadaki kartta ana fiyat da bu fiyat olur. Tavan okunamadıysa sınır bilinmez, fiyat gönderilmez (sunucu da reddeder) */
const campaignLimit = (c: CampaignChange) => (price: number) =>
  c.maxAction == null
    ? 'Ozon kampanya tavanı okunamadı'
    : price > Math.floor(c.maxAction)
      ? `Ozon tavanı ${usd(Math.floor(c.maxAction))}`
      : price > MAX_OZON_LIST_PRICE_USD
        ? `Lojistik tavanı ${usd(MAX_OZON_LIST_PRICE_USD)}`
        : null;
/** Ana fiyat lojistik tavanını ve 750 € ihracat sınırını geçemez */
const baseLimit = (c: CampaignChange) => (price: number) =>
  price > MAX_OZON_LIST_PRICE_USD
    ? `Lojistik tavanı ${usd(MAX_OZON_LIST_PRICE_USD)}`
    : price > c.exportLimitUsd
      ? `750 € sınırı ${usd(c.exportLimitUsd)}`
      : null;

/** "Elle kontrol" sekmesi: otomatik gönderilmeyen ürünler beş bölümde, her satırda yapılabilecek işlemle */
export function ManualCheckView({ rows, onChanged, onWrote }: { rows: CampaignChange[]; onChanged: () => Promise<void>; onWrote: () => void }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<ApplyResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [manual, setManual] = useState<Record<string, string>>({});

  const post = async (key: string, body: object) => {
    setBusy(key);
    setError(null);
    onWrote();
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
      if (j.results?.every((r: ApplyResult) => r.ok)) setManual((m) => ({ ...m, [key]: '' }));
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
    else
      post(pending.c.productId, {
        action: pending.type === 'base' ? 'base-price' : 'price',
        productId: pending.c.productId,
        price: pending.price,
        confirmLoss: pending.profit != null && pending.profit < 0,
      });
  };

  // Stok 0'da karar verilmez (keepAsIs reddeder): stok açılınca kart kararsız görünmeli
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
    ) : c.stock === 0 ? null : (
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

  // Bileşen değil, düz çağrı: kutu yazarken yeniden bağlanıp odağı kaybetmesin
  const priceBox = (c: CampaignChange, base = false) => (
    <PriceBox
      c={c}
      value={manual[c.productId] ?? ''}
      disabled={!!busy}
      limit={base ? baseLimit(c) : campaignLimit(c)}
      onChange={(v) => setManual((m) => ({ ...m, [c.productId]: v }))}
      onApply={(price, profit) => setPending(base ? { type: 'base', c, price, profit } : { type: 'price', c, price, label: 'Elle fiyat', profit })}
    />
  );
  const dialog = pending && dialogOf(pending);

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
                {r.offerId}:{' '}
                {!r.ok
                  ? r.error
                  : r.base
                    ? `ana fiyat ${usd(r.to)}`
                    : r.to
                      ? `kampanya fiyatı ${usd(r.to)}`
                      : `kampanyadan çıktı${r.exitPrice != null ? `, fiyatı ${usd(r.exitPrice)}` : ''}`}
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
                        {s.kind === 'blocked' && <TableHead className="text-right">Ana fiyat</TableHead>}
                        <TableHead className="text-right">{s.kind === 'blocked' ? 'Öneri' : 'Kampanyada'}</TableHead>
                        {s.kind !== 'blocked' && <TableHead className="text-right">Kâr (şimdi)</TableHead>}
                        {s.kind === 'opportunity' && <TableHead className="text-right">En ucuz rakip</TableHead>}
                        <TableHead className="text-right">Ozon tavanı</TableHead>
                        <TableHead className="text-right">Asgari kâr fiyatı</TableHead>
                        <TableHead className="text-right">Alış</TableHead>
                        <TableHead className="text-right">Satış (60 g)</TableHead>
                        <TableHead>İşlem</TableHead>
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
                            <TableCell className="whitespace-normal">
                              <Product c={c} />
                              <p className="mt-1 max-w-72 text-xs text-muted-foreground">{c.reason}</p>
                              {s.kind === 'closed' && c.buyable && c.rule && (
                                <p className="mt-1 max-w-72 text-xs font-medium">Kaynak alınabilir: stok açılabilir, ama önce fiyatı düzelt.</p>
                              )}
                            </TableCell>
                            {s.kind === 'blocked' && (
                              <TableCell className="text-right tabular-nums">
                                {usd(c.basePrice)}
                                {c.cost && (
                                  <div className="text-xs">
                                    kâr <Profit value={costProfitAt(c.basePrice, c.cost).profit} />
                                  </div>
                                )}
                              </TableCell>
                            )}
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
                            <TableCell className="text-right tabular-nums">{usd(c.maxAction == null ? null : Math.floor(c.maxAction))}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {usd(c.floorPrice)}
                              {c.breakEvenUsd != null && <div className="text-xs text-muted-foreground">başabaş {usd(c.breakEvenUsd)}</div>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {c.purchaseEur != null ? `${c.purchaseEur.toFixed(0)} €` : '—'}
                              {c.source && (
                                <div className="text-xs text-muted-foreground">
                                  {SOURCE[c.source]}
                                  {!c.buyable && (
                                    <Badge variant="destructive" className="ml-1" title="Hiçbir kanaldan şu an alınamıyor; maliyet yalnız tahmin">
                                      alınamaz
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className={cn('text-right tabular-nums', !c.sold && 'text-muted-foreground')}>{c.sold}</TableCell>
                            <TableCell>
                              {s.kind === 'blocked' ? (
                                priceBox(c, true)
                              ) : s.kind === 'opportunity' ? (
                                <div className="flex max-w-xl flex-wrap items-center gap-1.5">
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
                                  {priceBox(c)}
                                  <KeepCell c={c} />
                                </div>
                              ) : (
                                <div className="flex max-w-96 flex-wrap items-center gap-1.5">
                                  {priceBox(c)}
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
            <AlertDialogTitle>{dialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialog?.text}</AlertDialogDescription>
            {dialog?.notes.map((n) => (
              <p key={n} className="text-sm font-medium text-destructive">
                {n}
              </p>
            ))}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              variant={dialog?.danger ? 'destructive' : 'default'}
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
              disabled={!!busy || dialog?.blocked}
            >
              {busy && <RefreshCw className="animate-spin" />}
              {dialog?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
