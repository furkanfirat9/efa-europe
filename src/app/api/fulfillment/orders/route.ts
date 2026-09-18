import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { uploadLabelPdf, deleteLabelPdf } from '@/lib/blob/blobClient';
import { createLSOrders, cancelLSOrders, getLSOrdersList } from '@/lib/fulfillment/client';

function getFallbackPdfBase64(): string {
  return Buffer.from(
    '%PDF-1.4 1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 300 144]/Parent 2 0 R/Resources<<>>>>endobj xref 0 4 0000000000 65535 f 0000000009 00000 n 0000000058 00000 n 0000000115 00000 n trailer<</Size 4/Root 1 0 R>>startxref 205 %%EOF'
  ).toString('base64');
}

function isTestOrder(orderId?: string | null, productName?: string | null): boolean {
  const id = (orderId || '').toLowerCase().trim();
  const name = (productName || '').toLowerCase().trim();
  if (
    id.includes('test') ||
    id.startsWith('test') ||
    id === '213123123123123' ||
    name === 'test'
  ) {
    return true;
  }
  return false;
}

/**
 * GET /api/fulfillment/orders
 * Fetches all orders from PostgreSQL DB and enriches with real-time status from Logistics Solution API
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Fetch from Postgres
    let dbOrders: any[] = [];
    try {
      dbOrders = await prisma.arbitrageOrder.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch (dbErr) {
      console.warn('PostgreSQL fetch error, falling back to empty list:', dbErr);
    }

    // 2. Fetch live status from LS API
    let lsItems: any[] = [];
    try {
      const lsRes = await getLSOrdersList(100);
      if (lsRes.success && lsRes.items) {
        lsItems = lsRes.items;
      }
    } catch (lsErr) {
      console.warn('LS API fetch error:', lsErr);
    }

    const lsMap = new Map<string, any>();
    for (const item of lsItems) {
      lsMap.set(item.order_id, item);
    }

    // 3. Merge live state & filter out any test records
    const enrichedOrders = dbOrders
      .filter((ord) => !isTestOrder(ord.ozonOrderId, ord.productName))
      .map((ord) => {
        const live = lsMap.get(ord.ozonOrderId);
        return {
          ...ord,
          liveState: live?.state || ord.status,
          liveWaitReason: live?.wait_reason || undefined,
        };
      });

    // Also include any active orders present on LS API that might have been created externally
    for (const lsItem of lsItems) {
      // Test kayıtları veya iptal edilmiş yetim LS kayıtlarını tabloya ekleme
      if (isTestOrder(lsItem.order_id)) continue;
      if (lsItem.state === 'canceled') continue;

      if (!dbOrders.some((d) => d.ozonOrderId === lsItem.order_id)) {
        enrichedOrders.push({
          id: lsItem.order_id,
          ozonOrderId: lsItem.order_id,
          amazonTrackingBarcode: '-',
          productName: null,
          quantity: 1,
          declaredValue: 0,
          lengthMm: 300,
          widthMm: 200,
          heightMm: 150,
          weightGr: 1200,
          labelPdfUrl: null,
          labelFileName: null,
          note: null,
          status: lsItem.state,
          lsIndocId: lsItem.indoc_id || null,
          createdAt: lsItem.created_at || new Date().toISOString(),
          updatedAt: lsItem.created_at || new Date().toISOString(),
          liveState: lsItem.state,
          liveWaitReason: lsItem.wait_reason,
        });
      }
    }

    return NextResponse.json({
      success: true,
      items: enrichedOrders,
    });
  } catch (error: any) {
    console.error('API /fulfillment/orders GET Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Siparişler alınamadı.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/fulfillment/orders
 * Creates a new Arbitrage Forwarding Order:
 * 1. Uploads PDF to Vercel Blob
 * 2. Transmits order to Logistics Solution API
 * 3. Saves full record into Prisma PostgreSQL DB
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      ozonOrderId,
      amazonTrackingBarcode,
      productName,
      quantity = 1,
      declaredValue = 100,
      lengthMm = 300,
      widthMm = 200,
      heightMm = 150,
      weightGr = 1200,
      note,
      labelFile, // { name: string, base64: string }
    } = body;

    if (!ozonOrderId || !amazonTrackingBarcode) {
      return NextResponse.json(
        { success: false, error_message: 'Ozon Sipariş No ve Amazon Kargo Takip Kodu zorunludur.' },
        { status: 400 }
      );
    }

    const cleanOrderId = ozonOrderId.trim();
    const cleanBarcode = amazonTrackingBarcode.trim();

    // 1. Upload PDF to Vercel Blob (if provided)
    let labelPdfUrl: string | null = null;
    let labelFileName: string = `ozon_label_${cleanOrderId}.pdf`;
    let base64PdfForLS: string = getFallbackPdfBase64();

    if (labelFile && labelFile.base64) {
      labelFileName = labelFile.name || `ozon_label_${cleanOrderId}.pdf`;
      base64PdfForLS = labelFile.base64;
      try {
        const uploadRes = await uploadLabelPdf(labelFileName, labelFile.base64);
        labelPdfUrl = uploadRes.url;
      } catch (blobErr: any) {
        console.warn('Vercel Blob upload warning:', blobErr.message);
      }
    }

    // 2. Transmit to Logistics Solution API
    const lsPayload = {
      order_id: cleanOrderId,
      delivery_id: 16,
      cod: 0,
      declared_value: Number(declaredValue) || 100,
      forwarded_parcels: [
        {
          barcode: cleanBarcode,
          length: Number(lengthMm) || 300,
          width: Number(widthMm) || 200,
          height: Number(heightMm) || 150,
          weight: Number(weightGr) || 1200,
        },
      ],
      files: [
        {
          file_name: labelFileName,
          file_data: base64PdfForLS,
          copy_qnt: 1,
        },
      ],
    };

    const lsRes = await createLSOrders([lsPayload]);
    if (!lsRes.success) {
      return NextResponse.json(
        { success: false, error_message: lsRes.error_message || 'Depo API sipariş kabul etmedi.' },
        { status: 400 }
      );
    }

    // 3. Save / Upsert in Prisma PostgreSQL
    let dbRecord = null;
    try {
      dbRecord = await prisma.arbitrageOrder.upsert({
        where: { ozonOrderId: cleanOrderId },
        update: {
          amazonTrackingBarcode: cleanBarcode,
          productName: productName || null,
          quantity: Number(quantity) || 1,
          declaredValue: Number(declaredValue) || 100,
          lengthMm: Number(lengthMm) || 300,
          widthMm: Number(widthMm) || 200,
          heightMm: Number(heightMm) || 150,
          weightGr: Number(weightGr) || 1200,
          labelPdfUrl: labelPdfUrl || undefined,
          labelFileName: labelFileName || undefined,
          note: note || null,
          status: 'wait',
        },
        create: {
          ozonOrderId: cleanOrderId,
          amazonTrackingBarcode: cleanBarcode,
          productName: productName || null,
          quantity: Number(quantity) || 1,
          declaredValue: Number(declaredValue) || 100,
          lengthMm: Number(lengthMm) || 300,
          widthMm: Number(widthMm) || 200,
          heightMm: Number(heightMm) || 150,
          weightGr: Number(weightGr) || 1200,
          labelPdfUrl,
          labelFileName,
          note: note || null,
          status: 'wait',
        },
      });
    } catch (dbErr: any) {
      console.error('PostgreSQL Save Error:', dbErr);
    }

    return NextResponse.json({
      success: true,
      order: dbRecord || { ozonOrderId: cleanOrderId },
      labelPdfUrl,
    });
  } catch (error: any) {
    console.error('API /fulfillment/orders POST Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Sipariş oluşturulamadı.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/fulfillment/orders
 * Updates / Corrects an existing order:
 * 1. Cancels old order on LS API
 * 2. Uploads new PDF if provided
 * 3. Re-creates order with same order_id on LS API
 * 4. Updates PostgreSQL DB
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      ozonOrderId,
      amazonTrackingBarcode,
      productName,
      quantity = 1,
      declaredValue = 100,
      lengthMm = 300,
      widthMm = 200,
      heightMm = 150,
      weightGr = 1200,
      note,
      labelFile,
    } = body;

    if (!ozonOrderId) {
      return NextResponse.json(
        { success: false, error_message: 'ozonOrderId zorunludur.' },
        { status: 400 }
      );
    }

    const cleanOrderId = ozonOrderId.trim();
    const cleanBarcode = amazonTrackingBarcode ? amazonTrackingBarcode.trim() : '';

    // 1. Fetch existing record
    const existing = await prisma.arbitrageOrder.findUnique({
      where: { ozonOrderId: cleanOrderId },
    });

    let labelPdfUrl = existing?.labelPdfUrl || null;
    let labelFileName = existing?.labelFileName || `ozon_label_${cleanOrderId}.pdf`;
    let base64PdfForLS: string = getFallbackPdfBase64();

    // 2. If new file uploaded, upload to Blob
    if (labelFile && labelFile.base64) {
      labelFileName = labelFile.name || `ozon_label_${cleanOrderId}.pdf`;
      base64PdfForLS = labelFile.base64;
      try {
        const uploadRes = await uploadLabelPdf(labelFileName, labelFile.base64);
        labelPdfUrl = uploadRes.url;
      } catch (blobErr: any) {
        console.warn('Vercel Blob update warning:', blobErr.message);
      }
    }

    // 3. Cancel old order in LS API
    try {
      await cancelLSOrders([cleanOrderId]);
    } catch (cancelErr) {
      console.warn('LS API Cancel during edit notice:', cancelErr);
    }

    // 4. Re-create order in LS API with updated parameters
    const lsPayload = {
      order_id: cleanOrderId,
      delivery_id: 16,
      cod: 0,
      declared_value: Number(declaredValue) || 100,
      forwarded_parcels: [
        {
          barcode: cleanBarcode || existing?.amazonTrackingBarcode || 'AMZ_TRACK',
          length: Number(lengthMm) || 300,
          width: Number(widthMm) || 200,
          height: Number(heightMm) || 150,
          weight: Number(weightGr) || 1200,
        },
      ],
      files: [
        {
          file_name: labelFileName,
          file_data: base64PdfForLS,
          copy_qnt: 1,
        },
      ],
    };

    const lsRes = await createLSOrders([lsPayload]);
    if (!lsRes.success) {
      return NextResponse.json(
        { success: false, error_message: lsRes.error_message || 'Depo API güncellenmiş siparişi kabul etmedi.' },
        { status: 400 }
      );
    }

    // 5. Update DB
    const updated = await prisma.arbitrageOrder.update({
      where: { ozonOrderId: cleanOrderId },
      data: {
        amazonTrackingBarcode: cleanBarcode || undefined,
        productName: productName !== undefined ? productName : undefined,
        quantity: Number(quantity) || 1,
        declaredValue: Number(declaredValue) || 100,
        lengthMm: Number(lengthMm) || 300,
        widthMm: Number(widthMm) || 200,
        heightMm: Number(heightMm) || 150,
        weightGr: Number(weightGr) || 1200,
        labelPdfUrl,
        labelFileName,
        note: note !== undefined ? note : undefined,
        status: 'wait',
      },
    });

    return NextResponse.json({
      success: true,
      order: updated,
    });
  } catch (error: any) {
    console.error('API /fulfillment/orders PUT Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Sipariş güncellenemedi.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/fulfillment/orders
 * Cancels the order in LS API and updates status or removes from DB
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const permanent = searchParams.get('permanent') === 'true';
    if (!orderId) {
      return NextResponse.json({ success: false, error_message: 'orderId gerekli.' }, { status: 400 });
    }

    // 1. Cancel on LS API
    let lsResult: any = { success: true };
    try {
      lsResult = await cancelLSOrders([orderId]);
    } catch (lsErr: any) {
      console.warn('LS API cancel note:', lsErr?.message || lsErr);
    }

    // 2. Update status or permanently delete in Postgres DB
    if (permanent || isTestOrder(orderId)) {
      try {
        await prisma.arbitrageOrder.deleteMany({
          where: { ozonOrderId: orderId },
        });
      } catch (dbErr) {
        console.warn('DB delete order note:', dbErr);
      }
    } else {
      try {
        await prisma.arbitrageOrder.update({
          where: { ozonOrderId: orderId },
          data: { status: 'canceled' },
        });
      } catch (dbErr) {
        console.warn('DB update cancel status note:', dbErr);
      }
    }

    return NextResponse.json(lsResult || { success: true });
  } catch (error: any) {
    console.error('API /fulfillment/orders DELETE Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Sipariş iptal edilemedi.' },
      { status: 500 }
    );
  }
}
