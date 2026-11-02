/**
 * Amazon sayfasındaki teslimat yazısından en erken teslim tarihi. Yazı olduğu gibi saklanır (ProductSource.deliveryText,
 * plDeliveryText); sayfa dili hesaba göre Türkçe, Almanca ya da Lehçe gelir:
 *   "5,99€ teslimat 16 - 30 Kasım" · "5,99€ teslimat 30 Aralık, 2026 - 13 Mayıs, 2027" · "Lieferung Samstag, 17. Oktober"
 *   "DARMOWA dostawa środa, 12 maja, 2027" · "DARMOWA dostawa 7 stycznia - 12 maja, 2027"
 *
 * Bağımlılığı yok: hem uygulama hem tarama script'leri (Node tip ayıklama ile) içe aktarabilir.
 */

const MONTHS: Record<string, number> = {
  ocak: 0, şubat: 1, mart: 2, nisan: 3, mayıs: 4, haziran: 5, temmuz: 6, ağustos: 7, eylül: 8, ekim: 9, kasım: 10, aralık: 11,
  januar: 0, februar: 1, märz: 2, april: 3, mai: 4, juni: 5, juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
  stycznia: 0, lutego: 1, marca: 2, kwietnia: 3, maja: 4, czerwca: 5, lipca: 6, sierpnia: 7, września: 8, października: 9, listopada: 10, grudnia: 11,
};

/** İlk tarih en erkenidir: "16 - 30 Kasım" → 16 Kasım; yıl yazılıysa hemen ayın arkasındadır */
const FIRST_DATE = new RegExp(
  String.raw`(\d{1,2})\.?\s*(?:[-–]\s*\d{1,2}\.?\s*)?(${Object.keys(MONTHS).join('|')})(?!\p{L})(?:,?\s*(\d{4}))?`,
  'iu'
);

const DAY_MS = 864e5;
/** Yazıda yıl yoksa: taramadan bu kadar gün eski görünen tarih gelecek yıldır ("4 Ocak", Kasım'da okundu) */
const PAST_TOLERANCE_DAYS = 30;

/** Taramadan en erken teslime kaç takvim günü var; tarih okunamazsa null */
export function deliveryDays(text: string | null | undefined, scannedAt: Date | null | undefined) {
  if (!text || !scannedAt) return null;
  const m = text.toLowerCase().match(FIRST_DATE);
  if (!m) return null;
  const scanDay = Date.UTC(scannedAt.getUTCFullYear(), scannedAt.getUTCMonth(), scannedAt.getUTCDate());
  const year = m[3] ? Number(m[3]) : scannedAt.getUTCFullYear();
  let date = Date.UTC(year, MONTHS[m[2]], Number(m[1]));
  if (!m[3] && date < scanDay - PAST_TOLERANCE_DAYS * DAY_MS) date = Date.UTC(year + 1, MONTHS[m[2]], Number(m[1]));
  return Math.round((date - scanDay) / DAY_MS);
}
