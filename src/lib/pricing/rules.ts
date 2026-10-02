import { calculateFulfillmentCosts, calculateShippingCosts } from '@/lib/calculator/profitCalculator';

/**
 * Otomatik fiyatlandırma kuralları (kullanıcıyla 2026-09-26'da kararlaştırıldı).
 *
 * Satılmamış ürün için ileriye dönük hesap: "bu ürün P $'dan satılırsa ne kalır?"
 *   net kâr = P − P × (komisyon + acquiring) − depoya gelmiş maliyet − Ozon kargosu − depo ücreti
 *   marj    = net kâr ÷ depoya gelmiş maliyet   (satıştan değil, bağlanan sermayeden)
 *
 * Fiyat kararı, en ucuz Ozon rakibine göre:
 *   rakip − 11 ₽ (tam dolara aşağı) asgari kârı sağlıyorsa → o fiyat
 *   sağlamıyorsa                                        → %25 marj fiyatı
 *   rakip yoksa                                           → %35 marj fiyatı
 *   rakip Amazon'un KDV hariç fiyatının altındaysa → yok sayılır (kullanıcı: genelde Çinli satıcı, sahte ürün;
 *   orijinali bu fiyatın altına satmak mümkün değil)
 */
export const PRICING = {
  /** 'gross' = Amazon KDV dahil fiyatı; Polonya KDV kaydı bitince 'net' (doğrudan KDV hariç tedarik). */
  vatMode: 'gross' as 'gross' | 'net',
  /** Amazon.de'den depoya kargo, her ürüne sabit. amazon.pl'de sayfada "DARMOWA dostawa" yazıyorsa 0,
   *  yazmıyorsa bu değer (bilinmeyen kargo için temkinli varsayım). */
  amazonShippingEur: 5.99,
  /** amazon.pl yalnız KDV dahil fiyat gösteriyor (hesap orada Business değil); KDV hariç = fiyat ÷ 1,23 */
  plVatRate: 0.23,
  /** Amazon ağırlığına kutu/dolgu payı. */
  packagingPct: 0.1,
  packagingMinG: 150,
  /** Amazon ağırlığı bunun altındaysa anlamsız sayılır ("1 g" gibi). */
  minPlausibleWeightG: 50,
  targetMargin: 0.25,
  noRivalMargin: 0.35,
  /** Asgari net kâr: maliyetin %8'i, en az 5 $. */
  minProfitPct: 0.08,
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
  /** Fiyat hem Amazon KDV dahil fiyatının 2,5 katını hem %25 marj fiyatının 1,5 katını aşarsa otomatik
   *  değiştirilmez (ucuz üründe kargo fiyatı doğal olarak Amazon'un birkaç katına çıkarır). */
  sanityMultiple: 2.5,
  sanityTargetMultiple: 1.5,
  /** Ozon acquiring'i vermezse */
  defaultAcquiringPct: 0.01,
} as const;

export type WeightSource = 'amazon-package' | 'amazon-item' | 'ozon-card' | 'none';

/** Kargo fiziksel ağırlıktan: Amazon kutulu ağırlığı > Amazon ürün ağırlığı + paket payı > Ozon kartı. */
export function shippingWeight(amzItemG: number | null, amzPackageG: number | null, ozonCardG: number | null) {
  const ok = (g: number | null): g is number => g != null && g >= PRICING.minPlausibleWeightG;
  if (ok(amzPackageG)) return { grams: amzPackageG, source: 'amazon-package' as WeightSource, check: false };
  if (ok(amzItemG)) {
    const pack = Math.max(amzItemG * PRICING.packagingPct, PRICING.packagingMinG);
    return { grams: Math.round(amzItemG + pack), source: 'amazon-item' as WeightSource, check: false };
  }
  if (ok(ozonCardG)) return { grams: ozonCardG, source: 'ozon-card' as WeightSource, check: true };
  return { grams: 0, source: 'none' as WeightSource, check: true };
}

export interface CostInput {
  /** Seçilen kanaldaki alış fiyatı (Amazon.de ya da amazon.pl, €) */
  purchaseEur: number;
  /** O kanaldan depoya kargo (€) */
  shippingEur: number;
  weightG: number;
  eurUsd: number;
  /** Satıştan kesilen oranlar toplamı (komisyon + acquiring), ör. 0.06 */
  feePct: number;
}

export interface CostBase {
  landedUsd: number;
  ozonShippingUsd: number;
  depotUsd: number;
  /** Satıştan bağımsız giderler toplamı */
  fixedUsd: number;
  feePct: number;
}

export function costBase({ purchaseEur, shippingEur, weightG, eurUsd, feePct }: CostInput): CostBase {
  const landedUsd = (purchaseEur + shippingEur) * eurUsd;
  const ozonShippingUsd = calculateShippingCosts(weightG).totalShipping * eurUsd;
  const depotUsd = calculateFulfillmentCosts(weightG).totalFulfillment * eurUsd;
  return { landedUsd, ozonShippingUsd, depotUsd, fixedUsd: landedUsd + ozonShippingUsd + depotUsd, feePct };
}

export function profitAt(price: number, c: CostBase) {
  const profit = price * (1 - c.feePct) - c.fixedUsd;
  return { profit, margin: c.landedUsd > 0 ? profit / c.landedUsd : 0 };
}

/** Bu net kârı bırakan en düşük tam dolar fiyat. */
export function priceForProfit(profitUsd: number, c: CostBase) {
  return Math.ceil((c.fixedUsd + profitUsd) / (1 - c.feePct));
}

export const minProfitUsd = (landedUsd: number) => Math.max(landedUsd * PRICING.minProfitPct, PRICING.minProfitUsd);

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

export type PriceRule ='rival' | 'target' | 'no-rival' | 'fake-rival' | 'check';

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
 * @param amazonGrossUsd seçilen kanalın KDV dahil fiyatı; rakipsiz fiyatın "abartılı mı" kontrolü için
 * @param storefrontFactor bu ürün için storefrontFactorFor sonucu
 */
export function decidePrice(
  c: CostBase,
  rivalUsd: number | null,
  rubPerUsd: number | null,
  amazonGrossUsd: number,
  netPurchaseUsd: number,
  storefrontFactor: number = PRICING.storefrontRateFactor
): PriceDecision {
  const targetPrice = priceForProfit(c.landedUsd * PRICING.targetMargin, c);
  const floorPrice = priceForProfit(minProfitUsd(c.landedUsd), c);
  const withOld = (price: number, rule: PriceRule, rivalTarget: number | null): PriceDecision => ({
    price,
    oldPrice: Math.round(price * PRICING.oldPriceMultiplier),
    minPrice: floorPrice,
    rule,
    targetPrice,
    floorPrice,
    rivalTarget,
  });

  const noRival = priceForProfit(c.landedUsd * PRICING.noRivalMargin, c);
  const tooHigh = (price: number) => price > Math.max(amazonGrossUsd * PRICING.sanityMultiple, targetPrice * PRICING.sanityTargetMultiple);

  const fakeRival = !!rivalUsd && rivalUsd < netPurchaseUsd;
  if (rivalUsd && rivalUsd > 0 && rubPerUsd && rubPerUsd > 0 && !fakeRival) {
    // Müşterinin gördüğü rublede rakibin 11 ₽ altı: rakip ₽ = rivalUsd × rubPerUsd, bizim 1 $ vitrinde
    // rubPerUsd × storefrontFactor ₽. Ozon yalnız tam sayı USD kabul ediyor: aşağı yuvarlanır,
    // fark 11 ₽ ile ~1 $ (≈80 ₽) arasında kalır.
    const rivalTarget = Math.floor((rivalUsd - PRICING.undercutRub / rubPerUsd) / storefrontFactor);
    if (rivalTarget < floorPrice) return withOld(targetPrice, 'target', rivalTarget);
    // Ozon'un "en ucuz rakip" verisi bazen saçma (XV1473/00'da 611.074 $): rakibe eşitlemek fiyatı
    // uçurur. Böyle durumda rakipsiz fiyat önerilir ve elle kontrole düşer.
    return tooHigh(rivalTarget) ? withOld(noRival, 'check', rivalTarget) : withOld(rivalTarget, 'rival', rivalTarget);
  }

  return withOld(noRival, tooHigh(noRival) ? 'check' : fakeRival ? 'fake-rival' : 'no-rival', null);
}
