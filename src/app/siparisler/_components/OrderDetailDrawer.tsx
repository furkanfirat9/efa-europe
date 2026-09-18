'use client';

import React, { useState, useEffect } from 'react';
import { X, Package, ExternalLink, FileText, Upload, Trash2, Eye, AlertCircle } from 'lucide-react';
import { OrderItem } from '../types';
import {
  isUrlString,
  formatOrderUrlLabel,
  formatDate,
  getOzonPostingUrl,
  getShipmentCountdown,
  getCountdownUrgencyStyle,
} from '../utils';
import { OrderStatusBadge } from './OrderStatusBadge';
import { formatUSD, formatTL } from '@/lib/format';
import { PillButton } from '@/components/ui/PillButton';

interface OrderDetailDrawerProps {
  order: OrderItem | null;
  open: boolean;
  notes: string;
  onNotesChange: (notes: string) => void;
  saving: boolean;
  onSave: () => Promise<void>;
  onClose: () => void;
}

export const OrderDetailDrawer: React.FC<OrderDetailDrawerProps> = ({
  order,
  open,
  notes,
  onNotesChange,
  saving,
  onSave,
  onClose,
}) => {
  // Belge Durumu (Yerel Depolama ile Senkron Takip)
  const [docFile, setDocFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const countdown = React.useMemo(
    () => (order ? getShipmentCountdown(order.shipmentDate, order.status) : null),
    [order?.shipmentDate, order?.status]
  );

  useEffect(() => {
    setShowDeleteConfirm(false);
    if (!order) return;
    const loadDoc = () => {
      try {
        const saved = localStorage.getItem(`doc_${order.postingNumber}`);
        if (saved) {
          setDocFile(JSON.parse(saved));
        } else {
          setDocFile(null);
        }
      } catch {
        setDocFile(null);
      }
    };

    loadDoc();

    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ postingNumber: string }>;
      if (!customEvent.detail || customEvent.detail.postingNumber === order.postingNumber) {
        loadDoc();
      }
    };

    window.addEventListener('order_doc_updated', handleSync);
    return () => {
      window.removeEventListener('order_doc_updated', handleSync);
    };
  }, [order?.postingNumber]);

  useEffect(() => {
    if (!open) {
      setShowDeleteConfirm(false);
    }
  }, [open]);

  const handleUploadDocument = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !order) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const doc = { name: file.name, dataUrl };
      setDocFile(doc);
      try {
        localStorage.setItem(`doc_${order.postingNumber}`, JSON.stringify(doc));
        window.dispatchEvent(
          new CustomEvent('order_doc_updated', { detail: { postingNumber: order.postingNumber } })
        );
      } catch (err) {
        console.warn('LocalStorage save error:', err);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleConfirmDeleteDocument = () => {
    if (!order) return;
    try {
      localStorage.removeItem(`doc_${order.postingNumber}`);
      setDocFile(null);
      setShowDeleteConfirm(false);
      window.dispatchEvent(
        new CustomEvent('order_doc_updated', { detail: { postingNumber: order.postingNumber } })
      );
    } catch (err) {
      console.warn('LocalStorage delete error:', err);
    }
  };

  const handleViewDocument = () => {
    if (!docFile?.dataUrl) return;
    try {
      const arr = docFile.dataUrl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch {
      window.open(docFile.dataUrl, '_blank');
    }
  };

  if (!open || !order) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Arka plan karartması */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-6 sm:pl-10">
        <div className="w-screen max-w-md bg-white border-l border-border-subtle shadow-float flex flex-col h-full rounded-l-[28px] overflow-hidden animate-in slide-in-from-right duration-200 ease-out z-50">
          {/* Panel Başlığı */}
          <div className="flex items-center justify-between border-b border-border-subtle px-6 py-5 bg-surface-muted/30">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[16px] font-medium text-text-primary">Sipariş Detayı</h3>
                <OrderStatusBadge status={order.status} statusName={order.statusName} />
                {countdown && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white tracking-tight select-none ${getCountdownUrgencyStyle(
                      countdown.daysLeft,
                      countdown.isExpired
                    )}`}
                    title={`Son Sevkiyat: 6 gün ek süreyle en geç: ${countdown.deadlineFormatted}`}
                  >
                    <span className="relative flex h-1.5 w-1.5 shrink-0 items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-80" />
                      <span className="relative inline-flex rounded-full h-1 w-1 bg-white" />
                    </span>
                    <span>{countdown.label}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-text-muted">
                <span>{order.postingNumber}</span>
                <a
                  href={getOzonPostingUrl(order.postingNumber, order.status)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-muted hover:text-accent transition-colors inline-flex items-center"
                  title="Ozon'da görüntüle"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-surface-muted hover:bg-ink hover:text-white flex items-center justify-center text-text-secondary transition-colors cursor-pointer"
              title="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Panel İçeriği (Dikey Kaydırılabilir) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* 1. Ürün Kartı */}
            <div className="rounded-[20px] border border-border-subtle bg-surface-muted/30 p-4 space-y-2">
              <div className="flex items-start gap-3.5">
                <div className="h-12 w-12 shrink-0 rounded-2xl border border-border-subtle bg-white flex items-center justify-center overflow-hidden">
                  {order.productImage ? (
                    <img
                      src={order.productImage}
                      alt={order.productTitle || 'Ürün'}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <Package className="h-5 w-5 text-text-muted" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-medium text-[13px] text-text-primary tracking-tight">
                    {order.productOfferId || '—'}
                  </div>
                  <div
                    className="text-[12px] text-text-secondary line-clamp-2 leading-relaxed"
                    title={order.productTitle || undefined}
                  >
                    {order.productTitle || '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Müşteri & Teslimat Bilgileri */}
            <div className="rounded-[20px] border border-border-subtle bg-surface-muted/30 p-4 space-y-2 text-[12px]">
              <div className="font-medium text-text-primary text-[13px] mb-1 flex items-center justify-between border-b border-border-subtle pb-2">
                <span>Müşteri & Teslimat</span>
                <span className="text-text-secondary font-medium text-[12px]">{formatDate(order.inProcessAt)}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border-subtle/50">
                <span className="text-text-secondary">Alıcı Adı</span>
                <span className="font-medium text-text-primary">{order.customerName || '—'}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border-subtle/50">
                <span className="text-text-secondary">Teslimat Şehri</span>
                <span className="font-medium text-text-primary">{order.customerCity || '—'}</span>
              </div>
              {order.shipmentDate && (
                <div className="flex items-center justify-between py-1 border-b border-border-subtle/50">
                  <span className="text-text-secondary">Son Sevk (6 Gün Ek Süre)</span>
                  <div className="text-right">
                    <span className="font-semibold text-[#D14343]">
                      {countdown ? `${countdown.deadlineFormatted} (${countdown.label})` : formatDate(order.shipmentDate)}
                    </span>
                    <span className="text-[10px] text-text-muted block">
                      Ozon sevk tarihi: {formatDate(order.shipmentDate)} + 6 gün
                    </span>
                  </div>
                </div>
              )}
              {order.customerAddressTail && (
                <div className="py-1">
                  <span className="text-text-secondary block mb-1">Adres Detayı</span>
                  <span className="text-text-secondary text-[11px] leading-normal block bg-white p-2.5 rounded-xl border border-border-subtle">
                    {order.customerAddressTail}
                  </span>
                </div>
              )}
            </div>

            {/* 3. Tedarik & Sipariş Takip Bilgileri */}
            <div className="rounded-[20px] border border-border-subtle bg-surface-muted/30 p-4 space-y-2 text-[12px]">
              <div className="font-medium text-text-primary text-[13px] mb-1 border-b border-border-subtle pb-2">
                Tedarik & Takip
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border-subtle/50">
                <span className="text-text-secondary">Tedarikçi</span>
                <span className="font-medium text-text-primary">{order.supplier || '—'}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border-subtle/50">
                <span className="text-text-secondary">Sipariş / Takip No</span>
                {isUrlString(order.supplierOrderId) ? (
                  <a
                    href={
                      /^https?:\/\//i.test(order.supplierOrderId?.trim() || '')
                        ? order.supplierOrderId?.trim()
                        : `https://${order.supplierOrderId?.trim()}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#ECEBFD] text-[#5856D6] px-3 py-1 text-xs font-medium hover:bg-[#D9DBFA] transition-colors"
                    title={order.supplierOrderId || undefined}
                  >
                    <span>{formatOrderUrlLabel(order.supplierOrderId || '')}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-text-primary font-medium">{order.supplierOrderId || '—'}</span>
                )}
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border-subtle/50">
                <span className="text-text-secondary">Ödeme Kartı</span>
                <span className="text-text-primary font-medium">{order.paymentCard || '—'}</span>
              </div>
            </div>

            {/* 4. Belge & Fatura Bilgileri */}
            <div className="rounded-[20px] border border-border-subtle bg-surface-muted/30 p-4 space-y-3 text-[12px]">
              <div className="font-medium text-text-primary text-[13px] mb-1 border-b border-border-subtle pb-2 flex items-center justify-between">
                <span>Sipariş Belgesi / Fatura</span>
                {docFile ? (
                  <span className="text-[#2E8B57] bg-[#E5F6EC] px-2.5 py-0.5 rounded-full font-medium text-[11px]">
                    Yüklendi
                  </span>
                ) : (
                  <span className="text-text-muted bg-surface-muted px-2 py-0.5 rounded-full font-medium text-[11px]">
                    Belge Yok
                  </span>
                )}
              </div>

              {docFile ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-white border border-border-subtle shadow-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-xl bg-[#ECEBFD] text-[#5856D6] flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-text-primary text-xs truncate max-w-[190px]" title={docFile.name}>
                          {docFile.name}
                        </div>
                        <div className="text-[11px] text-text-muted">Kayıtlı Belge</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleViewDocument}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-900 hover:bg-black text-white text-xs font-semibold transition-colors cursor-pointer shrink-0 shadow-xs"
                      title="Yeni sekmede görüntüle"
                    >
                      <Eye className="h-3.5 w-3.5 text-white stroke-[2.2]" />
                      <span>Görüntüle</span>
                    </button>
                  </div>

                  {showDeleteConfirm ? (
                    <div className="p-3 rounded-2xl bg-rose-50/90 border border-rose-200 space-y-2.5 animate-in fade-in duration-150">
                      <div className="flex items-start gap-2 text-rose-900">
                        <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                        <div className="text-xs leading-snug">
                          <span className="font-semibold block">Belge silinsin mi?</span>
                          <span className="text-[11px] text-rose-700">Bu işlem siparişe ait yüklü belgeyi kalıcı olarak kaldırır.</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(false)}
                          className="px-3 py-1 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium transition-colors cursor-pointer"
                        >
                          Vazgeç
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmDeleteDocument}
                          className="px-3 py-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition-colors cursor-pointer"
                        >
                          Evet, Sil
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <label className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors">
                        <Upload className="h-3.5 w-3.5 text-text-muted" />
                        <span>Farklı Belge Yükle</span>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,image/*,.doc,.docx,.xlsx"
                          onChange={handleUploadDocument}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FDE7E7] text-[#D14343] hover:bg-rose-100 text-[11px] font-medium transition-colors cursor-pointer"
                        title="Belgeyi sil"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Belgeyi Sil</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-2xl border border-dashed border-border-subtle bg-white hover:border-accent hover:bg-accent-soft/10 transition-all cursor-pointer group text-center">
                  <div className="h-8 w-8 rounded-full bg-surface-muted flex items-center justify-center text-text-muted group-hover:text-accent group-hover:bg-accent-soft/20 transition-colors">
                    <Upload className="h-4 w-4" />
                  </div>
                  <span className="text-[12px] font-medium text-text-secondary group-hover:text-text-primary">
                    Fatura veya Belge Yükle
                  </span>
                  <span className="text-[10px] text-text-muted">
                    PDF, PNG, JPG veya Ofis belgeleri
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,image/*,.doc,.docx,.xlsx"
                    onChange={handleUploadDocument}
                  />
                </label>
              )}
            </div>

            {/* 5. Finansal & Maliyet Dökümü */}
            <div className="rounded-[20px] border border-border-subtle bg-surface-muted/30 p-4 space-y-2 text-[12px]">
              <div className="font-medium text-text-primary text-[13px] mb-1 border-b border-border-subtle pb-2">
                Finansal Tablo & Kâr
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border-subtle/50">
                <span className="text-text-secondary">Ozon Satış Tutarı</span>
                <span className="font-semibold text-[#2E8B57] tabular-nums">
                  {formatUSD(order.salePrice)}
                  <span className="text-text-muted font-normal ml-1 text-[11px]">
                    (~{formatTL((order.salePrice || 0) * 48.35)})
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border-subtle/50">
                <span className="text-text-secondary">Tedarik Alış Maliyeti</span>
                <span className="font-semibold text-[#D14343] tabular-nums">
                  {order.buyPrice !== null && order.buyPrice !== undefined
                    ? formatTL(order.buyPrice)
                    : 'Henüz girilmedi'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border-subtle/50">
                <span className="text-text-secondary">Ozon Komisyonu (%5)</span>
                <span className="text-[#D14343] tabular-nums font-medium">
                  - {formatUSD((order.salePrice || 0) * 0.05)}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 bg-white px-4 rounded-2xl border border-border-subtle shadow-xs mt-1.5">
                <span className="font-medium text-text-primary text-[13px]">Tahmini Net Kâr</span>
                <span
                  className={`font-semibold text-[15px] tabular-nums ${
                    (order.netProfitTry || 0) >= 0 ? 'text-[#2E8B57]' : 'text-[#D14343]'
                  }`}
                >
                  {order.netProfitTry ? formatTL(order.netProfitTry) : '—'}
                </span>
              </div>
            </div>

            {/* 5. Sipariş Notları */}
            <div className="space-y-1.5">
              <label className="block text-[12px] text-text-secondary font-medium">Sipariş Notu</label>
              <textarea
                rows={3}
                placeholder="Örn: Allegro DPD ile Polonya deposuna gönderildi..."
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                className="w-full rounded-[16px] border border-border-subtle bg-surface-muted p-3 text-xs text-text-primary placeholder:text-text-muted focus:bg-white focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none leading-relaxed transition-all"
              />
            </div>
          </div>

          {/* Panel Butonları (Sabit Alt Kısım) */}
          <div className="flex items-center justify-end gap-2.5 border-t border-border-subtle bg-surface-muted/30 p-4 sm:px-6">
            <PillButton variant="secondary" onClick={onClose}>
              Kapat
            </PillButton>
            <PillButton variant="primary" disabled={saving} onClick={onSave}>
              {saving ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}
            </PillButton>
          </div>
        </div>
      </div>
    </div>
  );
};
