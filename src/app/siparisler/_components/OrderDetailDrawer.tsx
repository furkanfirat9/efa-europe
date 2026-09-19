'use client';

import React from 'react';
import { ExternalLink, Eye, FileText, Loader2, Package, Trash2, Upload } from 'lucide-react';
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
import { Label } from '@/components/shadcn/label';
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
import { cn } from '@/lib/utils';
import { formatTL, formatUSD } from '@/lib/format';
import { OrderItem } from '../types';
import {
  formatDate,
  formatOrderUrlLabel,
  getCountdownUrgencyStyle,
  getOzonPostingUrl,
  getShipmentCountdown,
  isUrlString,
} from '../utils';
import { useOrderDocument, type OnDocumentChange } from '../useOrderDocument';
import { DOC_ACCEPT, isDocumentExpected } from './cells';
import { OrderStatusBadge } from './OrderStatusBadge';

interface OrderDetailDrawerProps {
  order: OrderItem | null;
  open: boolean;
  notes: string;
  onNotesChange: (notes: string) => void;
  saving: boolean;
  onSave: () => Promise<void>;
  onClose: () => void;
  onDocumentChange: OnDocumentChange;
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export const OrderDetailDrawer: React.FC<OrderDetailDrawerProps> = ({
  order,
  open,
  notes,
  onNotesChange,
  saving,
  onSave,
  onClose,
  onDocumentChange,
}) => {
  const { docFile, busy, upload, remove, view } = useOrderDocument(order, onDocumentChange);

  const countdown = React.useMemo(
    () => (order ? getShipmentCountdown(order.shipmentDate, order.status) : null),
    [order?.shipmentDate, order?.status]
  );

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = '';
  };

  const supplierOrderHref = order?.supplierOrderId?.trim()
    ? /^https?:\/\//i.test(order.supplierOrderId.trim())
      ? order.supplierOrderId.trim()
      : `https://${order.supplierOrderId.trim()}`
    : '';

  return (
    <Sheet open={open && !!order} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {order && (
          <>
            <SheetHeader className="border-b p-6">
              <div className="flex flex-wrap items-center gap-2 pr-6">
                <SheetTitle>Sipariş detayı</SheetTitle>
                <OrderStatusBadge status={order.status} statusName={order.statusName} />
                {countdown && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold select-none',
                      getCountdownUrgencyStyle(countdown.daysLeft, countdown.isExpired)
                    )}
                    title={`Son sevkiyat (6 gün ek süreyle): ${countdown.deadlineFormatted}`}
                  >
                    {countdown.label}
                  </span>
                )}
              </div>
              <SheetDescription className="flex items-center gap-1.5 font-mono text-xs">
                {order.postingNumber}
                <a
                  href={getOzonPostingUrl(order.postingNumber, order.status)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Ozon'da görüntüle"
                  className="hover:text-foreground"
                >
                  <ExternalLink className="size-3" />
                </a>
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Ürün */}
              <div className="flex items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                  {order.productImage ? (
                    <img src={order.productImage} alt={order.productTitle || 'Ürün'} className="size-full object-contain p-1" />
                  ) : (
                    <Package className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{order.productOfferId || '—'}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground" title={order.productTitle || undefined}>
                    {order.productTitle || '—'}
                  </p>
                </div>
              </div>

              <Separator />

              <Section title="Müşteri ve teslimat" action={<span className="text-sm text-muted-foreground">{formatDate(order.inProcessAt)}</span>}>
                <dl className="space-y-2">
                  <Row label="Alıcı">{order.customerName || '—'}</Row>
                  <Row label="Teslimat şehri">{order.customerCity || '—'}</Row>
                  {order.shipmentDate && (
                    <Row label="Son sevk (6 gün ek süre)">
                      <span className="text-destructive">
                        {countdown ? `${countdown.deadlineFormatted} (${countdown.label})` : formatDate(order.shipmentDate)}
                      </span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        Ozon sevk tarihi {formatDate(order.shipmentDate)} + 6 gün
                      </span>
                    </Row>
                  )}
                </dl>
                {order.customerAddressTail && (
                  <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">{order.customerAddressTail}</p>
                )}
              </Section>

              <Separator />

              <Section title="Tedarik ve takip">
                <dl className="space-y-2">
                  <Row label="Tedarikçi">{order.supplier || '—'}</Row>
                  <Row label="Sipariş / takip no">
                    {isUrlString(order.supplierOrderId) ? (
                      <Badge asChild variant="secondary" className="gap-1">
                        <a href={supplierOrderHref} target="_blank" rel="noreferrer" title={order.supplierOrderId || undefined}>
                          {formatOrderUrlLabel(order.supplierOrderId || '')}
                          <ExternalLink />
                        </a>
                      </Badge>
                    ) : (
                      order.supplierOrderId || '—'
                    )}
                  </Row>
                  <Row label="Ödeme kartı">{order.paymentCard || '—'}</Row>
                </dl>
              </Section>

              <Separator />

              <Section
                title="Belge / fatura"
                action={
                  busy ? (
                    <Badge variant="outline" className="gap-1">
                      <Loader2 className="animate-spin" />
                      İşleniyor
                    </Badge>
                  ) : docFile ? (
                    <Badge variant="secondary">Kayıtlı</Badge>
                  ) : isDocumentExpected(order) ? (
                    <Badge
                      variant="outline"
                      className="border-status-warning-text bg-status-warning-bg text-status-warning-text"
                    >
                      Belge bekleniyor
                    </Badge>
                  ) : (
                    <Badge variant="outline">Belge yok</Badge>
                  )
                }
              >
                {docFile ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium" title={docFile.name}>
                          {docFile.name}
                        </span>
                      </div>
                      <Button size="sm" onClick={view}>
                        <Eye />
                        Görüntüle
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Button variant="ghost" size="sm" asChild>
                        <label className="cursor-pointer">
                          <Upload />
                          Farklı belge yükle
                          <input type="file" className="hidden" accept={DOC_ACCEPT} onChange={handleUpload} />
                        </label>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 />
                            Belgeyi sil
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Belge silinsin mi?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Bu siparişe yüklenen “{docFile.name}” kaldırılır. Bu işlem geri alınamaz.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                            <AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">
                              Sil
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-md border border-dashed p-5 text-center transition-colors hover:bg-muted/50">
                    <Upload className="size-5 text-muted-foreground" />
                    <span className="text-sm font-medium">Fatura veya belge yükle</span>
                    <span className="text-xs text-muted-foreground">PDF, PNG, JPG veya Office belgeleri</span>
                    <input type="file" className="hidden" accept={DOC_ACCEPT} onChange={handleUpload} />
                  </label>
                )}
              </Section>

              <Separator />

              <Section title="Finansal özet">
                <dl className="space-y-2">
                  <Row label="Ozon satış tutarı">
                    <span className="tabular-nums">{formatUSD(order.salePrice)}</span>
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      (~{formatTL((order.salePrice || 0) * 48.35)})
                    </span>
                  </Row>
                  <Row label="Tedarik alış maliyeti">
                    <span className="tabular-nums">
                      {order.buyPrice !== null && order.buyPrice !== undefined ? formatTL(order.buyPrice) : 'Henüz girilmedi'}
                    </span>
                  </Row>
                  <Row label="Ozon komisyonu (%5)">
                    <span className="tabular-nums">− {formatUSD((order.salePrice || 0) * 0.05)}</span>
                  </Row>
                </dl>
                <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
                  <span className="text-sm font-medium">Tahmini net kâr</span>
                  <span
                    className={cn(
                      'text-base font-semibold tabular-nums',
                      (order.netProfitTry || 0) < 0 && 'text-destructive'
                    )}
                  >
                    {order.netProfitTry ? formatTL(order.netProfitTry) : '—'}
                  </span>
                </div>
              </Section>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="order-notes">Sipariş notu</Label>
                <Textarea
                  id="order-notes"
                  rows={3}
                  placeholder="Örn: Allegro DPD ile Polonya deposuna gönderildi…"
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                />
              </div>
            </div>

            <SheetFooter className="flex-row justify-end border-t p-4">
              <Button variant="outline" onClick={onClose}>
                Kapat
              </Button>
              <Button disabled={saving} onClick={onSave}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
