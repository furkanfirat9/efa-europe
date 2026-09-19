/**
 * Belgeler sayfasının iki seviyeli gider kategorileri.
 * Anahtarlar veritabanında saklanır; ad değiştirmek serbesttir, anahtar değiştirmek değildir.
 */
export interface DocumentCategory {
  key: string;
  group: string;
  label: string;
}

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  { key: 'tedarik.mal', group: 'Tedarik', label: 'Mal alımı' },

  { key: 'uyelik.amazon_prime', group: 'Üyelikler', label: 'Amazon Prime' },
  { key: 'uyelik.allegro_smart', group: 'Üyelikler', label: 'Allegro Business Smart' },
  { key: 'uyelik.diger', group: 'Üyelikler', label: 'Diğer üyelik' },

  { key: 'ozon.komisyon', group: 'Ozon', label: 'Komisyon' },
  { key: 'ozon.lojistik', group: 'Ozon', label: 'Lojistik' },
  { key: 'ozon.premium', group: 'Ozon', label: 'Premium abonelik' },
  { key: 'ozon.araci_banka', group: 'Ozon', label: 'Aracı banka' },
  { key: 'ozon.ceza', group: 'Ozon', label: 'Cezalar' },
  { key: 'ozon.reklam', group: 'Ozon', label: 'Reklam' },

  { key: 'depo.polonya', group: 'Depo ve lojistik', label: 'Polonya deposu' },
  { key: 'depo.kargo', group: 'Depo ve lojistik', label: 'Kargo' },

  { key: 'diger', group: 'Diğer', label: 'Diğer' },
];

export const CATEGORY_KEYS = DOCUMENT_CATEGORIES.map((c) => c.key);

const byKey = new Map(DOCUMENT_CATEGORIES.map((c) => [c.key, c]));

export const isCategoryKey = (key: unknown): key is string => typeof key === 'string' && byKey.has(key);

/** "Ozon › Komisyon" biçiminde tam ad. */
export function categoryLabel(key?: string | null): string {
  if (!key) return 'Kategorisiz';
  const c = byKey.get(key);
  if (!c) return key;
  return c.group === c.label ? c.label : `${c.group} › ${c.label}`;
}

/** Select içinde gruplu gösterim için. */
export function groupedCategories(): { group: string; items: DocumentCategory[] }[] {
  const groups = new Map<string, DocumentCategory[]>();
  for (const c of DOCUMENT_CATEGORIES) {
    if (!groups.has(c.group)) groups.set(c.group, []);
    groups.get(c.group)!.push(c);
  }
  return [...groups].map(([group, items]) => ({ group, items }));
}

export const PLATFORMS = [
  { key: 'amazon', label: 'Amazon' },
  { key: 'allegro', label: 'Allegro' },
  { key: 'ozon', label: 'Ozon' },
  { key: 'other', label: 'Diğer' },
] as const;

export const platformLabel = (key?: string | null) =>
  PLATFORMS.find((p) => p.key === key)?.label ?? '—';
