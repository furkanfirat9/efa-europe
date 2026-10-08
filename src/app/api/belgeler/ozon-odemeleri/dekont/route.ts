import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { MATCH_DAYS, PAYOUT_STORE } from '@/lib/ozon/payouts';
import { parseReceiptText, pdfText, type ParsedReceipt } from '@/lib/ozon/receipt';

/**
 * POST form-data: file → dekontu okur, kaydetmez. Onay ekranı için TL tutarı, tarih, dönem
 * referansı ve dekontu henüz olmayan Ozon ödemeleri arasından tarihi en yakın olanı döner.
 * Uygun ödeme yoksa (Ozon ayın raporunu ay kapanınca verir) öneri boş gelir ve dekont yeni
 * satır olarak kaydedilir. Görsel dekontlar okunmaz (alanlar boş gelir, kullanıcı girer).
 */

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error_message: 'Dosya gerekli.' }, { status: 400 });
    }

    let parsed: ParsedReceipt = { receivedTry: null, receivedAt: null, bankReference: null };
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      try {
        parsed = parseReceiptText(await pdfText(Buffer.from(await file.arrayBuffer())));
      } catch (err) {
        console.warn('Dekont PDF metni okunamadı:', err);
      }
    }

    let suggestedPayoutId: string | null = null;
    if (parsed.receivedAt) {
      const received = new Date(`${parsed.receivedAt}T00:00:00Z`).getTime();
      const open = await prisma.ozonPayout.findMany({
        where: { storeId: PAYOUT_STORE, receivedTry: null, paidAt: { not: null } },
        select: { id: true, paidAt: true },
      });
      const best = open
        .map((p) => ({ id: p.id, days: Math.abs(received - p.paidAt!.getTime()) / 86_400_000 }))
        .filter((p) => p.days <= MATCH_DAYS)
        .sort((a, b) => a.days - b.days)[0];
      suggestedPayoutId = best?.id ?? null;
    }

    return NextResponse.json({ success: true, parsed, suggestedPayoutId, readable: isPdf && parsed.receivedTry != null });
  } catch (error: any) {
    console.error('API /belgeler/ozon-odemeleri/dekont POST Error:', error);
    return NextResponse.json({ success: false, error_message: error.message || 'Dekont okunamadı.' }, { status: 500 });
  }
}
