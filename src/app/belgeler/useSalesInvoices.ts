'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { SalesInvoiceDto } from '@/lib/sales-invoices/service';
import type { UploadItem } from './useDocuments';
import { MONTHS } from './utils';

export type SalesInvoiceItem = SalesInvoiceDto;

const isInMonth = (inv: SalesInvoiceItem, year: number, month: number) =>
  inv.issueDate.startsWith(`${year}-${String(month).padStart(2, '0')}`);

const byDateDesc = (a: SalesInvoiceItem, b: SalesInvoiceItem) =>
  b.issueDate.localeCompare(a.issueDate) || b.invoiceNo.localeCompare(a.invoiceNo);

/** Satış faturaları sekmesi. Ay seçimi Belgeler sayfasının üstündeki seçicilerden gelir. */
export function useSalesInvoices(year: number, month: number) {
  const [invoices, setInvoices] = useState<SalesInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  // Hızlı ay değişiminde geç gelen eski yanıt yeni ayın verisini ezmesin.
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/belgeler/satis?year=${year}&month=${month}`, { signal: controller.signal });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error_message || 'Satış faturaları alınamadı.');
      setInvoices(data.invoices);
      setError(null);
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
    return () => requestRef.current?.abort();
  }, [load]);

  /** Dosyalar sırayla yüklenir; başka aya düşen faturalar bildirimle söylenir. */
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const items: UploadItem[] = files.map((file, i) => ({
        key: `${Date.now()}-${i}-${file.name}`,
        name: file.name,
        state: 'waiting',
      }));
      setUploads((prev) => [...prev, ...items]);

      for (let i = 0; i < files.length; i++) {
        const { key } = items[i];
        setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, state: 'reading' } : u)));
        try {
          const form = new FormData();
          form.append('file', files[i]);
          const res = await fetch('/api/belgeler/satis', { method: 'POST', body: form });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error_message || 'Fatura yüklenemedi.');

          const saved: SalesInvoiceItem[] = data.invoices;
          const here = saved.filter((inv) => isInMonth(inv, year, month));
          setInvoices((prev) => [...here, ...prev].sort(byDateDesc));
          setUploads((prev) => prev.filter((u) => u.key !== key));

          for (const inv of saved.filter((inv) => !isInMonth(inv, year, month))) {
            const [y, m] = inv.issueDate.split('-').map(Number);
            toast.success(`${inv.invoiceNo} kaydedildi (${MONTHS[m - 1]} ${y} ayında)`);
          }
          if (here.length) toast.success(here.length === 1 ? `${here[0].invoiceNo} kaydedildi` : `${here.length} fatura kaydedildi`);
          for (const s of data.skipped ?? []) toast.warning(`${s.invoiceNo}: ${s.reason}`);
        } catch (err: any) {
          setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, state: 'error', error: err.message } : u)));
        }
      }
    },
    [year, month]
  );

  const dismissUpload = useCallback((key: string) => {
    setUploads((prev) => prev.filter((u) => u.key !== key));
  }, []);

  const replace = (inv: SalesInvoiceItem) => setInvoices((prev) => prev.map((d) => (d.id === inv.id ? inv : d)));

  /** Siparişi elle bağlar; null bağlantıyı kaldırır. */
  const setPosting = useCallback(async (id: string, postingNumber: string | null): Promise<boolean> => {
    try {
      const res = await fetch(`/api/belgeler/satis/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postingNumber }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error_message || 'Sipariş bağlanamadı.');
      replace(data.invoice);
      toast.success(postingNumber ? `${postingNumber} bağlandı` : 'Sipariş bağlantısı kaldırıldı');
      return true;
    } catch (err: any) {
      toast.error(err.message);
      return false;
    }
  }, []);

  const attachPdf = useCallback(async (id: string, file: File): Promise<boolean> => {
    setPdfBusy(id);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/belgeler/satis/${id}/pdf`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error_message || 'PDF eklenemedi.');
      replace(data.invoice);
      toast.success('PDF eklendi');
      return true;
    } catch (err: any) {
      toast.error(err.message);
      return false;
    } finally {
      setPdfBusy(null);
    }
  }, []);

  const removePdf = useCallback(async (id: string): Promise<boolean> => {
    setPdfBusy(id);
    try {
      const res = await fetch(`/api/belgeler/satis/${id}/pdf`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error_message || 'PDF kaldırılamadı.');
      replace(data.invoice);
      toast.success('PDF kaldırıldı');
      return true;
    } catch (err: any) {
      toast.error(err.message);
      return false;
    } finally {
      setPdfBusy(null);
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/belgeler/satis/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error_message || 'Fatura silinemedi.');
      setInvoices((prev) => prev.filter((d) => d.id !== id));
      toast.success('Fatura silindi');
      return true;
    } catch (err: any) {
      toast.error(err.message);
      return false;
    }
  }, []);

  const selected = invoices.find((d) => d.id === selectedId) ?? null;

  return {
    invoices,
    loading,
    error,
    setError,
    uploads,
    uploadFiles,
    dismissUpload,
    selected,
    setSelectedId,
    pdfBusy,
    setPosting,
    attachPdf,
    removePdf,
    remove,
  };
}
