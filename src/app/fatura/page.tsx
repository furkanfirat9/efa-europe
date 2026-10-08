'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, FileText, Loader2, Package, ReceiptText, RefreshCw } from 'lucide-react';
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
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/shadcn/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/shadcn/tooltip';
import { OrderStatusBadge } from '@/app/siparisler/_components/OrderStatusBadge';
import type { InvoiceOrderRow } from '@/lib/efatura/issue';

/**
 * Fatura oluştur: faturası kesilmemiş siparişler ve kesilenler.
 * Analiz yok; kesilen faturalar Belgeler → Satış faturaları'nda görünür.
 */

interface ListResponse {
  env: 'staging' | 'production';
  startDate: string;
  pending: InvoiceOrderRow[];
  invoiced: InvoiceOrderRow[];
}

const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' });
const formatDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '—');
const formatAmount = (value: number, currency: string) =>
  `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;

/**
 * Fatura no + PDF. Tamamlanmış faturada yalnızca bu ikisi görünür; Trendyol henüz
 * işliyorsa PDF yerine dönen simge, hata verdiyse numara kırmızı yazılır.
 */
function InvoiceCell({ invoiceNo, pdfHref, state }: { invoiceNo: string | null; pdfHref: string | null; state: 'done' | 'processing' | 'error' }) {
  return (
    <div className="mx-auto grid w-fit grid-cols-[auto_2rem] items-center gap-2">
      <span
        className={state === 'error' ? 'font-mono text-xs text-destructive' : 'font-mono text-xs'}
        title={state === 'error' ? 'Trendyol faturayı işlerken hata verdi' : undefined}
      >
        {invoiceNo ?? '—'}
      </span>
      {state === 'processing' ? (
        <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" aria-label="Fatura işleniyor" />
      ) : !pdfHref ? (
        <span />
      ) : (
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <a href={pdfHref} target="_blank" rel="noreferrer" aria-label="PDF'i aç">
            <FileText />
          </a>
        </Button>
      )}
    </div>
  );
}

function OrderCells({ row }: { row: InvoiceOrderRow }) {
  return (
    <>
      <TableCell className="whitespace-nowrap">{formatDate(row.orderDate)}</TableCell>
      <TableCell className="font-mono text-xs">{row.postingNumber}</TableCell>
      <TableCell>
        <div className="mx-auto flex size-10 items-center justify-center overflow-hidden rounded-md border bg-background p-1">
          {row.image ? (
            <img src={row.image} alt={row.productName || 'Ürün'} className="size-full object-contain" />
          ) : (
            <Package className="size-4 text-muted-foreground" />
          )}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">{row.offerId ?? '—'}</TableCell>
      <TableCell>
        <div className="mx-auto max-w-64 truncate text-left" title={row.productName ?? undefined}>
          {row.productName ?? '—'}
          {row.itemCount > 1 && <span className="text-muted-foreground"> · {row.itemCount} adet</span>}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">{row.customerName ?? '—'}</TableCell>
      <TableCell className="whitespace-nowrap font-medium tabular-nums">{formatAmount(row.amount, row.currency)}</TableCell>
      <TableCell>
        <OrderStatusBadge status={row.status} statusName={row.statusName ?? undefined} />
      </TableCell>
    </>
  );
}

/** "Kargoda" görünen Ozon durumları; toplu fatura yalnızca bunlara kesilir. */
const IN_TRANSIT = new Set(['delivering', 'driver_pickup']);

async function requestIssue(postingNumber: string) {
  const res = await fetch('/api/fatura/kes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postingNumber }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error_message);
  return json.issue as { invoiceNo: string | null; transliterated: boolean };
}

const ORDER_HEADERS = ['Tarih', 'Gönderi no', 'Görsel', 'Offer ID', 'Ürün', 'Müşteri', 'Tutar', 'Durum'];

function OrdersTable({
  rows,
  loading,
  lastHeader,
  empty,
  renderLast,
}: {
  rows: InvoiceOrderRow[];
  loading: boolean;
  lastHeader: string;
  empty: string;
  renderLast: (row: InvoiceOrderRow) => React.ReactNode;
}) {
  const columnCount = ORDER_HEADERS.length + 1;
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            {[...ORDER_HEADERS, lastHeader].map((h) => (
              <TableHead key={h} className="whitespace-nowrap text-center">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i} className="hover:bg-transparent">
                <TableCell colSpan={columnCount}>
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columnCount} className="h-32 text-center text-muted-foreground">
                <ReceiptText className="mx-auto mb-2 size-8 opacity-60" />
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.postingNumber} className="[&>td]:text-center">
                <OrderCells row={row} />
                <TableCell>{renderLast(row)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function FaturaPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('bekleyen');
  const [confirming, setConfirming] = useState<InvoiceOrderRow | null>(null);
  const [issuing, setIssuing] = useState<string | null>(null);
  // Onay penceresi açılırken listenin kopyası: kapanırken liste yenilense de pencere değişmez.
  const [bulkConfirm, setBulkConfirm] = useState<InvoiceOrderRow[] | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/fatura', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error_message);
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Liste alınamadı.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Trendyol'da işlenen fatura birkaç saniyede tamamlanır, Belgeler kaydı XML'i bekleyebilir;
  // o sırada liste sessizce yenilenir (yenileme sunucuda durumu ve kaydı ilerletir).
  const processing = data?.invoiced.some(
    (r) =>
      r.issue &&
      (!['205', '305', '29', '405'].includes(r.issue.providerStatus ?? '') ||
        (r.issue.providerStatus === '205' && !r.issue.saved))
  );
  useEffect(() => {
    if (!processing) return;
    const id = setTimeout(() => load(true), 15000);
    return () => clearTimeout(id);
  }, [processing, data, load]);

  const issue = async (row: InvoiceOrderRow) => {
    setConfirming(null);
    setIssuing(row.postingNumber);
    try {
      const issued = await requestIssue(row.postingNumber);
      toast.success(`Fatura kesildi: ${issued.invoiceNo ?? row.postingNumber}`, {
        description: issued.transliterated
          ? 'Trendyol Rusça metni engellediği için ad ve adres Latin harflerle yazıldı.'
          : undefined,
      });
    } catch (err) {
      toast.error('Fatura kesilemedi', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setIssuing(null);
      load(true);
    }
  };

  // Toplu fatura: faturası kesilmemiş ve kargoda olan siparişler. Sevkiyat bekleyenler faturasız kalır.
  const bulkRows = (data?.pending ?? []).filter((r) => IN_TRANSIT.has(r.status) && !r.blocked);

  // Faturalar sırayla kesilir; biri hata verirse diğerleri durmaz.
  const issueBulk = async (rows: InvoiceOrderRow[]) => {
    setBulkConfirm(null);
    const failed: string[] = [];
    let ok = 0;
    setBulk({ done: 0, total: rows.length });
    for (const [i, row] of rows.entries()) {
      setIssuing(row.postingNumber);
      try {
        await requestIssue(row.postingNumber);
        ok++;
      } catch (err) {
        failed.push(`${row.postingNumber}: ${err instanceof Error ? err.message : 'hata'}`);
      }
      setBulk({ done: i + 1, total: rows.length });
    }
    setIssuing(null);
    setBulk(null);
    if (failed.length) {
      toast.error(`${ok} fatura kesildi, ${failed.length} sipariş kesilemedi`, {
        description: failed.join(' · '),
        duration: 15000,
      });
    } else {
      toast.success(`${ok} fatura kesildi`);
    }
    load(true);
  };

  const isTest = data?.env === 'staging';

  return (
    <div className="flex-1 space-y-4 bg-background p-4 pt-6 text-foreground md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Fatura oluştur</h1>
            {isTest && <Badge variant="outline">Test ortamı</Badge>}
          </div>
          <p className="text-muted-foreground">
            Trendyol E-Faturam ile e-Arşiv satış faturası.
            {data && ` ${formatDate(data.startDate)} ve sonrasındaki siparişler.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
          Yenile
        </Button>
      </div>

      {isTest && (
        <Alert>
          <AlertCircle />
          <AlertTitle>Test ortamı</AlertTitle>
          <AlertDescription>
            Burada kesilen faturalar GİB'e gitmez ve yasal değildir; Belgeler → Satış faturaları'na da yazılmaz.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Bir sorun oluştu</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="bekleyen">Fatura bekleyen{data ? ` (${data.pending.length})` : ''}</TabsTrigger>
          <TabsTrigger value="faturalanan">Faturalanan{data ? ` (${data.invoiced.length})` : ''}</TabsTrigger>
        </TabsList>

        <TabsContent value="bekleyen" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Toplu fatura yalnızca kargodaki siparişlere kesilir; sevkiyat bekleyenler faturasız kalır.
            </p>
            <Button size="sm" disabled={!bulkRows.length || !!issuing} onClick={() => setBulkConfirm(bulkRows)}>
              {bulk ? (
                <>
                  <Loader2 className="animate-spin" />
                  Kesiliyor {bulk.done}/{bulk.total}
                </>
              ) : (
                <>Kargodakileri faturala ({bulkRows.length})</>
              )}
            </Button>
          </div>
          <OrdersTable
            rows={data?.pending ?? []}
            loading={loading && !data}
            lastHeader="Fatura"
            empty="Faturası kesilmemiş sipariş yok."
            renderLast={(row) => {
              if (issuing === row.postingNumber) {
                return (
                  <Button size="sm" disabled>
                    <Loader2 className="animate-spin" />
                    Kesiliyor
                  </Button>
                );
              }
              const button = (
                <Button size="sm" disabled={!!row.blocked || !!issuing} onClick={() => setConfirming(row)}>
                  Fatura kes
                </Button>
              );
              const note = row.blocked ?? row.issue?.error;
              return note ? (
                <div className="flex flex-col items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>{button}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72">{note}</TooltipContent>
                  </Tooltip>
                  <span className="max-w-40 truncate text-xs text-destructive" title={note}>
                    {row.blocked ? 'Kesilemez' : 'Önceki deneme başarısız'}
                  </span>
                </div>
              ) : (
                button
              );
            }}
          />
        </TabsContent>

        <TabsContent value="faturalanan">
          <OrdersTable
            rows={data?.invoiced ?? []}
            loading={loading && !data}
            lastHeader="Fatura"
            empty="Henüz fatura kesilmedi."
            renderLast={(row) =>
              row.gibInvoice ? (
                <InvoiceCell
                  invoiceNo={row.gibInvoice.invoiceNo}
                  pdfHref={row.gibInvoice.hasPdf ? `/api/belgeler/satis/${row.gibInvoice.id}/pdf` : null}
                  state="done"
                />
              ) : (
                row.issue && (
                  <InvoiceCell
                    invoiceNo={row.issue.invoiceNo}
                    pdfHref={`/api/fatura/pdf/${row.issue.invoiceUuid}`}
                    state={
                      row.issue.providerStatus === '29' || row.issue.providerStatus === '405'
                        ? 'error'
                        : ['205', '305'].includes(row.issue.providerStatus ?? '')
                          ? 'done'
                          : 'processing'
                    }
                  />
                )
              )
            }
          />
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!bulkConfirm} onOpenChange={(open) => !open && setBulkConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkConfirm?.length} sipariş faturalansın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              Kargodaki {bulkConfirm?.length} sipariş · toplam{' '}
              {formatAmount((bulkConfirm ?? []).reduce((s, r) => s + r.amount, 0), 'USD')}
              <br />
              {isTest
                ? 'Test ortamında kesilecek.'
                : 'e-Arşiv faturaları GİB’e gönderilir; bu işlem geri alınamaz.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkConfirm && issueBulk(bulkConfirm)}>Faturaları kes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fatura kesilsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming && (
                <>
                  {confirming.postingNumber} · {confirming.customerName} ·{' '}
                  {formatAmount(confirming.amount, confirming.currency)}
                  <br />
                  {isTest
                    ? 'Test ortamında kesilecek.'
                    : 'e-Arşiv faturası GİB’e gönderilir; bu işlem geri alınamaz.'}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirming && issue(confirming)}>Fatura kes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
