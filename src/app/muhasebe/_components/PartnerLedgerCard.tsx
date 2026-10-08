'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { List, Plus, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { EntryKind, PartnerLedger, PartnerMovement } from '@/lib/accounting/partnerLedger';
import { DateField } from '@/app/belgeler/_components/DateField';
import { formatTL } from '@/lib/format';
import { Button } from '@/components/shadcn/button';
import { Badge } from '@/components/shadcn/badge';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/shadcn/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/dialog';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { Separator } from '@/components/shadcn/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/shadcn/sheet';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';

// Sunucudaki ENTRY_KINDS ile aynı anahtarlar; istemciye Prisma'yı taşımamak için ayrı.
const KIND_OPTIONS: { value: EntryKind; label: string }[] = [
  { value: 'transfer', label: 'Şirkete para gönderdim' },
  { value: 'expense', label: 'Şahsi kartla gider ödedim (panelde kaydı yok)' },
  { value: 'repayment', label: 'Şirket bana geri ödedi' },
];

const SOURCE_LABEL: Record<PartnerMovement['source'], string> = {
  order: 'Sipariş alışı',
  document: 'Belge',
  transfer: 'Para gönderimi',
  expense: 'Panel dışı gider',
  repayment: 'Geri ödeme',
};

const displayDate = (iso: string | null) => (iso ? iso.split('-').reverse().join('.') : '—');

/** "1.234,56", "1234,56" ve "1234.56" girişlerinin hepsini sayıya çevirir. */
function parseAmount(text: string): number {
  const t = text.trim().replace(/\s|₺/g, '');
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  // Yalnızca nokta varsa: sonunda 1-2 hane kalıyorsa ondalık, değilse binlik ayracı
  return /\.\d{1,2}$/.test(t) ? Number(t) : Number(t.replace(/\./g, ''));
}

const EMPTY_FORM = { kind: 'transfer' as EntryKind, date: format(new Date(), 'yyyy-MM-dd'), amount: '', description: '' };

/**
 * Muhasebe › Ortak cari hesabı (331): şirketin ortağa borcu. Bakiye seçili aydan bağımsız,
 * bugüne kadarki toplam; kambiyo zararı satırı seçili ayın (bakiyeye zaten dahil, karttan
 * çekilen TL ile faturanın TCMB kuruyla TL'si arasındaki fark).
 */
export function PartnerLedgerCard({
  fxLoss,
  fxLossLoading,
  monthLabel,
}: {
  fxLoss: { total: number; count: number };
  fxLossLoading: boolean;
  monthLabel: string;
}) {
  const [ledger, setLedger] = useState<PartnerLedger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/muhasebe/ortak-cari');
      const data = await res.json();
      if (!data.success) throw new Error(data.error_message || 'Ortak cari hesabı alınamadı.');
      setLedger(data.ledger);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountTry = parseAmount(form.amount);
    if (!form.date || !Number.isFinite(amountTry) || amountTry <= 0) {
      toast.error('Tarih ve sıfırdan büyük bir tutar girin.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/muhasebe/ortak-cari', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: form.kind, date: form.date, amountTry, description: form.description }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error_message || 'Hareket kaydedilemedi.');
      toast.success('Hareket eklendi');
      setAddOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: PartnerMovement) => {
    if (!confirm(`${displayDate(m.date)} tarihli ${formatTL(Math.abs(m.amountTry))} tutarındaki hareket silinsin mi?`)) return;
    setDeletingId(m.id);
    try {
      const res = await fetch(`/api/muhasebe/ortak-cari?id=${encodeURIComponent(m.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error_message || 'Hareket silinemedi.');
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const rows = ledger
    ? [
        { label: 'Kartla sipariş alışları', note: `${ledger.orders.count} sipariş`, amount: ledger.orders.total },
        { label: "Belgeler'deki giderler", note: `${ledger.documents.count} belge · Ozon hariç`, amount: ledger.documents.total },
        { label: 'Şirkete gönderilen para', note: null, amount: ledger.transfers },
        { label: 'Panel dışı giderler', note: null, amount: ledger.expenses },
        { label: 'Şirketin geri ödediği', note: null, amount: -ledger.repayments },
      ]
    : [];

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle>Ortak cari hesabı</CardTitle>
        <CardDescription>331 Ortaklara Borçlar · bugüne kadar</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus />
            Hareket ekle
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <div className="text-3xl font-bold tabular-nums">
            {ledger ? formatTL(ledger.balance) : <Skeleton className="h-9 w-40" />}
          </div>
          <p className="text-sm text-muted-foreground">Şirketin sana borcu</p>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
          {ledger && ledger.orders.missingTry > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {ledger.orders.missingTry} siparişin TL alış tutarı yok, toplama girmedi
            </p>
          )}
        </div>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <React.Fragment key={r.label}>
              {i > 0 && <Separator />}
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">
                  {r.label}
                  {r.note && <span className="ml-1 text-xs">({r.note})</span>}
                </span>
                <span className="font-medium tabular-nums">
                  {r.amount < 0 ? '−' : ''}
                  {formatTL(Math.abs(r.amount))}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="rounded-lg border p-3">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium">
              {fxLoss.total < 0 ? 'Kambiyo kârı' : 'Kambiyo zararı'}
              <span className="ml-1 text-xs font-normal text-muted-foreground">({monthLabel})</span>
            </span>
            <div className="font-medium tabular-nums">
              {fxLossLoading ? <Skeleton className="h-5 w-20" /> : formatTL(Math.abs(fxLoss.total))}
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {fxLoss.count} siparişte karttan çekilen TL ile faturanın TCMB kuruyla TL'si arasındaki fark · giderlere eklendi
          </p>
        </div>
      </CardContent>

      <CardFooter className="mt-auto flex-col items-stretch gap-3">
        <Button variant="ghost" size="sm" className="justify-start" onClick={() => setListOpen(true)} disabled={!ledger}>
          <List />
          Tüm hareketler
        </Button>
        <div className="flex gap-3 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
          <Wallet className="mt-0.5 size-4 shrink-0" />
          Ödeme kartı seçilmiş sipariş alışları buraya otomatik düşer. Sermaye 5.000.000 TL taahhüt, ödenmedi.
        </div>
      </CardFooter>

      {/* Hareket ekleme */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <form onSubmit={save} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Hareket ekle</DialogTitle>
              <DialogDescription>
                Sipariş alışları ve Belgeler'deki giderler otomatik gelir; onları burada tekrar girme.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="pl-kind">Tür</Label>
              <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as EntryKind }))}>
                <SelectTrigger id="pl-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="pl-date">Tarih</Label>
                <DateField id="pl-date" value={form.date} onChange={(date) => setForm((f) => ({ ...f, date }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pl-amount">Tutar (TL)</Label>
                <Input
                  id="pl-amount"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pl-desc">Açıklama</Label>
              <Input
                id="pl-desc"
                placeholder="Örn. Enpara'dan şirket hesabına havale"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tüm hareketler */}
      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="border-b p-6">
            <SheetTitle>Ortak cari hareketleri</SheetTitle>
            <SheetDescription>
              Bakiye {ledger ? formatTL(ledger.balance) : '…'} · yalnızca elle girilen hareketler silinebilir
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Tarih</TableHead>
                  <TableHead>Kaynak</TableHead>
                  <TableHead>Açıklama</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead className="w-10 pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ledger?.movements ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="pl-6 tabular-nums">{displayDate(m.date)}</TableCell>
                    <TableCell>
                      <Badge variant={m.manual ? 'secondary' : 'outline'}>{SOURCE_LABEL[m.source]}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-muted-foreground" title={m.description}>
                      {m.description}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.amountTry < 0 ? '−' : ''}
                      {formatTL(Math.abs(m.amountTry))}
                    </TableCell>
                    <TableCell className="pr-6">
                      {m.manual && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                          onClick={() => remove(m)}
                          disabled={deletingId === m.id}
                          aria-label="Hareketi sil"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {ledger && ledger.movements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Henüz hareket yok
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
