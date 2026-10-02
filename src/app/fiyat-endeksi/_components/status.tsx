import { Badge } from '@/components/shadcn/badge';
import { cn } from '@/lib/utils';

export type ColorIndex = 'GREEN' | 'YELLOW' | 'RED' | 'WITHOUT_INDEX';
export type SummaryKey = 'green' | 'yellow' | 'red' | 'withoutIndex';

export const STATUS: Record<ColorIndex, { label: string; short: string; dot: string; hint: string; key: SummaryKey }> = {
  GREEN: { label: 'Kazançlı', short: 'Kazançlı', dot: 'bg-emerald-500', hint: 'Piyasadaki en iyi fiyata eşit veya daha ucuz.', key: 'green' },
  YELLOW: { label: 'Orta düzey', short: 'Orta', dot: 'bg-amber-500', hint: 'Piyasa fiyatının %0 ile %5 üzerinde.', key: 'yellow' },
  RED: { label: 'Kazançsız', short: 'Kazançsız', dot: 'bg-destructive', hint: 'Piyasa fiyatının %5 üzerinde (revizyon önerilir).', key: 'red' },
  WITHOUT_INDEX: { label: 'Endekssiz', short: 'Endekssiz', dot: 'bg-muted-foreground/40', hint: 'Piyasada eşleşen ürün bulunamadı.', key: 'withoutIndex' },
};
export const STATUS_ORDER: ColorIndex[] = ['GREEN', 'YELLOW', 'RED', 'WITHOUT_INDEX'];

export function StatusBadge({ index }: { index: ColorIndex }) {
  return (
    <Badge variant="outline" className="gap-1.5 text-muted-foreground">
      <span className={cn('size-1.5 rounded-full', STATUS[index].dot)} />
      {STATUS[index].label}
    </Badge>
  );
}

export const money = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

export const when = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
