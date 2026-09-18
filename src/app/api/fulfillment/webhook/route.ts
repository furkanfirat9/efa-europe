import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/fulfillment/webhook
 * Inbound webhook receiver for Logistics Solution / External notifications
 * Safe, fault-tolerant: always returns 200 OK after safely persisting data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Received Inbound Fulfillment Webhook:', JSON.stringify(body));

    // Handle incoming photo/report event
    if (body.photo_id || body.photos || body.event === 'photo_uploaded') {
      const photoId = body.photo_id || body.id;
      const orderId = body.order_id || body.ozon_order_id || null;
      const url = body.url || body.photo_url || null;
      const descrip = body.descrip || body.description || 'Depo Foto-Kontrol';

      if (photoId) {
        const existing = await prisma.warehouseReport.findFirst({
          where: { photoId: Number(photoId) },
        });

        if (!existing) {
          await prisma.warehouseReport.create({
            data: {
              photoId: Number(photoId),
              ozonOrderId: orderId,
              type: body.type || 'photo',
              title: body.title || descrip,
              description: descrip,
              mediaUrl: url,
              source: 'warehouse',
            },
          });
        }
      }
    }

    // Handle order status update event
    if (body.order_id && body.state) {
      try {
        await prisma.arbitrageOrder.update({
          where: { ozonOrderId: body.order_id },
          data: { status: body.state },
        });
      } catch (ordErr) {
        console.warn('Webhook order update notice:', ordErr);
      }
    }

    return NextResponse.json({ success: true, received: true });
  } catch (error: any) {
    console.error('Webhook processing notice:', error.message);
    // Always return 200 OK so webhook sender never retries endlessly or marks endpoint as failing
    return NextResponse.json({ success: true, error: error.message });
  }
}
