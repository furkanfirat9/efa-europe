/**
 * Değer Ozon ürün kodu (offer_id) olarak kullanılabilecek bir model kodu mu?
 *
 * "HD9350/90", "0761406380", "11.2000.9002", "Profi 28 cm (0794689991)" → evet.
 * Ürün başlığı ("Tefal Duetto 3-teiliges Pfannenset 20,24 und 28cm,") ya da rakamsız seri
 * adı ("Quick Clean") → hayır. Toplu Yükleme eskiden başlığın ilk 50 harfini offer_id olarak
 * gönderebiliyordu; mağazada bu yüzden 33 başlık parçası ürün kodu oluştu. Eşikler mağazanın
 * 371 kodu üzerinde denendi: yakalananların hepsi kesilmiş başlıklar.
 */
export function looksLikeModelCode(value?: string | null): boolean {
  const v = (value || '').trim();
  if (v.length < 3 || v.length > 40) return false;
  if (!/\d/.test(v)) return false;
  return v.split(/\s+/).length <= 5;
}
