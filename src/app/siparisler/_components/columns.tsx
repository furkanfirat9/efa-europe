'use client';

import React from 'react';
import {
  columnVisibilityFeature,
  createColumnHelper,
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import { formatNumber, formatUSD } from '@/lib/format';
import { OrderItem } from '../types';
import { formatDate } from '../utils';
import type { SortDirection, SortField } from '../useOrders';
import { OrderStatusBadge } from './OrderStatusBadge';
import {
  BuyPriceCell,
  DocumentCell,
  InlineTextCell,
  PostingNumberCell,
  ProductImageCell,
  SupplierOrderIdCell,
  type UpdateOrder,
} from './cells';
import type { OnDocumentChange } from '../useOrderDocument';

/**
 * Sıralama ve filtreleme useOrders'ta (URL ile senkron) yapılır; tablo yalnızca
 * sayfalama ve kolon görünürlüğünü yönetir.
 */
export const orderTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

const helper = createColumnHelper<typeof orderTableFeatures, OrderItem>();

/** Kolon görünürlüğü menüsündeki adlar. */
export const COLUMN_LABELS: Record<string, string> = {
  date: 'Sipariş tarihi',
  postingNumber: 'Gönderi no',
  product: 'Ürün',
  buyPrice: 'Alış ₺',
  salePrice: 'Satış',
  paymentCard: 'Kart',
  supplier: 'Tedarik',
  supplierOrderId: 'Sipariş no',
  document: 'Belge',
  status: 'Durum',
};

interface SortProps {
  sortField: SortField;
  sortDirection: SortDirection;
  onToggle: Record<SortField, () => void>;
}

function SortableHeader({ field, label, sort }: { field: SortField; label: string; sort: SortProps }) {
  const active = sort.sortField === field;
  const Icon = !active ? ArrowUpDown : sort.sortDirection === 'asc' ? ArrowUp : ArrowDown;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={sort.onToggle[field]}
      className="h-8 data-[active=true]:text-foreground"
      data-active={active}
      aria-label={`${label} kolonuna göre sırala`}
    >
      {label}
      <Icon className={active ? '' : 'text-muted-foreground'} />
    </Button>
  );
}

export function buildOrderColumns({
  onUpdate,
  onOpenDetail,
  onDocumentChange,
  sort,
}: {
  onUpdate: UpdateOrder;
  onOpenDetail: (order: OrderItem) => void;
  onDocumentChange: OnDocumentChange;
  sort: SortProps;
}) {
  return helper.columns([
    helper.display({
      id: 'index',
      header: '#',
      enableHiding: false,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.index + 1}</span>,
    }),
    helper.display({
      id: 'date',
      header: () => <SortableHeader field="date" label="Tarih" sort={sort} />,
      cell: ({ row }) => <span className="whitespace-nowrap font-medium">{formatDate(row.original.inProcessAt)}</span>,
    }),
    helper.display({
      id: 'postingNumber',
      header: 'Gönderi no',
      cell: ({ row }) => <PostingNumberCell order={row.original} />,
    }),
    helper.display({
      id: 'product',
      header: 'Ürün',
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-3">
          <ProductImageCell order={row.original} />
          <div
            className="max-w-28 truncate text-xs font-medium"
            title={row.original.productTitle || row.original.productOfferId || undefined}
          >
            {row.original.productOfferId || row.original.productTitle || '—'}
          </div>
        </div>
      ),
    }),
    helper.display({
      id: 'buyPrice',
      header: () => <SortableHeader field="buyPrice" label="Alış ₺" sort={sort} />,
      cell: ({ row }) => <BuyPriceCell order={row.original} onUpdate={onUpdate} />,
    }),
    helper.display({
      id: 'salePrice',
      header: () => <SortableHeader field="salePrice" label="Satış" sort={sort} />,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {row.original.currency === 'USD'
            ? formatUSD(row.original.salePrice)
            : `${formatNumber(row.original.salePrice)} ${row.original.currency}`}
        </span>
      ),
    }),

    helper.display({
      id: 'paymentCard',
      header: 'Kart',
      cell: ({ row }) => (
        <InlineTextCell
          order={row.original}
          field="paymentCard"
          label="Ödeme kartı"
          emptyAsNull
          onUpdate={onUpdate}
          className="w-20"
        />
      ),
    }),
    helper.display({
      id: 'supplier',
      header: 'Tedarik',
      cell: ({ row }) => (
        <InlineTextCell order={row.original} field="supplier" label="Tedarikçi" onUpdate={onUpdate} className="w-20" />
      ),
    }),
    helper.display({
      id: 'supplierOrderId',
      header: 'Sipariş no',
      cell: ({ row }) => <SupplierOrderIdCell order={row.original} onUpdate={onUpdate} />,
    }),
    helper.display({
      id: 'document',
      header: 'Belge',
      cell: ({ row }) => <DocumentCell order={row.original} onDocumentChange={onDocumentChange} />,
    }),
    helper.display({
      id: 'status',
      header: 'Durum',
      cell: ({ row }) => <OrderStatusBadge status={row.original.status} statusName={row.original.statusName} />,
    }),

    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">İşlemler</span>,
      enableHiding: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onOpenDetail(row.original)}
          aria-label="Sipariş detayını aç"
        >
          <PanelRightOpen />
        </Button>
      ),
    }),
  ]);
}
