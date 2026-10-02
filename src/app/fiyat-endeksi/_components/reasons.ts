import type { ColorChange, StatePoint } from '@/lib/pricing/indexHistory';
import { money, type ColorIndex } from './status';

const RANK: Partial<Record<ColorIndex, number>> = { GREEN: 0, YELLOW: 1, RED: 2 };

/** 1 kötüleşti, -1 iyileşti, 0 endekse girdi/çıktı */
export function direction(c: Pick<ColorChange, 'from' | 'to'>) {
  const a = RANK[c.from];
  const b = RANK[c.to];
  if (a == null || b == null) return 0;
  return b > a ? 1 : b < a ? -1 : 0;
}

const pct = (a: number, b: number) => {
  const p = (b / a - 1) * 100;
  return `${p > 0 ? '+' : '−'}%${Math.abs(p).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
};

/** Değişimin sebebi, okunur metin olarak (rakam ile). */
export function reasonTexts(c: Pick<ColorChange, 'reasons'>, before: StatePoint, after: StatePoint, currency: string) {
  return c.reasons.map((r) => {
    switch (r) {
      case 'we':
        return `Fiyatımız ${money(before.price)} → ${money(after.price)} ${currency}`;
      case 'rival':
        return `Rakip ${money(before.rivalUsd ?? 0)} → ${money(after.rivalUsd ?? 0)} ${currency} (${pct(before.rivalRub!, after.rivalRub!)})`;
      case 'rival-gone':
        return 'Rakip kalmadı';
      case 'rival-new':
        return `Yeni rakip: ${money(after.rivalUsd ?? 0)} ${currency}`;
      case 'external':
        return `Dış piyasa endeksi ${before.extIndex ?? '—'} → ${after.extIndex ?? '—'}`;
      case 'recalc':
        return 'Fiyatlar aynı, Ozon yeniden hesapladı';
    }
  });
}
