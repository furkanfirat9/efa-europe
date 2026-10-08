'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { categoryTotals, signedTry, type DocumentItem } from '@/app/belgeler/utils';
import type { SalesInvoiceDto } from '@/lib/sales-invoices/service';
import type { InvoiceOrderRow } from '@/lib/efatura/issue';

export interface MonthOption {
  key: string;        // YYYY-MM
  label: string;      // Eylül 2026
  shortLabel: string; // Eyl
  year: number;
  month: number;
  isCurrent: boolean;
  dateFrom: string;   // YYYY-MM-01
  dateTo: string;     // YYYY-MM-DD (ay sonu)
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
    });
  }

  return options;
}

/**
 * Avrupa mağazasının aylık hasılat ve kurumlar vergisi hesabı.
 *
 * Hasılat, Belgeler → Satış faturaları'ndaki kesilmiş faturaların TL toplamıdır; her
 * fatura kendi günündeki kurla kesildiği için tek bir kurla çevrilmez, iade faturaları
 * düşülür. Gider, Belgeler'deki onaylı alış / gider faturalarından gelir. Faturası henüz
 * kesilmemiş siparişler (Fatura oluştur) hasılata girmez, ayrıca gösterilir.
 */
export function useEuropeAccounting() {
  const monthOptions = useMemo(() => generateMonthOptions(), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(monthOptions[0]?.key || '');

  const activeMonth = useMemo(() => {
    return monthOptions.find((m) => m.key === selectedMonthKey) || monthOptions[0];
  }, [monthOptions, selectedMonthKey]);

  // Belgeler → Satış faturaları
  const [sales, setSales] = useState({ totalTry: 0, totalUsd: 0, count: 0, missingFx: 0 });
  const [salesLoading, setSalesLoading] = useState<boolean>(true);

  // Ay içinde gelip faturası kesilmemiş siparişler
  const [pending, setPending] = useState({ count: 0, totalUsd: 0 });
  const [pendingLoading, setPendingLoading] = useState<boolean>(true);

  // Belgeler sayfasındaki onaylı gider belgeleri (TL)
  const [expenses, setExpenses] = useState({ total: 0, goods: 0, ozon: 0, documentCount: 0, pendingCount: 0 });
  const [expensesLoading, setExpensesLoading] = useState<boolean>(true);

  // Kambiyo zararı: kartla ödenen alışlarda karttan çekilen TL − faturanın TCMB kuruyla TL'si
  const [fxLoss, setFxLoss] = useState({ total: 0, count: 0 });
  const [fxLossLoading, setFxLossLoading] = useState<boolean>(true);

  // Satış faturalarını, faturası kesilmemiş siparişleri ve giderleri çek
  const fetchData = useCallback(async () => {
    if (!activeMonth) return;

    setSalesLoading(true);
    setPendingLoading(true);
    setExpensesLoading(true);

    try {
      // 1. Ayın satış faturaları
      const res = await fetch(`/api/belgeler/satis?year=${activeMonth.year}&month=${activeMonth.month}`);
      if (res.ok) {
        const invoices: SalesInvoiceDto[] = (await res.json()).invoices ?? [];
        const sign = (inv: SalesInvoiceDto) => (inv.typeCode === 'IADE' ? -1 : 1);
        setSales({
          totalTry: invoices.reduce((acc, inv) => acc + signedTry(inv), 0),
          totalUsd: invoices
            .filter((inv) => inv.currency === 'USD')
            .reduce((acc, inv) => acc + inv.totalAmount * sign(inv), 0),
          count: invoices.length,
          missingFx: invoices.filter((inv) => inv.totalTry == null).length,
        });
      }
    } catch (err) {
      console.error('Satış faturaları alınamadı:', err);
    } finally {
      setSalesLoading(false);
    }

    try {
      // 2. Ay içinde gelip faturası kesilmemiş siparişler (gün Moskova / İstanbul saatiyle)
      const res = await fetch('/api/fatura');
      if (res.ok) {
        const rows: InvoiceOrderRow[] = (await res.json()).pending ?? [];
        const inMonth = rows.filter((r) => {
          if (!r.orderDate) return false;
          const day = new Date(new Date(r.orderDate).getTime() + 3 * 3600_000).toISOString().slice(0, 10);
          return day >= activeMonth.dateFrom && day <= activeMonth.dateTo;
        });
        setPending({ count: inMonth.length, totalUsd: inMonth.reduce((acc, r) => acc + r.amount, 0) });
      }
    } catch (err) {
      console.error('Faturası kesilmemiş siparişler alınamadı:', err);
    } finally {
      setPendingLoading(false);
    }

    try {
      // 3. Belgeler sayfasındaki ayın onaylı gider belgeleri. Onay bekleyenler toplama girmez.
      const docsRes = await fetch(`/api/belgeler?year=${activeMonth.year}&month=${activeMonth.month}`);
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        const documents: DocumentItem[] = docsData.documents ?? [];
        // Çok kalemli belgelerde (Ozon UPD'si) tutar kalem kategorilerine dağıtılır.
        const totals = categoryTotals(documents);
        const sumOf = (prefix: string) =>
          totals.filter((t) => t.key === prefix || t.key.startsWith(`${prefix}.`)).reduce((acc, t) => acc + t.total, 0);
        setExpenses({
          total: totals.reduce((acc, t) => acc + t.total, 0),
          goods: sumOf('tedarik'),
          ozon: sumOf('ozon'),
          documentCount: documents.length,
          pendingCount: (docsData.pending ?? []).length,
        });
      }
    } catch (err) {
      console.error('Belgeler sayfasından giderler alınamadı:', err);
    } finally {
      setExpensesLoading(false);
    }

    setFxLossLoading(true);
    try {
      // 4. Ayın kambiyo zararı (giderlere eklenir)
      const res = await fetch(`/api/muhasebe/kambiyo?year=${activeMonth.year}&month=${activeMonth.month}`);
      const data = await res.json();
      if (data.success) setFxLoss({ total: data.total, count: data.count });
    } catch (err) {
      console.error('Kambiyo zararı alınamadı:', err);
    } finally {
      setFxLossLoading(false);
    }
  }, [activeMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Brüt hasılat (TL): kesilmiş satış faturalarının toplamı
  const invoiceTotalTry = sales.totalTry;

  // Faturalardaki ağırlıklı ortalama kur (bilgi amaçlı)
  const averageRate = sales.totalUsd > 0 ? sales.totalTry / sales.totalUsd : 0;

  // Dinamik Vergi & Kâr Hesaplaması
  const totalExpenses = expenses.total + fxLoss.total;

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
    loading: salesLoading || expensesLoading || fxLossLoading,
    salesLoading,
    pendingLoading,
    expensesLoading: expensesLoading || fxLossLoading,
    fxLossLoading,
    sales,
    pending,
    averageRate,
    expenses,
    fxLoss,
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
