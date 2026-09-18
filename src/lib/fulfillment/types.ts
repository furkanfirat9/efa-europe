export interface LSRateLimits {
  concurrent_qnt: number;
  req_qnt: { day: number; minute: number };
  req_mb: { day: number; minute: number };
  resp_mb: { day: number; minute: number };
  err_qnt: { day: number; minute: number };
  err_mb: { day: number; minute: number };
  duration_minutes: { day: number; minute: number };
}

export interface LSFulfillmentContact {
  logo_url?: string;
  contact_info?: string;
}

export interface LSSettingsResponse {
  success: boolean;
  deliveries?: Array<{ delivery_id: number; delivery_name: string }>;
  rate_limits?: LSRateLimits;
  fulfillment?: LSFulfillmentContact;
  goods_expir_enabled?: boolean;
  goods_surplus_enabled?: boolean;
  error_code?: number;
  error_message?: string;
}

export interface LSOrderForwardedParcel {
  barcode: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
}

export interface LSOrderFile {
  file_name: string;
  file_data: string;
  copy_qnt?: number;
  override?: boolean;
}

export interface LSOrderItem {
  order_id: string;
  delivery_id: number;
  cod: number;
  declared_value?: number;
  created_at?: string;
  indoc_id?: string;
  state?: string;
  wait_reason?: string;
  forwarded_parcels: LSOrderForwardedParcel[];
  files?: LSOrderFile[];
}

export interface LSOrderListItem {
  order_id: string;
  created_at: string;
  indoc_id?: string;
  delivery_id: number;
  state: string;
  wait_reason?: string;
  tracking_number?: string;
}

export interface ArbitrageOrderRecord {
  id: string;
  ozonOrderId: string;
  amazonTrackingBarcode: string;
  productName: string | null;
  quantity: number;
  declaredValue: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  weightGr: number;
  labelPdfUrl: string | null;
  labelFileName: string | null;
  note: string | null;
  status: string;
  lsIndocId: string | null;
  createdAt: string;
  updatedAt: string;
  liveState?: string;
  liveWaitReason?: string;
}

export interface WarehouseReportRecord {
  id: string;
  ozonOrderId: string | null;
  photoId: number | null;
  outdocId: string | null;
  type: 'photo' | 'damage' | 'inspection' | 'note' | string;
  title: string;
  description: string | null;
  mediaUrl: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  order?: ArbitrageOrderRecord | null;
}

export interface LSStockItem {
  good_id: string;
  good_name?: string;
  useful_qnt: number;
  defect_qnt: number;
  surplus_qnt?: number;
  reserve_qnt?: number;
  eans?: string[];
  attributes?: Array<{ attribute_id: number; value: any }>;
}
