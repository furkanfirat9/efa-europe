/** Konsol genelinde tek biçimli sayı gösterimi. */

const decimal = new Intl.NumberFormat('tr-TR');
const compact = new Intl.NumberFormat('tr-TR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const formatNumber = (value?: number | null): string =>
  decimal.format(Math.round(Number(value) || 0));

export const formatCompact = (value?: number | null): string =>
  compact.format(Number(value) || 0);

/**
 * Ozon satış/analitik ciroları ve sipariş tutarları USD cinsindendir —
 * API `currency_code` alanını USD olarak döndürüyor ve ürünler panele dolarla
 * yükleniyor. Eskiden ₽ ile biçimlendiriliyordu, etiket veriyle uyuşmuyordu.
 */
export const formatMoney = (value?: number | null): string =>
  `$${decimal.format(Math.round(Number(value) || 0))}`;

export const formatMoneyCompact = (value?: number | null): string =>
  `$${compact.format(Number(value) || 0)}`;

export const formatUSD = formatMoney;

/**
 * Ruble (₽). Ozon analitik ucundan gelen SKU ciroları mağaza para birimiyle,
 * yani ruble olarak dönüyor; sipariş tutarlarından farklı bir birim.
 */
export const formatRub = (value?: number | null): string =>
  `${decimal.format(Math.round(Number(value) || 0))} ₽`;

const decimal2 = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Euro para birimi formatı (€). Kuruşlu veya tam sayı seçilebilir. */
export const formatEuro = (value?: number | null, fraction = true): string => {
  const n = Number(value) || 0;
  return `€${fraction ? decimal2.format(n) : decimal.format(Math.round(n))}`;
};

/** Türk Lirası para birimi formatı (₺). Kuruşlu veya tam sayı seçilebilir. */
export const formatTL = (value?: number | null, fraction = true): string => {
  const n = Number(value) || 0;
  return `₺${fraction ? decimal2.format(n) : decimal.format(Math.round(n))}`;
};

/**
 * Türkçe para/sayı formatı (Örn: 139,89 veya 25.489,56).
 * Binlik ayracı nokta (.), ondalık ayracı virgül (,).
 */
export const formatTrNumber = (value?: number | null): string => {
  if (value === null || value === undefined || isNaN(Number(value))) return '';
  return decimal2.format(Number(value));
};

/**
 * Türkçe veya uluslararası formatlı sayı dizesini JS float sayısına çevirir.
 * - "25.489,56" -> 25489.56
 * - "25489,56"  -> 25489.56
 * - "25489.56"  -> 25489.56
 * - "139,89"    -> 139.89
 * - "139.89"    -> 139.89
 */
export const parseTrNumber = (str?: string | number | null): number | null => {
  if (str === null || str === undefined) return null;
  if (typeof str === 'number') return isNaN(str) ? null : str;
  let s = String(str).trim();
  if (!s) return null;

  if (s.includes('.') && s.includes(',')) {
    // Hem nokta hem virgül varsa (örn: 25.489,56): noktalar binlik, virgül ondalık
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    // Sadece virgül varsa (örn: 25489,56 veya 139,89): virgül ondalık
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const percentFormatters = new Map<number, Intl.NumberFormat>();

/**
 * Dönüşüm oranlarında ondalık basamak bilgi taşır (%1,4 ile %1,9 farklı
 * şeylerdir), o yüzden varsayılan bir basamaktır. Pay dağılımı gibi kaba
 * oranlarda `digits: 0` geçilir.
 */
export const formatPercent = (value?: number | null, digits?: number): string => {
  const n = Number(value) || 0;
  const places = digits ?? (Math.abs(n) < 100 ? 1 : 0);

  let formatter = percentFormatters.get(places);
  if (!formatter) {
    formatter = new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    });
    percentFormatters.set(places, formatter);
  }

  return `%${formatter.format(n)}`;
};

/** İki aşama arasındaki geçiş oranı. Payda 0 ise yüzde anlamsızdır. */
export const rate = (numerator?: number | null, denominator?: number | null): number | null => {
  const d = Number(denominator) || 0;
  if (d <= 0) return null;
  return ((Number(numerator) || 0) / d) * 100;
};

export const formatDayLabel = (isoDate: string): string => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

export const formatDateTime = (value?: string): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatClock = (value?: string): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const decimal1 = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Oran gibi tek ondalığın bilgi taşıdığı değerler (ör. oturum başına gösterim). */
export const formatDecimal = (value?: number | null): string =>
  decimal1.format(Number(value) || 0);
