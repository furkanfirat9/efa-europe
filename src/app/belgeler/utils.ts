import type { AccountingDocumentDto } from '@/lib/documents/service';

export type DocumentItem = AccountingDocumentDto;

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
