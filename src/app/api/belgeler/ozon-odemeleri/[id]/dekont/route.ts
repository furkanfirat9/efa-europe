import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { PAYOUT_STORE } from '@/lib/ozon/payouts';

/** GET → ödemenin dekontunu aç. Blob adresi yalnızca veritabanından okunur. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/belgeler/ozon-odemeleri/[id]/dekont'>) {
  try {
    const { id } = await ctx.params;
    const payout = await prisma.ozonPayout.findFirst({
      where: { id, storeId: PAYOUT_STORE },
      select: { receiptUrl: true, receiptName: true, receiptContentType: true },
    });
    if (!payout?.receiptUrl) return new NextResponse('Dekont bulunamadı.', { status: 404 });

    const result = await get(payout.receiptUrl, {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN || undefined,
    });
    if (!result || result.statusCode !== 200) {
      return new NextResponse('Dekont depodan okunamadı.', { status: 502 });
    }

    const name = payout.receiptName || 'dekont';
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': payout.receiptContentType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    console.error('API /belgeler/ozon-odemeleri/[id]/dekont Error:', error);
    return new NextResponse('Dekont açılamadı: ' + (error.message || 'bilinmeyen hata'), { status: 500 });
  }
}
