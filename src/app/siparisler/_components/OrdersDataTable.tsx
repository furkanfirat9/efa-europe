'use client';

import React, { useEffect, useMemo } from 'react';
import { useTable, type ColumnVisibilityState } from '@tanstack/react-table';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Package,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu';
import { Input } from '@/components/shadcn/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { cn } from '@/lib/utils';
import { OrderItem, STATUS_FILTER_OPTIONS } from '../types';
import type { AvailableProduct, AvailableSupplier, SortDirection, SortField } from '../useOrders';
import { buildOrderColumns, COLUMN_LABELS, orderTableFeatures } from './columns';
import type { UpdateOrder } from './cells';
import type { OnDocumentChange } from '../useOrderDocument';
import { FilterCombobox } from './FilterCombobox';

const PAGE_SIZES = [25, 50, 100];

/** Detay butonu kolonu sağa yapışık: dar ekranda tablo kaydırılsa da görünür kalır. */
const STICKY_HEAD = 'sticky right-0 z-10 bg-muted';
const STICKY_CELL =
  'sticky right-0 z-10 bg-background group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))]';
const VISIBILITY_KEY = 'siparisler_column_visibility';

interface OrdersDataTableProps {
  orders: OrderItem[];
  loading: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  productFilter: string;
  onProductChange: (value: string) => void;
  supplierFilter: string;
  onSupplierChange: (value: string) => void;
  availableProducts: AvailableProduct[];
  availableSuppliers: AvailableSupplier[];
  sortField: SortField;
  sortDirection: SortDirection;
  onToggleSort: Record<SortField, () => void>;
  /** Değiştiğinde ilk sayfaya dönülür (ay seçimi gibi dış filtreler). */
  resetKey: string;
  onUpdate: UpdateOrder;
  onOpenDetail: (order: OrderItem) => void;
  onDocumentChange: OnDocumentChange;
}

function loadVisibility(): ColumnVisibilityState {
  try {
    return JSON.parse(localStorage.getItem(VISIBILITY_KEY) || '{}');
  } catch {
    return {};
  }
}

export function OrdersDataTable(props: OrdersDataTableProps) {
  const {
    orders,
    loading,
    sortField,
    sortDirection,
    onToggleSort,
    onUpdate,
    onOpenDetail,
    onDocumentChange,
  } = props;

  const columns = useMemo(
    () =>
      buildOrderColumns({
        onUpdate,
        onOpenDetail,
        onDocumentChange,
        sort: { sortField, sortDirection, onToggle: onToggleSort },
      }),
    [onUpdate, onOpenDetail, onDocumentChange, sortField, sortDirection, onToggleSort]
  );

  const table = useTable({
    features: orderTableFeatures,
    columns,
    data: orders,
    // Satır kimliği gönderi no: satırdaki düzenleme durumu veri yenilense de korunur.
    getRowId: (row) => row.postingNumber || row.id,
    // Satır düzenleyince (veri değişir) sayfa başa atlamasın; filtre değişince elle sıfırlanır.
    autoResetPageIndex: false,
    initialState: { pagination: { pageIndex: 0, pageSize: 50 } },
  });

  // Kolon görünürlüğünü tablo kendisi tutar; tercih tarayıcıda saklanır. Sunucu ve ilk
  // istemci render'ı tüm kolonlarla eşleşsin diye kayıtlı tercih mount'tan sonra uygulanır.
  useEffect(() => {
    const saved = loadVisibility();
    if (Object.keys(saved).length) table.setColumnVisibility(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kayıt yalnızca kullanıcı menüden değiştirince yapılır (efektle kaydetmek, geliştirme
  // modunda çift çalışan efektler yüzünden kayıtlı tercihi boş değerle ezebiliyordu).
  const setColumnVisible = (id: string, visible: boolean) => {
    table.getColumn(id)?.toggleVisibility(visible);
    try {
      localStorage.setItem(VISIBILITY_KEY, JSON.stringify({ ...table.state.columnVisibility, [id]: visible }));
    } catch {}
  };

  const { pageIndex, pageSize } = table.state.pagination;
  const filterKey = [
    props.resetKey,
    props.searchTerm,
    props.statusFilter,
    props.productFilter,
    props.supplierFilter,
    sortField,
    sortDirection,
  ].join('|');
  useEffect(() => {
    table.setPageIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const isFiltered =
    props.searchTerm.trim() !== '' ||
    props.statusFilter !== 'all' ||
    props.productFilter !== 'all' ||
    props.supplierFilter !== 'all';

  const rows = table.getRowModel().rows;
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const pageCount = Math.max(1, table.getPageCount());
  const firstRow = orders.length === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min(orders.length, (pageIndex + 1) * pageSize);

  return (
    <div className="space-y-4">
      {/* Araç çubuğu */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Gönderi, ürün, tedarikçi ara…"
            value={props.searchTerm}
            onChange={(e) => props.onSearchChange(e.target.value)}
            className="h-8 pl-8"
            aria-label="Siparişlerde ara"
          />
        </div>
        <FilterCombobox
          title="Durum"
          value={props.statusFilter}
          onChange={props.onStatusChange}
          searchable={false}
          options={STATUS_FILTER_OPTIONS.filter((o) => o.key !== 'all').map((o) => ({
            value: o.key,
            label: o.fullLabel,
            dotClassName: o.dotColor,
          }))}
        />
        <FilterCombobox
          title="Ürün"
          value={props.productFilter}
          onChange={props.onProductChange}
          options={props.availableProducts.map((p) => ({
            value: p.offerId,
            label: p.offerId,
            description: p.title || undefined,
            count: p.count,
          }))}
        />
        <FilterCombobox
          title="Tedarikçi"
          value={props.supplierFilter}
          onChange={props.onSupplierChange}
          options={props.availableSuppliers.map((s) => ({ value: s.name, label: s.label, count: s.count }))}
        />
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => {
              props.onSearchChange('');
              props.onStatusChange('all');
              props.onProductChange('all');
              props.onSupplierChange('all');
            }}
          >
            Sıfırla
            <X />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto h-8">
              <Settings2 />
              Kolonlar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Kolonları göster</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllLeafColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => setColumnVisible(column.id, !!value)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {COLUMN_LABELS[column.id] ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tablo */}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn('whitespace-nowrap', header.column.id === 'actions' && STICKY_HEAD)}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell colSpan={visibleColumnCount}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumnCount} className="h-40 text-center text-muted-foreground">
                  <Package className="mx-auto mb-2 size-8 opacity-60" />
                  {isFiltered ? 'Filtrelere uyan sipariş yok.' : 'Bu ay için sipariş bulunamadı.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="group">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(cell.column.id === 'actions' && STICKY_CELL)}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Sayfalama */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <p className="text-muted-foreground tabular-nums">
          {orders.length} siparişten {firstRow}–{lastRow} gösteriliyor
        </p>
        <div className="flex items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Sayfa başına</span>
            <Select value={String(pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
              <SelectTrigger size="sm" className="w-18" aria-label="Sayfa başına satır">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top">
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="tabular-nums">
            Sayfa {pageIndex + 1} / {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="hidden size-8 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label="İlk sayfa"
            >
              <ChevronsLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Önceki sayfa"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Sonraki sayfa"
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="hidden size-8 lg:flex"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              aria-label="Son sayfa"
            >
              <ChevronsRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
