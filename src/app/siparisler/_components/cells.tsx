'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileCheck, Link2, Package, Upload } from 'lucide-react';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/shadcn/tooltip';
import { cn } from '@/lib/utils';
import { formatTrNumber, parseTrNumber } from '@/lib/format';
import { OrderItem } from '../types';
import {
  formatOrderUrlLabel,
  getCountdownUrgencyStyle,
  getOzonPostingUrl,
  getShipmentCountdown,
  isUrlString,
} from '../utils';
import { useOrderDocument } from '../useOrderDocument';

export type UpdateOrder = (postingNumber: string, payload: Record<string, any>) => Promise<void>;

/** Tablo içi düzenleme kutusu: kenarlığı yalnızca üzerine gelince veya odakta görünür. */
const inlineInput =
  'h-8 border-transparent bg-transparent text-center text-xs shadow-none hover:border-input focus-visible:bg-background';

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

/** Değer odaktayken dışarıdan gelen güncellemeyle ezilmez. */
function useInlineValue(source: string) {
  const [value, setValue] = useState(source);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setValue(source);
  }, [source, focused]);
  return { value, setValue, focused, setFocused };
}

// ─── Gönderi no ──────────────────────────────────────────────────────────────

export function PostingNumberCell({ order }: { order: OrderItem }) {
  if (!order.postingNumber) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1.5 font-mono text-xs">
      <span className="whitespace-nowrap">{order.postingNumber}</span>
      <a
        href={getOzonPostingUrl(order.postingNumber, order.status)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ozon'da görüntüle"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}

// ─── Görsel + son sevk geri sayımı ───────────────────────────────────────────

export function ProductImageCell({ order }: { order: OrderItem }) {
  const countdown = React.useMemo(
    () => getShipmentCountdown(order.shipmentDate, order.status),
    [order.shipmentDate, order.status]
  );

  return (
    <div className="relative inline-flex">
      <div className="flex size-10 items-center justify-center overflow-hidden rounded-md border bg-background p-1">
        {order.productImage ? (
          <img
            src={order.productImage}
            alt={order.productTitle || 'Ürün'}
            className="size-full object-contain"
          />
        ) : (
          <Package className="size-4 text-muted-foreground" />
        )}
      </div>

      {/* Ozon'un 6 günlük ek süresine göre kalan gün */}
      {countdown && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'absolute -top-2 left-7 z-10 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none whitespace-nowrap ring-1 ring-background select-none',
                getCountdownUrgencyStyle(countdown.daysLeft, countdown.isExpired)
              )}
            >
              <span className="relative flex size-1.5 items-center justify-center">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-80" />
                <span className="relative inline-flex size-1 rounded-full bg-white" />
              </span>
              {countdown.label}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Son sevkiyat (6 gün ek süreyle): {countdown.deadlineFormatted}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ─── Alış fiyatı (TR sayı biçimi: 25.489,56) ─────────────────────────────────

export function BuyPriceCell({ order, onUpdate }: { order: OrderItem; onUpdate: UpdateOrder }) {
  const formatted =
    order.buyPrice !== null && order.buyPrice !== undefined ? formatTrNumber(order.buyPrice) : '';
  const { value, setValue, setFocused } = useInlineValue(formatted);

  const commit = () => {
    setFocused(false);
    const trimmed = value.trim();
    if (trimmed === '') {
      setValue('');
      if (order.buyPrice !== null && order.buyPrice !== undefined) {
        onUpdate(order.postingNumber, { buyPrice: null });
      }
      return;
    }

    const parsed = parseTrNumber(trimmed);
    if (parsed === null || parsed <= 0) {
      setValue(formatted);
      return;
    }

    setValue(formatTrNumber(parsed));
    if (parsed !== order.buyPrice) {
      onUpdate(order.postingNumber, { buyPrice: parsed });
    }
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder="0,00 ₺"
      aria-label="Alış fiyatı"
      value={value}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={commit}
      onKeyDown={blurOnEnter}
      className={cn(inlineInput, 'w-22 font-medium tabular-nums')}
    />
  );
}

// ─── Kart / tedarikçi gibi serbest metin alanları ────────────────────────────

export function InlineTextCell({
  order,
  field,
  label,
  onUpdate,
  emptyAsNull = false,
  className,
}: {
  order: OrderItem;
  field: 'paymentCard' | 'supplier';
  label: string;
  onUpdate: UpdateOrder;
  /** Boş bırakıldığında null gönder (kart) ya da boş metin (tedarikçi). */
  emptyAsNull?: boolean;
  className?: string;
}) {
  const current = order[field] || '';
  const { value, setValue, setFocused } = useInlineValue(current);

  const commit = () => {
    setFocused(false);
    const trimmed = value.trim();
    if (trimmed !== current) {
      onUpdate(order.postingNumber, { [field]: emptyAsNull ? trimmed || null : trimmed });
    }
  };

  return (
    <Input
      type="text"
      placeholder="Gir…"
      aria-label={label}
      value={value}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={blurOnEnter}
      className={cn(inlineInput, className)}
    />
  );
}

// ─── Tedarikçi sipariş no (bağlantıysa tıklanabilir, çift tıkla düzenlenir) ──

export function SupplierOrderIdCell({ order, onUpdate }: { order: OrderItem; onUpdate: UpdateOrder }) {
  const current = order.supplierOrderId || '';
  const { value, setValue, focused, setFocused } = useInlineValue(current);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) setEditing(false);
  }, [current, focused]);

  const isUrl = isUrlString(value);
  const href = isUrl ? (/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`) : '';

  const commit = () => {
    setFocused(false);
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed !== current) {
      onUpdate(order.postingNumber, { supplierOrderId: trimmed });
    }
  };

  const startEditing = () => {
    if (editing) return;
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
  };

  if (isUrl && !editing) {
    return (
      <div onDoubleClick={startEditing} className="flex justify-center">
        <Badge asChild variant="secondary" className="max-w-36 gap-1">
          <a href={href} target="_blank" rel="noreferrer" title={`${value} (düzenlemek için çift tıklayın)`}>
            <Link2 />
            <span className="truncate">{formatOrderUrlLabel(value)}</span>
            <ExternalLink />
          </a>
        </Badge>
      </div>
    );
  }

  return (
    <Input
      ref={inputRef}
      type="text"
      placeholder="Gir…"
      aria-label="Tedarikçi sipariş no"
      value={value}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => {
        setFocused(true);
        setEditing(true);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        blurOnEnter(e);
        if (e.key === 'Escape') {
          setFocused(false);
          setEditing(false);
        }
      }}
      className={cn(inlineInput, 'w-24')}
    />
  );
}

// ─── Belge ───────────────────────────────────────────────────────────────────

export function DocumentCell({ order }: { order: OrderItem }) {
  const { docFile, upload, view } = useOrderDocument(order.postingNumber);

  if (docFile) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" className="size-8" onClick={view} aria-label="Belgeyi görüntüle">
            <FileCheck className="text-emerald-600" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{docFile.name} — yeni sekmede aç</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-8 border-dashed border-muted-foreground/40 text-muted-foreground shadow-none hover:border-foreground/40 hover:text-foreground"
          asChild
        >
          <label className="cursor-pointer" aria-label="Belge yükle">
            <Upload />
            <input
              type="file"
              className="hidden"
              accept=".pdf,image/*,.doc,.docx,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                e.target.value = '';
              }}
            />
          </label>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Fatura / belge yükle (PDF, görsel)</TooltipContent>
    </Tooltip>
  );
}
