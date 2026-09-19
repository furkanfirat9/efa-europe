'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface MonthOption {
  key: string;        // YYYY-MM
  label: string;      // Eylül 2026
  shortLabel: string; // Eyl
  year: number;
  month: number;
  isCurrent: boolean;
  dateFrom: string;   // YYYY-MM-01
  dateTo: string;     // YYYY-MM-DD (ay sonu)
  invoiceDate: string;// DD.MM.YYYY (ay sonu)
}

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

// Son 6 ayı üreten yardımcı fonksiyon
function generateMonthOptions(): MonthOption[] {
  const options: MonthOption[] = [];
  const now = new Date();
  const localNow = new Date(now.getTime() + 3 * 3600 * 1000);
  const curYear = localNow.getUTCFullYear();
  const curMonth = localNow.getUTCMonth(); // 0-indexed

  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(curYear, curMonth - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth(); // 0-indexed
    const mStr = String(m + 1).padStart(2, '0');

    // Ayın son gününü bul
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lastDayStr = String(lastDay).padStart(2, '0');

    options.push({
      key: `${y}-${mStr}`,
      label: `${MONTH_NAMES[m]} ${y}`,
      shortLabel: MONTH_NAMES[m].slice(0, 3),
      year: y,
      month: m + 1,
      isCurrent: i === 0,
      dateFrom: `${y}-${mStr}-01`,
      dateTo: `${y}-${mStr}-${lastDayStr}`,
      invoiceDate: `${lastDayStr}.${mStr}.${y}`,
    });
  }

  return options;
}

/**
 * Avrupa mağazasının aylık fatura ve kurumlar vergisi hesabı.
 * Ozon siparişleri (USD), TCMB döviz alış kuru ve Siparişler sayfasına
 * girilen alış maliyetleri seçilen ay için birlikte çekilir.
 */
export function useEuropeAccounting() {
  const monthOptions = useMemo(() => generateMonthOptions(), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(monthOptions[0]?.key || '');

  const activeMonth = useMemo(() => {
    return monthOptions.find((m) => m.key === selectedMonthKey) || monthOptions[0];
  }, [monthOptions, selectedMonthKey]);

  // Sipariş Verileri (Ozon)
  const [totalRevenueUsd, setTotalRevenueUsd] = useState<number>(0);
  const [totalOrdersCount, setTotalOrdersCount] = useState<number>(0);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(true);

  // TCMB Kur Verileri
  const [tcmbUsdRate, setTcmbUsdRate] = useState<number>(0);
  const [tcmbDate, setTcmbDate] = useState<string>('');
  const [rateLoading, setRateLoading] = useState<boolean>(true);

  // Siparişler Sayfasından Çekilen Alış Maliyeti
  const [ordersBuyCostTry, setOrdersBuyCostTry] = useState<number>(0);
  const [recordedBuyCount, setRecordedBuyCount] = useState<number>(0);
  const [ordersPageTotalCount, setOrdersPageTotalCount] = useState<number>(0);
  const [siparisLoading, setSiparisLoading] = useState<boolean>(true);

  // Kullanıcının Girdiği Diğer Giderler (Kargo, komisyon vb.)
  const [otherExpensesInput, setOtherExpensesInput] = useState<string>('');

  // Ay değişince kayıtlı diğer giderleri localStorage'dan yükle
  useEffect(() => {
    if (typeof window !== 'undefined' && activeMonth) {
      const savedOther = localStorage.getItem(`ozon_other_exp_${activeMonth.key}`) || '';
      setOtherExpensesInput(savedOther);
    }
  }, [selectedMonthKey, activeMonth]);

  const handleOtherExpensesChange = (val: string) => {
    setOtherExpensesInput(val);
    if (typeof window !== 'undefined' && activeMonth) {
      localStorage.setItem(`ozon_other_exp_${activeMonth.key}`, val);
    }
  };

  // Siparişleri, TCMB Kurunu ve Siparişler Sayfasından Alış Fiyatlarını Çek
  const fetchData = useCallback(async () => {
    if (!activeMonth) return;

    setOrdersLoading(true);
    setRateLoading(true);
    setSiparisLoading(true);

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

    try {
      // 3. Siparişler Sayfasından İlgili Ayın Alış Maliyeti
      const siparisRes = await fetch(`/api/siparisler?year=${activeMonth.year}&month=${activeMonth.month}`);
      if (siparisRes.ok) {
        const siparisData = await siparisRes.json();
        const autoBuyCost = Number(siparisData.stats?.totalBuyCostTry || 0);
        setOrdersBuyCostTry(autoBuyCost);
        setRecordedBuyCount(Number(siparisData.stats?.recordedBuyCount || 0));
        setOrdersPageTotalCount(Number(siparisData.stats?.totalOrders || 0));
      }
    } catch (err) {
      console.error('Siparişler sayfasından alış fiyatı alınamadı:', err);
    } finally {
      setSiparisLoading(false);
    }
  }, [activeMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fatura Tutarı / Brüt Hasılat (TL)
  const invoiceTotalTry = totalRevenueUsd * tcmbUsdRate;

  // Dinamik Vergi & Kâr Hesaplaması
  const buyCost = ordersBuyCostTry;
  const otherExpenses = parseFloat(otherExpensesInput.replace(/\./g, '').replace(',', '.')) || 0;
  const totalExpenses = buyCost + otherExpenses;

  // Ticari Kazanç / Kâr (Zarar durumunda 0)
  const commercialProfit = Math.max(0, invoiceTotalTry - totalExpenses);

  // 7582 Sayılı Kanun %95 İstisna / İndirim Tutarı
  const exemptAmount95 = commercialProfit * 0.95;

  // Vergiye Tabi Matrah (%5)
  const taxableBase5 = commercialProfit * 0.05;

  // Ödenecek Kurumlar Vergisi (%25 x %5 = %1,25)
  const corporateTaxToPay = taxableBase5 * 0.25;

  // Şirkette Kalan Net Kâr
  const netProfitAfterTax = commercialProfit - corporateTaxToPay;

  return {
    monthOptions,
    selectedMonthKey,
    setSelectedMonthKey,
    activeMonth,
    fetchData,
    loading: ordersLoading || rateLoading || siparisLoading,
    ordersLoading,
    rateLoading,
    siparisLoading,
    totalRevenueUsd,
    totalOrdersCount,
    tcmbUsdRate,
    tcmbDate,
    ordersBuyCostTry,
    recordedBuyCount,
    ordersPageTotalCount,
    otherExpensesInput,
    handleOtherExpensesChange,
    invoiceTotalTry,
    totalExpenses,
    commercialProfit,
    exemptAmount95,
    taxableBase5,
    corporateTaxToPay,
    netProfitAfterTax,
  };
}

export type EuropeAccounting = ReturnType<typeof useEuropeAccounting>;
