'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, FileText, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/shadcn/alert';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
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
import { Progress } from '@/components/shadcn/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { formatTL } from '@/lib/format';
import { DateField } from './DateField';
import { formatAmount, formatIsoDate, formatRate } from '../utils';

interface Payout {
  id: string;
  // Ozon raporu henüz gelmemişse (ay kapanmadı) boş
  ozonDocNo: string | null;
  paidAt: string | null;
  amountRub: number | null;
  receivedTry: number | null;
  receivedAt: string | null;
  bankReference: string | null;
  hasReceipt: boolean;
  receiptName: string | null;
}

interface Balance {
  rub: number;
  usd: number | null;
  usdRate: number | null;
  periodEnd: string | null;
}

/** "Rep.20260901" → "1–15 Eyl" gibi okunur dönem; tanınmazsa olduğu gibi. */
function periodLabel(ref: string | null): string {
  const m = ref?.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return ref || '—';
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d === 1 ? `1–15 ${months[mo - 1]}` : `${d}–${lastDay} ${months[mo - 1]}`;
}

/** "1.234,56", "1234,56" ve "1234.56" girişlerinin hepsini sayıya çevirir. */
function parseAmount(text: string): number {
  const t = text.trim().replace(/\s|₺|TL/gi, '');
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  return /\.\d{1,2}$/.test(t) ? Number(t) : Number(t.replace(/\./g, ''));
}

// Ozon raporu henüz gelmemiş ödemenin dekontu yeni satır olarak açılır.
const NEW_PAYOUT = 'yeni';

const EMPTY_FORM = { payoutId: '', amount: '', date: '', reference: '' };

export function OzonPayoutsTab() {
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [thresholdUsd, setThresholdUsd] = useState(1000);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (force = false) => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/belgeler/ozon-odemeleri${force ? '?yenile=1' : ''}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error_message || 'Ozon ödemeleri alınamadı.');
      setPayouts(data.payouts);
      setBalance(data.balance);
      setThresholdUsd(data.thresholdUsd);
      setWarning(data.warning);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDialog = (payoutId = '') => {
    setForm({ ...EMPTY_FORM, payoutId });
    setFile(null);
    setDialogOpen(true);
  };

  // Seçilen dekontu okut; bulunan alanlar boş olanları doldurur.
  const pickFile = async (picked: File | null) => {
    setFile(picked);
    if (!picked) return;
    setReading(true);
    try {
      const body = new FormData();
      body.append('file', picked);
      const res = await fetch('/api/belgeler/ozon-odemeleri/dekont', { method: 'POST', body });
      const data = await res.json();
      if (!data.success) throw new Error(data.error_message || 'Dekont okunamadı.');
      const p = data.parsed;
      setForm((f) => ({
        payoutId: f.payoutId || data.suggestedPayoutId || NEW_PAYOUT,
        amount: p.receivedTry != null ? String(p.receivedTry).replace('.', ',') : f.amount,
        date: p.receivedAt || f.date,
        reference: p.bankReference || f.reference,
      }));
      if (!data.readable) toast.info('Dekont okunamadı; tutarı ve tarihi elle girin.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setReading(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (!form.payoutId) return toast.error('Dekontun ait olduğu Ozon ödemesini seçin.');
    const isNew = form.payoutId === NEW_PAYOUT;
    if (!Number.isFinite(amount) || amount <= 0 || !form.date) return toast.error('Gelen TL tutarı ve tarihi girin.');

    setSaving(true);
    try {
      const body = new FormData();
      body.append('receivedTry', String(amount));
      body.append('receivedAt', form.date);
      body.append('bankReference', form.reference);
      if (file) body.append('file', file);
      const res = await fetch(isNew ? '/api/belgeler/ozon-odemeleri' : `/api/belgeler/ozon-odemeleri/${form.payoutId}`, {
        method: isNew ? 'POST' : 'PUT',
        body,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error_message || 'Dekont kaydedilemedi.');
      toast.success('Dekont kaydedildi');
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeReceipt = async (p: Payout) => {
    const question = p.ozonDocNo
      ? `${formatIsoDate(p.paidAt)} tarihli ödemenin dekontu ve TL bilgisi kaldırılsın mı?`
      : `${formatIsoDate(p.receivedAt)} tarihli dekont silinsin mi?`;
    if (!confirm(question)) return;
    const res = await fetch(`/api/belgeler/ozon-odemeleri/${p.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) return toast.error(data.error_message || 'Dekont kaldırılamadı.');
    await load();
  };

  const year = new Date().getFullYear();
  const thisYear = (payouts ?? []).filter((p) => p.receivedAt?.startsWith(String(year)));
  const yearTry = thisYear.reduce((acc, p) => acc + (p.receivedTry ?? 0), 0);
  const missingReceipt = (payouts ?? []).filter((p) => p.receivedTry == null).length;
  const waitingOzon = (payouts ?? []).filter((p) => !p.ozonDocNo).length;
  const progress = balance?.usd != null ? Math.min(100, Math.max(0, (balance.usd / thresholdUsd) * 100)) : 0;
  // Dekont bağlanabilecek satırlar: Ozon'da görünen ama dekontu olmayan ödemeler
  const openPayouts = (payouts ?? []).filter((p) => p.ozonDocNo && (p.receivedTry == null || p.id === form.payoutId));

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {warning && (
        <Alert>
          <AlertCircle />
          <AlertDescription>Ozon'a ulaşılamadı, kayıtlı veriler gösteriliyor: {warning}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-3">
          <CardHeader>
            <CardDescription className="font-medium text-foreground">Ozon'da bekleyen bakiye</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">
                {balance ? formatAmount(balance.rub, 'RUB') : <Skeleton className="h-8 w-32" />}
              </span>
              {balance?.usd != null && (
                <span className="text-sm text-muted-foreground tabular-nums">≈ {formatAmount(balance.usd, 'USD')}</span>
              )}
            </div>
            <Progress value={progress} aria-label="Ödeme sınırına ilerleme" />
            <p className="text-xs text-muted-foreground">
              Ozon bakiye {formatAmount(thresholdUsd, 'USD')} olunca öder
              {balance?.usd != null && balance.usd < thresholdUsd
                ? ` · sınıra ≈ ${formatAmount(thresholdUsd - balance.usd, 'USD')} kaldı`
                : ''}
              {balance?.periodEnd ? ` · ${formatIsoDate(balance.periodEnd)} dönem sonu` : ''}. Yıl sonunda kalan
              bakiye, %95 istisnası için kurumlar vergisi beyannamesine kadar Türkiye'ye gelmeli.
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardDescription className="font-medium text-foreground">{year}'de Türkiye'ye gelen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold tabular-nums">
              {payouts ? formatTL(yearTry) : <Skeleton className="h-8 w-32" />}
            </div>
            <p className="text-xs text-muted-foreground">
              {thisYear.length} ödeme · dekontlarla, %95 istisna şartının kanıtı
              {missingReceipt > 0 ? ` · ${missingReceipt} ödemenin dekontu yok` : ''}
              {waitingOzon > 0 ? ` · ${waitingOzon} dekont Ozon'un ay sonu raporunu bekliyor` : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ödemeler</CardTitle>
          <CardDescription>Ozon'un mutabakat raporundaki ödemeler ve bankaya gelen TL karşılıkları</CardDescription>
          <CardAction className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => load(true)} disabled={refreshing} aria-label="Ozon'dan yenile">
              <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            </Button>
            <Button onClick={() => openDialog()}>
              <Upload />
              Dekont yükle
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ozon ödeme tarihi</TableHead>
                <TableHead className="text-right">Ozon (₽)</TableHead>
                <TableHead className="text-right">Gelen (TL)</TableHead>
                <TableHead>Geliş tarihi</TableHead>
                <TableHead className="text-right">Kur TL/₽</TableHead>
                <TableHead>Dönem</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!payouts &&
                Array.from({ length: 2 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {payouts?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="tabular-nums">{formatIsoDate(p.paidAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.amountRub != null ? formatAmount(p.amountRub) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.receivedTry != null ? formatTL(p.receivedTry) : '—'}</TableCell>
                  <TableCell className="tabular-nums">{formatIsoDate(p.receivedAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.receivedTry != null && p.amountRub ? formatRate(p.receivedTry / p.amountRub) : '—'}
                  </TableCell>
                  <TableCell>{periodLabel(p.bankReference)}</TableCell>
                  <TableCell>
                    {!p.ozonDocNo ? (
                      <Badge variant="outline">Ozon raporu bekleniyor</Badge>
                    ) : p.receivedTry != null ? (
                      <Badge variant="secondary">Eşleşti</Badge>
                    ) : (
                      <Badge variant="outline">Dekont yok</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {p.hasReceipt && (
                        <Button variant="ghost" size="icon" className="size-7" asChild aria-label="Dekontu aç">
                          <a href={`/api/belgeler/ozon-odemeleri/${p.id}/dekont`} target="_blank" rel="noreferrer">
                            <FileText />
                          </a>
                        </Button>
                      )}
                      {p.receivedTry == null ? (
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => openDialog(p.id)} aria-label="Dekont ekle">
                          <Upload />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                          onClick={() => removeReceipt(p)}
                          aria-label="Dekontu kaldır"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {payouts && payouts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Ozon henüz ödeme yapmadı
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={save} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Dekont yükle</DialogTitle>
              <DialogDescription>
                PDF dekont okunur ve alanlar doldurulur; görselde alanları elle girin. Ozon bir ayın ödemelerini ay
                kapanınca raporladığı için bu ayın ödemesi listede yoksa yeni satır açılır, rapor gelince birleşir.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor="op-file">Dekont</Label>
              <input
                ref={fileInput}
                id="op-file"
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" className="justify-start font-normal" onClick={() => fileInput.current?.click()}>
                {reading ? <Loader2 className="animate-spin" /> : <Upload />}
                {file ? file.name : 'Dosya seç'}
              </Button>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="op-payout">Ozon ödemesi</Label>
              <Select value={form.payoutId} onValueChange={(v) => setForm((f) => ({ ...f, payoutId: v }))}>
                <SelectTrigger id="op-payout" className="w-full">
                  <SelectValue placeholder="Ödeme seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_PAYOUT}>Ozon'da henüz görünmüyor (bu ayın ödemesi)</SelectItem>
                  {openPayouts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {formatIsoDate(p.paidAt)} · {formatAmount(p.amountRub ?? 0, 'RUB')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="op-amount">Gelen tutar (TL)</Label>
                <Input
                  id="op-amount"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="op-date">Geliş tarihi (valör)</Label>
                <DateField id="op-date" value={form.date} onChange={(date) => setForm((f) => ({ ...f, date }))} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="op-ref">Dönem referansı</Label>
              <Input
                id="op-ref"
                placeholder="Rep.20260901"
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={saving || reading}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
