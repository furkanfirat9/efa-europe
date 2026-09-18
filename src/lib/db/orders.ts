import { prisma } from './prisma';

function getOrderStatusName(status: string): string {
  switch (status) {
    case 'awaiting_packaging':
      return 'Paketleme Bekliyor';
    case 'awaiting_deliver':
    case 'awaiting_registration':
      return 'Sevkiyat Bekliyor';
    case 'delivering':
    case 'driver_pickup':
      return 'Kargoda';
    case 'delivered':
      return 'Teslim Edildi';
    case 'cancelled':
      return 'İptal Edildi';
    default:
      return status || 'İşleniyor';
  }
}

/**
 * Ozon API'sinden gelen gönderileri veritabanına upsert eder.
 */
export async function syncOzonOrdersToDb(postings: any[], storeId: string = 'store1') {
  if (!postings || postings.length === 0) return { count: 0 };

  let syncedCount = 0;

  for (const p of postings) {
    const postingNumber = p.posting_number;
    if (!postingNumber) continue;

    try {
      const orderId = String(p.order_id || p.order_number || '');
      const status = p.status || 'unknown';
      const statusName = getOrderStatusName(status);

      const inProcessAt = p.in_process_at ? new Date(p.in_process_at) : p.shipment_date ? new Date(p.shipment_date) : null;
      const shipmentDate = p.shipment_date ? new Date(p.shipment_date) : null;

      // Fiyat hesabı
      let totalPrice = 0;
      if (p.financial_data?.products && Array.isArray(p.financial_data.products)) {
        totalPrice = p.financial_data.products.reduce((acc: number, prod: any) => acc + Number(prod.price || 0), 0);
      } else if (p.products && Array.isArray(p.products)) {
        totalPrice = p.products.reduce((acc: number, prod: any) => acc + Number(prod.price || 0), 0);
      }

      const currency = p.products?.[0]?.currency_code || 'RUB';

      // Müşteri & Adres
      const customer = p.customer || {};
      const addr = customer.address || {};
      const customerName = customer.name || p.addressee?.name || null;
      const customerCity = addr.city || p.analytics_data?.city || null;
      const customerRegion = addr.region || p.analytics_data?.region || null;
      const customerCountry = addr.country || 'Россия';
      const customerAddressTail = addr.address_tail || null;
      const latitude = addr.latitude ? Number(addr.latitude) : null;
      const longitude = addr.longitude ? Number(addr.longitude) : null;
      const pvzCode = addr.pvz_code ? Number(addr.pvz_code) : null;

      // Lojistik
      const analytics = p.analytics_data || {};
      const deliveryType = analytics.delivery_type || null;
      const paymentType = analytics.payment_type_group_name || null;
      const warehouseName = analytics.warehouse || null;
      const tplProvider = analytics.tpl_provider || null;
      const deliveryDateBegin = analytics.delivery_date_begin ? new Date(analytics.delivery_date_begin) : null;
      const deliveryDateEnd = analytics.delivery_date_end ? new Date(analytics.delivery_date_end) : null;

      const firstProduct = p.products && p.products.length > 0 ? p.products[0] : null;
      const productOfferId = firstProduct?.offer_id || null;
      const productTitle = firstProduct?.name || null;
      const productImage = p.product_image || firstProduct?.product_image || null;

      const orderData: any = {
        orderId,
        storeId,
        status,
        statusName,
        inProcessAt,
        shipmentDate,
        totalPrice,
        currency,
        customerName,
        customerCity,
        customerRegion,
        customerCountry,
        customerAddressTail,
        latitude,
        longitude,
        pvzCode,
        deliveryType,
        paymentType,
        warehouseName,
        tplProvider,
        deliveryDateBegin,
        deliveryDateEnd,
        productsJson: p.products || [],
        financialDataJson: p.financial_data || null,
        rawDataJson: p,
      };

      if (productOfferId) orderData.productOfferId = productOfferId;
      if (productTitle) orderData.productTitle = productTitle;
      if (productImage) orderData.productImage = productImage;

      const updateData = { ...orderData };
      if (!orderData.productImage) {
        delete updateData.productImage;
      }

      await prisma.ozonOrder.upsert({
        where: { postingNumber },
        create: {
          postingNumber,
          ...orderData,
        },
        update: updateData,
      });

      syncedCount++;
    } catch (err) {
      console.warn(`[Prisma] Sipariş kaydedilemedi (${postingNumber}):`, err);
    }
  }

  return { count: syncedCount };
}

/**
 * Kayıtlı siparişleri filtreleyerek getirir.
 */
export async function getStoredOzonOrders(filter?: {
  storeId?: string;
  status?: string;
  city?: string;
  region?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}) {
  const where: any = {};

  if (filter?.storeId) where.storeId = filter.storeId;
  if (filter?.status) where.status = filter.status;
  if (filter?.city) where.customerCity = { contains: filter.city, mode: 'insensitive' };
  if (filter?.region) where.customerRegion = { contains: filter.region, mode: 'insensitive' };

  if (filter?.dateFrom || filter?.dateTo) {
    where.inProcessAt = {};
    if (filter.dateFrom) where.inProcessAt.gte = filter.dateFrom;
    if (filter.dateTo) where.inProcessAt.lte = filter.dateTo;
  }

  return prisma.ozonOrder.findMany({
    where,
    orderBy: { inProcessAt: 'desc' },
    take: filter?.limit || 100,
  });
}

