import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { CURRENT_STORE, isPostingFromInvoice, ORDER_STORE_ID, toSalesDto } from '@/lib/sales-invoices/service';

/**
 *   PATCH  { postingNumber: string | null } → siparişi elle bağla / bağlantıyı kaldır
 *   DELETE                                  → satış faturasını, dosyasını ve eklenmiş PDF'ini sil
 */

const fail = (status: number, message: string) =>
  NextResponse.json({ success: false, error_message: message }, { status });

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/belgeler/satis/[id]'>) {
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    if (!('postingNumber' in body)) return fail(400, 'Değiştirilecek alan yok.');

    const existing = await prisma.salesInvoice.findFirst({
      where: { id, store: CURRENT_STORE },
      select: { notes: true, postingNumber: true },
    });
    if (!existing) return fail(404, 'Fatura bulunamadı.');
    // Faturanın kendisinde yazan gönderi no belgenin parçasıdır; panelden değiştirilmez.
    if (isPostingFromInvoice(existing.notes, existing.postingNumber)) {
      return fail(409, 'Bu faturanın gönderi numarası faturada yazıyor; değiştirilemez.');
    }

    const posting = typeof body.postingNumber === 'string' && body.postingNumber.trim() ? body.postingNumber.trim() : null;
    if (posting) {
      const order = await prisma.ozonOrder.findFirst({
        where: { postingNumber: posting, storeId: ORDER_STORE_ID },
        select: { postingNumber: true },
      });
      if (!order) return fail(404, `${posting} numaralı sipariş bulunamadı.`);

      // Bir sipariş yalnızca bir satış faturasına bağlanır.
      const taken = await prisma.salesInvoice.findFirst({
        where: { store: CURRENT_STORE, postingNumber: posting, NOT: { id } },
        select: { invoiceNo: true },
      });
      if (taken) return fail(409, `${posting} zaten ${taken.invoiceNo} faturasına bağlı.`);
    }

    const updated = await prisma.salesInvoice.update({
      where: { id },
      data: { postingNumber: posting },
      include: { lines: true },
    });
    return NextResponse.json({ success: true, invoice: toSalesDto(updated) });
  } catch (error: any) {
    console.error('API /api/belgeler/satis/[id] PATCH Error:', error);
    return fail(500, 'Fatura kaydedilemedi: ' + (error.message || 'bilinmeyen hata'));
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/belgeler/satis/[id]'>) {
  try {
    const { id } = await ctx.params;
    const existing = await prisma.salesInvoice.findFirst({
      where: { id, store: CURRENT_STORE },
      select: { fileUrl: true, pdfUrl: true },
    });
    if (!existing) return fail(404, 'Fatura bulunamadı.');

    await prisma.salesInvoice.delete({ where: { id } });

    // Aynı ZIP'ten gelen başka fatura varsa dosya onundur da; son fatura silinince kaldırılır.
    const sharing = await prisma.salesInvoice.count({ where: { fileUrl: existing.fileUrl } });
    const urls = [sharing === 0 && existing.fileUrl, existing.pdfUrl].filter((u): u is string => !!u);
    for (const url of urls) {
      try {
        await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN || undefined });
      } catch (err) {
        console.error('Satış faturası dosyası silinemedi:', url, err);
      }
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /api/belgeler/satis/[id] DELETE Error:', error);
    return fail(500, 'Fatura silinemedi: ' + (error.message || 'bilinmeyen hata'));
  }
}
