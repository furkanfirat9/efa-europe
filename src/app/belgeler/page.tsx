'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { useDocuments } from './useDocuments';
import { DocumentKpiCards } from './_components/DocumentKpiCards';
import { DocumentsTable } from './_components/DocumentsTable';
import { DocumentSheet } from './_components/DocumentSheet';
import { UploadDropzone } from './_components/UploadDropzone';
import { formatAmount, formatIsoDate, MONTHS, YEARS } from './utils';

export default function BelgelerPage() {
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
    selected,
    setSelectedId,
    saving,
    save,
    remove,
  } = useDocuments();

  return (
    <div className="flex-1 space-y-4 bg-background p-4 pt-6 text-foreground md:p-8">
      {/* Başlık */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Belgeler</h1>
          <p className="text-muted-foreground">Tedarik, hizmet ve üyelik faturaları; TCMB kuruyla TL karşılıkları.</p>
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

      <DocumentsTable documents={documents} loading={loading} onOpen={setSelectedId} />

      <DocumentSheet
        document={selected}
        open={!!selected}
        saving={saving}
        onClose={() => setSelectedId(null)}
        onSave={save}
        onDelete={remove}
      />
    </div>
  );
}
