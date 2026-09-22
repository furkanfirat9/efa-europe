'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Package, PackageSearch } from 'lucide-react';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/shadcn/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover';
import { formatMoney } from '@/lib/format';
import { formatIsoDate } from '../utils';

interface OrderOption {
  postingNumber: string;
  customerName: string | null;
  productTitle: string | null;
  productImage: string | null;
  totalPrice: number;
  orderDate: string | null;
  /** Neden üstte olduğu, ör. "Aynı müşteri" */
  hint: string | null;
}

/**
 * Belgeye siparişi elle bağlamak için seçici. Liste sunucudan gelir (`endpoint`):
 * arama yoksa belge tarihine yakın siparişler, eşleşme ipucu olanlar üstte.
 */
export function PostingPicker({
  endpoint,
  exclude = [],
  onSelect,
  children,
  align = 'center',
}: {
  /** Ör. /api/belgeler/satis/<id>/siparisler */
  endpoint: string;
  /** Belgeye zaten bağlı olup listede gösterilmeyecek gönderi numaraları */
  exclude?: string[];
  onSelect: (postingNumber: string) => Promise<boolean>;
  /** Açma düğmesi */
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Yazarken her tuşta değil, kısa bir duraksamadan sonra aranır; eski yanıt yenisini ezmez.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error_message || 'Siparişler alınamadı.');
        setOrders(data.orders);
        setError(null);
      } catch (err: any) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, endpoint]);

  const visible = orders.filter((o) => !exclude.includes(o.postingNumber));

  const choose = async (postingNumber: string) => {
    setSaving(true);
    const ok = await onSelect(postingNumber);
    setSaving(false);
    if (ok) setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[26rem] p-0" align={align}>
        <Command shouldFilter={false}>
          <CommandInput placeholder="Gönderi no, müşteri ya da ürün ara…" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-96">
            {loading || saving ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {saving ? 'Bağlanıyor…' : 'Aranıyor…'}
              </div>
            ) : error ? (
              <p className="py-6 text-center text-sm text-destructive">{error}</p>
            ) : (
              <>
                <CommandEmpty>
                  <PackageSearch className="mx-auto mb-2 size-6 opacity-60" />
                  Sipariş bulunamadı.
                </CommandEmpty>
                <CommandGroup heading={query ? 'Arama sonuçları' : 'Belge tarihine yakın siparişler'}>
                  {visible.map((o) => (
                    <CommandItem
                      key={o.postingNumber}
                      value={o.postingNumber}
                      onSelect={() => choose(o.postingNumber)}
                      className="items-start gap-3"
                    >
                      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                        {o.productImage ? (
                          <img
                            src={o.productImage}
                            alt={o.productTitle ?? 'Ürün'}
                            loading="lazy"
                            className="size-full object-contain p-1"
                          />
                        ) : (
                          <Package className="size-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{o.postingNumber}</span>
                          {o.hint && (
                            <Badge variant="secondary" className="text-[10px]">
                              {o.hint}
                            </Badge>
                          )}
                          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                            {formatMoney(o.totalPrice)}
                          </span>
                        </div>
                        <div className="truncate text-xs">
                          {o.customerName ?? '—'}
                          <span className="text-muted-foreground"> · {formatIsoDate(o.orderDate)}</span>
                        </div>
                        {o.productTitle && <div className="truncate text-xs text-muted-foreground">{o.productTitle}</div>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Tablodaki "Seç" düğmesi */
export function PickPostingButton({
  label = 'Seç',
  ...props
}: Omit<React.ComponentProps<typeof PostingPicker>, 'children'> & { label?: string }) {
  return (
    <PostingPicker {...props}>
      <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
        {label}
      </Button>
    </PostingPicker>
  );
}
