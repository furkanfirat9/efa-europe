'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  columnVisibilityFeature,
  createColumnHelper,
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, FileText, Loader2, PanelRightOpen, Paperclip, ReceiptText, Search, X } from 'lucide-react';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { formatTL } from '@/lib/format';
import type { SalesInvoiceItem } from '../useSalesInvoices';
import { formatAmount, formatIsoDate, formatRate, invoiceTypeLabel, signedTry } from '../utils';
import { PickPostingButton } from './PostingPicker';

const features = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

const helper = createColumnHelper<typeof features, SalesInvoiceItem>();

export function SalesInvoicesTable({
  invoices,
  loading,
  pdfBusy,
  onOpen,
  onAttachPdf,
  onSetPosting,
}: {
  invoices: SalesInvoiceItem[];
  loading: boolean;
  pdfBusy: string | null;
  onOpen: (id: string) => void;
  onAttachPdf: (id: string, file: File) => void;
  onSetPosting: (id: string, postingNumber: string | null) => Promise<boolean>;
}) {
  const [search, setSearch] = useState('');
  // Tek dosya seçici bütün satırlara hizmet eder; hangi faturaya ekleneceği burada tutulur.
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const pdfTargetRef = useRef<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return invoices;
    return invoices.filter((inv) =>
      [inv.customerName, inv.invoiceNo, inv.postingNumber, ...inv.lines.map((l) => l.name)]
        .filter(Boolean)
        .some((v) => v!.toLocaleLowerCase('tr-TR').includes(q))
    );
  }, [invoices, search]);

  const columns = useMemo(
    () =>
      helper.columns([
        // Sıra no, tablodaki (arama sonrası) sıraya göre; sayfalar arasında devam eder.
        helper.display({
          id: 'index',
          header: '#',
          cell: ({ row }) => <span className="text-xs tabular-nums text-muted-foreground">{row.index + 1}</span>,
        }),
        helper.display({
          id: 'date',
          header: 'Tarih',
          cell: ({ row }) => <span className="whitespace-nowrap font-medium">{formatIsoDate(row.original.issueDate)}</span>,
        }),
        helper.display({
          id: 'invoiceNo',
          header: 'Fatura no',
          cell: ({ row }) => (
            <div className="flex flex-col items-center gap-1">
              <span className="font-mono text-xs">{row.original.invoiceNo}</span>
              {/* Satış sekmesinde "Satış" etiketi gereksiz; yalnızca farklı tipler (iade, istisna …) işaretlenir. */}
              {row.original.typeCode && row.original.typeCode !== 'SATIS' && (
                <Badge variant={row.original.typeCode === 'IADE' ? 'destructive' : 'secondary'} className="text-[11px]">
                  {invoiceTypeLabel(row.original.typeCode)}
                </Badge>
              )}
            </div>
          ),
        }),
        helper.display({
          id: 'customer',
          header: 'Müşteri',
          cell: ({ row }) => (
            <div className="mx-auto max-w-56 text-center">
              <div className="truncate font-medium" title={row.original.customerName ?? undefined}>
                {row.original.customerName ?? '—'}
              </div>
              <div
                className="truncate text-xs text-muted-foreground"
                title={row.original.lines.map((l) => l.name).join('\n') || undefined}
              >
                {row.original.lines[0]?.name ?? ''}
                {row.original.lines.length > 1 && ` +${row.original.lines.length - 1}`}
              </div>
            </div>
          ),
        }),
        helper.display({
          id: 'country',
          header: 'Ülke',
          cell: ({ row }) => <span className="text-xs">{row.original.customerCountry ?? '—'}</span>,
        }),
        helper.display({
          id: 'amount',
          header: 'Tutar',
          cell: ({ row }) => (
            <span className="tabular-nums whitespace-nowrap">
              {formatAmount(row.original.totalAmount, row.original.currency)}
            </span>
          ),
        }),
        helper.display({
          id: 'rate',
          header: 'Kur',
          cell: ({ row }) => (
            <span className="text-xs tabular-nums text-muted-foreground" title={row.original.fxSource ?? undefined}>
              {row.original.currency === 'TRY' ? '—' : formatRate(row.original.fxRate)}
            </span>
          ),
        }),
        helper.display({
          id: 'totalTry',
          header: 'TL karşılığı',
          cell: ({ row }) => (
            <span className="font-medium tabular-nums whitespace-nowrap">
              {row.original.totalTry == null ? '—' : formatTL(signedTry(row.original))}
            </span>
          ),
        }),
        helper.display({
          id: 'posting',
          header: 'Gönderi no',
          cell: ({ row }) =>
            row.original.postingNumber ? (
              <a
                href={`/siparisler?search=${encodeURIComponent(row.original.postingNumber)}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs underline-offset-4 hover:underline"
                title="Siparişler sayfasında aç"
              >
                {row.original.postingNumber}
              </a>
            ) : (
              <PickPostingButton
                endpoint={`/api/belgeler/satis/${row.original.id}/siparisler`}
                onSelect={(posting) => onSetPosting(row.original.id, posting)}
              />
            ),
        }),
        helper.display({
          id: 'pdf',
          header: 'PDF',
          cell: ({ row }) => {
            const inv = row.original;
            if (pdfBusy === inv.id) return <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />;
            return inv.hasPdf ? (
              <Button variant="ghost" size="icon" className="size-8" asChild>
                <a
                  href={`/api/belgeler/satis/${inv.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="PDF'i aç"
                  title={inv.pdfName ?? undefined}
                >
                  <FileText />
                </a>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  pdfTargetRef.current = inv.id;
                  pdfInputRef.current?.click();
                }}
              >
                <Paperclip />
                Ekle
              </Button>
            );
          },
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">İşlemler</span>,
          cell: ({ row }) => (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => onOpen(row.original.id)}
              aria-label="Fatura detayını aç"
            >
              <PanelRightOpen />
            </Button>
          ),
        }),
      ]),
    [onOpen, onSetPosting, pdfBusy]
  );

  const table = useTable({
    features,
    columns,
    data: filtered,
    getRowId: (row) => row.id,
    initialState: { pagination: { pageIndex: 0, pageSize: 50 } },
  });

  // Ay değişince ilk sayfaya dön.
  useEffect(() => {
    table.setPageIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices]);

  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleLeafColumns().length;
  const { pageIndex } = table.state.pagination;

  return (
    <div className="space-y-4">
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && pdfTargetRef.current) onAttachPdf(pdfTargetRef.current, file);
          e.target.value = '';
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Müşteri, fatura no, ürün ara…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              table.setPageIndex(0);
            }}
            className="h-8 pl-8"
            aria-label="Satış faturalarında ara"
          />
        </div>
        {search.trim() !== '' && (
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setSearch('')}>
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
                  <TableHead key={header.id} className="whitespace-nowrap text-center">
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
                  <ReceiptText className="mx-auto mb-2 size-8 opacity-60" />
                  {search.trim() ? 'Aramaya uyan fatura yok.' : 'Bu ay için satış faturası yok.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-center">
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
            {filtered.length} fatura · toplam {formatTL(filtered.reduce((acc, inv) => acc + signedTry(inv), 0))}
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
