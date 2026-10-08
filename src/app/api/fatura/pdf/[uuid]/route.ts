import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { downloadEArchive, efaturaEnv } from '@/lib/efatura/trendyol';

/** Panelden kesilen faturanın PDF'i; her açılışta Trendyol'dan alınır. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/fatura/pdf/[uuid]'>) {
  try {
    const { uuid } = await ctx.params;
    const issue = await prisma.eArchiveIssue.findFirst({
      where: { invoiceUuid: uuid, env: efaturaEnv(), status: 'ISSUED' },
      select: { invoiceNo: true },
    });
    if (!issue) return new NextResponse('Fatura bulunamadı.', { status: 404 });

    const pdf = await downloadEArchive(uuid, 'pdf');
    if (!pdf) return new NextResponse('Fatura henüz işleniyor; birkaç saniye sonra tekrar deneyin.', { status: 409 });

    const name = `${issue.invoiceNo ?? uuid}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${name}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    console.error('API /api/fatura/pdf GET Error:', error);
    return new NextResponse('PDF alınamadı: ' + (error.message || 'bilinmeyen hata'), { status: 500 });
  }
}
