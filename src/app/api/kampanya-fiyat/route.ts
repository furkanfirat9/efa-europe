import { NextRequest, NextResponse } from 'next/server';
import { applyCampaignPrices, buildCampaignPlan, dropStaleReviews } from '@/lib/pricing/campaign';
import { OzonRateLimitError } from '@/lib/ozon/gate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fail = (error: unknown, fallback: string) =>
  NextResponse.json(
    { success: false, error_message: error instanceof Error ? error.message : fallback },
    { status: error instanceof OzonRateLimitError ? 429 : 500 }
  );

/**
 * Elastik boosting kampanyası için gönderim planı. Kurallar: src/lib/pricing/campaign.ts
 * Ozon'a yazmaz; tek yazdığı, stoğu 0'a düşen kartların "olduğu gibi kalsın" kararlarını silmek.
 */
export async function GET() {
  try {
    const { staleReviews, ...plan } = await buildCampaignPlan();
    await dropStaleReviews(staleReviews);
    return NextResponse.json({ success: true, ...plan });
  } catch (error) {
    return fail(error, 'Kampanya planı hesaplanamadı.');
  }
}

/**
 * Seçilen ürünlerin kampanya fiyatını Ozon'a yazar. Gövde: { productIds: string[], estimateCuts?: { [productId]: fiyat } }. Fiyat
 * sunucuda yeniden hesaplanır; estimateCuts kullanıcının ekranda "alınamaz" hâliyle gördüğü indirimlerdir (isUnseenEstimateCut).
 */
export async function POST(request: NextRequest) {
  try {
    const { productIds, estimateCuts } = await request.json();
    if (!Array.isArray(productIds) || !productIds.length || productIds.length > 500) {
      return NextResponse.json({ success: false, error_message: 'productIds (1–500) gerekli.' }, { status: 400 });
    }
    const results = await applyCampaignPrices(productIds.map(String), estimateCuts && typeof estimateCuts === 'object' ? estimateCuts : {});
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return fail(error, 'Kampanya fiyatları gönderilemedi.');
  }
}
