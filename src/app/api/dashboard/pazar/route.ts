import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { loadShareComparison } from '@/lib/pricing/indexHistory';
import { loadScanStatus } from '@/lib/sourcing/scanStatus';

export const dynamic = 'force-dynamic';

const STORE = 'store1';

/**
 * Dashboard "Pazar ve tedarik": fiyat endeksinin son kaydı (3 saatte bir, Vercel Cron) ve
 * tedarik taramalarının durumu. Yalnız veri tabanından okur.
 */
export async function GET() {
  try {
    const [latest, share, scans] = await Promise.all([
      prisma.priceIndexRun.findFirst({ where: { storeId: STORE }, orderBy: { takenAt: 'desc' } }),
      loadShareComparison(STORE),
      loadScanStatus(STORE),
    ]);
    return NextResponse.json({
      success: true,
      priceIndex: latest
        ? {
            takenAt: latest.takenAt.toISOString(),
            total: latest.total,
            green: latest.green,
            yellow: latest.yellow,
            red: latest.red,
            withoutIndex: latest.withoutIndex,
            share,
          }
        : null,
      scans,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pazar verisi alınamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status: 500 });
  }
}
