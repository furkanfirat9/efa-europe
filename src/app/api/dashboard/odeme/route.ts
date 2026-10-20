import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getPendingBalance, PAYOUT_STORE, PAYOUT_THRESHOLD_USD, type PendingBalance } from '@/lib/ozon/payouts';

export const dynamic = 'force-dynamic';

/** Bakiye yarım aylık finans raporundan geliyor ve gün içinde değişmiyor; her açılışta Ozon'a sorulmaz. */
const BALANCE_CACHE_MS = 15 * 60 * 1000;
let balanceCache: { at: number; value: PendingBalance } | null = null;

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Dashboard "Ozon ödemesi" kartı: Ozon'da biriken bakiye, ödeme eşiği ve son ödeme.
 * Ödemeler Belgeler → Ozon ödemeleri sayfasının eşitlediği tablodan okunur (mutabakat raporu burada çekilmez).
 */
export async function GET() {
  let balance: PendingBalance | null = null;
  let warning: string | null = null;
  try {
    if (balanceCache && Date.now() - balanceCache.at < BALANCE_CACHE_MS) balance = balanceCache.value;
    else {
      balance = await getPendingBalance();
      balanceCache = { at: Date.now(), value: balance };
    }
  } catch (err) {
    warning = err instanceof Error ? err.message : 'Ozon bakiyesi alınamadı.';
  }

  try {
    const last = await prisma.ozonPayout.findFirst({
      where: { storeId: PAYOUT_STORE, paidAt: { not: null } },
      orderBy: { paidAt: 'desc' },
    });
    return NextResponse.json({
      success: true,
      balance,
      thresholdUsd: PAYOUT_THRESHOLD_USD,
      lastPayout: last
        ? { paidAt: isoDay(last.paidAt), amountRub: last.amountRub, receivedTry: last.receivedTry, receivedAt: isoDay(last.receivedAt) }
        : null,
      warning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ozon ödemeleri alınamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status: 500 });
  }
}
