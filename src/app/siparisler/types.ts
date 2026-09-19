export interface OrderItem {
  id: string;
  postingNumber: string;
  orderId: string;
  storeId: string;
  status: string;
  statusName?: string;
  inProcessAt?: string;
  shipmentDate?: string;
  totalPrice: number;
  salePrice: number;
  currency: string;
  customerName?: string;
  customerCity?: string;
  customerRegion?: string;
  customerAddressTail?: string;
  productOfferId?: string;
  productTitle?: string;
  productImage?: string;
  buyPrice?: number | null;
  buyCurrency?: string | null;
  buyPriceTry?: number | null;
  paymentCard?: string | null;
  supplier?: string | null;
  supplierOrderId?: string | null;
  supplierTracking?: string | null;
  purchaseDate?: string | null;
  netProfit?: number | null;
  netProfitTry?: number | null;
  notes?: string | null;
  // Yüklü belge (dosya /api/siparisler/document üzerinden açılır)
  documentName?: string | null;
  documentContentType?: string | null;
  documentSize?: number | null;
  documentUploadedAt?: string | null;
}

export type OrderDocumentFields = Pick<
  OrderItem,
  'documentName' | 'documentContentType' | 'documentSize' | 'documentUploadedAt'
>;

export interface MonthOption {
  value: number;
  label: string;
}

export const MONTHS: MonthOption[] = [
  { value: 1, label: 'Ocak' },
  { value: 2, label: 'Şubat' },
  { value: 3, label: 'Mart' },
  { value: 4, label: 'Nisan' },
  { value: 5, label: 'Mayıs' },
  { value: 6, label: 'Haziran' },
  { value: 7, label: 'Temmuz' },
  { value: 8, label: 'Ağustos' },
  { value: 9, label: 'Eylül' },
  { value: 10, label: 'Ekim' },
  { value: 11, label: 'Kasım' },
  { value: 12, label: 'Aralık' },
];

export function getAvailableYears(): number[] {
  const currentYear = new Date().getFullYear();
  const startYear = 2024;
  const years: number[] = [];
  for (let y = startYear; y <= currentYear; y++) {
    years.push(y);
  }
  return years;
}

export const AVAILABLE_YEARS: number[] = getAvailableYears();

export interface OrderStats {
  totalOrders: number;
  awaitingOrders: number;
  cancelledOrders: number;
  uncalculatedOrders: number;
  totalRevenueUsd: number;
  totalBuyCostTry: number;
  totalNetProfitTry: number;
  recordedBuyCount: number;
}

export interface CardOption {
  value: string;
  label: string;
}

export const CARD_OPTIONS: CardOption[] = [
  { value: '', label: 'Seçiniz' },
  { value: 'Enpara', label: 'Enpara' },
  { value: 'QNB Finansbank', label: 'QNB Finansbank' },
  { value: 'Garanti BBVA', label: 'Garanti BBVA' },
  { value: 'İş Bankası', label: 'İş Bankası' },
  { value: 'Yapı Kredi', label: 'Yapı Kredi' },
  { value: 'Akbank', label: 'Akbank' },
  { value: 'Ziraat Bankası', label: 'Ziraat' },
  { value: 'Wise', label: 'Wise' },
  { value: 'Diğer', label: 'Diğer' },
];

export interface StatusFilterOption {
  key: string;
  label: string;
  fullLabel: string;
  dotColor: string;
}

export const STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
  { key: 'all', label: 'Tümü', fullLabel: 'Tümü (İptaller Hariç)', dotColor: 'bg-slate-400' },
  { key: 'awaiting', label: 'Sevk Bekleyenler', fullLabel: 'Sevk Bekleyenler', dotColor: 'bg-amber-500' },
  { key: 'delivering', label: 'Kargodakiler', fullLabel: 'Kargodakiler', dotColor: 'bg-blue-500' },
  { key: 'delivered', label: 'Teslim Edilenler', fullLabel: 'Teslim Edilenler', dotColor: 'bg-emerald-500' },
  { key: 'cancelled', label: 'İptaller', fullLabel: 'İptal Edilenler', dotColor: 'bg-rose-500' },
  { key: 'uncalculated', label: 'Hesaplanmayanlar', fullLabel: 'Hesaplanmayanlar', dotColor: 'bg-purple-500' },
];
