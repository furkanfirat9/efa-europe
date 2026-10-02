import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * ASIN onay ekranının listesi.
 *
 *   GET → { counts: { durum: adet }, rows: onay bekleyen ürünler }
 *
 * Tablo `scripts/asin_source_import.mjs` ile dolar (Amazon taraması tarayıcıda yapılır).
 * Kesin (VERIFIED) ve elle karar verilmiş (MANUAL, NOT_ON_AMAZON) ürünler listeye girmez.
 */

const STORE = 'store1';
const REVIEW_STATUSES = ['MODEL_MISMATCH', 'SUSPECT', 'LIKELY', 'MISSING', 'UNREADABLE'];

export async function GET() {
  try {
    const [groups, rows] = await Promise.all([
      prisma.productSource.groupBy({ by: ['asinStatus'], where: { storeId: STORE }, _count: true }),
      prisma.productSource.findMany({
        where: { storeId: STORE, asinStatus: { in: REVIEW_STATUSES } },
        orderBy: [{ asinStatus: 'asc' }, { offerId: 'asc' }],
      }),
    ]);
    const counts = Object.fromEntries(groups.map((g) => [g.asinStatus, g._count]));
    return NextResponse.json({ success: true, counts, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ASIN listesi alınamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status: 500 });
  }
}
