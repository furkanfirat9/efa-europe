'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Trash2 } from 'lucide-react';
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
  AlertDialogTrigger,
} from '@/components/shadcn/alert-dialog';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select';
import { Separator } from '@/components/shadcn/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/shadcn/sheet';
import { Textarea } from '@/components/shadcn/textarea';
import { groupedCategories, PLATFORMS } from '@/lib/documents/categories';
import { formatTL, formatTrNumber, parseTrNumber } from '@/lib/format';
import type { DocumentPatch } from '../useDocuments';
import { CURRENCIES, formatAmount, formatIsoDate, formatRate, type DocumentItem } from '../utils';

type FormState = Record<
  | 'platform'
  | 'category'
  | 'documentNo'
  | 'ksefNo'
  | 'documentDate'
  | 'sellerName'
  | 'sellerCountry'
  | 'sellerTaxId'
  | 'buyerName'
  | 'currency'
  | 'totalAmount'
  | 'orderNumber'
  | 'servicePeriodStart'
  | 'servicePeriodEnd'
  | 'notes',
  string
>;

const toForm = (d: DocumentItem): FormState => ({
  platform: d.platform ?? '',
  category: d.category ?? '',
  documentNo: d.documentNo ?? '',
  ksefNo: d.ksefNo ?? '',
  documentDate: d.documentDate ?? '',
  sellerName: d.sellerName ?? '',
  sellerCountry: d.sellerCountry ?? '',
  sellerTaxId: d.sellerTaxId ?? '',
  buyerName: d.buyerName ?? '',
  currency: d.currency ?? '',
  totalAmount: d.totalAmount == null ? '' : formatTrNumber(d.totalAmount),
  orderNumber: d.orderNumber ?? '',
  servicePeriodStart: d.servicePeriodStart ?? '',
  servicePeriodEnd: d.servicePeriodEnd ?? '',
  notes: d.notes ?? '',
});

const toPatch = (f: FormState): DocumentPatch => ({
  platform: f.platform || null,
  category: f.category || null,
  documentNo: f.documentNo || null,
  ksefNo: f.ksefNo || null,
  documentDate: f.documentDate || null,
  sellerName: f.sellerName || null,
  sellerCountry: f.sellerCountry.toUpperCase() || null,
  sellerTaxId: f.sellerTaxId || null,
  buyerName: f.buyerName || null,
  currency: f.currency || null,
  totalAmount: parseTrNumber(f.totalAmount),
  orderNumber: f.orderNumber || null,
  servicePeriodStart: f.servicePeriodStart || null,
  servicePeriodEnd: f.servicePeriodEnd || null,
  notes: f.notes || null,
});

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className="mb-1.5 text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function DocumentSheet({
  document: current,
  open,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  document: DocumentItem | null;
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (id: string, patch: DocumentPatch, confirm: boolean) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  // Panel kapanırken belge seçimi hemen boşalır; kapanma animasyonu boyunca son belge gösterilir.
  const [doc, setDoc] = useState<DocumentItem | null>(current);
  const [form, setForm] = useState<FormState | null>(current ? toForm(current) : null);

  // Başka bir belge açıldığında ya da sunucudan güncel hâli geldiğinde formu yenile.
  useEffect(() => {
    if (!current) return;
    setDoc(current);
    setForm(toForm(current));
  }, [current]);

  const set = (key: keyof FormState) => (value: string) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  const input = (key: keyof FormState) => ({
    id: `doc-${key}`,
    value: form?.[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key)(e.target.value),
  });

  const isDraft = doc?.status === 'draft';
  const fxWillChange = !!doc && !!form && (form.documentDate !== (doc.documentDate ?? '') || form.currency !== (doc.currency ?? ''));
  const showPeriod = !!form && (form.category.startsWith('uyelik') || !!form.servicePeriodStart || !!form.servicePeriodEnd);

  const submit = async (confirm: boolean) => {
    if (!doc || !form) return;
    const ok = await onSave(doc.id, toPatch(form), confirm);
    if (ok && confirm) onClose();
  };

  return (
    <Sheet open={open && !!current} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {doc && form && (
          <>
            <SheetHeader className="border-b p-6">
              <div className="flex flex-wrap items-center gap-2 pr-6">
                <SheetTitle>{isDraft ? 'Belgeyi kontrol et' : 'Belge detayı'}</SheetTitle>
                <Badge variant={isDraft ? 'outline' : 'secondary'}>{isDraft ? 'Onay bekliyor' : 'Onaylandı'}</Badge>
              </div>
              <SheetDescription className="flex items-center gap-1.5">
                <span className="truncate">{doc.fileName}</span>
                <a
                  href={`/api/belgeler/${doc.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Dosyayı aç
                  <ExternalLink className="size-3" />
                </a>
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {doc.warnings.length > 0 && (
                <Alert>
                  <AlertTriangle />
                  <AlertTitle>Kontrol edilmesi gerekenler</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {doc.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <section className="grid grid-cols-2 gap-4">
                <Field label="Belge tarihi" htmlFor="doc-documentDate">
                  <Input type="date" {...input('documentDate')} />
                </Field>
                <Field label="Belge no" htmlFor="doc-documentNo">
                  <Input {...input('documentNo')} className="font-mono text-xs" />
                </Field>
                <Field label="Kategori" className="col-span-2">
                  <Select value={form.category} onValueChange={set('category')}>
                    <SelectTrigger className="w-full" aria-label="Kategori">
                      <SelectValue placeholder="Kategori seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupedCategories().map(({ group, items }) => (
                        <SelectGroup key={group}>
                          <SelectLabel>{group}</SelectLabel>
                          {items.map((c) => (
                            <SelectItem key={c.key} value={c.key}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Toplam (KDV dahil)" htmlFor="doc-totalAmount">
                  <Input
                    {...input('totalAmount')}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="font-medium tabular-nums"
                  />
                </Field>
                <Field label="Para birimi">
                  <Select value={form.currency} onValueChange={set('currency')}>
                    <SelectTrigger className="w-full" aria-label="Para birimi">
                      <SelectValue placeholder="Seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </section>

              {/* TL karşılığı */}
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">TL karşılığı</span>
                  <span className="text-base font-semibold tabular-nums">
                    {doc.totalTry == null ? '—' : formatTL(doc.totalTry)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {doc.fxRate == null
                    ? 'Kur henüz belirlenmedi.'
                    : `1 ${doc.currency} = ${formatRate(doc.fxRate)} ₺ · ${formatIsoDate(doc.fxRateDate)} · ${doc.fxSource}`}
                </p>
                {fxWillChange && (
                  <p className="mt-1 text-xs font-medium">Tarih ya da para birimi değişti; kur kaydedince yeniden alınır.</p>
                )}
              </div>

              <Separator />

              <section className="grid grid-cols-2 gap-4">
                <Field label="Satıcı" htmlFor="doc-sellerName" className="col-span-2">
                  <Input {...input('sellerName')} />
                </Field>
                <Field label="Satıcı ülkesi" htmlFor="doc-sellerCountry">
                  <Input {...input('sellerCountry')} maxLength={2} placeholder="PL" className="uppercase" />
                </Field>
                <Field label="Satıcı vergi no" htmlFor="doc-sellerTaxId">
                  <Input {...input('sellerTaxId')} className="font-mono text-xs" />
                </Field>
                <Field label="Platform">
                  <Select value={form.platform} onValueChange={set('platform')}>
                    <SelectTrigger className="w-full" aria-label="Platform">
                      <SelectValue placeholder="Seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.key} value={p.key}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Sipariş no" htmlFor="doc-orderNumber">
                  <Input {...input('orderNumber')} className="font-mono text-xs" />
                </Field>
                <Field label="Alıcı" htmlFor="doc-buyerName" className="col-span-2">
                  <Input {...input('buyerName')} />
                </Field>
                {(form.ksefNo || doc.ksefNo) && (
                  <Field label="KSeF no" htmlFor="doc-ksefNo" className="col-span-2">
                    <Input {...input('ksefNo')} className="font-mono text-xs" />
                  </Field>
                )}
                {showPeriod && (
                  <>
                    <Field label="Hizmet dönemi başı" htmlFor="doc-servicePeriodStart">
                      <Input type="date" {...input('servicePeriodStart')} />
                    </Field>
                    <Field label="Hizmet dönemi sonu" htmlFor="doc-servicePeriodEnd">
                      <Input type="date" {...input('servicePeriodEnd')} />
                    </Field>
                  </>
                )}
                <Field label="Not" htmlFor="doc-notes" className="col-span-2">
                  <Textarea {...input('notes')} rows={2} />
                </Field>
              </section>

              {doc.lines.length > 0 && (
                <>
                  <Separator />
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium">Belgedeki kalemler</h3>
                    <ul className="divide-y rounded-md border text-sm">
                      {doc.lines.map((line) => (
                        <li key={line.id} className="flex items-start gap-3 p-3">
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2">{line.description}</p>
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              {line.quantity != null && <span>{line.quantity} adet</span>}
                              {line.isShipping && <Badge variant="outline">Kargo</Badge>}
                            </div>
                          </div>
                          <span className="shrink-0 tabular-nums">{formatAmount(line.amount, doc.currency)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
            </div>

            <SheetFooter className="flex-row items-center gap-2 border-t p-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={saving}>
                    <Trash2 />
                    Sil
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Belge silinsin mi?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {doc.fileName} ve okunan bilgileri kalıcı olarak silinir. Bu işlem geri alınamaz.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={async () => {
                        if (await onDelete(doc.id)) onClose();
                      }}
                    >
                      Sil
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => submit(false)} disabled={saving}>
                  Kaydet
                </Button>
                {isDraft && (
                  <Button size="sm" onClick={() => submit(true)} disabled={saving}>
                    {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    Onayla
                  </Button>
                )}
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
