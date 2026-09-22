'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Download, ExternalLink, FileText, Loader2, Paperclip, Trash2 } from 'lucide-react';
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
import { Separator } from '@/components/shadcn/separator';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/shadcn/sheet';
import { formatTL } from '@/lib/format';
import type { SalesInvoiceItem } from '../useSalesInvoices';
import { formatAmount, formatIsoDate, formatRate, invoiceTypeLabel, signedTry } from '../utils';
import { PickPostingButton, PostingPicker } from './PostingPicker';

/**
 * Faturanın tamamını "Yol › Alan: değer" satırlarına açar. Tutar ve kimlik gibi
 * alanların nitelikleri (para birimi, şema) değerin yanına yazılır.
 */
function flatten(value: unknown, path: string[] = [], out: { key: string; value: string }[] = []) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((item, i) => flatten(item, value.length > 1 ? [...path, `${i + 1}`] : path, out));
    return out;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const attrs = Object.entries(obj).filter(([k]) => k.startsWith('@_'));
    const children = Object.entries(obj).filter(([k]) => !k.startsWith('@_') && k !== '#text');
    if ('#text' in obj || (attrs.length && !children.length)) {
      const text = obj['#text'] == null ? '' : String(obj['#text']);
      const extra = attrs.map(([, v]) => String(v)).join(', ');
      out.push({ key: path.join(' › '), value: [text, extra && `(${extra})`].filter(Boolean).join(' ') });
    }
    for (const [k, v] of children) flatten(v, [...path, k], out);
    return out;
  }
  const text = String(value).trim();
  if (text) out.push({ key: path.join(' › '), value: text });
  return out;
}

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={mono ? 'break-all text-right font-mono text-xs' : 'text-right'}>{children}</span>
    </div>
  );
}

export function SalesInvoiceSheet({
  invoice: current,
  open,
  pdfBusy,
  onClose,
  onAttachPdf,
  onRemovePdf,
  onSetPosting,
  onDelete,
}: {
  invoice: SalesInvoiceItem | null;
  open: boolean;
  pdfBusy: boolean;
  onClose: () => void;
  onAttachPdf: (id: string, file: File) => void;
  onRemovePdf: (id: string) => void;
  onSetPosting: (id: string, postingNumber: string | null) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  // Panel kapanırken seçim hemen boşalır; kapanma animasyonu boyunca son fatura gösterilir.
  const [inv, setInv] = useState<SalesInvoiceItem | null>(current);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (current) setInv(current);
  }, [current]);

  const allFields = useMemo(() => (inv ? flatten(inv.data) : []), [inv]);

  return (
    <Sheet open={open && !!current} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 outline-none sm:max-w-xl">
        {inv && (
          <>
            <SheetHeader className="border-b p-6">
              <div className="flex flex-wrap items-center gap-2 pr-6">
                <SheetTitle>Satış faturası</SheetTitle>
                <Badge variant={inv.typeCode === 'IADE' ? 'destructive' : 'secondary'}>
                  {invoiceTypeLabel(inv.typeCode)}
                </Badge>
              </div>
              <SheetDescription className="flex items-center gap-1.5">
                <span className="font-mono">{inv.invoiceNo}</span>
                <span>·</span>
                <a
                  href={`/api/belgeler/satis/${inv.id}/file`}
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                  title={inv.fileName}
                >
                  Orijinal dosyayı indir
                  <Download className="size-3" />
                </a>
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <section>
                <Row label="Tarih">
                  {formatIsoDate(inv.issueDate)}
                  {inv.issueTime && <span className="text-muted-foreground"> {inv.issueTime.slice(0, 5)}</span>}
                </Row>
                <Row label="Müşteri">{inv.customerName ?? '—'}</Row>
                <Row label="Ülke / şehir">{[inv.customerCountry, inv.customerCity].filter(Boolean).join(' · ') || '—'}</Row>
                <Row label="Gönderi no">
                  {inv.postingNumber ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      <a
                        href={`/siparisler?search=${encodeURIComponent(inv.postingNumber)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs underline-offset-4 hover:underline"
                      >
                        {inv.postingNumber}
                        <ExternalLink className="size-3" />
                      </a>
                      {inv.postingFromInvoice ? (
                        <span className="text-xs text-muted-foreground">faturada yazıyor</span>
                      ) : (
                        <>
                          <PostingPicker
                            endpoint={`/api/belgeler/satis/${inv.id}/siparisler`}
                            onSelect={(posting) => onSetPosting(inv.id, posting)}
                            align="end"
                          >
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                              Değiştir
                            </Button>
                          </PostingPicker>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onSetPosting(inv.id, null)}
                          >
                            Kaldır
                          </Button>
                        </>
                      )}
                    </span>
                  ) : (
                    <PickPostingButton endpoint={`/api/belgeler/satis/${inv.id}/siparisler`} onSelect={(posting) => onSetPosting(inv.id, posting)} />
                  )}
                </Row>
                <Row label="ETTN" mono>
                  {inv.uuid}
                </Row>
                <Row label="Profil">{inv.profile ?? '—'}</Row>
              </section>

              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <Row label="Toplam">
                  <span className="font-semibold tabular-nums">{formatAmount(inv.totalAmount, inv.currency)}</span>
                </Row>
                <Row label="KDV hariç">
                  <span className="tabular-nums">{formatAmount(inv.taxExclusive, inv.currency)}</span>
                </Row>
                <Row label="KDV">
                  <span className="tabular-nums">{formatAmount(inv.taxAmount, inv.currency)}</span>
                </Row>
                {!!inv.allowanceTotal && (
                  <Row label="İskonto">
                    <span className="tabular-nums">{formatAmount(inv.allowanceTotal, inv.currency)}</span>
                  </Row>
                )}
                {inv.exemptionCode && (
                  <Row label="İstisna">
                    {inv.exemptionCode} – {inv.exemptionReason ?? ''}
                  </Row>
                )}
                <Separator className="my-2" />
                <Row label="TL karşılığı">
                  <span className="text-base font-semibold tabular-nums">
                    {inv.totalTry == null ? '—' : formatTL(signedTry(inv))}
                  </span>
                </Row>
                <p className="text-right text-xs text-muted-foreground">
                  {inv.currency === 'TRY'
                    ? 'Fatura TL'
                    : inv.fxRate == null
                      ? 'Kur bulunamadı'
                      : `1 ${inv.currency} = ${formatRate(inv.fxRate)} ₺ · ${inv.fxSource === 'Fatura' ? 'faturadaki kur' : inv.fxSource}`}
                </p>
              </div>

              {inv.notes.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Notlar</h3>
                  <ul className="space-y-1 rounded-md border p-3 text-sm">
                    {inv.notes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Kalemler</h3>
                <ul className="divide-y rounded-md border text-sm">
                  {inv.lines.map((line) => (
                    <li key={line.id} className="flex items-start gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-3">{line.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[
                            line.quantity != null && `${line.quantity} adet`,
                            line.unitPrice != null && `birim ${formatAmount(line.unitPrice, inv.currency)}`,
                            line.taxPercent != null && `KDV %${line.taxPercent}`,
                            line.gtip && `GTİP ${line.gtip}`,
                            line.originCountry && `menşe ${line.originCountry}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums">{formatAmount(line.amount, inv.currency)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">PDF</h3>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onAttachPdf(inv.id, file);
                    e.target.value = '';
                  }}
                />
                <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
                  {inv.hasPdf ? (
                    <>
                      <a
                        href={`/api/belgeler/satis/${inv.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-w-0 flex-1 items-center gap-1.5 font-medium underline-offset-4 hover:underline"
                      >
                        <FileText className="size-4 shrink-0" />
                        <span className="truncate">{inv.pdfName ?? 'PDF'}</span>
                      </a>
                      <Button variant="outline" size="sm" onClick={() => pdfInputRef.current?.click()} disabled={pdfBusy}>
                        Değiştir
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onRemovePdf(inv.id)} disabled={pdfBusy}>
                        Kaldır
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-muted-foreground">PDF eklenmemiş.</span>
                      <Button variant="outline" size="sm" onClick={() => pdfInputRef.current?.click()} disabled={pdfBusy}>
                        {pdfBusy ? <Loader2 className="animate-spin" /> : <Paperclip />}
                        PDF ekle
                      </Button>
                    </>
                  )}
                </div>
              </section>

              <details className="group rounded-md border">
                <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                  Faturadaki tüm bilgiler
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{allFields.length} alan</span>
                </summary>
                <dl className="divide-y border-t text-xs">
                  {allFields.map((f, i) => (
                    <div key={i} className="grid grid-cols-5 gap-2 px-3 py-1.5">
                      <dt className="col-span-2 break-words text-muted-foreground">{f.key}</dt>
                      <dd className="col-span-3 break-words">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </div>

            <SheetFooter className="flex-row items-center gap-2 border-t p-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 />
                    Sil
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Fatura silinsin mi?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {inv.invoiceNo} ve yüklenen dosyaları kalıcı olarak silinir. Bu işlem geri alınamaz.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={async () => {
                        if (await onDelete(inv.id)) onClose();
                      }}
                    >
                      Sil
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="outline" size="sm" className="ml-auto" onClick={onClose}>
                Kapat
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
