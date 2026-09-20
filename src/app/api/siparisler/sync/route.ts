import { NextRequest, NextResponse } from 'next/server';
import { syncOzonOrdersToDb } from '@/lib/db/orders';
import { prisma } from '@/lib/db/prisma';
import { getOzonHeaders, OzonRateLimitError } from '@/lib/ozon/gate';
import {
  fetchPostingsForRange,
  enrichPostingsWithProductDetails,
  monthRangeMsk,
  currentMonthMsk,
} from '@/lib/ozon/postings';

export const dynamic = 'force-dynamic';

const STORE_ID = 'store1';

/**
 * İçinde bulunulan ay bu süreden eskiyse yeniden çekilir. Geçmiş aylar bir
 * kez indirildikten sonra hiç sorulmaz; onlara yeni sipariş düşmez.
 */
const CURRENT_MONTH_TTL_MS = 5 * 60 * 1000;

/**
 * Görseli olmayan siparişleri, aynı ürünün görseli bilinen başka bir
 * siparişinden tamamlar.
 */
async function backfillMissingImages() {
  try {
    const ordersWithImages = await prisma.ozonOrder.findMany({
      where: { productImage: { not: null } },
      select: { productOfferId: true, productImage: true },
    });

    for (const src of ordersWithImages) {
      if (src.productOfferId && src.productImage) {
        await prisma.ozonOrder.updateMany({
          where: { productOfferId: src.productOfferId, productImage: null },
          data: { productImage: src.productImage },
        });
      }
    }
  } catch {
    // Görsel tamamlama başarısız olursa senkron yine de geçerlidir.
  }
}

/**
 * POST /api/siparisler/sync
 *
 * Gövdede `year` ve `month` beklenir: o ay gerekiyorsa Ozon'dan indirilir.
 *
 * Karar kuralı:
 *  - Dönem daha önce hiç indirilmemişse  → indirilir.
 *  - Dönem içinde bulunulan aysa ve son indirme 5 dakikadan eskiyse → indirilir.
 *  - Diğer durumlarda                    → hiç Ozon'a gidilmez, `skipped` döner.
 *
 * `force: true` gönderilirse kural atlanır ve dönem her hâlükârda indirilir.
 *
 * Elle girilen alanlara (alış fiyatı, tedarikçi, kart, not) dokunulmaz;
 * upsert yalnızca Ozon'dan gelen alanları yazar.
 */
export async function POST(request: NextRequest) {
  try {
    let year: number | undefined;
    let month: number | undefined;
    let force = false;

    try {
      const body = await request.json();
      const y = Number(body?.year);
      const m = Number(body?.month);
      if (Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12) {
        year = y;
        month = m;
      }
      force = body?.force === true;
    } catch {
      // Gövde yok ya da JSON değil.
    }

    if (!year || !month) {
      // Dönem verilmediyse içinde bulunulan ay varsayılır.
      const now = currentMonthMsk();
      year = now.year;
      month = now.month;
    }

    const current = currentMonthMsk();
    const isCurrentMonth = year === current.year && month === current.month;

    const existing = await prisma.orderPeriodSync.findUnique({
      where: { storeId_year_month: { storeId: STORE_ID, year, month } },
    });

    if (!force && existing) {
      const stale = Date.now() - existing.syncedAt.getTime() > CURRENT_MONTH_TTL_MS;
      if (!isCurrentMonth || !stale) {
        return NextResponse.json({
          success: true,
          skipped: true,
          period: `${year}-${String(month).padStart(2, '0')}`,
          syncedAt: existing.syncedAt.toISOString(),
          fetchedCount: 0,
          syncedCount: 0,
        });
      }
    }

    const headers = getOzonHeaders(STORE_ID);
    if (!headers['Client-Id'] || !headers['Api-Key']) {
      return NextResponse.json(
        { success: false, error_message: 'Avrupa mağazası için API anahtarları tanımlı değil (.env kontrol edin).' },
        { status: 400 }
      );
    }

    const { sinceISO, toISO } = monthRangeMsk(year, month);

    const postings = await fetchPostingsForRange(sinceISO, toISO, headers);
    await enrichPostingsWithProductDetails(postings, headers);
    const res = await syncOzonOrdersToDb(postings, STORE_ID);

    await backfillMissingImages();

    // İşareti yalnızca çekim başarıyla tamamlandıktan sonra koy; hata hâlinde
    // dönem "indirildi" sayılmasın ki bir sonraki ziyarette yeniden denensin.
    await prisma.orderPeriodSync.upsert({
      where: { storeId_year_month: { storeId: STORE_ID, year, month } },
      create: { storeId: STORE_ID, year, month, orderCount: postings.length },
      update: { orderCount: postings.length, syncedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      skipped: false,
      period: `${year}-${String(month).padStart(2, '0')}`,
      fetchedCount: postings.length,
      syncedCount: res.count || 0,
    });
  } catch (error: any) {
    console.error('API /api/siparisler/sync Error:', error);

    if (error instanceof OzonRateLimitError) {
      return NextResponse.json({ success: false, error_message: error.message }, { status: 429 });
    }

    return NextResponse.json(
      { success: false, error_message: error.message || 'Senkronizasyon başarısız.' },
      { status: 500 }
    );
  }
}
