'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Edit3, Package, Upload, FileText } from 'lucide-react';
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
import { formatNumber, formatUSD, formatTrNumber, parseTrNumber } from '@/lib/format';

interface OrderTableRowProps {
  order: OrderItem;
  idx: number;
  onUpdate: (postingNumber: string, payload: Record<string, any>) => Promise<void>;
  onOpenDetail: (order: OrderItem) => void;
}

export const OrderTableRow = React.memo(function OrderTableRow({
  order,
  idx,
  onUpdate,
  onOpenDetail,
}: OrderTableRowProps) {
  // Belge Durumu (Yerel Depolama ile Kalıcı Takip)
  const [docFile, setDocFile] = useState<{ name: string; dataUrl: string } | null>(null);

  useEffect(() => {
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
  }, [order.postingNumber]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

  const handleViewDocument = (e: React.MouseEvent) => {
    e.preventDefault();
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

  // Manuel Alış Fiyatı (Sayısal - TR Formatı: 139,89 / 25.489,56)
  const [buyPriceVal, setBuyPriceVal] = useState(
    order.buyPrice !== null && order.buyPrice !== undefined
      ? formatTrNumber(order.buyPrice)
      : ''
  );
  const [paymentCardVal, setPaymentCardVal] = useState(order.paymentCard || '');
  const [supplierVal, setSupplierVal] = useState(order.supplier || '');
  const [supplierOrderIdVal, setSupplierOrderIdVal] = useState(order.supplierOrderId || '');

  // Odaklanma durumları (Kullanıcı yazarken dışarıdan state ezilmesini önler)
  const [isBuyPriceFocused, setIsBuyPriceFocused] = useState(false);
  const [isPaymentCardFocused, setIsPaymentCardFocused] = useState(false);
  const [isSupplierFocused, setIsSupplierFocused] = useState(false);
  const [isOrderIdFocused, setIsOrderIdFocused] = useState(false);
  const [isOrderIdEditing, setIsOrderIdEditing] = useState(false);
  const orderIdInputRef = useRef<HTMLInputElement>(null);

  const isOrderIdUrl = isUrlString(supplierOrderIdVal);
  const orderIdSafeHref = isOrderIdUrl
    ? /^https?:\/\//i.test(supplierOrderIdVal.trim())
      ? supplierOrderIdVal.trim()
      : `https://${supplierOrderIdVal.trim()}`
    : '';

  useEffect(() => {
    if (!isBuyPriceFocused) {
      setBuyPriceVal(
        order.buyPrice !== null && order.buyPrice !== undefined
          ? formatTrNumber(order.buyPrice)
          : ''
      );
    }
  }, [order.buyPrice, isBuyPriceFocused]);

  useEffect(() => {
    if (!isPaymentCardFocused) {
      setPaymentCardVal(order.paymentCard || '');
    }
  }, [order.paymentCard, isPaymentCardFocused]);

  useEffect(() => {
    if (!isSupplierFocused) {
      setSupplierVal(order.supplier || '');
    }
  }, [order.supplier, isSupplierFocused]);

  useEffect(() => {
    if (!isOrderIdFocused) {
      setSupplierOrderIdVal(order.supplierOrderId || '');
      setIsOrderIdEditing(false);
    }
  }, [order.supplierOrderId, isOrderIdFocused]);

  // Alış Fiyatı Kaydetme (onBlur veya Enter)
  const handleBuyPriceCommit = () => {
    setIsBuyPriceFocused(false);
    const trimmed = buyPriceVal.trim();
    if (trimmed === '') {
      setBuyPriceVal('');
      if (order.buyPrice !== null && order.buyPrice !== undefined) {
        onUpdate(order.postingNumber, { buyPrice: null });
      }
      return;
    }

    const parsed = parseTrNumber(trimmed);
    if (parsed === null || parsed <= 0) {
      setBuyPriceVal(
        order.buyPrice !== null && order.buyPrice !== undefined
          ? formatTrNumber(order.buyPrice)
          : ''
      );
      return;
    }

    // Otomatik formatla (örn: 25.489,56)
    const formatted = formatTrNumber(parsed);
    setBuyPriceVal(formatted);

    if (parsed !== order.buyPrice) {
      onUpdate(order.postingNumber, { buyPrice: parsed });
    }
  };

  // Kart Kaydetme
  const handlePaymentCardCommit = () => {
    setIsPaymentCardFocused(false);
    const trimmed = paymentCardVal.trim();
    if (trimmed !== (order.paymentCard || '')) {
      onUpdate(order.postingNumber, { paymentCard: trimmed || null });
    }
  };

  // Tedarikçi Kaydetme
  const handleSupplierCommit = () => {
    const trimmed = supplierVal.trim();
    if (trimmed !== (order.supplier || '')) {
      onUpdate(order.postingNumber, { supplier: trimmed });
    }
  };

  // Sipariş No Kaydetme
  const handleSupplierOrderIdCommit = () => {
    setIsOrderIdFocused(false);
    setIsOrderIdEditing(false);
    const trimmed = supplierOrderIdVal.trim();
    if (trimmed !== (order.supplierOrderId || '')) {
      onUpdate(order.postingNumber, { supplierOrderId: trimmed });
    }
  };

  const countdown = React.useMemo(
    () => getShipmentCountdown(order.shipmentDate, order.status),
    [order.shipmentDate, order.status]
  );

  return (
    <tr className="hover:bg-slate-50/80 transition-colors border-b border-slate-200/80 group">
      {/* 1. Sıra No (#) */}
      <td className="px-1 py-4 whitespace-nowrap text-center text-xs text-slate-400 font-semibold font-mono w-[50px]">
        {idx + 1}
      </td>

      {/* 2. SİPARİŞ TARİHİ */}
      <td className="px-2 py-4 whitespace-nowrap text-center text-slate-700 font-semibold text-sm">
        {formatDate(order.inProcessAt)}
      </td>

      {/* 3. GÖNDERİ NO */}
      <td className="px-1.5 py-4 whitespace-nowrap text-center text-xs" title={order.postingNumber}>
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-slate-700 font-semibold font-mono tracking-tight whitespace-nowrap">
            {order.postingNumber || '-'}
          </span>
          {order.postingNumber && (
            <a
              href={getOzonPostingUrl(order.postingNumber, order.status)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-slate-400 hover:text-indigo-500 transition-colors"
              title="Ozon'da görüntüle"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </td>

      {/* 4. GÖRSEL & SEVKİYAT UYARI ROZETİ */}
      <td className="px-1 py-3 text-center align-middle">
        <div className="relative inline-flex items-center justify-center">
          <div className="w-10 h-10 rounded-xl border border-slate-100 bg-white p-1 shadow-sm flex items-center justify-center overflow-hidden">
            {order.productImage ? (
              <img
                src={order.productImage}
                alt={order.productTitle || 'Ürün'}
                className="w-full h-full object-contain hover:scale-105 transition-transform duration-200"
              />
            ) : (
              <Package className="w-4 h-4 text-slate-400" />
            )}
          </div>

          {/* Ozon 6 Günlük Ek Süre Kalan Gün Rozeti (Görselin Önünü Kapatmayacak Şekilde Sağ Üste Dışa Yaslı) */}
          {countdown && (
            <span
              className={`absolute -top-2 left-[30px] z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8.5px] font-bold leading-none tracking-tight text-white shadow-xs whitespace-nowrap ring-1 ring-white select-none transition-all duration-300 ${getCountdownUrgencyStyle(
                countdown.daysLeft,
                countdown.isExpired
              )}`}
              title={`Son Sevkiyat: 6 günlük ek süreyle en geç kargoya verilme süresi: ${countdown.deadlineFormatted} (${countdown.label})`}
            >
              {/* Canlı Tiktak / Zaman Akıyor Nabız Göstergesi */}
              <span className="relative flex h-1.5 w-1.5 shrink-0 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-80" />
                <span className="relative inline-flex rounded-full h-1 w-1 bg-white" />
              </span>
              <span>{countdown.label}</span>
            </span>
          )}
        </div>
      </td>

      {/* 5. ÜRÜN (SADECE MODEL / ÜRÜN KODU) */}
      <td className="px-2 py-4 text-center text-slate-700 font-medium text-xs align-middle" title={order.productTitle || order.productOfferId || undefined}>
        <div className="truncate max-w-[170px] mx-auto text-center">
          {order.productOfferId || order.productTitle || '-'}
        </div>
      </td>

      {/* 6. ALIŞ (MANUEL SAYISAL INPUT ALANI - TR FORMATLI) */}
      <td className="px-2 py-3 whitespace-nowrap text-center align-middle">
        <div className="flex items-center justify-center">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00 ₺"
            value={buyPriceVal}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9.,]/g, '');
              setBuyPriceVal(val);
            }}
            onFocus={(e) => {
              setIsBuyPriceFocused(true);
              e.target.select();
            }}
            onBlur={handleBuyPriceCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="text-center text-xs font-bold text-slate-800 placeholder:text-slate-400 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 rounded-xl px-2 py-1 transition-all outline-none w-24"
          />
        </div>
      </td>

      {/* 7. SATIŞ (OZON SATIŞ TUTARI) */}
      <td className="px-2 py-4 whitespace-nowrap text-center font-bold text-sm text-emerald-600 align-middle">
        <div className="flex items-center justify-center">
          {order.currency === 'USD'
            ? formatUSD(order.salePrice)
            : `${formatNumber(order.salePrice)} ${order.currency}`}
        </div>
      </td>

      {/* 8. KART (MANUEL METİN INPUT ALANI) */}
      <td className="px-1 py-3 whitespace-nowrap text-center align-middle">
        <div className="flex items-center justify-center">
          <input
            type="text"
            placeholder="Gir..."
            value={paymentCardVal}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(e) => setPaymentCardVal(e.target.value)}
            onFocus={() => setIsPaymentCardFocused(true)}
            onBlur={handlePaymentCardCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="text-center text-xs font-semibold text-slate-800 placeholder:text-slate-400 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 rounded-xl px-2.5 py-1 transition-all outline-none w-28"
          />
        </div>
      </td>

      {/* 9. TEDARİK (MANUEL METİN INPUT ALANI) */}
      <td className="px-2 py-3 whitespace-nowrap text-center align-middle">
        <div className="flex items-center justify-center">
          <input
            type="text"
            placeholder="Gir..."
            value={supplierVal}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(e) => setSupplierVal(e.target.value)}
            onFocus={() => setIsSupplierFocused(true)}
            onBlur={() => {
              setIsSupplierFocused(false);
              handleSupplierCommit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="text-center text-xs font-medium text-slate-700 placeholder:text-slate-400 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 rounded-xl px-2 py-1 transition-all outline-none w-24"
          />
        </div>
      </td>

      {/* 10. SİPARİŞ NO (METİN VEYA TIKLANABİLİR MAVİ URL LİNKİ) */}
      <td
        className="px-2 py-3 whitespace-nowrap text-center align-middle"
        onDoubleClick={() => {
          if (!isOrderIdEditing) {
            setIsOrderIdEditing(true);
            setTimeout(() => {
              orderIdInputRef.current?.focus();
              orderIdInputRef.current?.select();
            }, 30);
          }
        }}
      >
        <div className="flex items-center justify-center">
          {isOrderIdUrl && !isOrderIdEditing ? (
            <a
              href={orderIdSafeHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100/50 hover:bg-indigo-100/70 transition-colors"
              title={`${supplierOrderIdVal} (Düzenlemek için çift tıklayın)`}
            >
              <span>🔗 {formatOrderUrlLabel(supplierOrderIdVal)}</span>
              <ExternalLink className="w-3 h-3 opacity-80" />
            </a>
          ) : (
            <input
              ref={orderIdInputRef}
              type="text"
              placeholder="Gir..."
              value={supplierOrderIdVal}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              onChange={(e) => setSupplierOrderIdVal(e.target.value)}
              onFocus={() => {
                setIsOrderIdFocused(true);
                setIsOrderIdEditing(true);
              }}
              onBlur={handleSupplierOrderIdCommit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setIsOrderIdFocused(false);
                  setIsOrderIdEditing(false);
                }
              }}
              className={`text-center text-xs font-semibold text-slate-800 placeholder:text-slate-400 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 rounded-xl px-2.5 py-1 transition-all outline-none w-32 ${
                isOrderIdUrl ? 'border-indigo-300 text-indigo-600 bg-indigo-50/40' : ''
              }`}
            />
          )}
        </div>
      </td>

      {/* 11. BELGE (KOMPAKT YÜKLEME / GÖRÜNTÜLEME) */}
      <td className="px-2 py-3 whitespace-nowrap text-center align-middle">
        <div className="flex items-center justify-center">
          {docFile ? (
            <button
              type="button"
              onClick={handleViewDocument}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 bg-indigo-50/80 hover:bg-indigo-100/90 text-indigo-600 hover:text-indigo-800 border border-indigo-100/80 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              title={`${docFile.name || 'Belge'} (Yeni sekmede görüntüle)`}
            >
              <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>Görüntüle</span>
            </button>
          ) : (
            <label
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50/70 border border-slate-200/80 hover:border-indigo-200 rounded-xl cursor-pointer transition-all"
              title="Fatura / Belge yükle (PDF, Görsel)"
            >
              <Upload className="w-3 h-3 text-slate-400 group-hover:text-indigo-500" />
              <span>Yükle</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,image/*,.doc,.docx,.xlsx"
                onChange={handleFileUpload}
              />
            </label>
          )}
        </div>
      </td>

      {/* 12. DURUM */}
      <td className="px-2 py-4 whitespace-nowrap text-center align-middle">
        <div className="flex items-center justify-center">
          <OrderStatusBadge status={order.status} statusName={order.statusName} />
        </div>
      </td>

      {/* 13. İŞLEMLER */}
      <td className="px-2 pr-4 py-3 whitespace-nowrap text-center align-middle">
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => onOpenDetail(order)}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all border border-slate-200/60 mx-auto cursor-pointer"
            title="Sipariş detayını görüntüle"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
});
