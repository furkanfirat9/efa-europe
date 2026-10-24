import { calculateFulfillmentCosts, calculateShippingCosts } from '@/lib/calculator/profitCalculator';

/**
 * Otomatik fiyatlandırma kuralları (kullanıcıyla 2026-09-26'da kararlaştırıldı).
 *
 * Satılmamış ürün için ileriye dönük hesap: "bu ürün P $'dan satılırsa ne kalır?"
 *   net kâr = P − P × (komisyon + acquiring + aracılık) − min(P × platform, 200 ₽)
 *             − depoya gelmiş maliyet (banka kur farkıyla) − Ozon kargosu − depo ücreti
 *   marj    = net kâr ÷ depoya gelmiş maliyet   (satıştan değil, bağlanan sermayeden)
 *
 * Fiyat kararı, en ucuz Ozon rakibine göre (kullanıcı, 2026-10-11; bütün ürünler):
 *   rakip − 11 ₽ (tam dolara aşağı) %20 marjı aşıyorsa      → %20 marj fiyatı (rakip çok pahalı diye fiyat şişmez)
 *   %10 marj ile %20 arasındaysa (en az 5 $ kâr)             → rakip − 11 ₽ (rakibi yeneriz)
 *   %10'un altında kalıyorsa (rakibi kârla yenemiyoruz)      → %15 marj fiyatı (fiyat yarışına girilmez)
 *   rakip yoksa                                              → %20 marj fiyatı
 *   rakip Amazon'un KDV hariç fiyatının altındaysa → yok sayılır (kullanıcı: genelde Çinli satıcı, sahte ürün;
 *   orijinali bu fiyatın altına satmak mümkün değil)
 * Eskiden (2026-09-26 – 10-11): rakibe asgari %8 kâra kadar inilir, inilemezse %25, rakipsiz %35; rakip pahalıysa
 * sınırsız yaklaşılırdı (MMB6652B: rakip 674 $, %25 fiyatı 377 $).
 */
export const PRICING = {
  /** 'gross' = Amazon KDV dahil fiyatı; Polonya KDV kaydı bitince 'net' (doğrudan KDV hariç tedarik). */
  vatMode: 'gross' as 'gross' | 'net',
  /** Amazon.de'den depoya kargo, her ürüne sabit. amazon.pl'de sayfada "DARMOWA dostawa" yazıyorsa 0,
   *  yazmıyorsa bu değer (bilinmeyen kargo için temkinli varsayım). */
  amazonShippingEur: 5.99,
  /** amazon.pl yalnız KDV dahil fiyat gösteriyor (hesap orada Business değil); KDV hariç = fiyat ÷ 1,23 */
  plVatRate: 0.23,
  /** Kartın TL'den çektiği tutar ECB kurunun bu kadar üstünde (2026-10-10 ölçümü: %2,0 / %4,1 / %4,9; kullanıcı
   *  ortalamaya yakın %3,5'i seçti). Alışa ve depoya kargoya eklenir; Ozon kargosu ve depo ücreti kartla ödenmiyor. */
  bankFxPct: 0.035,
  /** Amazon ağırlığına kutu/dolgu payı. LS'nin ölçtüğü ağırlık ürün ağırlığından çoğunlukla 150–275 g fazla, ürünün
   *  ağırlığıyla oransal büyümüyor (2026-10-10, 9 gönderi); alt sınır bu yüzden 150 g'dan 250 g'a çıktı. */
  packagingPct: 0.1,
  packagingMinG: 250,
  /** Kutulu ağırlığa (Amazon / Icecat) LS'nin dış paketi: JF4031E0 Icecat kutusu 2 280 g, LS 2 540 g ölçtü. */
  boxPadG: 250,
  /** Ozon kartındaki ağırlık kaynaksız tahmindir (yüklemede çoğunlukla ürün + %10). Rakiple aramızda yeterli fark varsa
   *  kutu payı %10 yerine %30 sayılır: maliyet yükselir ama fiyat yine rakibin altında kalır (kullanıcı, 2026-10-24). */
  cardWeightPct: 0.1,
  cardWeightSafePct: 0.3,
  /** Gerçek kargo ağırlığı tahminin bu katını aşıyorsa ölçüm hatası sayılır
   *  (HX6064/87: 4 fırça başlığı 1,42 kg ölçüldü, LS'ye soruldu). */
  realWeightMaxRatio: 3,
  /** Amazon ağırlığı bunun altındaysa anlamsız sayılır ("1 g" gibi). */
  minPlausibleWeightG: 50,
  /** Ozon kartının paketli ağırlığı bunun altındaysa ürün gerçekten hafiftir (başlık, bıçak, ampul): 50 g altı ağırlıklar
   *  da kabul edilir (2026-10-11, kullanıcı; 18 ürünün kârı hesaplanamıyordu). */
  smallItemMaxCardG: 250,
  /** Marj üst sınırı: rakip ne kadar pahalı olursa olsun fiyat bu marjı aşmaz; rakipsiz ürün de bu marjla satılır. */
  targetMargin: 0.2,
  noRivalMargin: 0.2,
  /** Rakibi kârla yenemediğimizde (rakip − 11 ₽ asgari kârın altında) kalınan marj. */
  noBeatMargin: 0.15,
  /** Asgari net kâr (rakibi yenerken inilebilecek en alt): maliyetin %10'u, en az 5 $ (30 $'lık üründe %10 kargo ve
   *  kur oynamasında zarara döner). Eskiden %8. */
  minProfitPct: 0.1,
  minProfitUsd: 5,
  undercutRub: 11,
  /** Bizim 1 $'ımızın vitrindeki yeşil (Ozon Bank) ruble karşılığı ÷ Ozon'un rakip fiyatını çevirdiği kur.
   *  2026-10-02 ölçümü, 8 ürün: vitrin 81,90 ₽/$, yeşil indirim %0,95 → 81,12 ₽/$; endeks kuru 83,25 ₽/$.
   *  Bu çarpan olmadan rakibin 11 ₽ değil ~%3 altına düşüyorduk (XP9207/30: 850 ₽). Amaç rakibe olabildiğince
   *  yakın durmak: Ozon fiyatları yakın iki satıcıya da kârlı etiket veriyor, rakibinkini bozmak fiyat savaşı açar.
   *  Bazı ürünlerde Ozon bu farkı uygulamıyor (endeks = bizim $ ÷ rakip $; muhtemelen rakip dolarla satıyor);
   *  0,9744 orada bizi rakibin üstüne çıkardı (2026-10-02, 9 ürün sarıya düştü). Hangisi olduğu ürünün kendi
   *  endeksinden okunur, bkz. storefrontFactorFor. */
  storefrontRateFactor: 0.9744,
  /** Endeksten ölçülen oran bunun üstündeyse Ozon kur farkı uygulamıyor sayılır (iki durumun ortası;
   *  endeks iki haneye yuvarlandığı için ölçüm ±0,005 oynuyor). */
  noFactorThreshold: 0.987,
  oldPriceMultiplier: 1.2,
  /** AB → Rusya ihracatında satış fiyatı bunu geçemez (AGENTS.md §5); kural fiyatı aşarsa sınırın hemen altına çekilir */
  exportLimitEur: 750,
  /** Acquiring ödeme yöntemine göre değişiyor: Ozon Bank %1,90, banka kartı %1,16, СБП %0,49. Ozon'un ürün başına
   *  verdiği oran (~%1) bunu yansıtmıyor; 10 siparişin ortalaması %1,54 → kullanıcı %1,5'i seçti (2026-10-10). */
  acquiringPct: 0.015,
} as const;

/** Ozon'un satış fiyatından kestiği, ürüne göre değişmeyen kalemler (sipariş kârı ve fiyat önerisi ortak kullanır). */
export const OZON_GLOBAL_FEES = {
  /** Ozon komisyonu tahakkuk etmeden finansal veride oran yoksa */
  defaultCommissionPct: 0.05,
  /** "Электронная услуга подключения к логистической Платформе Ozon" (tahakkuk tipi 123), gönderi başına en fazla 200 ₽ */
  platformPct: 0.02,
  platformCapRub: 200,
  /** "Услуги по заключению договора на организацию международной перевозки" (tahakkuk tipi 122);
   *  tek tahakkuktan çıkarıldı: 42703766-0246-1'de 21,82 ₽ = 6.613 ₽ × %0,33 */
  intermediaryPct: 0.0033,
  /** Ozon satıcının dolar fiyatını CBR USD kurunun bu katıyla rubleye çeviriyor (6.613 ₽ ÷ 76 $ = 87,013; CBR 86,5857) */
  saleRateFactor: 1.005,
} as const;

/** Platform hizmetinin 200 ₽ tavanı dolar olarak (Ozon'un satıcı kuru CBR USD × 1,005); kur yoksa null = tavansız */
export const platformCapUsdFor = (cbrUsd: number | null | undefined) =>
  cbrUsd ? OZON_GLOBAL_FEES.platformCapRub / (cbrUsd * OZON_GLOBAL_FEES.saleRateFactor) : null;

export type WeightSource ='ozon-real' | 'researched' | 'amazon-package' | 'icecat-package' | 'amazon-item' | 'ozon-card' | 'small-item' | 'none';

export interface WeightInput {
  amzItemG?: number | null;
  amzPackageG?: number | null;
  /** Araştırılmış kutulu ağırlık (ProductSource.researchedPackageWeightG) */
  researchedPackageG?: number | null;
  /** Icecat kutulu ağırlığı (ProductSource.icecatPackageWeightG) */
  icecatPackageG?: number | null;
  ozonCardG?: number | null;
  /** Ozon'un teslim edilmiş siparişte kestiği kargo kademesinden (kademe × 500 g) */
  realG?: number | null;
}

/**
 * Kargo ağırlığı: ürün daha önce gönderildiyse Ozon'un kestiği kargo kademesinden (`realG`), yoksa tahmin.
 * Tahmin: araştırılmış kutulu ağırlık > Amazon kutulu ağırlığı > Icecat kutulu ağırlığı (+ LS dış paketi) > Amazon ürün
 * ağırlığı + paket payı > Ozon kartı.
 */
export function shippingWeight({ amzItemG = null, amzPackageG = null, researchedPackageG = null, icecatPackageG = null, ozonCardG = null, realG = null }: WeightInput) {
  const est = estimatedWeight(amzItemG, amzPackageG, researchedPackageG, icecatPackageG, ozonCardG);
  if (realG && (!est.grams || realG <= est.grams * PRICING.realWeightMaxRatio)) {
    return { grams: realG, source: 'ozon-real' as WeightSource, check: false };
  }
  return est;
}

function estimatedWeight(
  amzItemG: number | null,
  amzPackageG: number | null,
  researchedPackageG: number | null,
  icecatPackageG: number | null,
  ozonCardG: number | null
) {
  const ok = (g: number | null): g is number => g != null && g >= PRICING.minPlausibleWeightG;
  // Kaynağıyla tek tek kontrol edildi; Amazon'un "ürün ağırlığı" bazen kutudan bile ağır yazılı (BHD341/10: fön 600 g, Amazon 1 090 g)
  if (ok(researchedPackageG)) return { grams: researchedPackageG + PRICING.boxPadG, source: 'researched' as WeightSource, check: false };
  if (ok(amzPackageG)) return { grams: amzPackageG + PRICING.boxPadG, source: 'amazon-package' as WeightSource, check: false };
  // Icecat'te kutunun üründen hafif yazıldığı kayıtlar var (HD2350/80: ürün 2 400 g, kutu 643 g); onlar yok sayılır
  if (ok(icecatPackageG) && !(ok(amzItemG) && icecatPackageG < amzItemG)) {
    return { grams: icecatPackageG + PRICING.boxPadG, source: 'icecat-package' as WeightSource, check: false };
  }
  if (ok(amzItemG)) {
    const pack = Math.max(amzItemG * PRICING.packagingPct, PRICING.packagingMinG);
    return { grams: Math.round(amzItemG + pack), source: 'amazon-item' as WeightSource, check: false };
  }
  if (ok(ozonCardG)) return { grams: ozonCardG, source: 'ozon-card' as WeightSource, check: true };
  // Çok hafif ürün (7–48 g): kart da küçük diyorsa 50 g altı ağırlık gerçektir. Büyük üründe Amazon'un yanlış "1 g"si
  // kart ağır olduğu için buraya gelmez, yukarıda kart ağırlığı kullanılır.
  const small = [amzPackageG, icecatPackageG, amzItemG, ozonCardG].filter((g): g is number => g != null && g > 0);
  if (small.length && ozonCardG != null && ozonCardG > 0 && ozonCardG < PRICING.smallItemMaxCardG) {
    return { grams: Math.max(...small) + PRICING.packagingMinG, source: 'small-item' as WeightSource, check: false };
  }
  return { grams: 0, source: 'none' as WeightSource, check: true };
}

export interface CostInput {
  /** Seçilen kanaldaki alış fiyatı (Amazon.de ya da amazon.pl, €) */
  purchaseEur: number;
  /** O kanaldan depoya kargo (€) */
  shippingEur: number;
  weightG: number;
  eurUsd: number;
  /** Satıştan tavansız kesilen oranlar toplamı (komisyon + acquiring + aracılık), ör. 0.068 */
  feePct: number;
  /** Platform hizmeti oranı; gönderi başına platformCapUsd ile sınırlı */
  platformPct: number;
  /** Platform hizmetinin tavanı (200 ₽, $); kur bilinmiyorsa null = tavansız */
  platformCapUsd: number | null;
}

export interface CostBase {
  landedUsd: number;
  ozonShippingUsd: number;
  depotUsd: number;
  /** Satıştan bağımsız giderler toplamı */
  fixedUsd: number;
  feePct: number;
  platformPct: number;
  platformCapUsd: number | null;
}

export function costBase({ purchaseEur, shippingEur, weightG, eurUsd, feePct, platformPct, platformCapUsd }: CostInput): CostBase {
  const landedUsd = (purchaseEur + shippingEur) * eurUsd * (1 + PRICING.bankFxPct);
  const ozonShippingUsd = calculateShippingCosts(weightG).totalShipping * eurUsd;
  const depotUsd = calculateFulfillmentCosts(weightG).totalFulfillment * eurUsd;
  return {
    landedUsd,
    ozonShippingUsd,
    depotUsd,
    fixedUsd: landedUsd + ozonShippingUsd + depotUsd,
    feePct,
    platformPct,
    platformCapUsd,
  };
}

/** Bu fiyattan satışta Ozon'un satış fiyatı üzerinden kestiği toplam */
function salesFees(price: number, c: CostBase) {
  const platform = price * c.platformPct;
  return price * c.feePct + (c.platformCapUsd == null ? platform : Math.min(platform, c.platformCapUsd));
}

export function profitAt(price: number, c: CostBase) {
  const profit = price - salesFees(price, c) - c.fixedUsd;
  return { profit, margin: c.landedUsd > 0 ? profit / c.landedUsd : 0 };
}

/** Bu net kârı bırakan en düşük tam dolar fiyat. */
export function priceForProfit(profitUsd: number, c: CostBase) {
  const need = c.fixedUsd + profitUsd;
  const uncapped = need / (1 - c.feePct - c.platformPct);
  const capped = c.platformCapUsd != null && uncapped * c.platformPct > c.platformCapUsd;
  return Math.ceil(capped ? (need + c.platformCapUsd!) / (1 - c.feePct) : uncapped);
}

export const minProfitUsd = (landedUsd: number) => Math.max(landedUsd * PRICING.minProfitPct, PRICING.minProfitUsd);

/** Asgari kâr (%10, en az 5 $), rakibi yenemeyince %15, üst sınır %20 ve rakipsiz (%20) fiyatlar; hiçbiri tabanın altına inmez. */
export function marginPrices(c: CostBase) {
  const floorPrice = priceForProfit(minProfitUsd(c.landedUsd), c);
  // Ucuz üründe marj kârı "en az 5 $" tabanının altında kalabiliyor (1871016030: 35 $ < 37 $)
  const targetPrice = Math.max(priceForProfit(c.landedUsd * PRICING.targetMargin, c), floorPrice);
  const noRivalPrice = Math.max(priceForProfit(c.landedUsd * PRICING.noRivalMargin, c), floorPrice);
  const noBeatPrice = Math.max(priceForProfit(c.landedUsd * PRICING.noBeatMargin, c), floorPrice);
  return { floorPrice, targetPrice, noRivalPrice, noBeatPrice };
}

/**
 * Ozon'un bu ürünün endeksinde kullandığı oran: endeks ÷ (bizim fiyat ÷ rakip $).
 * İki durum görülüyor: ~0,974 (rakip rubleyle satıyor, vitrin kuru farkı) ve 1 (fark yok). Endeks yuvarlandığı ve
 * Ozon onu saatler sonra yeniden hesapladığı için ölçüm tam alınmaz, en yakın duruma oturtulur. Endeks yoksa 0,9744.
 */
export function storefrontFactorFor(indexValue: number | null | undefined, customerPrice: number, rivalUsd: number) {
  if (!indexValue || indexValue <= 0 || customerPrice <= 0 || rivalUsd <= 0) return PRICING.storefrontRateFactor;
  const measured = indexValue / (customerPrice / rivalUsd);
  return measured >= PRICING.noFactorThreshold ? 1 : PRICING.storefrontRateFactor;
}

/** rival: rakibin 11 ₽ altı · rival-cap: rakip pahalı, %20'de duruldu · no-beat: rakibi kârla yenemiyoruz, %15 ·
 *  no-rival / fake-rival: %20 · check: eski kural (artık üretilmiyor; kayıtlı eski önerilerde görünebilir) */
export type PriceRule ='rival' | 'rival-cap' | 'no-beat' | 'no-rival' | 'fake-rival' | 'check';

export interface PriceDecision {
  price: number;
  oldPrice: number;
  /** Ozon'un kendi indirimlerinin inemeyeceği alt sınır (asgari kâr fiyatı) */
  minPrice: number;
  rule: PriceRule;
  targetPrice: number;
  floorPrice: number;
  rivalTarget: number | null;
}

/**
 * @param rivalUsd  en ucuz Ozon rakibi, satıcı para biriminde (USD)
 * @param netPurchaseUsd seçilen kanalın KDV hariç fiyatı; rakip bunun altındaysa sahte sayılır
 * @param rubPerUsd rakibin ruble fiyatı ÷ dolar fiyatı (Ozon'un kendi çevrimi)
 * @param storefrontFactor bu ürün için storefrontFactorFor sonucu
 */
export function decidePrice(
  c: CostBase,
  rivalUsd: number | null,
  rubPerUsd: number | null,
  netPurchaseUsd: number,
  storefrontFactor: number = PRICING.storefrontRateFactor
): PriceDecision {
  const { floorPrice, targetPrice, noRivalPrice: noRival, noBeatPrice } = marginPrices(c);
  const withOld = (price: number, rule: PriceRule, rivalTarget: number | null): PriceDecision => ({
    price,
    oldPrice: Math.round(price * PRICING.oldPriceMultiplier),
    minPrice: floorPrice,
    rule,
    targetPrice,
    floorPrice,
    rivalTarget,
  });

  const fakeRival = !!rivalUsd && rivalUsd < netPurchaseUsd;
  if (rivalUsd && rivalUsd > 0 && rubPerUsd && rubPerUsd > 0 && !fakeRival) {
    // Müşterinin gördüğü rublede rakibin 11 ₽ altı: rakip ₽ = rivalUsd × rubPerUsd, bizim 1 $ vitrinde
    // rubPerUsd × storefrontFactor ₽. Ozon yalnız tam sayı USD kabul ediyor: aşağı yuvarlanır,
    // fark 11 ₽ ile ~1 $ (≈80 ₽) arasında kalır.
    const rivalTarget = Math.floor((rivalUsd - PRICING.undercutRub / rubPerUsd) / storefrontFactor);
    // Rakip pahalı: ona yaklaşmak marjı %20'nin üstüne çıkarır → %20'de durulur. Ozon'un saçma rakip verisi de
    // (XV1473/00'da 611.074 $) böylece fiyatı uçuramaz.
    if (rivalTarget > targetPrice) return withOld(targetPrice, 'rival-cap', rivalTarget);
    // Rakibi asgari kârla (%10, en az 5 $) yenebiliyoruz
    if (rivalTarget >= floorPrice) return withOld(rivalTarget, 'rival', rivalTarget);
    // Yenemiyoruz: fiyat yarışına girilmez, %15'te kalınır
    return withOld(noBeatPrice, 'no-beat', rivalTarget);
  }

  return withOld(noRival, fakeRival ? 'fake-rival' : 'no-rival', null);
}
