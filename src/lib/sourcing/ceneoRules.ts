/**
 * Ceneo tekliflerinden tedarik kaynağı seçimi (kullanıcıyla 2026-09-27'de kararlaştırıldı).
 *
 *   güvenilir teklif = büyük mağaza (puana bakılmaz) | Allegro | Ceneo puanı ≥ 4,7 ve ≥ 100 yorum
 *   toplam           = fiyat + kargo; Allegro'da kargo 0 (kullanıcının Smart üyeliği var)
 *   seçim            = en ucuz güvenilir teklif; büyük mağaza ondan en fazla %3 pahalıysa büyük mağaza
 *
 * Ceneo puanı büyük mağazalarda anlamsız (amazon.pl 3★ / 77 yorum): müşterileri yorumu Ceneo'ya yazmıyor.
 * Allegro ve Amazon.pl pazar yeri: asıl satıcı Ceneo'da görünmez (görmek için tıklama başı ücretli reklam
 * linkine gitmek gerekir), satın alırken kontrol edilir.
 *
 * Bağımlılığı yok: hem uygulama hem `scripts/ceneo_import.mjs` (Node tip ayıklama ile) içe aktarır.
 */

export const SOURCING = {
  bigShops: ['amazon.pl', 'mediaexpert.pl', 'euro.com.pl', 'x-kom.pl', 'morele.net', 'neonet.pl', 'empik.com', 'mediamarkt.pl'],
  /** Pazar yerleri: satıcı Ceneo'da görünmez */
  marketplaces: ['allegro.pl', 'amazon.pl'],
  minRating: 4.7,
  minReviews: 100,
  bigShopPreferPct: 0.03,
  /** Başlığında muadil / uyumlu parça yazan ilanlar seçime girmez (kullanıcı, 2026-10-01): satıcılar, özellikle
   *  Allegro'da, orijinalin sayfasına "Zamiennik" ürün listeliyor (CA6903/22, FY3446/30). Bedeli: asıl ürünü
   *  "Samsung TV ile uyumlu" diye anlatan ilan da düşer (SRP4010/10 kumandası). */
  compatibleTitle: /zamiennik|zamienn[yae]|kompatybil|pasuje do|zgodn[yae] z|odpowiednik/i,
} as const;

export interface CeneoOffer {
  offerId: string | null;
  shop: string | null;
  type: string | null;
  title: string | null;
  pricePln: number;
  /** null = teklifte kargo bilgisi yok */
  shippingPln: number | null;
  shippingText: string | null;
  dispatch: string | null;
  rating: number | null;
  reviews: number;
  trustedBadge: boolean;
  clickUrl: string | null;
}

export type ShopKind = 'big' | 'official' | 'allegro' | 'rated' | 'untrusted';

export interface RatedOffer extends CeneoOffer {
  kind: ShopKind;
  totalPln: number;
}

const host = (shop: string | null) => (shop || '').toLowerCase().replace(/^www\./, '');
const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** @param brand markanın resmî mağazası da büyük mağaza sayılır (home-appliances.philips, tefal.pl) */
export function shopKind(o: CeneoOffer, brand?: string | null): ShopKind {
  const h = host(o.shop);
  if (h === 'allegro.pl') return 'allegro';
  if ((SOURCING.bigShops as readonly string[]).includes(h)) return 'big';
  const b = brand ? letters(brand.split(/\s+/)[0]) : '';
  if (b.length >= 3 && letters(h).includes(b)) return 'official';
  if ((o.rating ?? 0) >= SOURCING.minRating && o.reviews >= SOURCING.minReviews) return 'rated';
  return 'untrusted';
}

export function rateOffers(offers: CeneoOffer[], brand?: string | null): RatedOffer[] {
  return offers
    .map((o) => {
      const kind = shopKind(o, brand);
      return { ...o, kind, totalPln: o.pricePln + (kind === 'allegro' ? 0 : o.shippingPln ?? 0) };
    })
    .sort((a, b) => a.totalPln - b.totalPln);
}

export interface CeneoPick {
  best: RatedOffer;
  cheapest: RatedOffer;
  /** true: büyük mağaza %3 içinde kaldığı için en ucuz yerine seçildi */
  preferredBig: boolean;
  trustedCount: number;
}

export function pickBestOffer(offers: CeneoOffer[], brand?: string | null): CeneoPick | null {
  const trusted = rateOffers(offers, brand).filter((o) => o.kind !== 'untrusted' && !SOURCING.compatibleTitle.test(o.title ?? ''));
  if (!trusted.length) return null;
  const cheapest = trusted[0];
  const big = trusted.find((o) => o.kind === 'big' || o.kind === 'official');
  const preferredBig = !!big && big !== cheapest && big.totalPln <= cheapest.totalPln * (1 + SOURCING.bigShopPreferPct);
  return { best: preferredBig ? big! : cheapest, cheapest, preferredBig, trustedCount: trusted.length };
}
