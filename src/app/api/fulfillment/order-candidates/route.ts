import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getEcbEurUsd } from '@/lib/fx/ecb';
import { extractProductMeta } from '@/lib/orders/productMeta';
import { ordersWithoutTaskWhere } from '@/lib/fulfillment/missing';

export const dynamic = 'force-dynamic';

/**
 * GET /api/fulfillment/order-candidates
 *
 * Fulfillment formundaki sipariş seçici: Avrupa mağazasının (store1) açık siparişlerinden
 * henüz sevkiyat görevi (ArbitrageOrder) açılmamış olanlar. Fiyat ECB kuruyla euroya da
 * çevrilir; beyan değeri bu tutardır.
 */
export async function GET() {
  try {
    const [where, ecb] = await Promise.all([ordersWithoutTaskWhere(), getEcbEurUsd().catch(() => null)]);

    const orders = await prisma.ozonOrder.findMany({
      where,
      // Eskiden yeniye: en uzun süredir bekleyen sipariş en üstte.
      orderBy: { inProcessAt: 'asc' },
    });

    const items = orders.map((o) => {
      const meta = extractProductMeta(o);
      const products = Array.isArray(o.productsJson) ? (o.productsJson as { quantity?: number }[]) : [];
      const priceUsd = Number(o.totalPrice) || 0;
      return {
        postingNumber: o.postingNumber,
        status: o.status,
        inProcessAt: o.inProcessAt,
        shipmentDate: o.shipmentDate,
        offerId: meta.offerId || null,
        title: meta.title || null,
        image: meta.image || null,
        quantity: products.reduce((sum, p) => sum + (p.quantity || 1), 0) || 1,
        priceUsd,
        priceEur: ecb ? Math.round((priceUsd / ecb.rate) * 100) / 100 : null,
      };
    });

    return NextResponse.json({
      success: true,
      items,
      ecb,
      ...(ecb ? {} : { warning: 'ECB kuru alınamadı; euro karşılıkları gösterilemiyor.' }),
    });
  } catch (error: any) {
    console.error('API /fulfillment/order-candidates Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Siparişler alınamadı.' },
      { status: 500 }
    );
  }
}
