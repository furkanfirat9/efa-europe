'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, TrendingUp, XCircle } from 'lucide-react';
import type { PriceJump, ScanStatus as Status } from '@/lib/sourcing/scanStatus';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover';
import { Skeleton } from '@/components/shadcn/skeleton';
import { cn } from '@/lib/utils';

export const when = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400_000);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `bugün ${time}`;
  if (days === 1) return `dün ${time}`;
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const LOOK: Record<string, { icon: typeof CheckCircle2; text: string; tone: string }> = {
  ok: { icon: CheckCircle2, text: 'Tamam', tone: 'text-emerald-600' },
  partial: { icon: AlertTriangle, text: 'Kısmi', tone: 'text-amber-600' },
  error: { icon: XCircle, text: 'Hata', tone: 'text-destructive' },
  stalled: { icon: XCircle, text: 'Yarıda kaldı', tone: 'text-destructive' },
  running: { icon: Loader2, text: 'Taranıyor', tone: 'text-muted-foreground' },
  none: { icon: Clock, text: 'Otomatik tarama yok', tone: 'text-muted-foreground' },
};

const price = (n: number, unit: string) => `${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${unit}`;

/** Taramada fiyatı %20+ oynayan ürünler; tarama okuduğunu yazdığı için yanlış okuma buradan gözle ayıklanır */
function Jumps({ jumps }: { jumps: PriceJump[] }) {
  const up = jumps.filter((j) => j.pct > 0).length;
  const down = jumps.length - up;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 rounded-sm text-xs underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            up > 0 ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          <TrendingUp className="size-3.5" />
          Ani fiyat değişimi: {[up > 0 && `${up} artış`, down > 0 && `${down} düşüş`].filter(Boolean).join(', ')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-xs text-muted-foreground">Fiyatı bu taramada %20 ya da daha fazla değişenler</div>
        <ul className="max-h-72 overflow-y-auto py-1 text-sm">
          {jumps.map((j) => (
            <li key={j.offer} className="flex items-center justify-between gap-3 px-3 py-1">
              <span className="truncate font-medium">{j.offer}</span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                <span className="text-xs text-muted-foreground">
                  {price(j.from, j.unit)} → {price(j.to, j.unit)}
                </span>
                <span className={cn('w-14 text-right text-xs font-medium', j.pct > 0 ? 'text-destructive' : 'text-emerald-600')}>
                  {j.pct > 0 ? '+' : ''}
                  {j.pct.toLocaleString('tr-TR')}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** /fiyat-onerisi üstünde her tedarik kanalının son otomatik taraması (scripts/supply_scan.mjs). */
export function ScanStatus() {
  const [channels, setChannels] = useState<Status[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tedarik-tarama')
      .then((r) => r.json())
      .then((j) => (j.success ? setChannels(j.channels) : setError(j.error_message)))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-destructive">Tarama durumu alınamadı: {error}</p>;
  if (!channels) return <Skeleton className="h-16 w-full" />;

  return (
    <div className="grid gap-2 md:grid-cols-3">
      {channels.map((c) => {
        const look = LOOK[c.status] ?? LOOK.none;
        const Icon = look.icon;
        return (
          <div key={c.channel} className="rounded-md border px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{c.label}</span>
              <span className={cn('flex items-center gap-1 text-xs', look.tone)}>
                <Icon className={cn('size-3.5', c.status === 'running' && 'animate-spin')} />
                {look.text}
              </span>
            </div>
            {c.status === 'none' ? (
              <div className="text-xs text-muted-foreground">Son veri: {when(c.lastDataAt)}</div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {when(c.finishedAt ?? c.startedAt)}
                  {c.total > 0 && ` · ${c.scanned}/${c.total} okundu`}
                  {(c.status === 'ok' || c.status === 'partial') && ` · ${c.priceChanged} fiyat, ${c.stockChanged} stok değişti`}
                </div>
                {c.jumps.length > 0 && <Jumps jumps={c.jumps} />}
                {c.error && <div className="text-xs text-destructive">{c.error}</div>}
              </>
            )}
            {c.stale && c.status !== 'running' && (
              <div className="text-xs text-amber-600">Veri eski: son başarılı tarama {when(c.lastDataAt)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
