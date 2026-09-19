import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { parseTrNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';

function parsePriceFromRaw(p: any): number {
  if (!p) return 0;
  if (p.products && Array.isArray(p.products)) {
    return p.products.reduce((acc: number, item: any) => acc + Number(item.price || 0), 0);
  }
  return Number(p.totalPrice || 0);
}

function extractProductMeta(p: any) {
  let offerId = p.productOfferId || '';
  let title = p.productTitle || '';
  let image = p.productImage || '';
  let sku = '';

  if (p.productsJson && Array.isArray(p.productsJson) && p.productsJson.length > 0) {
    const first = p.productsJson[0];
    if (!offerId && first.offer_id) offerId = first.offer_id;
    if (!title && first.name) title = first.name;
    if (first.sku) sku = String(first.sku);
  }

  // Raw veriden görsel kontrolü
  if (!image && p.rawDataJson?.products?.[0]?.sku) {
    const rawProd = p.rawDataJson.products[0];
    if (rawProd.image_url) image = rawProd.image_url;
  }

  return { offerId, title, image, sku };
}

async function computeStoreStats(storeId = 'store1', startDate?: Date, endDate?: Date) {
  const where: any = { storeId };

  if (startDate && endDate) {
    where.AND = [
      {
        OR: [
          { inProcessAt: { gte: startDate, lt: endDate } },
          { inProcessAt: null, createdAt: { gte: startDate, lt: endDate } },
        ],
      },
    ];
  }

  const allOrders = await prisma.ozonOrder.findMany({
    where,
    select: {
      totalPrice: true,
      currency: true,
      status: true,
      buyPrice: true,
      buyCurrency: true,
      buyPriceTry: true,
      netProfitTry: true,
    },
  });

  const totalOrders = allOrders.length;
  const awaitingOrders = allOrders.filter((o) =>
    ['awaiting_deliver', 'awaiting_packaging', 'awaiting_registration'].includes(o.status)
  ).length;
  const cancelledOrders = allOrders.filter((o) => o.status === 'cancelled').length;

  let totalRevenueUsd = 0;
  let totalBuyCostTry = 0;
  let totalNetProfitTry = 0;
  let recordedBuyCount = 0;

  for (const o of allOrders) {
    if (o.status === 'cancelled') continue;

    const salePrice = Number(o.totalPrice) || 0;
    const currency = o.currency || 'USD';
    if (currency === 'USD') {
      totalRevenueUsd += salePrice;
    } else if (currency === 'RUB') {
      totalRevenueUsd += salePrice / 86.5;
    }

    // Kullanıcı ne yazdıysa kur çevirme olmadan doğrudan toplanır
    if (o.buyPrice !== null && o.buyPrice !== undefined && Number(o.buyPrice) > 0) {
      totalBuyCostTry += Number(o.buyPrice);
      recordedBuyCount++;
    }

    if (o.netProfitTry) {
      totalNetProfitTry += Number(o.netProfitTry);
    }
  }

  const uncalculatedOrders = allOrders.filter(
    (o) =>
      o.status !== 'cancelled' &&
      (o.buyPrice === null || o.buyPrice === undefined || Number(o.buyPrice) <= 0)
  ).length;

  return {
    totalOrders,
    awaitingOrders,
    cancelledOrders,
    uncalculatedOrders,
    totalRevenueUsd,
    totalBuyCostTry,
    totalNetProfitTry,
    recordedBuyCount,
  };
}

/**
 * GET /api/siparisler
 * Sipariş listesini ve KPI kart verilerini döner.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const status = searchParams.get('status') || 'all';
    const limit = Math.min(Number(searchParams.get('limit')) || 500, 1000);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    let startDate: Date | undefined = undefined;
    let endDate: Date | undefined = undefined;

    if (yearParam && monthParam) {
      const y = parseInt(yearParam, 10);
      const m = parseInt(monthParam, 10); // 1-indexed: 1 = Ocak, 9 = Eylül
      if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
        startDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
        endDate = new Date(y, m, 1, 0, 0, 0, 0);
      }
    }

    // Sadece Avrupa (Polonya) Mağazası (store1) listelenecek
    const where: any = { storeId: 'store1' };
    const andConditions: any[] = [];

    if (startDate && endDate) {
      andConditions.push({
        OR: [
          { inProcessAt: { gte: startDate, lt: endDate } },
          { inProcessAt: null, createdAt: { gte: startDate, lt: endDate } },
        ],
      });
    }

    if (status !== 'all') {
      if (status === 'awaiting') {
        andConditions.push({
          status: { in: ['awaiting_deliver', 'awaiting_packaging', 'awaiting_registration'] },
        });
      } else if (status === 'uncalculated') {
        andConditions.push({
          status: { not: 'cancelled' },
          OR: [{ buyPrice: null }, { buyPrice: 0 }],
        });
      } else {
        andConditions.push({ status });
      }
    }

    if (search) {
      andConditions.push({
        OR: [
          { postingNumber: { contains: search, mode: 'insensitive' } },
          { productOfferId: { contains: search, mode: 'insensitive' } },
          { productTitle: { contains: search, mode: 'insensitive' } },
          { supplier: { contains: search, mode: 'insensitive' } },
          { supplierOrderId: { contains: search, mode: 'insensitive' } },
          { customerCity: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [orders, stats] = await Promise.all([
      prisma.ozonOrder.findMany({
        where,
        orderBy: { inProcessAt: 'asc' },
        take: limit,
      }),
      computeStoreStats('store1', startDate, endDate),
    ]);

    // Tüm siparişler arasında varsa mevcut ürün görsellerini offerId ile eşle
    const imageByOfferId = new Map<string, string>();
    for (const o of orders) {
      const meta = extractProductMeta(o);
      const img = o.productImage || meta.image;
      const off = (meta.offerId || o.productOfferId || '').trim();
      if (off && img) {
        imageByOfferId.set(off, img);
      }
    }

    const enrichedOrders = orders.map((o) => {
      const meta = extractProductMeta(o);
      const salePrice = Number(o.totalPrice) || parsePriceFromRaw(o);
      const currency = o.currency || 'USD';
      const offerId = meta.offerId || o.productOfferId || '-';
      const title = meta.title || o.productTitle || '-';
      let image = o.productImage || meta.image || null;

      // Eğer bu siparişte görsel eksikse, aynı offerId'ye sahip diğer siparişin görselini kullan
      if (!image && offerId !== '-' && imageByOfferId.has(offerId)) {
        image = imageByOfferId.get(offerId) || null;
      }

      // Belgenin private blob adresi istemciye gönderilmez (bkz. /api/siparisler/document).
      const { documentUrl: _documentUrl, ...rest } = o;
      return {
        ...rest,
        salePrice,
        currency,
        productOfferId: offerId,
        productTitle: title,
        productImage: image,
      };
    });

    return NextResponse.json({
      success: true,
      items: enrichedOrders,
      total: stats.totalOrders,
      stats,
    });
  } catch (error: any) {
    console.error('API /api/siparisler GET Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Siparişler yüklenemedi.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/siparisler
 * Belirli bir siparişin alış, kart, tedarik ve sipariş no bilgilerini günceller.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      postingNumber,
      buyPrice,
      buyCurrency,
      paymentCard,
      supplier,
      supplierOrderId,
      supplierTracking,
      purchaseDate,
      status,
      notes,
      year,
      month,
    } = body;

    if (!postingNumber) {
      return NextResponse.json(
        { success: false, error_message: 'postingNumber zorunludur.' },
        { status: 400 }
      );
    }

    // Mevcut siparişi bul
    const existing = await prisma.ozonOrder.findUnique({
      where: { postingNumber: String(postingNumber).trim() },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error_message: 'Sipariş bulunamadı.' },
        { status: 404 }
      );
    }

    let numBuyPrice =
      buyPrice !== undefined && buyPrice !== null && buyPrice !== ''
        ? parseTrNumber(buyPrice)
        : null;

    // Kur çevirme vs yok - Tabloya ne yazıldıysa alış maliyeti odur (10 ise 10, 500 ise 500)
    let buyPriceTry: number | null = null;
    let netProfit: number | null = null;
    let netProfitTry: number | null = null;

    if (buyPrice === null || buyPrice === '') {
      numBuyPrice = null;
      buyPriceTry = null;
      netProfit = null;
      netProfitTry = null;
    } else if (numBuyPrice !== null && !isNaN(numBuyPrice)) {
      buyPriceTry = numBuyPrice;

      // Ozon Net Kâr Hesaplama
      const salePrice = Number(existing.totalPrice) || parsePriceFromRaw(existing);
      const usdRate = 48.35; // Ozon USD ödeme kuru
      const salePriceTry = existing.currency === 'USD' ? salePrice * usdRate : salePrice;

      // Ozon Komisyonu (%5)
      const commissionTry = salePriceTry * 0.05;

      netProfitTry = salePriceTry - commissionTry - numBuyPrice;
      netProfit = netProfitTry / usdRate;
    }

    // Satın alma / Karttan çekim tarihi (purchaseDate) belirleme
    let resolvedPurchaseDate: Date | null | undefined = undefined;
    if (purchaseDate !== undefined) {
      resolvedPurchaseDate = purchaseDate ? new Date(purchaseDate) : null;
    } else if (buyPrice !== undefined) {
      if (numBuyPrice !== null && !isNaN(numBuyPrice)) {
        // Alış fiyatı ilk kez girildiğinde veya varsa mevcut tarihi koruyarak bugün olarak mühürle
        resolvedPurchaseDate = existing.purchaseDate || new Date();
      } else {
        // Alış fiyatı tamamen silindiyse tarihi de sıfırla
        resolvedPurchaseDate = null;
      }
    }

    const updateData: any = {
      ...(buyPrice !== undefined
        ? {
            buyPrice: numBuyPrice,
            buyPriceTry,
            netProfit,
            netProfitTry,
          }
        : {}),
      ...(resolvedPurchaseDate !== undefined ? { purchaseDate: resolvedPurchaseDate } : {}),
      buyCurrency: 'TRY',
      ...(paymentCard !== undefined ? { paymentCard: paymentCard || null } : {}),
      ...(supplier !== undefined ? { supplier: supplier || null } : {}),
      ...(supplierOrderId !== undefined ? { supplierOrderId: supplierOrderId || null } : {}),
      ...(supplierTracking !== undefined ? { supplierTracking: supplierTracking || null } : {}),
      ...(status ? { status } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
    };

    let patchStartDate: Date | undefined = undefined;
    let patchEndDate: Date | undefined = undefined;
    if (year && month) {
      const y = Number(year);
      const m = Number(month);
      patchStartDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
      patchEndDate = new Date(y, m, 1, 0, 0, 0, 0);
    } else {
      const refDate = existing.inProcessAt || existing.createdAt || new Date();
      patchStartDate = new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0, 0);
      patchEndDate = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1, 0, 0, 0, 0);
    }

    const [updated, stats] = await Promise.all([
      prisma.ozonOrder.update({
        where: { postingNumber: String(postingNumber).trim() },
        data: updateData,
      }),
      computeStoreStats('store1', patchStartDate, patchEndDate),
    ]);

    // Ürün başlığı ve offer_id'nin kaybolmaması için metadata zenginleştirmesi
    const meta = extractProductMeta(updated);
    const { documentUrl: _documentUrl, ...updatedRest } = updated;
    const enrichedUpdated = {
      ...updatedRest,
      salePrice: Number(updated.totalPrice) || parsePriceFromRaw(updated),
      productOfferId: meta.offerId || updated.productOfferId || '-',
      productTitle: meta.title || updated.productTitle || '-',
      productImage: updated.productImage || meta.image || null,
    };

    return NextResponse.json({
      success: true,
      item: enrichedUpdated,
      stats,
    });
  } catch (error: any) {
    console.error('API /api/siparisler PATCH Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Güncelleme başarısız oldu.' },
      { status: 500 }
    );
  }
}
