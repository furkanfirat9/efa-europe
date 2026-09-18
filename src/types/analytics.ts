export interface DayMetric {
  date: string;
  hitsViewSearch: number;
  hitsViewPdp: number;
  hitsViewTotal: number;
  sessionView: number;
  sessionViewSearch?: number;
  sessionViewPdp?: number;
  hitsToCart: number;
  convToCart: number;
  convToCartSearch?: number;
  convToCartPdp?: number;
  orderedUnits: number;
  revenue: number;
  positionCategory: number;
}

export interface HourlyOrderMetric {
  hour: string; // '00:00', '01:00', ...
  orders: number;
  revenue: number;
  date: string;
}

export interface SkuMetric {
  sku: string;
  name: string;
  offerId?: string;
  primaryImage?: string;
  hitsViewSearch: number;
  hitsViewPdp: number;
  hitsToCart: number;
  convToCart: number;
  orderedUnits: number;
  revenue: number;
  positionCategory: number;
}

export interface AnalyticsSummary {
  hitsViewSearch: number;
  hitsViewPdp: number;
  hitsViewTotal: number;
  sessionView: number;
  sessionViewSearch: number;
  sessionViewPdp: number;
  hitsToCart: number;
  convToCart: number;
  convToCartSearch: number;
  convToCartPdp: number;
  orderedUnits: number;
  revenue: number;
  avgPositionCategory: number;
  ctrPdp: number;
}

export interface OrderItem {
  sku: string;
  offerId: string;
  name: string;
  price: number;
  quantity: number;
  currency: string;
  primaryImage?: string;
}

export interface RecentOrder {
  postingNumber: string;
  orderId: string;
  status: string;
  statusName: string;
  inProcessAt: string;
  shipmentDate?: string;
  totalPrice: number;
  currency: string;
  customerCity?: string;
  customerRegion?: string;
  customerName?: string;
  latitude?: number;
  longitude?: number;
  products: OrderItem[];
}

export interface AnalyticsData {
  success: boolean;
  store: string;
  dateRange: { from: string; to: string };
  summary: AnalyticsSummary;
  days: DayMetric[];
  hourlyOrders: HourlyOrderMetric[];
  topProducts: SkuMetric[];
  recentOrders?: RecentOrder[];
  updatedAt: string;
}
