/**
 * 🧮 OZON & AMAZON KÂR VE MALİYET HESAPLAMA MOTORU (EURO € & TRY ₺)
 * 
 * Bu dosya tüm lojistik, komisyon, acentelik, TCMB döviz kuru ve fulfillment baremlerini içeren 
 * saf hesaplama motorudur. UI / CSS kodlarından tamamen izole edilmiştir.
 */

export interface ProfitCalculatorInputs {
  buyPrice: number;        // Alış Fiyatı (€)
  sellPrice: number;       // Satış Fiyatı (€)
  weightG: number;         // Ürün/Paket Ağırlığı (Gram)
  commissionRate: number;  // Ozon Kategori Komisyonu (%) [Varsayılan: 5]
  customShippingCost?: number; // Doğrudan Girilen Kargo Ücreti (€)
  eurTryRate?: number;     // TCMB EUR/TRY Satış Kuru [Varsayılan: 38.45]
  isIntegrated?: boolean;  // Depo Entegrasyonlu Tarife mi? [Varsayılan: true]
  isSplitting?: boolean;   // 1'e 2+ Bölmeli Kabul mü? [Varsayılan: false]
}

export interface FulfillmentBreakdown {
  receptionCost: number;   // Приёмка (Kabul Ücreti)
  dispatchCost: number;    // Отгрузка (Sevkiyat / İşleme Ücreti)
  packagingCost: number;   // Упаковочный материал (Koli / Paket Malzemesi)
  totalFulfillment: number;// Toplam Fulfillment (€)
}

export interface ShippingBreakdown {
  baseFee: number;         // İlk 500g Taban Ücreti (€ 10.30)
  extra500gUnits: number;  // Ek 500g Birim Sayısı
  extraFee: number;        // Ek Ağırlık Tutarı (€)
  totalShipping: number;   // Toplam Kargo (€)
}

export interface ProfitCalculationResult {
  // Girdiler
  buyPrice: number;
  sellPrice: number;
  weightG: number;
  commissionRate: number;
  eurTryRate: number;

  // Komisyon & Finansal Kesintiler (€)
  commissionAmount: number; // Kategori Komisyonu (€)
  agencyFee: number;        // Ozon Acentelik Ücreti (%2, Max € 2.14)
  bankFee: number;          // Aracı Banka Kesintisi (%1)
  totalPlatformFees: number;// Toplam Ozon & Finans Kesintileri (€)

  // Lojistik & Depolama (€)
  shipping: ShippingBreakdown;
  fulfillment: FulfillmentBreakdown;

  // Özet Sonuçlar (€)
  totalCost: number;        // Toplam Giderler (€)
  netProfit: number;        // Net Kâr (€)
  profitMargin: number;     // Kâr Marjı (%) [Net Kâr / Satış]
  roi: number;              // Yatırım Getirisi (%) [Net Kâr / Alış]

  // Hesaba Yatırılacak Tutar (Ozon Hakediş = Satış - Ozon Kesintileri [Komisyon + Acentelik + Banka + Kargo])
  // Not: Alış maliyeti ve harici Fulfillment (Depo) Ozon kesintisi olmadığı için hakedişe dahil değildir.
  payoutEur: number;        // Hakediş (€)
  payoutTry: number;        // Hakediş (₺)

  // Türk Lirası (₺) Karşılıkları
  netProfitTry: number;     // Net Kâr (₺)
  totalCostTry: number;     // Toplam Gider (₺)
  sellPriceTry: number;     // Satış Tutarı (₺)
  buyPriceTry: number;      // Alış Maliyeti (₺)

  hasInput: boolean;
}

/**
 * 📦 Depo & Fulfillment Maliyetini Hesaplar (Mail Forwarding Resmi Tarifesi)
 */
export function calculateFulfillmentCosts(
  weightG: number,
  isIntegrated = true,
  isSplitting = false
): FulfillmentBreakdown {
  if (weightG <= 0 || (!isIntegrated && !isSplitting)) {
    return { receptionCost: 0, dispatchCost: 0, packagingCost: 0, totalFulfillment: 0 };
  }

  // 1. Приёмка (Kabul Ücreti)
  const receptionCost = isIntegrated
    ? isSplitting ? 1.00 : 0.40
    : isSplitting ? 2.10 : 1.50;

  // 2. Отгрузка (Sevkiyat) & 3. Упаковочный материал (Paketleme Malzemesi)
  const weightKg = weightG / 1000;
  let dispatchCost = 0;
  let packagingCost = 0;

  if (weightKg <= 0.5) {
    dispatchCost = isIntegrated ? 1.50 : 3.50;
    packagingCost = 0.25;
  } else if (weightKg <= 1.0) {
    dispatchCost = isIntegrated ? 1.90 : 3.90;
    packagingCost = 0.35;
  } else if (weightKg <= 5.0) {
    dispatchCost = isIntegrated ? 2.50 : 4.50;
    packagingCost = 0.75;
  } else if (weightKg <= 10.0) {
    dispatchCost = isIntegrated ? 3.50 : 5.50;
    packagingCost = 2.15;
  } else if (weightKg <= 15.0) {
    dispatchCost = isIntegrated ? 4.50 : 6.50;
    packagingCost = 3.65;
  } else if (weightKg <= 20.0) {
    dispatchCost = isIntegrated ? 5.50 : 7.50;
    packagingCost = 5.70;
  } else if (weightKg <= 25.0) {
    dispatchCost = isIntegrated ? 8.50 : 10.50;
    packagingCost = 7.75;
  } else {
    // 25.01 kg - 31.00 kg
    dispatchCost = isIntegrated ? 12.50 : 14.50;
    packagingCost = 11.15;
  }

  const totalFulfillment = receptionCost + dispatchCost + packagingCost;

  return {
    receptionCost,
    dispatchCost,
    packagingCost,
    totalFulfillment,
  };
}

/**
 * 🚚 Kargo Maliyetini Hesaplar (10.30€ + 2.50€ / 500g)
 */
export function calculateShippingCosts(weightG: number): ShippingBreakdown {
  if (weightG <= 0) {
    return { baseFee: 0, extra500gUnits: 0, extraFee: 0, totalShipping: 0 };
  }

  const baseFee = 10.30;
  let extra500gUnits = 0;
  let extraFee = 0;

  if (weightG > 500) {
    extra500gUnits = Math.ceil((weightG - 500) / 500);
    extraFee = extra500gUnits * 2.50;
  }

  const totalShipping = baseFee + extraFee;

  return {
    baseFee,
    extra500gUnits,
    extraFee,
    totalShipping,
  };
}

/**
 * 💎 Ana Ozon Kâr ve Maliyet Hesaplayıcı (Euro & TRY)
 */
export function calculateOzonProfit(inputs: ProfitCalculatorInputs): ProfitCalculationResult {
  const buy = Math.max(0, inputs.buyPrice || 0);
  const sell = Math.max(0, inputs.sellPrice || 0);
  const weight = Math.max(0, inputs.weightG || 0);
  const commissionRate = Math.max(0, inputs.commissionRate || 0);
  const eurTryRate = Math.max(1, inputs.eurTryRate || 38.45);
  const isIntegrated = inputs.isIntegrated ?? true;
  const isSplitting = inputs.isSplitting ?? false;

  // 1. Ozon Kategori Komisyonu (€)
  const commissionAmount = (sell * commissionRate) / 100;

  // 2. Ozon Acentelik Ücreti (%2, Max € 2.14)
  const agencyFee = sell > 0 ? Math.min((sell * 2) / 100, 2.14) : 0;

  // 3. Aracı Banka Kesintisi (%1)
  const bankFee = sell > 0 ? (sell * 1) / 100 : 0;

  const totalPlatformFees = commissionAmount + agencyFee + bankFee;

  // 4. Kargo & Lojistik (€)
  const isCustomShipping = typeof inputs.customShippingCost === 'number' && !isNaN(inputs.customShippingCost);
  const shipping: ShippingBreakdown = isCustomShipping
    ? {
        baseFee: Math.max(0, inputs.customShippingCost!),
        extra500gUnits: 0,
        extraFee: 0,
        totalShipping: Math.max(0, inputs.customShippingCost!),
      }
    : calculateShippingCosts(weight);

  // 5. Fulfillment / Depo (€) - Harici Gider
  const fulfillment = calculateFulfillmentCosts(weight, isIntegrated, isSplitting);

  // 6. Toplam Giderler ve Net Kâr (€)
  const totalCost = buy + totalPlatformFees + shipping.totalShipping + fulfillment.totalFulfillment;
  const netProfit = sell - totalCost;
  const profitMargin = sell > 0 ? (netProfit / sell) * 100 : 0;
  const roi = buy > 0 ? (netProfit / buy) * 100 : 0;

  // 7. Hesaba Yatırılacak Tutar (Ozon Hakediş = Satış - Ozon Kesintileri)
  // Ozon Kesintileri = Komisyon + Acentelik + Banka + Kargo (Alış ve Harici Fulfillment HARİÇ)
  const ozonDirectDeductions = totalPlatformFees + shipping.totalShipping;
  const payoutEur = sell > 0 ? Math.max(0, sell - ozonDirectDeductions) : 0;
  const payoutTry = payoutEur * eurTryRate;

  // 8. Türk Lirası (₺) Karşılıkları
  const netProfitTry = netProfit * eurTryRate;
  const totalCostTry = totalCost * eurTryRate;
  const sellPriceTry = sell * eurTryRate;
  const buyPriceTry = buy * eurTryRate;

  return {
    buyPrice: buy,
    sellPrice: sell,
    weightG: weight,
    commissionRate,
    eurTryRate,
    commissionAmount,
    agencyFee,
    bankFee,
    totalPlatformFees,
    shipping,
    fulfillment,
    totalCost,
    netProfit,
    profitMargin,
    roi,
    payoutEur,
    payoutTry,
    netProfitTry,
    totalCostTry,
    sellPriceTry,
    buyPriceTry,
    hasInput: buy > 0 || sell > 0 || weight > 0 || (isCustomShipping && inputs.customShippingCost! > 0),
  };
}
