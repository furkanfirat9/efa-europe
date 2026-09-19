'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt,
  Building2,
  Calendar,
  Check,
  Copy,
  FileText,
  DollarSign,
  TrendingUp,
  RefreshCw,
  HelpCircle,
  Download,
  AlertCircle,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { formatTL, formatUSD, formatTrNumber } from '@/lib/format';

interface OrderItem {
  sku: string;
  offerId: string;
  name: string;
  price: number;
  quantity: number;
  primaryImage?: string;
}

interface RecentOrder {
  postingNumber: string;
  orderId: string;
  status: string;
  statusName: string;
  inProcessAt: string;
  totalPrice: number;
  currency: string;
  customerCity: string;
  products: OrderItem[];
}

interface MonthOption {
  key: string;        // YYYY-MM
  label: string;      // Eylül 2026
  year: number;
  month: number;
  isCurrent: boolean;
  dateFrom: string;   // YYYY-MM-01
  dateTo: string;     // YYYY-MM-DD (ay sonu)
  invoiceDate: string;// DD.MM.YYYY (ay sonu)
}

// Son 6 ayı üreten yardımcı fonksiyon
function generateMonthOptions(): MonthOption[] {
  const options: MonthOption[] = [];
  const now = new Date();
  const localNow = new Date(now.getTime() + 3 * 3600 * 1000);
  const curYear = localNow.getUTCFullYear();
  const curMonth = localNow.getUTCMonth(); // 0-indexed

  const monthNames = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(curYear, curMonth - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth(); // 0-indexed
    const mStr = String(m + 1).padStart(2, '0');
    
    // Ayın son gününü bul
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lastDayStr = String(lastDay).padStart(2, '0');

    const isCurrent = i === 0;

    options.push({
      key: `${y}-${mStr}`,
      label: `${monthNames[m]} ${y}`,
      year: y,
      month: m + 1,
      isCurrent,
      dateFrom: `${y}-${mStr}-01`,
      dateTo: `${y}-${mStr}-${lastDayStr}`,
      invoiceDate: `${lastDayStr}.${mStr}.${y}`,
    });
  }

  return options;
}

export function EuropeAccountingPanel() {
  const monthOptions = useMemo(() => generateMonthOptions(), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(monthOptions[0]?.key || '');
  
  const activeMonth = useMemo(() => {
    return monthOptions.find((m) => m.key === selectedMonthKey) || monthOptions[0];
  }, [monthOptions, selectedMonthKey]);

  // Sipariş Verileri
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [totalRevenueUsd, setTotalRevenueUsd] = useState<number>(0);
  const [totalOrdersCount, setTotalOrdersCount] = useState<number>(0);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(true);

  // TCMB Kur Verileri
  const [tcmbUsdRate, setTcmbUsdRate] = useState<number>(0);
  const [tcmbDate, setTcmbDate] = useState<string>('');
  const [rateLoading, setRateLoading] = useState<boolean>(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Siparişleri ve TCMB Kurunu Çek
  const fetchData = async () => {
    if (!activeMonth) return;

    setOrdersLoading(true);
    setRateLoading(true);

    try {
      // 1. Ozon Avrupa Mağazası Siparişleri
      const ordersRes = await fetch('/api/ozon/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: 'store1',
          date_from: activeMonth.dateFrom,
          date_to: activeMonth.dateTo,
          mode: 'orders',
        }),
      });

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data.recentOrders || []);
        setTotalRevenueUsd(Number(data.totalRevenue || 0));
        setTotalOrdersCount(Number(data.totalOrders || 0));
      }
    } catch (err) {
      console.error('Ozon sipariş verileri alınamadı:', err);
    } finally {
      setOrdersLoading(false);
    }

    try {
      // 2. TCMB USD Alış Kuru
      // Cari aysa güncel kur; geçmiş aysa ayın son gününün kuru
      const rateUrl = activeMonth.isCurrent
        ? '/api/exchange-rate'
        : `/api/exchange-rate?date=${activeMonth.dateTo}`;

      const rateRes = await fetch(rateUrl);
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        setTcmbUsdRate(Number(rateData.usdBuying || 0));
        setTcmbDate(rateData.effectiveDate || rateData.date || '');
      }
    } catch (err) {
      console.error('TCMB kuru alınamadı:', err);
    } finally {
      setRateLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonthKey]);

  // Fatura Tutarı (TL)
  const invoiceTotalTry = useMemo(() => {
    return totalRevenueUsd * tcmbUsdRate;
  }, [totalRevenueUsd, tcmbUsdRate]);

  // Fatura Açıklaması
  const invoiceDescription = useMemo(() => {
    return `3065 sayılı KDV Kanunu'nun 1. ve 6. maddeleri uyarınca Türkiye gümrük bölgesine girmeyen malların yurt dışı teslimi (Transit Ticaret) kapsamında KDV'den müstesnadır. ${activeMonth.label} dönemi Ozon Avrupa Mağazası sipariş teslimleri hasılatı. Toplam ${totalOrdersCount} adet sipariş.`;
  }, [activeMonth.label, totalOrdersCount]);

  // Kopyalama Yardımcısı
  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // CSV İndirme Yardımcısı
  const downloadCsv = () => {
    if (orders.length === 0) return;
    const header = ['Sipariş No', 'Ozon Sipariş ID', 'Tarih', 'Şehir', 'Tutar (USD)', 'TCMB Kuru', 'Tutar (TL)', 'Ürün'];
    const rows = orders.map((o) => [
      o.postingNumber,
      o.orderId,
      o.inProcessAt ? new Date(o.inProcessAt).toLocaleDateString('tr-TR') : '',
      o.customerCity || '',
      o.totalPrice,
      tcmbUsdRate.toFixed(4),
      (o.totalPrice * tcmbUsdRate).toFixed(2),
      `"${(o.products?.[0]?.name || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [header.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Ozon_Avrupa_Siparisler_${activeMonth.key}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* 1. ÜST BAR: AY SEÇİCİ & YENİLE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[28px] bg-surface p-5 md:p-6 shadow-hairline">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EEEEFC] text-accent">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium tracking-tight text-text-primary">
                Avrupa Mağazası Muhasebe & Fatura Masası
              </h2>
              <span className="rounded-full bg-[#E5F6EC] px-2.5 py-0.5 text-xs font-medium text-[#2E8B57]">
                Transit Ticaret
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              Ozon Avrupa teslimatları için aylık TCMB kuruna endeksli toplu e-Arşiv fatura matrahı.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Ay Seçici */}
          <div className="relative">
            <select
              value={selectedMonthKey}
              onChange={(e) => setSelectedMonthKey(e.target.value)}
              className="h-10 appearance-none rounded-full bg-surface-muted pl-4 pr-10 text-xs font-medium text-text-primary border-none focus:outline-none focus:ring-2 focus:ring-accent/30 cursor-pointer"
            >
              {monthOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label} {opt.isCurrent ? '(Cari Ay)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          </div>

          {/* Yenile Butonu */}
          <button
            onClick={fetchData}
            disabled={ordersLoading || rateLoading}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            title="Verileri Yenile"
          >
            <RefreshCw className={`h-4 w-4 ${ordersLoading || rateLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. BENTO STAT TILES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KART 1: KESİLECEK FATURA TUTARI (TL) */}
        <div className="rounded-[28px] bg-surface p-6 shadow-hairline flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                Kesilecek Fatura Tutarı (TL)
              </span>
              <span className="rounded-full bg-[#EEEEFC] px-2 py-0.5 text-[11px] font-medium text-accent">
                Matrah
              </span>
            </div>
            <div className="mt-3 text-3xl font-medium tracking-tight text-text-primary tabular-nums">
              {ordersLoading || rateLoading ? (
                <span className="inline-block h-8 w-36 animate-pulse rounded-md bg-surface-muted" />
              ) : (
                formatTL(invoiceTotalTry, true)
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs text-text-muted">
            <span>KDV: %0 (KDV Yok)</span>
            <span>{totalRevenueUsd > 0 && tcmbUsdRate > 0 ? `${formatUSD(totalRevenueUsd)} × ${tcmbUsdRate.toFixed(4)} ₺` : '—'}</span>
          </div>
        </div>

        {/* KART 2: DÖVİZ BRÜT CİRO (USD) */}
        <div className="rounded-[28px] bg-surface p-6 shadow-hairline flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                Brüt Döviz Hasılatı
              </span>
              <span className="rounded-full bg-[#F1F1F5] px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                USD
              </span>
            </div>
            <div className="mt-3 text-3xl font-medium tracking-tight text-text-primary tabular-nums">
              {ordersLoading ? (
                <span className="inline-block h-8 w-28 animate-pulse rounded-md bg-surface-muted" />
              ) : (
                formatUSD(totalRevenueUsd)
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs text-text-muted">
            <span>Teslim Edilen Sipariş:</span>
            <span className="font-medium text-text-primary">{totalOrdersCount} Adet</span>
          </div>
        </div>

        {/* KART 3: TCMB USD ALIŞ KURU */}
        <div className="rounded-[28px] bg-surface p-6 shadow-hairline flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                Uygulanan TCMB USD Kuru
              </span>
              <span className="rounded-full bg-[#E5F6EC] px-2 py-0.5 text-[11px] font-medium text-[#2E8B57]">
                Döviz Alış
              </span>
            </div>
            <div className="mt-3 text-3xl font-medium tracking-tight text-text-primary tabular-nums">
              {rateLoading ? (
                <span className="inline-block h-8 w-24 animate-pulse rounded-md bg-surface-muted" />
              ) : (
                `${tcmbUsdRate.toFixed(4)} ₺`
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs text-text-muted">
            <span>Kur Tarihi:</span>
            <span className="font-medium text-text-primary">{tcmbDate || activeMonth.invoiceDate}</span>
          </div>
        </div>

        {/* KART 4: YASAL İSTİSNA & KANUN */}
        <div className="rounded-[28px] bg-surface p-6 shadow-hairline flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                Vergi & İstisna Kodu
              </span>
              <span className="rounded-full bg-[#ECEBFD] px-2 py-0.5 text-[11px] font-medium text-[#5856D6]">
                e-Arşiv Kod
              </span>
            </div>
            <div className="mt-3 text-2xl font-medium tracking-tight text-text-primary">
              351 · Transit Ticaret
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs text-text-muted">
            <span>KDV Kanunu:</span>
            <span className="font-medium text-text-primary">Md. 1 ve 6 (Muaf)</span>
          </div>
        </div>
      </div>

      {/* 3. RESMİ FATURA DOLDURMA KARTI (E-ARŞİV REHBERİ) */}
      <div className="rounded-[28px] bg-surface p-6 md:p-8 shadow-hairline">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-border-subtle gap-4">
          <div>
            <h3 className="text-xl font-medium tracking-tight text-text-primary">
              Resmi e-Arşiv Fatura Kesim Rehberi
            </h3>
            <p className="mt-1 text-xs text-text-secondary">
              Mali müşavirinizin veya portalınızın faturayı düzenlerken gireceği hazır parametreler.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadCsv}
              disabled={orders.length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-4 py-2 text-xs font-medium text-text-primary hover:bg-[#EEEEFC] hover:text-accent transition-colors disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Sipariş Dökümünü İndir (Excel/CSV)</span>
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Fatura Tarihi */}
          <div className="rounded-[20px] bg-surface-muted p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider block">
                Fatura Düzenleme Tarihi
              </span>
              <span className="text-sm font-medium text-text-primary mt-0.5 block">
                {activeMonth.invoiceDate}
              </span>
              <span className="text-[10px] text-text-secondary block mt-0.5">
                (İlgili ayın son takvim günü)
              </span>
            </div>
            <button
              onClick={() => copyToClipboard(activeMonth.invoiceDate, 'invoiceDate')}
              className="h-8 w-8 rounded-full bg-surface flex items-center justify-center text-text-secondary hover:text-text-primary shadow-xs transition-colors"
              title="Kopyala"
            >
              {copiedField === 'invoiceDate' ? <Check className="h-4 w-4 text-[#2E8B57]" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* Alıcı Ünvanı */}
          <div className="rounded-[20px] bg-surface-muted p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider block">
                Alıcı Ünvanı / Müşteri
              </span>
              <span className="text-sm font-medium text-text-primary mt-0.5 block truncate max-w-[200px]">
                Nihai Tüketici (Muhtelif Alıcılar)
              </span>
              <span className="text-[10px] text-text-secondary block mt-0.5">
                (Ozon Global B2C Rusya Satışları)
              </span>
            </div>
            <button
              onClick={() => copyToClipboard('Nihai Tüketici (Muhtelif Rusya Alıcıları / Ozon B2C)', 'customerName')}
              className="h-8 w-8 rounded-full bg-surface flex items-center justify-center text-text-secondary hover:text-text-primary shadow-xs transition-colors"
              title="Kopyala"
            >
              {copiedField === 'customerName' ? <Check className="h-4 w-4 text-[#2E8B57]" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* VKN / TCKN */}
          <div className="rounded-[20px] bg-surface-muted p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider block">
                Vergi / Kimlik Numarası (VKN)
              </span>
              <span className="text-sm font-medium text-text-primary mt-0.5 block font-mono">
                1111111111
              </span>
              <span className="text-[10px] text-text-secondary block mt-0.5">
                (Yurtdışı nihai tüketici standart kodu)
              </span>
            </div>
            <button
              onClick={() => copyToClipboard('1111111111', 'vkn')}
              className="h-8 w-8 rounded-full bg-surface flex items-center justify-center text-text-secondary hover:text-text-primary shadow-xs transition-colors"
              title="Kopyala"
            >
              {copiedField === 'vkn' ? <Check className="h-4 w-4 text-[#2E8B57]" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* Fatura Türü */}
          <div className="rounded-[20px] bg-surface-muted p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider block">
                Fatura Türü & KDV
              </span>
              <span className="text-sm font-medium text-text-primary mt-0.5 block">
                İSTİSNA (%0 KDV)
              </span>
              <span className="text-[10px] text-text-secondary block mt-0.5">
                KDV Tutarı: 0,00 ₺
              </span>
            </div>
            <button
              onClick={() => copyToClipboard('İSTİSNA', 'faturaTuru')}
              className="h-8 w-8 rounded-full bg-surface flex items-center justify-center text-text-secondary hover:text-text-primary shadow-xs transition-colors"
              title="Kopyala"
            >
              {copiedField === 'faturaTuru' ? <Check className="h-4 w-4 text-[#2E8B57]" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* İstisna Kodu */}
          <div className="rounded-[20px] bg-surface-muted p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider block">
                GİB KDV İstisna Muafiyet Kodu
              </span>
              <span className="text-sm font-medium text-text-primary mt-0.5 block">
                351 - İstisna Olmayan Diğer
              </span>
              <span className="text-[10px] text-text-secondary block mt-0.5">
                Transit Ticaret (KDV Kanunu Md. 1 ve 6)
              </span>
            </div>
            <button
              onClick={() => copyToClipboard('351', 'istisnaKodu')}
              className="h-8 w-8 rounded-full bg-surface flex items-center justify-center text-text-secondary hover:text-text-primary shadow-xs transition-colors"
              title="Kopyala"
            >
              {copiedField === 'istisnaKodu' ? <Check className="h-4 w-4 text-[#2E8B57]" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* Net Matrah */}
          <div className="rounded-[20px] bg-surface-muted p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider block">
                Fatura Net Matrahı (TL)
              </span>
              <span className="text-sm font-medium text-text-primary mt-0.5 block tabular-nums">
                {formatTL(invoiceTotalTry, true)}
              </span>
              <span className="text-[10px] text-text-secondary block mt-0.5">
                ({formatUSD(totalRevenueUsd)} @ {tcmbUsdRate.toFixed(4)} ₺)
              </span>
            </div>
            <button
              onClick={() => copyToClipboard(invoiceTotalTry.toFixed(2), 'matrah')}
              className="h-8 w-8 rounded-full bg-surface flex items-center justify-center text-text-secondary hover:text-text-primary shadow-xs transition-colors"
              title="Kopyala"
            >
              {copiedField === 'matrah' ? <Check className="h-4 w-4 text-[#2E8B57]" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Fatura Açıklaması Kutusu */}
        <div className="mt-4 rounded-[20px] bg-surface-muted p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider">
              Resmi Fatura Notu / Açıklaması (GİB e-Arşiv Not Alanı)
            </span>
            <button
              onClick={() => copyToClipboard(invoiceDescription, 'description')}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              {copiedField === 'description' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#2E8B57]" />
                  <span className="text-[#2E8B57]">Kopyalandı!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Notu Kopyala</span>
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-text-secondary font-mono leading-relaxed bg-surface p-3 rounded-[12px] border border-border-subtle">
            {invoiceDescription}
          </p>
        </div>
      </div>

      {/* 4. SİPARİŞ LİSTESİ TABLOSU */}
      <div className="rounded-[28px] bg-surface p-6 md:p-8 shadow-hairline">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium tracking-tight text-text-primary">
              {activeMonth.label} Dönemi Ozon Sipariş Dökümü
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              İlgili ayda teslim edilen / işleme alınan faturalandırılacak net siparişler ({orders.length} Adet).
            </p>
          </div>
        </div>

        {ordersLoading ? (
          <div className="py-12 text-center text-xs text-text-muted animate-pulse">
            Ozon Avrupa siparişleri yükleniyor...
          </div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center text-xs text-text-muted">
            Bu dönem için teslim edilmiş sipariş bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="rounded-[12px] bg-surface-muted text-[11px] font-medium text-text-muted uppercase tracking-wider">
                  <th className="py-3 px-4 rounded-l-[12px]">Sipariş No</th>
                  <th className="py-3 px-4">Tarih</th>
                  <th className="py-3 px-4">Ürün Adı</th>
                  <th className="py-3 px-4">Teslimat Şehri</th>
                  <th className="py-3 px-4 text-right">Tutar (USD)</th>
                  <th className="py-3 px-4 text-right rounded-r-[12px]">Tutar (TL)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-xs">
                {orders.map((o) => {
                  const item = o.products?.[0];
                  const tryAmount = o.totalPrice * tcmbUsdRate;

                  return (
                    <tr key={o.postingNumber} className="hover:bg-surface-muted/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-text-primary">
                        {o.postingNumber}
                      </td>
                      <td className="py-3.5 px-4 text-text-secondary">
                        {o.inProcessAt ? new Date(o.inProcessAt).toLocaleDateString('tr-TR') : '—'}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs truncate text-text-primary" title={item?.name}>
                        {item?.name || 'Ürün'}
                      </td>
                      <td className="py-3.5 px-4 text-text-secondary">
                        {o.customerCity || 'Rusya'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-text-primary tabular-nums">
                        {formatUSD(o.totalPrice)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-text-primary tabular-nums">
                        {formatTL(tryAmount, true)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
