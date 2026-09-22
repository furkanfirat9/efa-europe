import { NextRequest, NextResponse } from 'next/server';
import { del, get, put } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { CURRENT_STORE, toSalesDto } from '@/lib/sales-invoices/service';

/**
 * Satış faturasının PDF'i. Panel PDF üretmez; kullanıcı kendi çevirdiği PDF'i ekler.
 *
 *   GET                  → PDF'i aç
 *   POST form-data: file → PDF ekle / değiştir
 *   DELETE               → PDF'i kaldır
 */

const MAX_BYTES = 4 * 1024 * 1024;
const token = () => process.env.BLOB_READ_WRITE_TOKEN || undefined;

const fail = (status: number, message: string) =>
  NextResponse.json({ success: false, error_message: message }, { status });

const findInvoice = (id: string) =>
  prisma.salesInvoice.findFirst({ where: { id, store: CURRENT_STORE }, select: { id: true, pdfUrl: true, pdfName: true } });

const removeBlob = async (url: string | null) => {
  if (!url) return;
  try {
    await del(url, { token: token() });
  } catch (err) {
    console.error('PDF silinemedi:', url, err);
  }
};

export async function GET(_request: NextRequest, ctx: RouteContext<'/api/belgeler/satis/[id]/pdf'>) {
  try {
    const { id } = await ctx.params;
    const inv = await findInvoice(id);
    if (!inv?.pdfUrl) return new NextResponse('Bu faturaya PDF eklenmemiş.', { status: 404 });

    const result = await get(inv.pdfUrl, { access: 'private', token: token() });
    if (!result || result.statusCode !== 200) return new NextResponse('PDF depodan okunamadı.', { status: 502 });

    const name = inv.pdfName ?? 'fatura.pdf';
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    console.error('API /api/belgeler/satis/[id]/pdf GET Error:', error);
    return new NextResponse('PDF açılamadı: ' + (error.message || 'bilinmeyen hata'), { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<'/api/belgeler/satis/[id]/pdf'>) {
  try {
    const { id } = await ctx.params;
    const inv = await findInvoice(id);
    if (!inv) return fail(404, 'Fatura bulunamadı.');

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return fail(400, 'Dosya bulunamadı.');
    if (file.size > MAX_BYTES) return fail(413, 'Dosya 4 MB sınırını aşıyor.');

    const buffer = Buffer.from(await file.arrayBuffer());
    // PDF'ler "%PDF" ile başlar; uzantıya ya da tarayıcının bildirdiği türe güvenilmez.
    if (buffer.subarray(0, 4).toString('latin1') !== '%PDF') return fail(415, 'Yalnızca PDF eklenebilir.');

    const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-120) || 'fatura.pdf';
    const blob = await put(`sales-invoices/${CURRENT_STORE}/pdf/${Date.now()}-${safeName}`, buffer, {
      access: 'private',
      contentType: 'application/pdf',
      token: token(),
    });

    const updated = await prisma.salesInvoice.update({
      where: { id },
      data: { pdfUrl: blob.url, pdfName: file.name, pdfSize: file.size },
      include: { lines: true },
    });
    await removeBlob(inv.pdfUrl);

    return NextResponse.json({ success: true, invoice: toSalesDto(updated) });
  } catch (error: any) {
    console.error('API /api/belgeler/satis/[id]/pdf POST Error:', error);
    return fail(500, 'PDF eklenemedi: ' + (error.message || 'bilinmeyen hata'));
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/belgeler/satis/[id]/pdf'>) {
  try {
    const { id } = await ctx.params;
    const inv = await findInvoice(id);
    if (!inv) return fail(404, 'Fatura bulunamadı.');

    const updated = await prisma.salesInvoice.update({
      where: { id },
      data: { pdfUrl: null, pdfName: null, pdfSize: null },
      include: { lines: true },
    });
    await removeBlob(inv.pdfUrl);

    return NextResponse.json({ success: true, invoice: toSalesDto(updated) });
  } catch (error: any) {
    console.error('API /api/belgeler/satis/[id]/pdf DELETE Error:', error);
    return fail(500, 'PDF kaldırılamadı: ' + (error.message || 'bilinmeyen hata'));
  }
}
