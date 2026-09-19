'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { OrderDocumentFields, OrderItem } from './types';

/** Sunucudaki sınırla aynı (Vercel istek gövdesi 4,5 MB). */
const MAX_BYTES = 4 * 1024 * 1024;
const ENDPOINT = '/api/siparisler/document';

export type OnDocumentChange = (postingNumber: string, fields: OrderDocumentFields) => void;

const EMPTY_FIELDS: OrderDocumentFields = {
  documentName: null,
  documentContentType: null,
  documentSize: null,
  documentUploadedAt: null,
};

async function readError(res: Response) {
  try {
    const data = await res.json();
    return data.error_message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function postDocument(postingNumber: string, file: File, onlyIfEmpty = false) {
  const form = new FormData();
  form.append('postingNumber', postingNumber);
  form.append('file', file);
  if (onlyIfEmpty) form.append('onlyIfEmpty', '1');
  const res = await fetch(ENDPOINT, { method: 'POST', body: form });
  return res;
}

/**
 * Siparişe yüklenen belge (fatura vb.). Dosya Vercel Blob'da, bilgisi veritabanında
 * tutulur; böylece her cihazdan aynı belge görünür. Tablo satırı ve detay paneli
 * aynı sipariş nesnesini okur, değişiklik `onChange` ile ikisine birden yansır.
 */
export function useOrderDocument(order: OrderItem | null | undefined, onChange: OnDocumentChange) {
  const [busy, setBusy] = useState(false);
  const postingNumber = order?.postingNumber;
  const docFile = order?.documentName ? { name: order.documentName } : null;

  const upload = useCallback(
    async (file: File) => {
      if (!postingNumber) return;
      if (file.size > MAX_BYTES) {
        toast.error('Dosya çok büyük', { description: 'En fazla 4 MB yüklenebilir.' });
        return;
      }
      setBusy(true);
      try {
        const res = await postDocument(postingNumber, file);
        if (!res.ok) throw new Error(await readError(res));
        const data = await res.json();
        onChange(postingNumber, {
          documentName: data.documentName,
          documentContentType: data.documentContentType,
          documentSize: data.documentSize,
          documentUploadedAt: data.documentUploadedAt,
        });
        toast.success('Belge kaydedildi', { description: file.name });
      } catch (err: any) {
        toast.error('Belge yüklenemedi', { description: err.message });
      } finally {
        setBusy(false);
      }
    },
    [postingNumber, onChange]
  );

  const remove = useCallback(async () => {
    if (!postingNumber) return;
    setBusy(true);
    try {
      const res = await fetch(`${ENDPOINT}?postingNumber=${encodeURIComponent(postingNumber)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await readError(res));
      onChange(postingNumber, EMPTY_FIELDS);
      toast.success('Belge silindi');
    } catch (err: any) {
      toast.error('Belge silinemedi', { description: err.message });
    } finally {
      setBusy(false);
    }
  }, [postingNumber, onChange]);

  const view = useCallback(() => {
    if (!postingNumber) return;
    window.open(`${ENDPOINT}?postingNumber=${encodeURIComponent(postingNumber)}`, '_blank', 'noopener');
  }, [postingNumber]);

  return { docFile, busy, upload, remove, view };
}

// ─── Tarayıcıda kalan eski belgelerin sunucuya taşınması ─────────────────────

const LEGACY_PREFIX = 'doc_';

/**
 * Belgeler eskiden yalnızca tarayıcının yerel deposunda (`doc_<gönderi no>`)
 * tutuluyordu. Sayfa açılınca bu kayıtlar bir kez sunucuya yüklenir; başarılı
 * olanlar yerelden silinir. Sunucuda zaten belgesi olan siparişin belgesi ezilmez,
 * o durumda ve diğer hatalarda yerel kopya yerinde bırakılır.
 */
export function useLegacyDocumentMigration(onChange: OnDocumentChange) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let keys: string[] = [];
    try {
      keys = Object.keys(localStorage).filter((k) => k.startsWith(LEGACY_PREFIX));
    } catch {
      return;
    }
    if (keys.length === 0) return;

    (async () => {
      let moved = 0;
      let kept = 0;
      for (const key of keys) {
        const postingNumber = key.slice(LEGACY_PREFIX.length);
        try {
          const raw = localStorage.getItem(key);
          const doc = raw ? (JSON.parse(raw) as { name?: string; dataUrl?: string }) : null;
          if (!doc?.dataUrl) {
            kept++;
            continue;
          }
          const blob = await (await fetch(doc.dataUrl)).blob();
          const file = new File([blob], doc.name || 'belge', { type: blob.type });
          const res = await postDocument(postingNumber, file, true);
          if (!res.ok) {
            kept++;
            continue;
          }
          const data = await res.json();
          localStorage.removeItem(key);
          onChange(postingNumber, {
            documentName: data.documentName,
            documentContentType: data.documentContentType,
            documentSize: data.documentSize,
            documentUploadedAt: data.documentUploadedAt,
          });
          moved++;
        } catch (err) {
          console.warn('Eski belge taşınamadı:', key, err);
          kept++;
        }
      }

      if (moved > 0) toast.success(`${moved} belge sunucuya taşındı`, { description: 'Artık her cihazdan görünür.' });
      if (kept > 0) {
        toast.warning(`${kept} belge taşınamadı`, {
          description: 'Tarayıcıda duruyor; siparişin zaten belgesi olabilir ya da sipariş bulunamadı.',
        });
      }
    })();
  }, [onChange]);
}
