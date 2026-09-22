import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { CURRENT_STORE } from '@/lib/documents/service';

/**
 * GET ?q= → alış belgesine elle bağlanacak siparişin seçim listesi.
 *
 * Arama yoksa belge tarihinden önceki 45 günün siparişleri gelir (alış, Ozon
 * siparişinden sonra yapılır). Tedarikçi sipariş no'su faturadakini içerenler
 * üste alınır. Bu yalnızca bir sıralamadır: bağlantıyı kullanıcı seçerek kurar.
 * İptal edilen siparişler ve başka bir alış belgesine bağlanmış siparişler listelenmez.
 */

const DAY = 24 * 60 * 60 * 1000;
// Lenora'nın siparişleri (Avrupa mağazası)
const ORDER_STORE_ID = 'store1';

const fail = (status: number, message: string) =>
  NextResponse.json({ success: false, error_message: message }, { status });

export async function GET(request: NextRequest, ctx: RouteContext<'/api/belgeler/[id]/siparisler'>) {
  try {
    const { id } = await ctx.params;
    const doc = await prisma.accountingDocument.findFirst({
      where: { id, store: CURRENT_STORE },
      select: { documentDate: true, createdAt: true, orderNumber: true },
    });
    if (!doc) return fail(404, 'Belge bulunamadı.');

    const taken = await prisma.accountingDocument.findMany({
      where: { store: CURRENT_STORE, NOT: [{ id }, { postingNumbers: { isEmpty: true } }] },
      select: { postingNumbers: true },
    });

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    const where: Prisma.OzonOrderWhereInput = {
      storeId: ORDER_STORE_ID,
      postingNumber: { notIn: taken.flatMap((t) => t.postingNumbers) },
      NOT: { status: { startsWith: 'cancelled' } },
    };
    if (q) {
      where.OR = [
        { postingNumber: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { productTitle: { contains: q, mode: 'insensitive' } },
        { supplierOrderId: { contains: q, mode: 'insensitive' } },
      ];
    } else {
      const day = (doc.documentDate ?? doc.createdAt).getTime();
      where.inProcessAt = { gte: new Date(day - 45 * DAY), lt: new Date(day + 3 * DAY) };
    }

    const orders = await prisma.ozonOrder.findMany({
      where,
      select: {
        postingNumber: true,
        customerName: true,
        productTitle: true,
        productImage: true,
        totalPrice: true,
        inProcessAt: true,
        supplierOrderId: true,
      },
      orderBy: { inProcessAt: 'desc' },
      take: q ? 30 : 300,
    });

    const orderNo = doc.orderNumber?.trim();
    const sameOrder = (o: { supplierOrderId: string | null }) =>
      !!orderNo && orderNo.length >= 4 && !!o.supplierOrderId?.includes(orderNo);

    const ranked = orders
      .map((o) => ({ ...o, match: sameOrder(o) }))
      .sort((a, b) => Number(b.match) - Number(a.match))
      .slice(0, 30);

    return NextResponse.json({
      success: true,
      orders: ranked.map((o) => ({
        postingNumber: o.postingNumber,
        customerName: o.customerName,
        productTitle: o.productTitle,
        productImage: o.productImage,
        totalPrice: o.totalPrice,
        orderDate: o.inProcessAt?.toISOString().slice(0, 10) ?? null,
        hint: o.match ? 'Aynı tedarikçi siparişi' : null,
      })),
    });
  } catch (error: any) {
    console.error('API /api/belgeler/[id]/siparisler Error:', error);
    return fail(500, 'Siparişler alınamadı: ' + (error.message || 'bilinmeyen hata'));
  }
}
