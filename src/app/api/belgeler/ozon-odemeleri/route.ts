import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getPendingBalance, PAYOUT_STORE, PAYOUT_THRESHOLD_USD, syncOzonPayouts } from '@/lib/ozon/payouts';
import { readReceiptForm } from '@/lib/ozon/payoutReceipt';

/**
 * Ozon ödemeleri
 *
 *   GET            → ödemeler (Ozon tarafı + dekont), Ozon'da bekleyen bakiye
 *   GET ?yenile=1  → mutabakat raporlarını süreye bakmadan yeniden çeker
 *   POST form-data → Ozon raporu henüz gelmemiş ödemenin dekontunu yeni satır olarak kaydeder
 *
 * Ozon'a ulaşılamazsa veri tabanındaki ödemeler yine döner, hata `warning` olarak gelir.
 */

// Mutabakat raporu Ozon'da birkaç saniyede hazırlanıyor; ilk açılışta birden fazla ay çekilebilir.
export const maxDuration = 60;

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function GET(request: NextRequest) {
  const warnings: string[] = [];

  try {
    await syncOzonPayouts({ force: request.nextUrl.searchParams.get('yenile') === '1' });
  } catch (err: any) {
    console.error('Ozon ödemeleri eşitlenemedi:', err);
    warnings.push(err.message || 'Ozon ödemeleri alınamadı.');
  }

  const balance = await getPendingBalance().catch((err: any) => {
    console.error('Ozon bakiyesi alınamadı:', err);
    warnings.push(err.message || 'Ozon bakiyesi alınamadı.');
    return null;
  });

  try {
    const rows = await prisma.ozonPayout.findMany({ where: { storeId: PAYOUT_STORE } });
    // Ozon raporu gelmemiş satırlar bankaya geliş tarihiyle sıralanır.
    const sortDate = (p: (typeof rows)[number]) => (p.paidAt ?? p.receivedAt ?? p.createdAt).getTime();
    rows.sort((a, b) => sortDate(b) - sortDate(a));
    const payouts = rows.map((p) => ({
      id: p.id,
      ozonDocNo: p.ozonDocNo,
      paidAt: isoDay(p.paidAt),
      amountRub: p.amountRub,
      receivedTry: p.receivedTry,
      receivedAt: isoDay(p.receivedAt),
      bankReference: p.bankReference,
      hasReceipt: !!p.receiptUrl,
      receiptName: p.receiptName,
    }));

    return NextResponse.json({
      success: true,
      payouts,
      balance,
      thresholdUsd: PAYOUT_THRESHOLD_USD,
      warning: warnings.length ? warnings.join(' · ') : null,
    });
  } catch (error: any) {
    console.error('API /belgeler/ozon-odemeleri GET Error:', error);
    return NextResponse.json({ success: false, error_message: error.message || 'Ozon ödemeleri okunamadı.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const fields = await readReceiptForm(await request.formData());
    if ('error' in fields) return NextResponse.json({ success: false, error_message: fields.error }, { status: 400 });

    const created = await prisma.ozonPayout.create({
      data: {
        storeId: PAYOUT_STORE,
        receivedTry: fields.receivedTry,
        receivedAt: fields.receivedAt,
        bankReference: fields.bankReference,
        ...(fields.receipt ?? {}),
      },
    });
    return NextResponse.json({ success: true, id: created.id });
  } catch (error: any) {
    console.error('API /belgeler/ozon-odemeleri POST Error:', error);
    return NextResponse.json({ success: false, error_message: error.message || 'Dekont kaydedilemedi.' }, { status: 500 });
  }
}
