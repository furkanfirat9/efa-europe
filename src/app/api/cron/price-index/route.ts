import { NextRequest, NextResponse } from 'next/server';
import { fetchPriceItems, recordPriceIndex } from '@/lib/pricing/indexHistory';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel Cron: Avrupa mağazasının fiyat endeksini 3 saatte bir kaydeder (vercel.json).
 *
 * Panelin giriş kapısı (src/proxy.ts) /api/cron/ adreslerini geçirir; kapıyı burada CRON_SECRET tutar.
 * Vercel cron isteğine `Authorization: Bearer <CRON_SECRET>` başlığını kendisi ekler.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET tanımlı değil.' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Yetkisiz.' }, { status: 401 });
  }

  try {
    const items = await fetchPriceItems('store1');
    const result = await recordPriceIndex('store1', items, { force: true });
    console.log('[cron/price-index]', JSON.stringify({ items: items.length, ...result }));
    return NextResponse.json({ success: true, items: items.length, ...result });
  } catch (error: any) {
    console.error('[cron/price-index] hata:', error);
    return NextResponse.json({ success: false, error: error.message || 'Endeks kaydedilemedi.' }, { status: 500 });
  }
}
