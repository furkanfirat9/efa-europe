/**
 * LS tarifeleri (€): depo ücreti (kabul + sevk + paket) ve Ozon kargosu (LS Economy PL).
 * Kâr ve fiyat hesabı src/lib/pricing/rules.ts'te; kâr hesaplama sayfası, fiyat önerisi ve sipariş kârı bunları kullanır.
 */

export interface FulfillmentBreakdown {
  receptionCost: number;   // Приёмка (Kabul Ücreti)
  dispatchCost: number;    // Отгрузка (Sevkiyat / İşleme Ücreti)
  packagingCost: number;   // Упаковочный материал (Koli / Paket Malzemesi)
  totalFulfillment: number;// Toplam Fulfillment (€)
}

export interface ShippingBreakdown {
  baseFee: number;         // Sabit Gönderi Ücreti (€ 10.30)
  weightUnits: number;     // Başlanan 500g Birim Sayısı (ilk 500g dahil)
  weightFee: number;       // Ağırlık Tutarı (€ 2.50 / 500g)
  totalShipping: number;   // Toplam Kargo (€)
}

/**
 * 📦 Depo & Fulfillment Maliyetini Hesaplar (Mail Forwarding Resmi Tarifesi)
 */
export function calculateFulfillmentCosts(
  weightG: number,
  isIntegrated = true,
  isSplitting = false
): FulfillmentBreakdown {
  if (weightG <= 0) {
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
 * 🚚 Kargo Maliyetini Hesaplar (LS Economy PL Parcel: 10.30€ + 2.50€ / 500g)
 *
 * 2.50€ ilk 500g dahil her başlanan 500g için eklenir: 0,68 kg → 10.30 + 2 × 2.50 = 15.30€.
 * Ozon'un 42703766-0246-1 gönderisinden (0,68 kg) kestiği 1.538,71 ₽ (~15.9€) bu okumaya
 * yakın; eskiden ilk 500g taban ücrete dahil sayılıyordu ve her siparişte kargo 2.50€ eksik çıkıyordu.
 */
export function calculateShippingCosts(weightG: number): ShippingBreakdown {
  if (weightG <= 0) {
    return { baseFee: 0, weightUnits: 0, weightFee: 0, totalShipping: 0 };
  }

  const baseFee = 10.30;
  const weightUnits = Math.ceil(weightG / 500);
  const weightFee = weightUnits * 2.50;
  const totalShipping = baseFee + weightFee;

  return {
    baseFee,
    weightUnits,
    weightFee,
    totalShipping,
  };
}
