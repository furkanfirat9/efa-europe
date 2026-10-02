import { prisma } from '@/lib/db/prisma';

/**
 * Tedarik taramalarının son durumu (scripts/supply_scan.mjs → SupplyScanRun).
 * Deneme (dry-run) çalışmaları sayılmaz: veritabanına bir şey yazmazlar.
 */

export type ScanChannel = 'amazon-de' | 'amazon-pl' | 'ceneo';

export const SCAN_CHANNELS: { channel: ScanChannel; label: string; /** Beklenen aralık; aşılırsa "eski" */ maxAgeH: number }[] = [
  { channel: 'amazon-de', label: 'Amazon.de', maxAgeH: 36 },
  { channel: 'amazon-pl', label: 'amazon.pl', maxAgeH: 36 },
  // Ceneo IPRoyal trafiği ücretli olduğu için haftada bir (pazartesi)
  { channel: 'ceneo', label: 'Ceneo', maxAgeH: 8 * 24 },
];

/** Bu süreden uzun "running" kalan çalışma yarıda kesilmiş sayılır (bilgisayar kapandı, süreç öldü). */
const STALLED_MS = 2 * 3600_000;

export interface ScanStatus {
  channel: ScanChannel;
  label: string;
  /** ok | partial | error | running | stalled | none */
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  total: number;
  scanned: number;
  priceChanged: number;
  stockChanged: number;
  held: number;
  error: string | null;
  /** Son başarılı/kısmi taramanın üstünden beklenen süre geçti */
  stale: boolean;
  /** Tablodaki en yeni okuma (elle yapılan taramalar dahil) */
  lastDataAt: string | null;
}

export async function loadScanStatus(storeId = 'store1'): Promise<ScanStatus[]> {
  const [runs, data] = await Promise.all([
    prisma.supplyScanRun.findMany({ orderBy: { startedAt: 'desc' }, take: 60 }),
    prisma.productSource.aggregate({ where: { storeId }, _max: { checkedAt: true, plCheckedAt: true, ceneoCheckedAt: true } }),
  ]);
  const lastData: Record<ScanChannel, Date | null> = {
    'amazon-de': data._max.checkedAt,
    'amazon-pl': data._max.plCheckedAt,
    ceneo: data._max.ceneoCheckedAt,
  };
  const isDry = (s: unknown) => !!(s && typeof s === 'object' && (s as { dryRun?: boolean }).dryRun);

  return SCAN_CHANNELS.map(({ channel, label, maxAgeH }) => {
    const real = runs.filter((r) => r.channel === channel && !isDry(r.summary));
    const last = real[0];
    const lastGood = real.find((r) => r.status === 'ok' || r.status === 'partial');
    const stalled = last?.status === 'running' && Date.now() - last.startedAt.getTime() > STALLED_MS;
    const goodAt = lastGood?.finishedAt ?? lastData[channel];
    return {
      channel,
      label,
      status: !last ? 'none' : stalled ? 'stalled' : last.status,
      startedAt: last?.startedAt.toISOString() ?? null,
      finishedAt: last?.finishedAt?.toISOString() ?? null,
      total: last?.total ?? 0,
      scanned: last?.scanned ?? 0,
      priceChanged: last?.priceChanged ?? 0,
      stockChanged: last?.stockChanged ?? 0,
      held: last?.held ?? 0,
      error: last?.error ?? null,
      stale: !goodAt || Date.now() - goodAt.getTime() > maxAgeH * 3600_000,
      lastDataAt: lastData[channel]?.toISOString() ?? null,
    };
  });
}
