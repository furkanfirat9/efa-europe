import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { uploadLabelPdf, deleteLabelPdf } from '@/lib/blob/blobClient';
import { getLSGoodsPhotos } from '@/lib/fulfillment/client';

/**
 * GET /api/fulfillment/reports
 * 1. Background syncs any new photos from Logistics Solution API into PostgreSQL
 * 2. Fetches all reports & photos from DB
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const type = searchParams.get('type');

    // 1. Auto-Sync from Logistics Solution API (Fault-tolerant background check)
    try {
      const lsPhotosRes = await getLSGoodsPhotos(50);
      if (lsPhotosRes.success && lsPhotosRes.items && lsPhotosRes.items.length > 0) {
        for (const photo of lsPhotosRes.items) {
          if (!photo.photo_id) continue;
          const existing = await prisma.warehouseReport.findFirst({
            where: { photoId: photo.photo_id },
          });

          if (!existing) {
            await prisma.warehouseReport.create({
              data: {
                photoId: photo.photo_id,
                ozonOrderId: photo.order_id || null,
                type: 'photo',
                title: photo.descrip || `Depo Koli Fotoğrafı #${photo.photo_id}`,
                description: photo.descrip || 'Polonya Cybinka deposu kabul/paketleme fotoğrafı.',
                mediaUrl: photo.url,
                source: 'warehouse',
                createdAt: photo.created_at ? new Date(photo.created_at) : new Date(),
              },
            });
          }
        }
      }
    } catch (syncErr: any) {
      console.warn('LS Photo Auto-Sync notice (Non-fatal):', syncErr.message);
    }

    // 2. Fetch from PostgreSQL
    const where: any = {};
    if (orderId) where.ozonOrderId = orderId;
    if (type && type !== 'all') where.type = type;

    const reports = await prisma.warehouseReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      items: reports,
    });
  } catch (error: any) {
    console.error('API /fulfillment/reports GET Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Raporlar alınamadı.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/fulfillment/reports
 * Adds a new warehouse report, inspection photo, damage notice, or note
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      ozonOrderId,
      type = 'photo',
      title,
      description,
      mediaBase64,
      mediaFileName,
      source = 'warehouse',
    } = body;

    if (!title) {
      return NextResponse.json(
        { success: false, error_message: 'Başlık zorunludur.' },
        { status: 400 }
      );
    }

    let mediaUrl: string | null = null;

    // If image/file base64 provided, upload to Vercel Blob
    if (mediaBase64) {
      const fileName = mediaFileName || `report_${Date.now()}.${type === 'photo' ? 'jpg' : 'pdf'}`;
      try {
        const uploadRes = await uploadLabelPdf(fileName, mediaBase64);
        mediaUrl = uploadRes.url;
      } catch (blobErr: any) {
        console.warn('Vercel Blob upload report media warning:', blobErr.message);
      }
    }

    // Save to PostgreSQL DB
    const report = await prisma.warehouseReport.create({
      data: {
        ozonOrderId: ozonOrderId ? ozonOrderId.trim() : null,
        type,
        title: title.trim(),
        description: description ? description.trim() : null,
        mediaUrl,
        source,
      },
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: any) {
    console.error('API /fulfillment/reports POST Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Rapor kaydedilemedi.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/fulfillment/reports
 * Deletes a report record and its associated blob if present
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('reportId');

    if (!reportId) {
      return NextResponse.json(
        { success: false, error_message: 'reportId gerekli.' },
        { status: 400 }
      );
    }

    const existing = await prisma.warehouseReport.findUnique({
      where: { id: reportId },
    });

    if (existing?.mediaUrl) {
      await deleteLabelPdf(existing.mediaUrl);
    }

    await prisma.warehouseReport.delete({
      where: { id: reportId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /fulfillment/reports DELETE Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Rapor silinemedi.' },
      { status: 500 }
    );
  }
}
