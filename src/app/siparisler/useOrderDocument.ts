'use client';

import { useCallback, useEffect, useState } from 'react';

export interface OrderDocument {
  name: string;
  dataUrl: string;
}

const storageKey = (postingNumber: string) => `doc_${postingNumber}`;

/**
 * Siparişe yüklenen belge (fatura vb.) tarayıcının yerel deposunda tutulur.
 * Tablo satırı ve detay paneli aynı belgeyi `order_doc_updated` olayıyla senkron izler.
 */
export function useOrderDocument(postingNumber: string | undefined) {
  const [docFile, setDocFile] = useState<OrderDocument | null>(null);

  useEffect(() => {
    if (!postingNumber) {
      setDocFile(null);
      return;
    }

    const loadDoc = () => {
      try {
        const saved = localStorage.getItem(storageKey(postingNumber));
        setDocFile(saved ? JSON.parse(saved) : null);
      } catch {
        setDocFile(null);
      }
    };

    loadDoc();

    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ postingNumber: string }>;
      if (!customEvent.detail || customEvent.detail.postingNumber === postingNumber) {
        loadDoc();
      }
    };

    window.addEventListener('order_doc_updated', handleSync);
    return () => window.removeEventListener('order_doc_updated', handleSync);
  }, [postingNumber]);

  const notify = useCallback(() => {
    window.dispatchEvent(new CustomEvent('order_doc_updated', { detail: { postingNumber } }));
  }, [postingNumber]);

  const upload = useCallback(
    (file: File) => {
      if (!postingNumber) return;
      const reader = new FileReader();
      reader.onload = () => {
        const doc = { name: file.name, dataUrl: reader.result as string };
        setDocFile(doc);
        try {
          localStorage.setItem(storageKey(postingNumber), JSON.stringify(doc));
          notify();
        } catch (err) {
          console.warn('LocalStorage save error:', err);
        }
      };
      reader.readAsDataURL(file);
    },
    [postingNumber, notify]
  );

  const remove = useCallback(() => {
    if (!postingNumber) return;
    try {
      localStorage.removeItem(storageKey(postingNumber));
      setDocFile(null);
      notify();
    } catch (err) {
      console.warn('LocalStorage delete error:', err);
    }
  }, [postingNumber, notify]);

  // data: URL'leri yeni sekmede doğrudan açılmadığı için Blob URL'ye çevrilir.
  const view = useCallback(() => {
    if (!docFile?.dataUrl) return;
    try {
      const [head, body] = docFile.dataUrl.split(',');
      const mime = head.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
      const bstr = atob(body);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      window.open(URL.createObjectURL(new Blob([u8arr], { type: mime })), '_blank');
    } catch {
      window.open(docFile.dataUrl, '_blank');
    }
  }, [docFile]);

  return { docFile, upload, remove, view };
}
