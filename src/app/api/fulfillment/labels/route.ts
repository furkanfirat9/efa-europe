import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const directUrl = searchParams.get('url');

    let blobUrl = directUrl;
    let fileName = 'ozon_label.pdf';

    if (orderId) {
      const order = await prisma.arbitrageOrder.findUnique({
        where: { ozonOrderId: orderId },
      });
      if (order?.labelPdfUrl) {
        blobUrl = order.labelPdfUrl;
        fileName = order.labelFileName || `ozon_label_${order.ozonOrderId}.pdf`;
      }
    }

    if (!blobUrl) {
      return new NextResponse('PDF etiketi bulunamadı.', { status: 404 });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const blobRes = await fetch(blobUrl, { headers });
    if (!blobRes.ok) {
      return new NextResponse('Blob dosyası yüklenemedi.', { status: blobRes.status });
    }

    const pdfBuffer = await blobRes.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('API /fulfillment/labels Error:', error);
    return new NextResponse('Etiket sunulurken hata oluştu: ' + error.message, { status: 500 });
  }
}
