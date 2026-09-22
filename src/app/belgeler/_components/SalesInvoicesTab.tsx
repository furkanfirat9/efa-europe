'use client';

import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Skeleton } from '@/components/shadcn/skeleton';
import { formatTL } from '@/lib/format';
import type { useSalesInvoices } from '../useSalesInvoices';
import { formatAmount, SALES_ACCEPT, signedTry } from '../utils';
import { SalesInvoiceSheet } from './SalesInvoiceSheet';
import { SalesInvoicesTable } from './SalesInvoicesTable';
import { UploadDropzone } from './UploadDropzone';

export function SalesInvoicesTab({ sales }: { sales: ReturnType<typeof useSalesInvoices> }) {
  const { invoices, loading, error, setError, uploads, uploadFiles, dismissUpload, selected, setSelectedId } = sales;

  // Döviz toplamları para birimine göre ayrı; iade faturası eksiye yazılır.
  const byCurrency = new Map<string, number>();
  for (const inv of invoices) {
    const sign = inv.typeCode === 'IADE' ? -1 : 1;
    byCurrency.set(inv.currency, (byCurrency.get(inv.currency) ?? 0) + sign * inv.totalAmount);
  }
  const totalTry = invoices.reduce((acc, inv) => acc + signedTry(inv), 0);
  const withoutPdf = invoices.filter((inv) => !inv.hasPdf).length;

  const stats = [
    { label: 'Satış (TL)', value: formatTL(totalTry), note: `${invoices.length} fatura` },
    {
      label: 'Döviz toplamı',
      value: [...byCurrency].map(([cur, sum]) => formatAmount(sum, cur)).join(' · ') || '—',
      note: 'Faturadaki para biriminde',
    },
    { label: 'PDF eksik', value: String(withoutPdf), note: 'Bu ay' },
  ];

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive" className="relative pr-12">
          <AlertCircle />
          <AlertTitle>Bir sorun oluştu</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 size-7"
            onClick={() => setError(null)}
            aria-label="Uyarıyı kapat"
          >
            <X />
          </Button>
        </Alert>
      )}

      {/* items-start: özet kartları yükleme kartının yüksekliğine uzamasın */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Satış faturası yükle</CardTitle>
          </CardHeader>
          <CardContent>
            <UploadDropzone
              uploads={uploads}
              onFiles={uploadFiles}
              onDismiss={dismissUpload}
              accept={SALES_ACCEPT}
              hint="ZIP veya XML, dosya başına en fazla 4 MB. Fatura doğrudan okunur ve kaydedilir; Lenora'ya ait olmayan fatura kabul edilmez."
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
          {stats.map((s) => (
            <Card key={s.label} className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription>{s.label}</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums">
                  {loading ? <Skeleton className="h-8 w-28" /> : s.value}
                </CardTitle>
                <CardDescription className="text-xs">{loading ? <Skeleton className="h-4 w-16" /> : s.note}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>

      <SalesInvoicesTable
        invoices={invoices}
        loading={loading}
        pdfBusy={sales.pdfBusy}
        onOpen={setSelectedId}
        onAttachPdf={sales.attachPdf}
        onSetPosting={sales.setPosting}
      />

      <SalesInvoiceSheet
        invoice={selected}
        open={!!selected}
        pdfBusy={!!selected && sales.pdfBusy === selected.id}
        onClose={() => setSelectedId(null)}
        onAttachPdf={sales.attachPdf}
        onRemovePdf={sales.removePdf}
        onSetPosting={sales.setPosting}
        onDelete={sales.remove}
      />
    </div>
  );
}
