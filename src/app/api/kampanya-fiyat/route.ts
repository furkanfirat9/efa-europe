import { NextRequest, NextResponse } from 'next/server';
import { applyCampaignPrices, buildCampaignPlan } from '@/lib/pricing/campaign';
import { OzonRateLimitError } from '@/lib/ozon/gate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fail = (error: unknown, fallback: string) =>
  NextResponse.json(
    { success: false, error_message: error instanceof Error ? error.message : fallback },
    { status: error instanceof OzonRateLimitError ? 429 : 500 }
  );

/** Elastik boosting kampanyası için gönderim planı (salt okuma). Kurallar: src/lib/pricing/campaign.ts */
export async function GET() {
  try {
    return NextResponse.json({ success: true, ...(await buildCampaignPlan()) });
  } catch (error) {
    return fail(error, 'Kampanya planı hesaplanamadı.');
  }
}

/** Seçilen ürünlerin kampanya fiyatını Ozon'a yazar. Gövde: { productIds: string[] }. Fiyat sunucuda yeniden hesaplanır. */
export async function POST(request: NextRequest) {
  try {
    const { productIds } = await request.json();
    if (!Array.isArray(productIds) || !productIds.length || productIds.length > 500) {
      return NextResponse.json({ success: false, error_message: 'productIds (1–500) gerekli.' }, { status: 400 });
    }
    const results = await applyCampaignPrices(productIds.map(String));
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return fail(error, 'Kampanya fiyatları gönderilemedi.');
  }
}
