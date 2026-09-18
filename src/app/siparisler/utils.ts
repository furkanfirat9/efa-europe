/**
 * Verilen metnin bir web URL'si olup olmadığını tespit eder.
 */
export function isUrlString(val?: string | null): boolean {
  if (!val) return false;
  const s = val.trim();
  if (/^https?:\/\//i.test(s)) return true;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/.*)?$/i.test(s)) {
    if (/^\d+(\.\d+)+$/.test(s)) return false;
    return true;
  }
  return false;
}

/**
 * URL'nin ait olduğu siteyi etiket olarak çıkarır (örn: 'Allegro', 'Amazon', vb.)
 */
export function formatOrderUrlLabel(urlStr: string): string {
  try {
    const raw = urlStr.trim();
    const withProto = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
    const u = new URL(withProto);
    const host = u.hostname.toLowerCase();

    // Özel tanınan pazar yerleri ve e-ticaret siteleri
    if (host.includes('allegro')) return 'Allegro';
    if (host.includes('amazon')) return 'Amazon';
    if (host.includes('mediamarkt')) return 'MediaMarkt';
    if (host.includes('saturn')) return 'Saturn';
    if (host.includes('ebay')) return 'eBay';
    if (host.includes('aliexpress')) return 'AliExpress';
    if (host.includes('hepsiburada')) return 'Hepsiburada';
    if (host.includes('trendyol')) return 'Trendyol';
    if (host.includes('n11')) return 'N11';
    if (host.includes('morele')) return 'Morele';
    if (host.includes('ceneo')) return 'Ceneo';
    if (host.includes('rtveuroagd') || host.includes('euro.com.pl')) return 'RTV Euro AGD';
    if (host.includes('x-kom') || host.includes('xkom')) return 'x-kom';
    if (host.includes('komputronik')) return 'Komputronik';
    if (host.includes('erli')) return 'Erli';
    if (host.includes('empik')) return 'Empik';
    if (host.includes('ikea')) return 'IKEA';
    if (host.includes('kuna')) return 'KunaSystem';

    // Diğer siteler için ana domain adını temizle ve baş harfini büyüt
    const cleanHost = host.replace(/^(www|business|orders?|shop|store|my|app|panel)\./g, '');
    const segments = cleanHost.split('.');
    const mainName = segments.length > 1 ? segments[0] : cleanHost;
    if (mainName) {
      return mainName.charAt(0).toUpperCase() + mainName.slice(1);
    }
    return 'Link';
  } catch {
    return 'Link';
  }
}

/**
 * ISO tarih dizisini GG.AA.YYYY formatına çevirir
 */
export function formatDate(isoStr?: string): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Ozon Crossborder FBS gönderi detay sayfasına yönlendiren URL'yi üretir.
 * Örn: https://seller.ozon.ru/app/postings/crossborder/fbs?tab=awaiting_deliver&postingDetails=0129147027-0113-1
 */
export function getOzonPostingUrl(postingNumber: string, status?: string): string {
  const cleanPosting = encodeURIComponent(postingNumber.trim());
  let tab = 'awaiting_deliver';

  if (status) {
    if (['awaiting_deliver', 'awaiting_packaging', 'awaiting_registration'].includes(status)) {
      tab = 'awaiting_deliver';
    } else if (['delivering', 'driver_pickup'].includes(status)) {
      tab = 'delivering';
    } else if (status === 'delivered') {
      tab = 'delivered';
    } else if (status === 'cancelled') {
      tab = 'cancelled';
    } else {
      tab = status;
    }
  }

  return `https://seller.ozon.ru/app/postings/crossborder/fbs?tab=${tab}&postingDetails=${cleanPosting}`;
}

export interface ShipmentCountdown {
  daysLeft: number;
  label: string;
  deadlineFormatted: string;
  isUrgent: boolean;
  isExpired: boolean;
}

/**
 * Ozon FBS siparişleri için son sevkiyat geri sayımını hesaplar:
 * Ozon'un shipment_date ("Отгрузить до") tarihine 6 takvim günü ek süre tanınır (6. gün dahil).
 * Kalan süre 5 günden itibaren uyarı rozeti olarak gösterilir (Son 5 gün ... Bugün Son).
 */
export function getShipmentCountdown(
  shipmentDateStr?: string | null,
  status?: string
): ShipmentCountdown | null {
  if (!status || !['awaiting_deliver', 'awaiting_packaging', 'awaiting_registration'].includes(status)) {
    return null;
  }

  if (!shipmentDateStr) return null;

  const baseDate = new Date(shipmentDateStr);
  if (isNaN(baseDate.getTime())) return null;

  // Son gün: shipmentDate + 6 takvim günü (dahil kargoya verilebilir)
  const deadline = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + 6,
    23,
    59,
    59,
    999
  );

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const deadlineDayStart = new Date(
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate(),
    0,
    0,
    0,
    0
  );

  const diffTime = deadlineDayStart.getTime() - todayStart.getTime();
  const daysLeft = Math.round(diffTime / (1000 * 60 * 60 * 24));

  const deadlineFormatted = `${String(deadline.getDate()).padStart(2, '0')}.${String(
    deadline.getMonth() + 1
  ).padStart(2, '0')}.${deadline.getFullYear()}`;

  // 5 günden fazla varsa henüz uyarı rozeti gösterme
  if (daysLeft > 5) {
    return null;
  }

  if (daysLeft < 0) {
    return {
      daysLeft,
      label: 'Süre Doldu',
      deadlineFormatted,
      isUrgent: true,
      isExpired: true,
    };
  }

  if (daysLeft === 0) {
    return {
      daysLeft,
      label: 'Bugün Son',
      deadlineFormatted,
      isUrgent: true,
      isExpired: false,
    };
  }

  return {
    daysLeft,
    label: `Son ${daysLeft} gün`,
    deadlineFormatted,
    isUrgent: daysLeft <= 1,
    isExpired: false,
  };
}

/**
 * Kalan güne göre aşamalı renk ve aciliyet hissi (Isı haritası ve nabız)
 */
export function getCountdownUrgencyStyle(daysLeft: number, isExpired: boolean): string {
  if (isExpired) {
    return 'bg-zinc-900 text-rose-300 ring-1 ring-rose-500 shadow-xs';
  }
  if (daysLeft === 0) {
    // Bugün Son: En yüksek alarm, güçlü kırmızı ve yanıp sönme
    return 'bg-red-600 text-white animate-pulse ring-2 ring-red-300 shadow-sm shadow-red-500/40 font-extrabold';
  }
  if (daysLeft === 1) {
    // Son 1 gün: Kırmızı alarm ve nabız
    return 'bg-red-600 text-white animate-pulse ring-1.5 ring-red-200 shadow-xs shadow-red-500/30';
  }
  if (daysLeft === 2) {
    // Son 2 gün: Kritik kırmızı
    return 'bg-[#DC2626] text-white shadow-xs';
  }
  if (daysLeft === 3) {
    // Son 3 gün: Kırmızı-gül tonu
    return 'bg-[#E11D48] text-white shadow-xs';
  }
  if (daysLeft === 4) {
    // Son 4 gün: Canlı turuncu-kırmızı
    return 'bg-[#EA580C] text-white shadow-xs';
  }
  // Son 5 gün: Amber / Turuncu (Geri sayım başlangıcı)
  return 'bg-[#D97706] text-white shadow-xs';
}
