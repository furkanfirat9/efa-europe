import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { PAYOUT_STORE } from '@/lib/ozon/payouts';
import { blobToken, readReceiptForm } from '@/lib/ozon/payoutReceipt';

/**
 * PUT form-data: receivedTry, receivedAt (YYYY-MM-DD), bankReference?, file? → ödemeye dekontu bağlar
 * DELETE → dekontu ve banka bilgisini kaldırır. Ozon raporunda olmayan (yalnızca dekontla
 *          açılmış) satır tamamen silinir.
 */

const fail = (status: number, message: string) =>
  NextResponse.json({ success: false, error_message: message }, { status });

export async function PUT(request: NextRequest, ctx: RouteContext<'/api/belgeler/ozon-odemeleri/[id]'>) {
  try {
    const { id } = await ctx.params;
    const payout = await prisma.ozonPayout.findFirst({ where: { id, storeId: PAYOUT_STORE } });
    if (!payout) return fail(404, 'Ödeme bulunamadı.');

    const fields = await readReceiptForm(await request.formData());
    if ('error' in fields) return fail(400, fields.error);

    await prisma.ozonPayout.update({
      where: { id },
      data: {
        receivedTry: fields.receivedTry,
        receivedAt: fields.receivedAt,
        bankReference: fields.bankReference,
        ...(fields.receipt ?? {}),
      },
    });

    // Dekont değiştiyse eskisi depodan silinir.
    if (fields.receipt && payout.receiptUrl) {
      await del(payout.receiptUrl, { token: blobToken() }).catch((err) => console.warn('Eski dekont silinemedi:', err));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /belgeler/ozon-odemeleri/[id] PUT Error:', error);
    return fail(500, error.message || 'Dekont kaydedilemedi.');
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/belgeler/ozon-odemeleri/[id]'>) {
  try {
    const { id } = await ctx.params;
    const payout = await prisma.ozonPayout.findFirst({ where: { id, storeId: PAYOUT_STORE } });
    if (!payout) return fail(404, 'Ödeme bulunamadı.');

    if (!payout.ozonDocNo) {
      await prisma.ozonPayout.delete({ where: { id } });
    } else {
      await prisma.ozonPayout.update({
        where: { id },
        data: {
          receivedTry: null,
          receivedAt: null,
          bankReference: null,
          receiptUrl: null,
          receiptName: null,
          receiptContentType: null,
          receiptSize: null,
        },
      });
    }
    if (payout.receiptUrl) {
      await del(payout.receiptUrl, { token: blobToken() }).catch((err) => console.warn('Dekont silinemedi:', err));
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /belgeler/ozon-odemeleri/[id] DELETE Error:', error);
    return fail(500, error.message || 'Dekont kaldırılamadı.');
  }
}
