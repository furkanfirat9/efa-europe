'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  columnVisibilityFeature,
  createColumnHelper,
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, FileText, PanelRightOpen, Search, X } from 'lucide-react';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { FilterCombobox } from '@/app/siparisler/_components/FilterCombobox';
import { categoryLabel, platformLabel } from '@/lib/documents/categories';
import { formatTL } from '@/lib/format';
import { formatAmount, formatIsoDate, type DocumentItem } from '../utils';

const features = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

const helper = createColumnHelper<typeof features, DocumentItem>();

const countBy = (items: DocumentItem[], key: (d: DocumentItem) => string | null) => {
  const counts = new Map<string, number>();
  for (const d of items) {
    const k = key(d);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
};

export function DocumentsTable({
  documents,
  loading,
  onOpen,
}: {
  documents: DocumentItem[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('all');
  const [category, setCategory] = useState('all');
  const [seller, setSeller] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return documents.filter(
      (d) =>
        (platform === 'all' || d.platform === platform) &&
        (category === 'all' || d.category === category) &&
        (seller === 'all' || d.sellerName === seller) &&
        (!q ||
          [d.sellerName, d.documentNo, d.orderNumber, d.fileName, ...d.lines.map((l) => l.description)]
            .filter(Boolean)
            .some((v) => v!.toLocaleLowerCase('tr-TR').includes(q)))
    );
  }, [documents, search, platform, category, seller]);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: 'date',
          header: 'Tarih',
          cell: ({ row }) => <span className="whitespace-nowrap font-medium">{formatIsoDate(row.original.documentDate)}</span>,
        }),
        helper.display({
          id: 'seller',
          header: 'Satıcı',
          cell: ({ row }) => (
            <div className="max-w-56">
              <div className="truncate font-medium" title={row.original.sellerName ?? undefined}>
                {row.original.sellerName ?? '—'}
              </div>
              <div className="text-xs text-muted-foreground">
                {platformLabel(row.original.platform)}
                {row.original.sellerCountry && ` · ${row.original.sellerCountry}`}
              </div>
            </div>
          ),
        }),
        helper.display({
          id: 'documentNo',
          header: 'Belge no',
          cell: ({ row }) => <span className="font-mono text-xs">{row.original.documentNo ?? '—'}</span>,
        }),
        helper.display({
          id: 'category',
          header: 'Kategori',
          cell: ({ row }) => (
            <Badge variant="secondary" className="whitespace-nowrap">
              {row.original.categoryLabel}
            </Badge>
          ),
        }),
        helper.display({
          id: 'amount',
          header: () => <div className="text-right">Tutar</div>,
          cell: ({ row }) => (
            <div className="text-right tabular-nums whitespace-nowrap">
              {formatAmount(row.original.totalAmount, row.original.currency)}
            </div>
          ),
        }),
        helper.display({
          id: 'totalTry',
          header: () => <div className="text-right">TL karşılığı</div>,
          cell: ({ row }) => (
            <div className="text-right font-medium tabular-nums whitespace-nowrap">
              {row.original.totalTry == null ? '—' : formatTL(row.original.totalTry)}
            </div>
          ),
        }),
        helper.display({
          id: 'orderNumber',
          header: 'Sipariş no',
          cell: ({ row }) => <span className="font-mono text-xs">{row.original.orderNumber ?? '—'}</span>,
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">İşlemler</span>,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" className="size-8" asChild>
                <a
                  href={`/api/belgeler/${row.original.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Dosyayı aç"
                  title={row.original.fileName}
                >
                  <FileText />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => onOpen(row.original.id)}
                aria-label="Belge detayını aç"
              >
                <PanelRightOpen />
              </Button>
            </div>
          ),
        }),
      ]),
    [onOpen]
  );

  const table = useTable({
    features,
    columns,
    data: filtered,
    getRowId: (row) => row.id,
    initialState: { pagination: { pageIndex: 0, pageSize: 50 } },
  });

  // Filtre ya da ay değişince ilk sayfaya dön.
  useEffect(() => {
    table.setPageIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, platform, category, seller]);

  const platformCounts = countBy(documents, (d) => d.platform);
  const categoryCounts = countBy(documents, (d) => d.category);
  const sellerCounts = countBy(documents, (d) => d.sellerName);
  const isFiltered = search.trim() !== '' || platform !== 'all' || category !== 'all' || seller !== 'all';
  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleLeafColumns().length;
  const { pageIndex } = table.state.pagination;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Satıcı, belge no, ürün ara…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              table.setPageIndex(0);
            }}
            className="h-8 pl-8"
            aria-label="Belgelerde ara"
          />
        </div>
        <FilterCombobox
          title="Platform"
          value={platform}
          onChange={setPlatform}
          searchable={false}
          options={[...platformCounts].map(([key, count]) => ({ value: key, label: platformLabel(key), count }))}
        />
        <FilterCombobox
          title="Kategori"
          value={category}
          onChange={setCategory}
          options={[...categoryCounts].map(([key, count]) => ({ value: key, label: categoryLabel(key), count }))}
        />
        <FilterCombobox
          title="Satıcı"
          value={seller}
          onChange={setSeller}
          options={[...sellerCounts].map(([key, count]) => ({ value: key, label: key, count }))}
        />
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => {
              setSearch('');
              setPlatform('all');
              setCategory('all');
              setSeller('all');
            }}
          >
            Sıfırla
            <X />
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell colSpan={columnCount}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="h-32 text-center text-muted-foreground">
                  <FileText className="mx-auto mb-2 size-8 opacity-60" />
                  {isFiltered ? 'Filtrelere uyan belge yok.' : 'Bu ay için onaylanmış belge yok.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-4 text-sm">
          <p className="text-muted-foreground tabular-nums">
            {filtered.length} belge · toplam {formatTL(filtered.reduce((acc, d) => acc + (d.totalTry ?? 0), 0))}
          </p>
          {table.getPageCount() > 1 && (
            <div className="flex items-center gap-2">
              <span className="tabular-nums">
                Sayfa {pageIndex + 1} / {table.getPageCount()}
              </span>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
