'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, AlertTriangle, Loader2, Sparkles, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/shadcn/tabs';
import { useDocuments } from './useDocuments';
import { useSalesInvoices } from './useSalesInvoices';
import { DocumentKpiCards } from './_components/DocumentKpiCards';
import { DocumentsTable } from './_components/DocumentsTable';
import { DocumentSheet } from './_components/DocumentSheet';
import { SalesInvoicesTab } from './_components/SalesInvoicesTab';
import { UploadDropzone } from './_components/UploadDropzone';
import { formatAmount, formatIsoDate, MONTHS, YEARS } from './utils';

type Tab = 'gider' | 'satis';

/** Adresteki ?year=&month= geçerliyse onu, değilse içinde bulunulan ayı verir. */
function monthFromUrl(params: URLSearchParams) {
  const now = new Date();
  const year = Number(params.get('year'));
  const month = Number(params.get('month'));
  if (YEARS.includes(year) && Number.isInteger(month) && month >= 1 && month <= 12) return { year, month };
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Adresi geçmişe kayıt eklemeden günceller. */
function updateUrl(edit: (params: URLSearchParams) => void) {
  const params = new URLSearchParams(window.location.search);
  edit(params);
  const qs = params.toString();
  const target = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  if (target !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', target);
}

function BelgelerContent() {
  // Açık sekme ve seçili ay adreste tutulur (?sekme=satis&year=2026&month=8); sayfa
  // yenilenince aynı yerde kalınır. İçinde bulunulan ay adrese yazılmaz.
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(searchParams.get('sekme') === 'satis' ? 'satis' : 'gider');
  const [initialMonth] = useState(() => monthFromUrl(searchParams));

  const changeTab = (value: string) => {
    const next: Tab = value === 'satis' ? 'satis' : 'gider';
    setTab(next);
    updateUrl((params) => (next === 'satis' ? params.set('sekme', 'satis') : params.delete('sekme')));
  };

  const {
    year,
    setYear,
    month,
    setMonth,
    documents,
    pending,
    loading,
    error,
    setError,
    uploads,
    uploadFiles,
    dismissUpload,
    orderDocuments,
    readingOrders,
    readOrderDocument,
    readAllOrderDocuments,
    selected,
    setSelectedId,
    saving,
    save,
    remove,
  } = useDocuments(initialMonth);
  // Sayfada tutulur: sekme değiştirmek süren yüklemeyi ve listeyi sıfırlamasın.
  const sales = useSalesInvoices(year, month);

  useEffect(() => {
    const now = new Date();
    const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
    updateUrl((params) => {
      if (isCurrent) {
        params.delete('year');
        params.delete('month');
      } else {
        params.set('year', String(year));
        params.set('month', String(month));
      }
    });
  }, [year, month]);

  return (
    <div className="flex-1 space-y-4 bg-background p-4 pt-6 text-foreground md:p-8">
      {/* Başlık */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Belgeler</h1>
          <p className="text-muted-foreground">Alış, gider ve satış faturaları; TL karşılıklarıyla.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24" aria-label="Yıl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-32" aria-label="Ay">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((label, i) => (
                <SelectItem key={label} value={String(i + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={changeTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="gider">Alış / Gider</TabsTrigger>
          <TabsTrigger value="satis">Satış faturaları</TabsTrigger>
        </TabsList>

        <TabsContent value="satis">
          <SalesInvoicesTab sales={sales} />
        </TabsContent>

        <TabsContent value="gider" className="space-y-4">
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

          <DocumentKpiCards documents={documents} pendingCount={pending.length} loading={loading} />

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Belge yükle</CardTitle>
                <CardDescription>Amazon, Allegro, üyelik ve hizmet faturaları</CardDescription>
              </CardHeader>
              <CardContent>
                <UploadDropzone uploads={uploads} onFiles={uploadFiles} onDismiss={dismissUpload} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Onay bekleyenler
                  {pending.length > 0 && <Badge variant="secondary">{pending.length}</Badge>}
                </CardTitle>
                <CardDescription>Okunan bilgileri kontrol edip onaylayın; onaylanan belge kendi ayına yazılır.</CardDescription>
              </CardHeader>
              <CardContent>
                {pending.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Onay bekleyen belge yok.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {pending.map((doc) => (
                      <li key={doc.id} className="flex items-center gap-3 p-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{doc.sellerName ?? doc.fileName}</span>
                            {doc.warnings.length > 0 && (
                              <Badge variant="outline" className="gap-1 text-muted-foreground">
                                <AlertTriangle className="size-3" />
                                {doc.warnings.length}
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatIsoDate(doc.documentDate)} · {doc.categoryLabel} · {doc.fileName}
                          </p>
                        </div>
                        <span className="shrink-0 font-medium tabular-nums">{formatAmount(doc.totalAmount, doc.currency)}</span>
                        <Button size="sm" variant="outline" onClick={() => setSelectedId(doc.id)}>
                          İncele
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {orderDocuments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Siparişlere yüklenmiş faturalar
                  <Badge variant="secondary">{orderDocuments.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Siparişler sayfasından yüklediğiniz alış faturaları. Okunduğunda bilgileri çıkarılır ve onayınıza sunulur;
                  dosya siparişte kalır.
                </CardDescription>
                <CardAction>
                  <Button size="sm" variant="outline" onClick={readAllOrderDocuments} disabled={readingOrders.length > 0}>
                    {readingOrders.length > 0 ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Tümünü oku
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <ul className="divide-y rounded-md border">
                  {orderDocuments.map((doc) => {
                    const busy = readingOrders.includes(doc.postingNumber);
                    return (
                      <li key={doc.postingNumber} className="flex items-center gap-3 p-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-xs">{doc.postingNumber}</span>
                          <p className="truncate text-xs text-muted-foreground">
                            {[doc.supplier, doc.fileName, formatIsoDate(doc.uploadedAt?.slice(0, 10) ?? null)]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => readOrderDocument(doc.postingNumber)}
                          disabled={busy}
                        >
                          {busy ? <Loader2 className="animate-spin" /> : null}
                          {busy ? 'Okunuyor…' : 'Oku'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          <DocumentsTable documents={documents} loading={loading} onOpen={setSelectedId} />

          <DocumentSheet
            document={selected}
            open={!!selected}
            saving={saving}
            onClose={() => setSelectedId(null)}
            onSave={save}
            onDelete={remove}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function BelgelerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-background">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <BelgelerContent />
    </Suspense>
  );
}
