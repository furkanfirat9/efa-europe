import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { CURRENT_STORE, ORDER_STORE_ID } from '@/lib/sales-invoices/service';

/**
 * GET ?q= → satış faturasına elle bağlanacak siparişin seçim listesi.
 *
 * Arama yoksa fatura tarihinden önceki 60 günün siparişleri gelir; müşteri adı
 * faturadakiyle aynı kelimelerden oluşanlar (ad-soyad sırası farklı olabilir)
 * üste alınır. Bu yalnızca bir sıralamadır: bağlantıyı kullanıcı seçerek kurar.
 */

const DAY = 24 * 60 * 60 * 1000;

const fail = (status: number, message: string) =>
  NextResponse.json({ success: false, error_message: message }, { status });

const words = (s?: string | null) =>
  new Set(
    (s ?? '')
      .toLocaleLowerCase('tr-TR')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 2)
  );

/** İki adın kelimeleri birbirini kapsıyorsa (sıra fark etmez) aynı müşteri sayılır. */
function sameName(a?: string | null, b?: string | null): boolean {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return false;
  const [small, large] = x.size <= y.size ? [x, y] : [y, x];
  return [...small].every((w) => large.has(w));
}

export async function GET(request: NextRequest, ctx: RouteContext<'/api/belgeler/satis/[id]/siparisler'>) {
  try {
    const { id } = await ctx.params;
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id, store: CURRENT_STORE },
      select: { issueDate: true, customerName: true },
    });
    if (!invoice) return fail(404, 'Fatura bulunamadı.');

    // Başka bir satış faturasına bağlanmış siparişler listede gösterilmez.
    const taken = await prisma.salesInvoice.findMany({
      where: { store: CURRENT_STORE, postingNumber: { not: null }, NOT: { id } },
      select: { postingNumber: true },
    });

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    // İptal edilen siparişler de gösterilmez ("cancelled", "cancelled_from_split_pending" …).
    const where: Prisma.OzonOrderWhereInput = {
      storeId: ORDER_STORE_ID,
      postingNumber: { notIn: taken.map((t) => t.postingNumber!) },
      NOT: { status: { startsWith: 'cancelled' } },
    };
    if (q) {
      where.OR = [
        { postingNumber: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { productTitle: { contains: q, mode: 'insensitive' } },
      ];
    } else {
      const day = invoice.issueDate.getTime();
      where.inProcessAt = { gte: new Date(day - 60 * DAY), lt: new Date(day + 2 * DAY) };
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
        statusName: true,
      },
      orderBy: { inProcessAt: 'desc' },
      take: q ? 30 : 300,
    });

    const ranked = orders
      .map((o) => ({ ...o, sameCustomer: sameName(o.customerName, invoice.customerName) }))
      .sort((a, b) => Number(b.sameCustomer) - Number(a.sameCustomer))
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
        statusName: o.statusName,
        hint: o.sameCustomer ? 'Aynı müşteri' : null,
      })),
    });
  } catch (error: any) {
    console.error('API /api/belgeler/satis/[id]/siparisler Error:', error);
    return fail(500, 'Siparişler alınamadı: ' + (error.message || 'bilinmeyen hata'));
  }
}
