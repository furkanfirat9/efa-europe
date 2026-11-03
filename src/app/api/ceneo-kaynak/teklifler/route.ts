import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getEcbEurPln } from '@/lib/fx/ecb';
import { ceneoPickInput, pickSupply } from '@/lib/pricing/proposals';
import { offerSkip, pickBestOffer, rateOffers } from '@/lib/sourcing/ceneoRules';

/**
 * Teklif kontrolü listesi: Ceneo sayfası doğru ama seçilen teklifi şüpheli ürünler (ceneoOfferReview dolu) ve kararı
 * verilip teklif elenmiş ürünler (geri alınabilsin diye). Kararlar ../[id] ile yazılır.
 *
 *   GET → { rows: [{ …ürün, offers, rejectedGone, source, channels }] }
 *
 * offers ucuzdan pahalıya; skip teklifin seçime neden girmediği, selected maliyette kullanılan teklif.
 * rejectedGone: elenmiş ama son taramada sayfada artık olmayan teklifler.
 */

const STORE = 'store1';

export async function GET() {
  try {
    const [pln, rows] = await Promise.all([
      getEcbEurPln(),
      prisma.productSource.findMany({
        where: {
          storeId: STORE,
          asinStatus: { not: 'ARCHIVED' },
          ceneoStatus: { in: ['EXACT', 'MANUAL'] },
          OR: [{ ceneoOfferReview: { not: null } }, { ceneoRejectedOffers: { not: Prisma.DbNull } }],
        },
        orderBy: { offerId: 'asc' },
      }),
    ]);

    return NextResponse.json({
      success: true,
      rows: rows.map((r) => {
        const { offers, brand, codes, rejected } = ceneoPickInput(r);
        const best = pickBestOffer(offers, brand, codes, rejected)?.best ?? null;
        const { chosen, offers: channels, priceOf } = pickSupply(r, pln.rate);
        return {
          id: r.id,
          offerId: r.offerId,
          sku: r.sku,
          asin: r.asin,
          ozonName: r.ozonName,
          ozonBrand: r.ozonBrand,
          ozonImage: r.ozonImage,
          ceneoId: r.ceneoProductId,
          ceneoName: r.ceneoName,
          checkedAt: r.ceneoCheckedAt,
          review: r.ceneoOfferReview,
          offers: rateOffers(offers, brand).map((o) => ({
            offerId: o.offerId,
            shop: o.shop,
            title: o.title,
            totalPln: o.totalPln,
            skip: offerSkip(o, brand, codes, rejected),
            selected: o.offerId === best?.offerId,
          })),
          rejectedGone: rejected.filter((x) => !offers.some((o) => o.offerId === x.offerId)),
          source: chosen?.source ?? null,
          channels: channels.map((c) => ({ source: c.source, eur: priceOf(c), shippingEur: c.shippingEur, buyable: c.buyable, shop: c.shop ?? null, outlier: !!c.outlier })),
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Teklif listesi alınamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status: 500 });
  }
}
