import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { CURRENT_STORE } from '@/lib/sales-invoices/service';

/** GET → yüklenen orijinal dosyayı (ZIP / XML) indir. Blob adresi yalnızca veritabanından okunur. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/belgeler/satis/[id]/file'>) {
  try {
    const { id } = await ctx.params;
    const inv = await prisma.salesInvoice.findFirst({
      where: { id, store: CURRENT_STORE },
      select: { fileUrl: true, fileName: true, fileContentType: true },
    });
    if (!inv) return new NextResponse('Fatura bulunamadı.', { status: 404 });

    const result = await get(inv.fileUrl, { access: 'private', token: process.env.BLOB_READ_WRITE_TOKEN || undefined });
    if (!result || result.statusCode !== 200) return new NextResponse('Dosya depodan okunamadı.', { status: 502 });

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': inv.fileContentType,
        'Content-Disposition': `attachment; filename="${inv.fileName.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(inv.fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    console.error('API /api/belgeler/satis/[id]/file Error:', error);
    return new NextResponse('Dosya açılamadı: ' + (error.message || 'bilinmeyen hata'), { status: 500 });
  }
}
