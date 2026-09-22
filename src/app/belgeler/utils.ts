import { categoryLabel } from '@/lib/documents/categories';
import type { AccountingDocumentDto } from '@/lib/documents/service';

export type DocumentItem = AccountingDocumentDto;

/** Siparişler sayfasına yüklenmiş, henüz okunmamış alış faturası. */
export interface OrderDocumentItem {
  postingNumber: string;
  fileName: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
  supplier: string | null;
  supplierOrderId: string | null;
  orderDate: string | null;
}

/**
 * Kategori bazında TL toplamları. Ozon UPD'si gibi çok kalemli belgelerde toplam,
 * kalemlerin kendi kategorilerine oranlanarak dağıtılır.
 */
export function categoryTotals(documents: DocumentItem[]): { key: string; label: string; total: number }[] {
  const totals = new Map<string, number>();
  const add = (key: string | null, amount: number) => {
    const k = key ?? 'diger';
    totals.set(k, (totals.get(k) ?? 0) + amount);
  };

  for (const doc of documents) {
    const tl = doc.totalTry ?? 0;
    if (!tl) continue;
    const lineSum = doc.lines.reduce((acc, l) => acc + (l.amount ?? 0), 0);
    if (!doc.category && doc.lines.length && lineSum > 0) {
      for (const line of doc.lines) add(line.category, (tl * (line.amount ?? 0)) / lineSum);
    } else {
      add(doc.category, tl);
    }
  }

  return [...totals]
    .map(([key, total]) => ({ key, label: categoryLabel(key), total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

/** Tabloda gösterilecek kategori adı; çok kalemli belgelerde kalem sayısını da söyler. */
export function documentCategoryLabel(doc: DocumentItem): string {
  if (doc.category) return doc.categoryLabel;
  const categories = new Set(doc.lines.map((l) => l.category).filter(Boolean));
  if (categories.size === 1) return categoryLabel([...categories][0]!);
  if (categories.size > 1) return `${doc.lines.length} kalem`;
  return 'Kategorisiz';
}

export const DOC_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';
export const CURRENCIES = ['EUR', 'PLN', 'USD', 'TRY'] as const;

const amountFormatters = new Map<string, Intl.NumberFormat>();

/** Belgenin kendi para biriminde tutar: "139,89 PLN", "36,09 €" */
export function formatAmount(value?: number | null, currency?: string | null): string {
  if (value === null || value === undefined) return '—';
  if (!currency) return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  let formatter = amountFormatters.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('tr-TR', { style: 'currency', currency });
    } catch {
      formatter = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    amountFormatters.set(currency, formatter);
  }
  return formatter.format(value);
}

/** "2026-09-18" → "18.09.2026" */
export const formatIsoDate = (iso?: string | null) => (iso ? iso.split('-').reverse().join('.') : '—');

export const formatRate = (rate?: number | null) =>
  rate == null ? '—' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 4 }).format(rate);

export const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export const YEARS = (() => {
  const years: number[] = [];
  for (let y = 2024; y <= new Date().getFullYear(); y++) years.push(y);
  return years;
})();

export const SALES_ACCEPT = '.zip,.xml,application/zip,application/x-zip-compressed,application/xml,text/xml';

const INVOICE_TYPE_LABELS: Record<string, string> = {
  SATIS: 'Satış',
  ISTISNA: 'İstisna',
  IADE: 'İade',
  TEVKIFAT: 'Tevkifat',
  IHRACKAYITLI: 'İhraç kayıtlı',
  OZELMATRAH: 'Özel matrah',
};

/** "ISTISNA" → "İstisna"; bilinmeyen tip olduğu gibi gösterilir. */
export const invoiceTypeLabel = (code?: string | null) => (code ? INVOICE_TYPE_LABELS[code] ?? code : '—');

/** Satış toplamlarında iade faturası eksiye yazılır. */
export const signedTry = (inv: { typeCode: string | null; totalTry: number | null }) =>
  (inv.totalTry ?? 0) * (inv.typeCode === 'IADE' ? -1 : 1);
