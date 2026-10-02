import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * Ceneo onay ekranının listesi.
 *
 *   GET → { counts: { durum: adet }, rows: karar bekleyen ürünler }
 *
 * Tablo `scripts/ceneo_import.mjs` ile dolar (Ceneo taraması tarayıcıda yapılır, skill ceneo-scan).
 * Kesin (EXACT) ve elle karar verilmiş (MANUAL, NOT_IN_POLAND) ürünler listeye girmez.
 * Hiç eşleşmemiş ürünün durumu boştur; sayımda NONE olarak döner.
 */

const STORE = 'store1';

export async function GET() {
  try {
    const where = { storeId: STORE, asinStatus: { not: 'ARCHIVED' } };
    const [groups, rows] = await Promise.all([
      prisma.productSource.groupBy({ by: ['ceneoStatus'], where, _count: true }),
      prisma.productSource.findMany({
        where: { ...where, OR: [{ ceneoStatus: null }, { ceneoStatus: { in: ['VARIANT', 'NOT_FOUND', 'ERROR'] } }] },
        orderBy: [{ ceneoStatus: 'asc' }, { offerId: 'asc' }],
        select: {
          id: true,
          offerId: true,
          sku: true,
          ozonName: true,
          ozonBrand: true,
          ozonPartNumber: true,
          ozonImage: true,
          asin: true,
          amzModel: true,
          amzBrand: true,
          ceneoStatus: true,
          ceneoCandidates: true,
        },
      }),
    ]);
    const counts = Object.fromEntries(groups.map((g) => [g.ceneoStatus ?? 'NONE', g._count]));
    return NextResponse.json({ success: true, counts, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ceneo listesi alınamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status: 500 });
  }
}
