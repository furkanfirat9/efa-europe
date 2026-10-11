import { NextRequest, NextResponse } from 'next/server';
import { keepAsIs, removeFromCampaign, setManualPrice, undoKeep } from '@/lib/pricing/campaign';
import { OzonRateLimitError } from '@/lib/ozon/gate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * "Elle kontrol" bölümünün işlemleri. Gövde:
 *   { action: 'remove', productIds: string[] }   kampanyadan çıkar (zararlı / az kârlı)
 *   { action: 'price', productId, price }        elle kampanya fiyatı (asgari kâr ile Ozon tavanı arasında)
 *   { action: 'keep' | 'unkeep', productId }     "olduğu gibi kalsın" kararı / geri al
 * Ürünün elle kontrol grubunda olduğu sunucuda yeniden hesaplanan planla doğrulanır (src/lib/pricing/campaign.ts).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    switch (body.action) {
      case 'remove': {
        if (!Array.isArray(body.productIds) || !body.productIds.length || body.productIds.length > 100)
          return NextResponse.json({ success: false, error_message: 'productIds (1–100) gerekli.' }, { status: 400 });
        return NextResponse.json({ success: true, results: await removeFromCampaign(body.productIds.map(String)) });
      }
      case 'price':
        return NextResponse.json({ success: true, results: [await setManualPrice(String(body.productId), Number(body.price))] });
      case 'keep':
        await keepAsIs(String(body.productId));
        return NextResponse.json({ success: true });
      case 'unkeep':
        await undoKeep(String(body.productId));
        return NextResponse.json({ success: true });
      default:
        return NextResponse.json({ success: false, error_message: 'Bilinmeyen işlem.' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error_message: error instanceof Error ? error.message : 'İşlem yapılamadı.' },
      { status: error instanceof OzonRateLimitError ? 429 : 500 }
    );
  }
}
