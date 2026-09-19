import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { CURRENT_STORE } from '@/lib/documents/service';

/** GET → belgenin dosyasını aç. Blob adresi yalnızca veritabanından okunur. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/belgeler/[id]/file'>) {
  try {
    const { id } = await ctx.params;
    const doc = await prisma.accountingDocument.findFirst({
      where: { id, store: CURRENT_STORE },
      select: { fileUrl: true, fileName: true, fileContentType: true },
    });
    if (!doc) return new NextResponse('Belge bulunamadı.', { status: 404 });

    const result = await get(doc.fileUrl, {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN || undefined,
    });
    if (!result || result.statusCode !== 200) {
      return new NextResponse('Belge depodan okunamadı.', { status: 502 });
    }

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': doc.fileContentType,
        'Content-Disposition': `inline; filename="${doc.fileName.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    console.error('API /api/belgeler/[id]/file Error:', error);
    return new NextResponse('Belge açılamadı: ' + (error.message || 'bilinmeyen hata'), { status: 500 });
  }
}
