'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MONTHS, type DocumentItem } from './utils';

export interface UploadItem {
  key: string;
  name: string;
  state: 'waiting' | 'reading' | 'error';
  error?: string;
}

export type DocumentPatch = Partial<
  Pick<
    DocumentItem,
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
    | 'notes'
  >
>;

const isInMonth = (doc: DocumentItem, year: number, month: number) =>
  !!doc.documentDate && doc.documentDate.startsWith(`${year}-${String(month).padStart(2, '0')}`);

export function useDocuments() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [pending, setPending] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Hızlı ay değişiminde geç gelen eski yanıt yeni ayın verisini ezmesin.
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/belgeler?year=${year}&month=${month}`, { signal: controller.signal });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error_message || 'Belgeler alınamadı.');
      setDocuments(data.documents);
      setPending(data.pending);
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

  /** Dosyalar sırayla okunur; ilk başarılı taslak onay ekranında açılır. */
  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const items: UploadItem[] = files.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      name: file.name,
      state: 'waiting',
    }));
    setUploads((prev) => [...prev, ...items]);

    let opened = false;
    for (let i = 0; i < files.length; i++) {
      const { key } = items[i];
      setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, state: 'reading' } : u)));
      try {
        const form = new FormData();
        form.append('file', files[i]);
        const res = await fetch('/api/belgeler', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error_message || 'Belge yüklenemedi.');

        const doc: DocumentItem = data.document;
        setPending((prev) => [doc, ...prev]);
        setUploads((prev) => prev.filter((u) => u.key !== key));
        if (!opened) {
          setSelectedId(doc.id);
          opened = true;
        }
      } catch (err: any) {
        setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, state: 'error', error: err.message } : u)));
      }
    }
  }, []);

  const dismissUpload = useCallback((key: string) => {
    setUploads((prev) => prev.filter((u) => u.key !== key));
  }, []);

  const save = useCallback(
    async (id: string, patch: DocumentPatch, confirm = false): Promise<boolean> => {
      setSaving(true);
      try {
        const res = await fetch(`/api/belgeler/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...patch, confirm }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error_message || 'Belge kaydedilemedi.');

        const doc: DocumentItem = data.document;
        if (doc.status === 'draft') {
          setPending((prev) => prev.map((d) => (d.id === id ? doc : d)));
        } else {
          setPending((prev) => prev.filter((d) => d.id !== id));
          setDocuments((prev) => {
            const rest = prev.filter((d) => d.id !== id);
            if (!isInMonth(doc, year, month)) return rest;
            return [doc, ...rest].sort((a, b) => (b.documentDate ?? '').localeCompare(a.documentDate ?? ''));
          });
        }

        if (confirm) {
          const [y, m] = (doc.documentDate ?? '').split('-').map(Number);
          toast.success(
            isInMonth(doc, year, month)
              ? 'Belge onaylandı'
              : `Belge onaylandı ve ${MONTHS[m - 1]} ${y} ayına kaydedildi`
          );
        } else {
          toast.success('Değişiklikler kaydedildi');
        }
        return true;
      } catch (err: any) {
        toast.error(err.message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [year, month]
  );

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/belgeler/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error_message || 'Belge silinemedi.');
      setPending((prev) => prev.filter((d) => d.id !== id));
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      toast.success('Belge silindi');
      return true;
    } catch (err: any) {
      toast.error(err.message);
      return false;
    }
  }, []);

  const selected = [...pending, ...documents].find((d) => d.id === selectedId) ?? null;

  return {
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
  };
}
