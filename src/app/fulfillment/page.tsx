'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Barcode,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

import {
  LSSettingsResponse,
  ArbitrageOrderRecord,
  WarehouseReportRecord,
  LSStockItem,
} from '@/lib/fulfillment/types';
import { formatClock, formatDateTime, formatNumber } from '@/lib/format';
import { ShipmentStatus, isCancelled, isShipped } from './_components/ShipmentStatus';
import styles from './fulfillment.module.css';

type TabKey = 'orders' | 'reports' | 'stocks';

const TABS: { value: TabKey; label: string; countKey: 'orders' | 'reports' | 'stocks' }[] = [
  { value: 'orders', label: 'Sevkiyat görevleri', countKey: 'orders' },
  { value: 'reports', label: 'Depo bildirimleri', countKey: 'reports' },
  { value: 'stocks', label: 'Stok envanteri', countKey: 'stocks' },
];

const REPORT_FILTERS = [
  { value: 'all', label: 'Tümü' },
  { value: 'photo', label: 'Foto-kontrol' },
  { value: 'damage', label: 'Hasar tutanağı' },
  { value: 'inspection', label: 'Muayene' },
];

const REPORT_TYPES: Record<
  string,
  { style: { backgroundColor: string; color: string; borderColor: string }; dotColor: string; label: string }
> = {
  photo: {
    style: {
      backgroundColor: 'var(--accent-quiet)',
      color: 'var(--accent)',
      borderColor: 'var(--border)',
    },
    dotColor: 'var(--accent)',
    label: 'Foto-kontrol',
  },
  damage: {
    style: {
      backgroundColor: 'var(--danger-bg)',
      color: 'var(--danger)',
      borderColor: 'var(--danger-border)',
    },
    dotColor: 'var(--danger)',
    label: 'Hasar tutanağı',
  },
  inspection: {
    style: {
      backgroundColor: 'var(--warn-bg)',
      color: 'var(--warn)',
      borderColor: 'var(--warn-border)',
    },
    dotColor: 'var(--warn)',
    label: 'Muayene',
  },
  note: {
    style: {
      backgroundColor: 'var(--surface-sunken)',
      color: 'var(--text-muted)',
      borderColor: 'var(--border)',
    },
    dotColor: 'var(--text-subtle)',
    label: 'Depo notu',
  },
};

interface OrderFormData {
  ozonOrderId: string;
  amazonTrackingBarcode: string;
  productName: string;
  quantity: number;
  declaredValueEuro: number | string;
  lengthMm: number | string;
  widthMm: number | string;
  heightMm: number | string;
  weightGr: number | string;
  note: string;
}

const EMPTY_FORM: OrderFormData = {
  ozonOrderId: '',
  amazonTrackingBarcode: '',
  productName: '',
  quantity: 1,
  declaredValueEuro: '',
  lengthMm: '',
  widthMm: '',
  heightMm: '',
  weightGr: '',
  note: '',
};

const PARCEL_FIELDS = [
  { key: 'lengthMm', label: 'Uzunluk (mm)' },
  { key: 'widthMm', label: 'Genişlik (mm)' },
  { key: 'heightMm', label: 'Yükseklik (mm)' },
  { key: 'weightGr', label: 'Ağırlık (g)' },
] as const;

export default function FulfillmentPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('orders');

  // Live Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [settings, setSettings] = useState<LSSettingsResponse | null>(null);
  const [orders, setOrders] = useState<ArbitrageOrderRecord[]>([]);
  const [reports, setReports] = useState<WarehouseReportRecord[]>([]);
  const [stocks, setStocks] = useState<LSStockItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  // Edit Mode State (Orders)
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  // Order Form State
  const [form, setForm] = useState(EMPTY_FORM);
  const [labelFile, setLabelFile] = useState<{ name: string; base64: string } | null>(null);
  const [existingLabelUrl, setExistingLabelUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Report Modal / Form State
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [reportFilterType, setReportFilterType] = useState<string>('all');
  const [reportForm, setReportForm] = useState({
    ozonOrderId: '',
    type: 'photo',
    title: '',
    description: '',
  });
  const [reportMediaFile, setReportMediaFile] = useState<{ name: string; base64: string } | null>(
    null
  );
  const [submittingReport, setSubmittingReport] = useState<boolean>(false);
  const [reportSubmitError, setReportSubmitError] = useState<string | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  // Lightbox Preview
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Search Filter
  const [searchTerm, setSearchTerm] = useState('');

  // Initial Fetch
  const fetchData = async () => {
    try {
      setError(null);
      const [settingsRes, ordersRes, reportsRes, stocksRes] = await Promise.allSettled([
        fetch('/api/fulfillment/settings').then((r) => r.json()),
        fetch('/api/fulfillment/orders').then((r) => r.json()),
        fetch('/api/fulfillment/reports').then((r) => r.json()),
        fetch('/api/fulfillment/stocks').then((r) => r.json()),
      ]);

      if (settingsRes.status === 'fulfilled' && settingsRes.value.success) {
        setSettings(settingsRes.value);
      }
      if (ordersRes.status === 'fulfilled' && ordersRes.value.success) {
        const isTest = (id?: string | null, name?: string | null) => {
          const i = (id || '').toLowerCase();
          const n = (name || '').toLowerCase();
          return i.includes('test') || i === '213123123123123' || n === 'test';
        };
        const cleanList = (ordersRes.value.items || []).filter(
          (o: ArbitrageOrderRecord) => !isTest(o.ozonOrderId, o.productName)
        );
        setOrders(cleanList);
      }
      if (reportsRes.status === 'fulfilled' && reportsRes.value.success) {
        setReports(reportsRes.value.items || []);
      }
      if (stocksRes.status === 'fulfilled' && stocksRes.value.success) {
        setStocks(stocksRes.value.stocks || []);
      }
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(err.message || 'Veriler alınırken hata oluştu.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!lightboxUrl && !showReportModal) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (lightboxUrl) setLightboxUrl(null);
      else setShowReportModal(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [lightboxUrl, showReportModal]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Copy Helpers

  const handleCopyBarcode = (barcode: string) => {
    navigator.clipboard.writeText(barcode);
    setCopiedBarcode(barcode);
    setTimeout(() => setCopiedBarcode(null), 2000);
  };

  const handleCopyOrderId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedOrderId(id);
    setTimeout(() => setCopiedOrderId(null), 2000);
  };

  // Handle PDF File Upload (Order Label)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setSubmitError('Lütfen geçerli bir PDF dosyası yükleyin.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      setLabelFile({ name: file.name, base64 });
      setSubmitError(null);
    };
    reader.readAsDataURL(file);
  };

  // Handle Media File Upload (Report / Photo)
  const handleReportMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      setReportMediaFile({ name: file.name, base64 });
      setReportSubmitError(null);
    };
    reader.readAsDataURL(file);
  };

  // Start Edit Mode
  const handleStartEdit = (order: ArbitrageOrderRecord) => {
    setIsEditing(true);
    setEditingOrderId(order.ozonOrderId);
    setForm({
      ozonOrderId: order.ozonOrderId,
      amazonTrackingBarcode: order.amazonTrackingBarcode !== '-' ? order.amazonTrackingBarcode : '',
      productName: order.productName || '',
      quantity: order.quantity || 1,
      declaredValueEuro: order.declaredValue ?? '',
      lengthMm: order.lengthMm ?? '',
      widthMm: order.widthMm ?? '',
      heightMm: order.heightMm ?? '',
      weightGr: order.weightGr ?? '',
      note: order.note || '',
    });
    setExistingLabelUrl(order.labelPdfUrl || null);
    setLabelFile(null);
    setSubmitSuccess(null);
    setSubmitError(null);
    setActiveTab('orders');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Cancel Edit Mode
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingOrderId(null);
    setForm(EMPTY_FORM);
    setLabelFile(null);
    setExistingLabelUrl(null);
    setSubmitSuccess(null);
    setSubmitError(null);
  };

  // Handle Order Submit (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ozonOrderId || !form.amazonTrackingBarcode) {
      setSubmitError('Ozon sipariş numarası ve Amazon takip barkodu zorunludur.');
      return;
    }

    setSubmitting(true);
    setSubmitSuccess(null);
    setSubmitError(null);

    try {
      const payload: any = {
        ozonOrderId: form.ozonOrderId.trim(),
        amazonTrackingBarcode: form.amazonTrackingBarcode.trim(),
        productName: form.productName.trim() || null,
        quantity: Number(form.quantity) || 1,
        declaredValue: Number(form.declaredValueEuro) || 100,
        lengthMm: Number(form.lengthMm) || 300,
        widthMm: Number(form.widthMm) || 200,
        heightMm: Number(form.heightMm) || 150,
        weightGr: Number(form.weightGr) || 1200,
        note: form.note.trim() || null,
      };

      if (labelFile) {
        payload.labelFile = labelFile;
      }

      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch('/api/fulfillment/orders', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        const savedId = form.ozonOrderId;
        const wasEditing = isEditing;
        handleCancelEdit();
        setSubmitSuccess(
          wasEditing
            ? `"${savedId}" numaralı görev güncellendi ve depoya iletildi.`
            : `"${savedId}" için sevkiyat görevi oluşturuldu.`
        );
        fetchData();
      } else {
        setSubmitError(data.error_message || 'İşlem gerçekleştirilemedi.');
      }
    } catch (err: any) {
      setSubmitError(err.message || 'İstek gönderilirken bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel / Delete Order
  const handleCancelOrder = async (orderId: string, isAlreadyCancelled?: boolean) => {
    const confirmMsg = isAlreadyCancelled
      ? `"${orderId}" numaralı görev tablodan tamamen silinsin mi?`
      : `"${orderId}" numaralı sevkiyat görevi iptal edilsin mi?`;

    if (!confirm(confirmMsg)) return;

    setActionError(null);
    setCancellingId(orderId);
    try {
      const url = `/api/fulfillment/orders?orderId=${encodeURIComponent(orderId)}${
        isAlreadyCancelled ? '&permanent=true' : ''
      }`;
      const res = await fetch(url, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        setActionError(data.error_message || `${orderId} işlemi gerçekleştirilemedi.`);
      }
    } catch (err: any) {
      setActionError(`İşlem sırasında hata oluştu: ${err.message}`);
    } finally {
      setCancellingId(null);
    }
  };

  // Submit New Warehouse Report / Photo
  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportForm.title) {
      setReportSubmitError('Başlık alanı zorunludur.');
      return;
    }

    setSubmittingReport(true);
    setReportSubmitError(null);

    try {
      const payload: any = {
        ozonOrderId: reportForm.ozonOrderId.trim() || null,
        type: reportForm.type,
        title: reportForm.title.trim(),
        description: reportForm.description.trim() || null,
        source: 'manual',
      };

      if (reportMediaFile) {
        payload.mediaBase64 = reportMediaFile.base64;
        payload.mediaFileName = reportMediaFile.name;
      }

      const res = await fetch('/api/fulfillment/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setShowReportModal(false);
        setReportForm({ ozonOrderId: '', type: 'photo', title: '', description: '' });
        setReportMediaFile(null);
        fetchData();
      } else {
        setReportSubmitError(data.error_message || 'Bildirim kaydedilemedi.');
      }
    } catch (err: any) {
      setReportSubmitError(err.message || 'İstek gönderilirken hata oluştu.');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Delete Report
  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('Bu bildirim kaydı silinsin mi?')) return;

    setActionError(null);
    setDeletingReportId(reportId);
    try {
      const res = await fetch(`/api/fulfillment/reports?reportId=${encodeURIComponent(reportId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        setActionError(data.error_message || 'Bildirim silinemedi.');
      }
    } catch (err: any) {
      setActionError(`Silme sırasında hata oluştu: ${err.message}`);
    } finally {
      setDeletingReportId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return orders;
    return orders.filter(
      (o) =>
        o.ozonOrderId.toLowerCase().includes(term) ||
        (o.amazonTrackingBarcode && o.amazonTrackingBarcode.toLowerCase().includes(term)) ||
        (o.productName && o.productName.toLowerCase().includes(term)) ||
        (o.liveState && o.liveState.toLowerCase().includes(term)) ||
        (o.note && o.note.toLowerCase().includes(term))
    );
  }, [orders, searchTerm]);

  const filteredReports = useMemo(
    () =>
      reports.filter((r) => reportFilterType === 'all' || r.type === reportFilterType),
    [reports, reportFilterType]
  );

  const activeOrdersCount = orders.filter(
    (o) => !isCancelled(o.liveState) && !isCancelled(o.status)
  ).length;
  const shippedOrdersCount = orders.filter((o) => isShipped(o.liveState)).length;
  const inWarehouseCount = Math.max(0, activeOrdersCount - shippedOrdersCount);
  const damageCount = reports.filter((r) => r.type === 'damage').length;
  const connected = Boolean(settings?.success);

  const stats = [
    {
      label: 'Toplam görev',
      value: formatNumber(orders.length),
      hint:
        orders.length === 0
          ? 'Kayıt bulunmuyor'
          : `${formatNumber(activeOrdersCount)} aktif takipte`,
    },
    {
      label: 'Depoda işlemde',
      value: formatNumber(inWarehouseCount),
      hint: 'Koli teslimatı ve paketleme',
    },
    {
      label: 'Hava kargoya verildi',
      value: formatNumber(shippedOrdersCount),
      hint: 'Moskova sevkiyat koridoru',
      accent: true,
    },
    {
      label: 'Depo bildirimleri',
      value: formatNumber(reports.length),
      hint: damageCount > 0 ? `${formatNumber(damageCount)} hasar tutanağı` : 'Sıfır hasar kaydı',
    },
  ];

  return (
    <div className={styles.container}>
      {/* GEZİNME (HEADER) — Yönerge Madde 8: 56px, sade zemin, 1px ayırıcı, blur yok */}
      <header className={styles.header}>
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
              Fulfillment
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Durum Göstergesi: 6px nokta + sakin metin */}
            <div
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] border text-xs"
              style={{
                backgroundColor: loading
                  ? 'var(--surface-sunken)'
                  : connected
                  ? 'var(--success-bg)'
                  : 'var(--danger-bg)',
                borderColor: loading
                  ? 'var(--border)'
                  : connected
                  ? 'var(--success-border)'
                  : 'var(--danger-border)',
                color: loading
                  ? 'var(--text-muted)'
                  : connected
                  ? 'var(--success)'
                  : 'var(--danger)',
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: loading
                    ? 'var(--text-subtle)'
                    : connected
                    ? 'var(--success)'
                    : 'var(--danger)',
                }}
              />
              <span className="text-[11px] font-medium">
                {loading
                  ? 'Bağlanıyor…'
                  : connected
                  ? 'Depo bağlantısı etkin'
                  : 'Bağlantı kesildi'}
              </span>
            </div>

            {/* Yenileme Düğmesi: Yüzey düğmesi */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Verileri yenile"
              aria-label="Verileri yenile"
              className={styles.btnSecondary}
              style={{ width: 36, height: 36, padding: 0 }}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                strokeWidth={1.5}
              />
            </button>
          </div>
        </div>
      </header>

      {/* ANA İÇERİK ALANI — 1200px maksimum genişlik, 24px dikey ritim */}
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Hata Bildirimi */}
        {(error || actionError) && (
          <div
            className="flex items-center justify-between gap-4 p-3.5 border rounded-[6px]"
            style={{
              backgroundColor: 'var(--danger-bg)',
              borderColor: 'var(--danger-border)',
              color: 'var(--danger)',
            }}
          >
            <div className="flex items-center gap-2 text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>{error || actionError}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                handleRefresh();
              }}
              className={styles.btnSecondary}
              style={{ height: 28, fontSize: 11, padding: '0 8px' }}
            >
              Tekrar dene
            </button>
          </div>
        )}

        {/* METRİK ŞERİDİ — Yönerge Madde 2: Sahte kartlar yok, birleşik 4 sütunlu sessiz şerit */}
        <div className={styles.card}>
          <div className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] sm:grid-cols-4 sm:divide-y-0">
            {stats.map((stat) => (
              <div key={stat.label} className="p-4 sm:p-5">
                <div
                  className="text-xs uppercase tracking-[0.06em]"
                  style={{ color: 'var(--text-subtle)', fontSize: 11, fontWeight: 500 }}
                >
                  {stat.label}
                </div>
                {loading ? (
                  <div className="mt-2 space-y-1.5">
                    <div className="h-6 w-14 bg-slate-200/50 rounded-[4px] animate-pulse" />
                    <div className="h-3 w-24 bg-slate-100 rounded-[4px] animate-pulse" />
                  </div>
                ) : (
                  <div className="mt-1">
                    <div
                      className="font-mono text-2xl font-semibold tabular-nums"
                      style={{
                        color: stat.accent ? 'var(--accent)' : 'var(--text)',
                      }}
                    >
                      {stat.value}
                    </div>
                    <div
                      className="mt-1 text-xs truncate"
                      style={{ color: 'var(--text-muted)', fontSize: 12 }}
                    >
                      {stat.hint}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* SEKME DÜZENİ — Yönerge Madde 8 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
          <div className="inline-flex gap-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.value;
              const count =
                tab.countKey === 'orders'
                  ? orders.length
                  : tab.countKey === 'reports'
                  ? reports.length
                  : stocks.length;

              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors"
                  style={{
                    backgroundColor: isActive ? 'var(--surface)' : 'transparent',
                    color: isActive ? 'var(--text)' : 'var(--text-muted)',
                    border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                    boxShadow: isActive ? 'var(--shadow-1)' : 'none',
                  }}
                >
                  <span>{tab.label}</span>
                  <span
                    className="font-mono text-[11px] tabular-nums"
                    style={{ color: 'var(--text-subtle)' }}
                  >
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          {activeTab === 'reports' && (
            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              className={styles.btnSecondary}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Yeni bildirim ekle</span>
            </button>
          )}
        </div>

        {/* 1. SEKME: SEVKİYAT GÖREVLERİ (ORDERS) */}
        {activeTab === 'orders' && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* SOL KOLON: YENİ GÖREV FORMU (XL: 4, LG: 5 SÜTUN) */}
            <div className="space-y-6 xl:col-span-4 lg:col-span-5">
              <div className={styles.card}>
                <div
                  className="flex items-center justify-between border-b px-5 py-3.5"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div>
                    <h2
                      className="text-sm font-semibold"
                      style={{ color: 'var(--text)' }}
                    >
                      {isEditing ? 'Görevi düzenle' : 'Yeni sevkiyat görevi'}
                    </h2>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {isEditing
                        ? `"${editingOrderId}" bilgileri depoda güncellenir.`
                        : 'Amazon veya Allegro takip kodunu Ozon siparişiyle eşleyin.'}
                    </p>
                  </div>

                  {isEditing && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className={styles.btnGhost}
                    >
                      Vazgeç
                    </button>
                  )}
                </div>

                <div className="p-5">
                  {submitSuccess && (
                    <div
                      className="mb-4 flex items-start gap-2.5 p-3 rounded-[6px] border text-xs"
                      style={{
                        backgroundColor: 'var(--success-bg)',
                        borderColor: 'var(--success-border)',
                        color: 'var(--success)',
                      }}
                    >
                      <Check className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.5} />
                      <p>{submitSuccess}</p>
                    </div>
                  )}

                  {submitError && (
                    <div
                      className="mb-4 flex items-start gap-2.5 p-3 rounded-[6px] border text-xs"
                      style={{
                        backgroundColor: 'var(--danger-bg)',
                        borderColor: 'var(--danger-border)',
                        color: 'var(--danger)',
                      }}
                    >
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.5} />
                      <p>{submitError}</p>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
                    {/* Ozon Sipariş No */}
                    <div>
                      <label
                        className="block text-xs font-medium mb-1.5"
                        style={{ color: 'var(--text)' }}
                      >
                        Ozon sipariş numarası <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={form.ozonOrderId}
                        readOnly={isEditing}
                        onChange={(e) => setForm({ ...form, ozonOrderId: e.target.value })}
                        required
                        className={`${styles.input} font-mono`}
                      />
                    </div>

                    {/* Amazon / Allegro Takip Barkodu */}
                    <div>
                      <label
                        className="block text-xs font-medium mb-1.5"
                        style={{ color: 'var(--text)' }}
                      >
                        Amazon veya Allegro takip kodu <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={form.amazonTrackingBarcode}
                          onChange={(e) =>
                            setForm({ ...form, amazonTrackingBarcode: e.target.value })
                          }
                          required
                          className={`${styles.input} font-mono pr-8`}
                        />
                        <Barcode
                          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4"
                          style={{ color: 'var(--text-subtle)' }}
                          strokeWidth={1.5}
                        />
                      </div>
                      <p
                        className="mt-1 text-[11px]"
                        style={{ color: 'var(--text-subtle)' }}
                      >
                        Koli depoya ulaştığında personel bu barkodu okutarak eşleştirir.
                      </p>
                    </div>

                    {/* Ürün Adı & Beyan Değeri */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          className="block text-xs font-medium mb-1.5"
                          style={{ color: 'var(--text)' }}
                        >
                          Ürün adı
                        </label>
                        <input
                          type="text"
                          value={form.productName}
                          onChange={(e) => setForm({ ...form, productName: e.target.value })}
                          className={styles.input}
                        />
                      </div>
                      <div>
                        <label
                          className="block text-xs font-medium mb-1.5"
                          style={{ color: 'var(--text)' }}
                        >
                          Beyan değeri (€)
                        </label>
                        <input
                          type="number"
                          value={form.declaredValueEuro}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              declaredValueEuro: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                          className={`${styles.input} font-mono`}
                        />
                      </div>
                    </div>

                    {/* Ozon Kargo Etiketi (PDF) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label
                          className="block text-xs font-medium"
                          style={{ color: 'var(--text)' }}
                        >
                          Ozon kargo etiketi (PDF)
                        </label>
                        {existingLabelUrl && (
                          <a
                            href={`/api/fulfillment/labels?orderId=${encodeURIComponent(
                              form.ozonOrderId
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium"
                            style={{ color: 'var(--accent)' }}
                          >
                            <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                            Mevcut etiket
                          </a>
                        )}
                      </div>

                      <div
                        className="p-3 border border-dashed rounded-[6px] text-center"
                        style={{
                          borderColor: 'var(--border-strong)',
                          backgroundColor: 'var(--surface-sunken)',
                        }}
                      >
                        {labelFile ? (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 truncate text-xs">
                              <FileText className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                              <span className="truncate font-mono">{labelFile.name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setLabelFile(null)}
                              className="p-1 text-slate-400 hover:text-slate-700"
                              title="Dosyayı kaldır"
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                          </div>
                        ) : (
                          <label className="flex cursor-pointer items-center justify-center gap-2 py-1 text-xs">
                            <Upload
                              className="h-4 w-4"
                              style={{ color: 'var(--text-muted)' }}
                              strokeWidth={1.5}
                            />
                            <span style={{ color: 'var(--text)' }}>
                              {isEditing ? 'Yeni PDF seçin' : 'PDF dosyasını seçin'}
                            </span>
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={handleFileChange}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Koli Boyutları */}
                    <div>
                      <label
                        className="block text-xs font-medium mb-1.5"
                        style={{ color: 'var(--text)' }}
                      >
                        Koli boyutları ve ağırlık
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {PARCEL_FIELDS.map(({ key, label }) => (
                          <div key={key}>
                            <span
                              className="block text-center font-mono text-[10px] mb-1"
                              style={{ color: 'var(--text-subtle)' }}
                            >
                              {label}
                            </span>
                            <input
                              type="number"
                              value={form[key]}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  [key]: e.target.value === '' ? '' : Number(e.target.value),
                                })
                              }
                              className={`${styles.input} font-mono text-center px-1`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Depo Notu / Talimat (İsteğe Bağlı) */}
                    <div>
                      <label
                        className="block text-xs font-medium mb-1.5"
                        style={{ color: 'var(--text)' }}
                      >
                        Depo notu / Talimat{' '}
                        <span style={{ color: 'var(--text-subtle)', fontWeight: 'normal' }}>
                          (İsteğe bağlı)
                        </span>
                      </label>
                      <textarea
                        rows={2}
                        value={form.note}
                        onChange={(e) => setForm({ ...form, note: e.target.value })}
                        placeholder="Örn: 3'lü koli split edilecek, kutu kontrol edilsin vb."
                        className={styles.textarea}
                      />
                    </div>

                    {/* Form Gönderme: Tek Dolu Düğme — Madde 8 */}
                    <div className="pt-1">
                      <button
                        type="submit"
                        disabled={submitting}
                        className={`${styles.btnPrimary} w-full`}
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                            <span>İletiliyor…</span>
                          </>
                        ) : isEditing ? (
                          <>
                            <Edit3 className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <span>Görevi güncelle</span>
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <span>Görevi depoya ilet</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>

            {/* SAĞ KOLON: KAYITLI GÖREVLER TABLOSU (XL: 8, LG: 7 SÜTUN) */}
            <div className="min-w-0 xl:col-span-8 lg:col-span-7">
              <div className={`${styles.card} min-w-0 overflow-hidden`}>
                <div
                  className="flex flex-col gap-3 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div>
                    <h2
                      className="text-sm font-semibold"
                      style={{ color: 'var(--text)' }}
                    >
                      Kayıtlı görevler
                    </h2>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {loading
                        ? 'Yükleniyor…'
                        : searchTerm
                        ? `${filteredOrders.length} / ${orders.length} görev listeleniyor`
                        : `${orders.length} görev · Canlı depo durumu`}
                    </p>
                  </div>

                  {/* Arama Girdisi */}
                  <div className="relative">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Sipariş no veya barkod…"
                      className={styles.input}
                      style={{ width: 190, paddingLeft: 28 }}
                    />
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
                      style={{ color: 'var(--text-subtle)' }}
                      strokeWidth={1.5}
                    />
                  </div>
                </div>

                {/* Tablo — Madde 8: dikey çizgi yok, zebra yok, table-layout: fixed ile tam dinamik sığar */}
                <div className="w-full min-w-0 overflow-x-auto">
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ width: '34%' }}>Sipariş ve ürün</th>
                        <th style={{ width: '22%' }}>Takip barkodu</th>
                        <th style={{ width: '12%' }}>Etiket</th>
                        <th style={{ width: '22%' }}>Durum</th>
                        <th style={{ width: '10%', textAlign: 'right' }}>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 4 }).map((_, idx) => (
                          <tr key={idx}>
                            <td colSpan={5} className="py-4">
                              <div className="h-4 w-48 bg-slate-100 rounded-[4px] animate-pulse" />
                            </td>
                          </tr>
                        ))
                      ) : filteredOrders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center">
                            <p
                              className="text-xs"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {orders.length === 0
                                ? 'Henüz kayıtlı bir sevkiyat görevi bulunmuyor.'
                                : 'Aramanızla eşleşen görev bulunamadı.'}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredOrders.map((order) => (
                          <tr key={order.id || order.ozonOrderId}>
                            {/* Sipariş ve Ürün */}
                            <td className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="font-mono text-xs font-medium truncate"
                                  style={{ color: 'var(--text)' }}
                                >
                                  {order.ozonOrderId}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyOrderId(order.ozonOrderId)}
                                  className="p-0.5 text-slate-400 hover:text-slate-700 shrink-0"
                                  title="Sipariş numarasını kopyala"
                                >
                                  {copiedOrderId === order.ozonOrderId ? (
                                    <Check className="h-3 w-3 text-emerald-700" strokeWidth={1.5} />
                                  ) : (
                                    <Copy className="h-3 w-3" strokeWidth={1.5} />
                                  )}
                                </button>
                              </div>
                              <div
                                className="truncate text-xs mt-0.5 block min-w-0"
                                style={{ color: 'var(--text-muted)' }}
                                title={order.productName || ''}
                              >
                                {order.productName || 'Ürün adı girilmedi'}
                              </div>
                              <div
                                className="font-mono text-[11px] mt-0.5 tabular-nums truncate"
                                style={{ color: 'var(--text-subtle)' }}
                              >
                                {order.createdAt
                                  ? new Date(order.createdAt).toLocaleDateString('tr-TR')
                                  : '—'}{' '}
                                · €{formatNumber(order.declaredValue)}
                              </div>
                              {order.note && (
                                <div
                                  className="mt-1 inline-flex max-w-full items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-[4px] border truncate"
                                  style={{
                                    backgroundColor: 'var(--warn-bg)',
                                    borderColor: 'var(--warn-border)',
                                    color: 'var(--warn)',
                                  }}
                                  title={order.note}
                                >
                                  <span className="font-medium shrink-0">Not:</span>
                                  <span className="truncate">{order.note}</span>
                                </div>
                              )}
                            </td>

                            {/* Takip Barkodu */}
                            <td className="min-w-0">
                              {order.amazonTrackingBarcode &&
                              order.amazonTrackingBarcode !== '-' ? (
                                <button
                                  type="button"
                                  onClick={() => handleCopyBarcode(order.amazonTrackingBarcode)}
                                  className="inline-flex max-w-full items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded-[4px] border hover:bg-white min-w-0"
                                  style={{
                                    borderColor: 'var(--border)',
                                    backgroundColor: 'var(--surface-sunken)',
                                    color: 'var(--text)',
                                  }}
                                  title="Barkodu kopyala"
                                >
                                  <Barcode className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                                  <span className="truncate">
                                    {order.amazonTrackingBarcode}
                                  </span>
                                  {copiedBarcode === order.amazonTrackingBarcode && (
                                    <Check className="h-2.5 w-2.5 shrink-0 text-emerald-700" strokeWidth={1.5} />
                                  )}
                                </button>
                              ) : (
                                <span style={{ color: 'var(--text-subtle)' }}>—</span>
                              )}
                            </td>

                            {/* Etiket */}
                            <td>
                              {order.labelPdfUrl ? (
                                <a
                                  href={`/api/fulfillment/labels?orderId=${encodeURIComponent(
                                    order.ozonOrderId
                                  )}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded-[4px] border hover:underline whitespace-nowrap"
                                  style={{
                                    borderColor: 'var(--border)',
                                    backgroundColor: 'var(--surface-sunken)',
                                    color: 'var(--text)',
                                  }}
                                >
                                  <FileText className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                                  PDF
                                </a>
                              ) : (
                                <span
                                  className="font-mono text-[11px]"
                                  style={{ color: 'var(--text-subtle)' }}
                                >
                                  Şablon
                                </span>
                              )}
                            </td>

                            {/* Durum */}
                            <td className="min-w-0">
                              <ShipmentStatus
                                state={order.liveState || order.status}
                                waitReason={order.liveWaitReason}
                              />
                            </td>

                            {/* İşlemler: Sade düğmeler */}
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <div className="inline-flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(order)}
                                  className={styles.btnGhost}
                                  style={{ height: 26, width: 26, padding: 0 }}
                                  title="Düzenle"
                                  aria-label="Düzenle"
                                >
                                  <Edit3 className="h-3.5 w-3.5" strokeWidth={1.5} />
                                </button>

                                {order.liveState !== 'shipped' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelOrder(order.ozonOrderId, isCancelled(order.liveState))}
                                    disabled={cancellingId === order.ozonOrderId}
                                    className={styles.btnGhost}
                                    style={{ height: 26, width: 26, padding: 0 }}
                                    title={isCancelled(order.liveState) ? 'Görevi tablodan sil' : 'Görevi iptal et'}
                                    aria-label={isCancelled(order.liveState) ? 'Görevi tablodan sil' : 'Görevi iptal et'}
                                  >
                                    {cancellingId === order.ozonOrderId ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. SEKME: DEPO BİLDİRİMLERİ (REPORTS) */}
        {activeTab === 'reports' && (
          <div className={styles.card}>
            <div
              className="flex flex-col gap-3 border-b px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              style={{ borderColor: 'var(--border)' }}
            >
              <div>
                <h2
                  className="text-sm font-semibold"
                  style={{ color: 'var(--text)' }}
                >
                  Depo bildirimleri ve muayene kayıtları
                </h2>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cybinka deposundan gelen teslimat fotoğrafları, hasar tutanakları ve bildirimler.
                </p>
              </div>

              {/* Filtre Düğmeleri: Yüzey düğmeleri */}
              <div className="inline-flex gap-1">
                {REPORT_FILTERS.map((f) => {
                  const isActive = reportFilterType === f.value;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setReportFilterType(f.value)}
                      className="px-2.5 py-1 text-xs font-medium rounded-[6px] transition-colors"
                      style={{
                        backgroundColor: isActive ? 'var(--surface)' : 'transparent',
                        color: isActive ? 'var(--text)' : 'var(--text-muted)',
                        border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                        boxShadow: isActive ? 'var(--shadow-1)' : 'none',
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-5">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="border p-4 rounded-[12px] space-y-2" style={{ borderColor: 'var(--border)' }}>
                      <div className="h-32 bg-slate-100 rounded-[6px] animate-pulse" />
                      <div className="h-4 w-32 bg-slate-100 rounded-[4px] animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Bu filtreye uygun depo bildirimi bulunmuyor.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredReports.map((report) => {
                    const type = REPORT_TYPES[report.type] ?? REPORT_TYPES.note;

                    return (
                      <article
                        key={report.id}
                        className="flex flex-col border rounded-[12px] overflow-hidden"
                        style={{
                          borderColor: 'var(--border)',
                          backgroundColor: 'var(--surface)',
                        }}
                      >
                        {/* Görsel */}
                        {report.mediaUrl ? (
                          <button
                            type="button"
                            onClick={() => setLightboxUrl(report.mediaUrl)}
                            className="relative block h-36 w-full cursor-pointer overflow-hidden border-b"
                            style={{ borderColor: 'var(--border)' }}
                          >
                            <img
                              src={report.mediaUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 text-xs text-white opacity-0 hover:opacity-100 transition-opacity">
                              <Eye className="h-4 w-4" strokeWidth={1.5} />
                              <span>Büyüt</span>
                            </div>
                          </button>
                        ) : (
                          <div
                            className="flex h-20 items-center justify-center border-b"
                            style={{
                              borderColor: 'var(--border)',
                              backgroundColor: 'var(--surface-sunken)',
                            }}
                          >
                            <FileText
                              className="h-5 w-5"
                              style={{ color: 'var(--text-subtle)' }}
                              strokeWidth={1.5}
                            />
                          </div>
                        )}

                        <div className="flex flex-1 flex-col justify-between p-3.5">
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span
                                style={type.style}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] border text-[10px] font-medium"
                              >
                                <span
                                  style={{ backgroundColor: type.dotColor }}
                                  className="h-1 w-1 rounded-full"
                                />
                                {type.label}
                              </span>
                              <span
                                className="font-mono text-[10px] tabular-nums"
                                style={{ color: 'var(--text-subtle)' }}
                              >
                                {formatDateTime(report.createdAt)}
                              </span>
                            </div>

                            <h3
                              className="text-xs font-semibold leading-snug"
                              style={{ color: 'var(--text)' }}
                            >
                              {report.title}
                            </h3>

                            {report.ozonOrderId && (
                              <div
                                className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded-[4px] border"
                                style={{
                                  backgroundColor: 'var(--surface-sunken)',
                                  borderColor: 'var(--border)',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                <span>{report.ozonOrderId}</span>
                              </div>
                            )}

                            {report.description && (
                              <p
                                className="mt-1.5 text-xs line-clamp-2 leading-relaxed"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {report.description}
                              </p>
                            )}
                          </div>

                          <div
                            className="mt-3 flex items-center justify-between border-t pt-2 text-[11px]"
                            style={{
                              borderColor: 'var(--border)',
                              color: 'var(--text-subtle)',
                            }}
                          >
                            <span>
                              {report.source === 'warehouse' ? 'Cybinka deposu' : 'Manuel kayıt'}
                            </span>

                            <div className="flex items-center gap-1">
                              {report.mediaUrl && (
                                <a
                                  href={report.mediaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1 hover:text-slate-900"
                                  title="Yeni sekmede aç"
                                >
                                  <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteReport(report.id)}
                                disabled={deletingReportId === report.id}
                                className="p-1 hover:text-red-700"
                                title="Bildirimi sil"
                              >
                                {deletingReportId === report.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
                                ) : (
                                  <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. SEKME: STOK ENVANTERİ (STOCKS) */}
        {activeTab === 'stocks' && (
          <div className={styles.card}>
            <div
              className="border-b px-5 py-3.5"
              style={{ borderColor: 'var(--border)' }}
            >
              <h2
                className="text-sm font-semibold"
                style={{ color: 'var(--text)' }}
              >
                Depo stok envanteri
              </h2>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Cybinka deposu / Polonya
              </p>
            </div>

            {stocks.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                  Sıfır stoklu çapraz sevkiyat modeli devrede.
                </p>
                <p
                  className="mx-auto mt-1 max-w-[65ch] text-xs leading-relaxed"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Ürünler depoda uzun süre bekletilmez; Amazon veya Allegro’dan ulaştığı gün Ozon etiketi yapıştırılarak hava kargoya teslim edilir.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: '46%' }}>Ürün</th>
                      <th style={{ width: '18%', textAlign: 'right' }}>Kullanılabilir</th>
                      <th style={{ width: '18%', textAlign: 'right' }}>Rezerve</th>
                      <th style={{ width: '18%', textAlign: 'right' }}>Kusurlu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stocks.map((item) => (
                      <tr key={item.good_id}>
                        <td>
                          <div
                            className="font-medium truncate text-xs"
                            style={{ color: 'var(--text)' }}
                          >
                            {item.good_name || item.good_id}
                          </div>
                          {item.eans?.length ? (
                            <div
                              className="font-mono text-[11px] mt-0.5"
                              style={{ color: 'var(--text-subtle)' }}
                            >
                              {item.eans[0]}
                            </div>
                          ) : null}
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono tabular-nums">
                          {formatNumber(item.useful_qnt)}
                        </td>
                        <td
                          style={{ textAlign: 'right', color: 'var(--text-muted)' }}
                          className="font-mono tabular-nums"
                        >
                          {formatNumber(item.reserve_qnt)}
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            color: item.defect_qnt > 0 ? 'var(--danger)' : 'var(--text-subtle)',
                          }}
                          className="font-mono tabular-nums font-medium"
                        >
                          {formatNumber(item.defect_qnt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* YENİ BİLDİRİM MODALI — Yönerge Madde 6: 16px yarıçap, shadow-3, blur yok */}
      {showReportModal && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          onClick={() => setShowReportModal(false)}
        >
          <div
            className={styles.modal}
            style={{ width: '100%', maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-3.5"
              style={{ borderColor: 'var(--border)' }}
            >
              <h3
                className="text-sm font-semibold"
                style={{ color: 'var(--text)' }}
              >
                Yeni depo bildirimi ekle
              </h3>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
                aria-label="Kapat"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <form onSubmit={handleReportSubmit} className="p-5 space-y-4">
              {reportSubmitError && (
                <div
                  className="p-3 rounded-[6px] border text-xs"
                  style={{
                    backgroundColor: 'var(--danger-bg)',
                    borderColor: 'var(--danger-border)',
                    color: 'var(--danger)',
                  }}
                >
                  {reportSubmitError}
                </div>
              )}

              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--text)' }}
                >
                  İlgili Ozon sipariş numarası
                </label>
                <input
                  type="text"
                  placeholder="45612345-0012-1"
                  value={reportForm.ozonOrderId}
                  onChange={(e) => setReportForm({ ...reportForm, ozonOrderId: e.target.value })}
                  className={`${styles.input} font-mono`}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--text)' }}
                >
                  Bildirim türü
                </label>
                <select
                  value={reportForm.type}
                  onChange={(e) => setReportForm({ ...reportForm, type: e.target.value })}
                  className={styles.select}
                >
                  <option value="photo">Koli / ürün foto-kontrol</option>
                  <option value="damage">Hasar tutanağı</option>
                  <option value="inspection">Koli muayene ve kontrol</option>
                  <option value="note">Genel depo notu</option>
                </select>
              </div>

              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--text)' }}
                >
                  Başlık <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Koli teslim alındı"
                  value={reportForm.title}
                  onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
                  required
                  className={styles.input}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--text)' }}
                >
                  Açıklama
                </label>
                <textarea
                  rows={2}
                  placeholder="Kutuda deformasyon yok, Ozon etiketi basıldı."
                  value={reportForm.description}
                  onChange={(e) =>
                    setReportForm({ ...reportForm, description: e.target.value })
                  }
                  className={styles.textarea}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--text)' }}
                >
                  Görsel veya belge
                </label>
                <div
                  className="p-3 border border-dashed rounded-[6px] text-center"
                  style={{
                    borderColor: 'var(--border-strong)',
                    backgroundColor: 'var(--surface-sunken)',
                  }}
                >
                  {reportMediaFile ? (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-mono">{reportMediaFile.name}</span>
                      <button
                        type="button"
                        onClick={() => setReportMediaFile(null)}
                        className="p-1 text-slate-400 hover:text-slate-700"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 py-1 text-xs">
                      <Upload className="h-4 w-4" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
                      <span style={{ color: 'var(--text)' }}>Dosya seçin (JPG, PNG, PDF)</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleReportMediaChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div
                className="flex items-center justify-end gap-2 pt-3 border-t"
                style={{ borderColor: 'var(--border)' }}
              >
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className={styles.btnSecondary}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className={styles.btnPrimary}
                >
                  {submittingReport ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                      <span>Kaydediliyor…</span>
                    </>
                  ) : (
                    <span>Kaydet</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIGHTBOX (FOTOĞRAF BÜYÜTME) — Yönerge Madde 6: Mat karartma, blur yok */}
      {lightboxUrl && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Depo görseli"
            className="max-h-[88vh] max-w-[90vw] rounded-[12px] border border-black/20 object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-[6px] bg-white/20 text-white hover:bg-white/30"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
