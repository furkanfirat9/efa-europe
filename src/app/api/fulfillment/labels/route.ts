import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';

/**
 * Ozon kargo etiketi (PDF)
 *
 * Etiket Vercel Blob'da private tutulur. Blob adresi yalnızca veritabanındaki
 * sipariş kaydından okunur; istekten adres kabul edilmez, aksi hâlde token
 * dışarıdan verilen herhangi bir adrese gönderilebilirdi.
 *
 *   GET ?orderId=… → etiketi aç
 */
export async function GET(request: NextRequest) {
  try {
    const orderId = request.nextUrl.searchParams.get('orderId')?.trim();
    if (!orderId) return new NextResponse('Sipariş numarası eksik.', { status: 400 });

    const order = await prisma.arbitrageOrder.findUnique({
      where: { ozonOrderId: orderId },
      select: { ozonOrderId: true, labelPdfUrl: true, labelFileName: true },
    });
    if (!order?.labelPdfUrl) return new NextResponse('PDF etiketi bulunamadı.', { status: 404 });

    const result = await get(order.labelPdfUrl, {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN || undefined,
    });
    if (!result || result.statusCode !== 200) {
      return new NextResponse('Etiket depodan okunamadı.', { status: 502 });
    }

    const fileName = order.labelFileName || `ozon_label_${order.ozonOrderId}.pdf`;
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    console.error('API /fulfillment/labels Error:', error);
    return new NextResponse('Etiket sunulurken hata oluştu: ' + (error.message || 'bilinmeyen hata'), {
      status: 500,
    });
  }
}
