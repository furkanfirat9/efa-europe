'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Package, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/shadcn/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/dialog';
import { formatTrNumber } from '@/lib/format';

export interface OrderCandidate {
  postingNumber: string;
  status: string;
  inProcessAt: string | null;
  shipmentDate: string | null;
  offerId: string | null;
  title: string | null;
  image: string | null;
  quantity: number;
  priceUsd: number;
  priceEur: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  awaiting_deliver: 'Gönderime hazır',
  awaiting_packaging: 'Paketlenmeyi bekliyor',
  awaiting_registration: 'Kayıt bekliyor',
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—';

interface OrderPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (order: OrderCandidate) => void;
}

/**
 * Sevkiyat görevi henüz açılmamış açık Ozon siparişleri. Önce veri tabanındaki liste gösterilir,
 * ardından içinde bulunulan ay Ozon'la eşitlenir (Siparişler sayfasının kullandığı uç; 5 dakikadan
 * tazeyse Ozon'a gitmez) ve yeni sipariş geldiyse liste yenilenir.
 */
export function OrderPickerDialog({ open, onOpenChange, onSelect }: OrderPickerDialogProps) {
  const [items, setItems] = useState<OrderCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    const res = await fetch('/api/fulfillment/order-candidates', { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error_message || 'Siparişler alınamadı.');
    setItems(data.items);
    setWarning(data.warning ?? null);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadCandidates();
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Arka planda Ozon'la eşitle; yeni sipariş ya da durum değişikliği varsa listeyi tazele.
      setSyncing(true);
      try {
        const res = await fetch('/api/siparisler/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!cancelled && data.success && (!data.skipped || data.statusesUpdated > 0)) await loadCandidates();
      } catch {
        // Eşitleme başarısız olsa da veri tabanındaki liste geçerli.
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, loadCandidates]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Siparişlerden seç</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            Sevkiyat görevi henüz açılmamış açık siparişler.
            {syncing && (
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="size-3 animate-spin" />
                Ozon ile eşitleniyor
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {warning && <p className="text-xs text-muted-foreground">{warning}</p>}

        <div className="-mx-6 max-h-[60vh] overflow-y-auto border-y">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Yükleniyor…
            </div>
          ) : error ? (
            <p className="py-12 text-center text-sm text-destructive">{error}</p>
          ) : items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Görevi açılmamış açık sipariş yok.
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.postingNumber}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background p-1">
                      {item.image ? (
                        <img src={item.image} alt="" className="size-full object-contain" />
                      ) : (
                        <Package className="size-5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-medium">{item.postingNumber}</span>
                        <Badge variant={item.status === 'awaiting_deliver' ? 'secondary' : 'outline'}>
                          {STATUS_LABEL[item.status] ?? item.status}
                        </Badge>
                      </div>
                      <p className="truncate text-sm" title={item.title ?? undefined}>
                        {item.title || '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.offerId || '—'} · {formatDate(item.inProcessAt)}
                        {item.quantity > 1 && ` · ${item.quantity} adet`}
                      </p>
                    </div>

                    <div className="shrink-0 text-right tabular-nums">
                      <p className="text-sm font-medium">${formatTrNumber(item.priceUsd)}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.priceEur !== null ? `€${formatTrNumber(item.priceEur)}` : '—'}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
