import type { PriceIndexSnapshot } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/**
 * Fiyat endeksi geçmişi: kayıt ve renk değişimlerinin sebebi.
 *
 * Ozon endeksi fiyat değişikliğinden saatler sonra yeniden hesaplıyor (2026-10-02: ~13 saat). Bu yüzden
 * sebep, rengin değiştiği kaydın bir öncekine göre değil, önceki rengin BAŞLADIĞI kayda göre bulunur:
 * fiyatımızı sabah değiştirip renk akşam dönerse sebep yine "biz değiştik" çıkar.
 */

export type IndexColor = 'GREEN' | 'YELLOW' | 'RED' | 'WITHOUT_INDEX';

/** /v5/product/info/prices öğesinin kullandığımız kısmı */
export interface V5PriceItem {
  product_id: number;
  offer_id: string;
  price?: { price?: string | number; marketing_seller_price?: string | number };
  price_indexes?: {
    color_index?: string;
    ozon_index_data?: { min_price?: number; min_price_in_seller?: number; price_index_value?: number };
    external_index_data?: { min_price_in_seller?: number; price_index_value?: number };
  };
}

/** Sayfa her açıldığında kayıt düşmesin; bu süreden yeni kayıt varsa atlanır. */
const MIN_RUN_GAP_MS = 30 * 60 * 1000;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function toRow(it: V5PriceItem) {
  const base = num(it.price?.price) ?? 0;
  const oz = it.price_indexes?.ozon_index_data;
  const ext = it.price_indexes?.external_index_data;
  return {
    productId: String(it.product_id),
    offerId: it.offer_id ?? '',
    color: (it.price_indexes?.color_index || 'WITHOUT_INDEX') as IndexColor,
    price: num(it.price?.marketing_seller_price) ?? base,
    basePrice: base,
    ozonMinPrice: num(oz?.min_price),
    ozonMinPriceSeller: num(oz?.min_price_in_seller),
    ozonIndex: num(oz?.price_index_value),
    extMinPriceSeller: num(ext?.min_price_in_seller),
    extIndex: num(ext?.price_index_value),
  };
}
type Row = ReturnType<typeof toRow>;

const near = (a: number | null, b: number | null, tol: number) => (a == null || b == null ? a === b : Math.abs(a - b) <= tol);

function sameState(a: Row, b: Pick<PriceIndexSnapshot, keyof Row>) {
  return (
    a.color === b.color &&
    near(a.price, b.price, 0.005) &&
    near(a.basePrice, b.basePrice, 0.005) &&
    near(a.ozonMinPrice, b.ozonMinPrice, 0.5) &&
    near(a.ozonIndex, b.ozonIndex, 0.001) &&
    near(a.extIndex, b.extIndex, 0.001)
  );
}

/**
 * Mağazanın o anki endeksini kaydeder. Yalnızca durumu değişen ürünler yazılır.
 * @param force aradaki 30 dk beklemeyi yok sayar (elle yenile / zamanlanmış görev)
 * @param takenAt geçmiş anlık görüntü yüklerken kayıt zamanı
 */
export async function recordPriceIndex(storeId: string, items: V5PriceItem[], opts: { force?: boolean; takenAt?: Date } = {}) {
  if (!items.length) return { skipped: true as const, reason: 'boş liste' };
  const takenAt = opts.takenAt ?? new Date();
  if (!opts.force) {
    const last = await prisma.priceIndexRun.findFirst({ where: { storeId }, orderBy: { takenAt: 'desc' } });
    if (last && takenAt.getTime() - last.takenAt.getTime() < MIN_RUN_GAP_MS) return { skipped: true as const, reason: 'son kayıt yeni' };
  }

  const rows = items.map(toRow);
  const count = (c: IndexColor) => rows.filter((r) => r.color === c).length;
  const latest = await prisma.priceIndexSnapshot.findMany({
    where: { storeId, takenAt: { lte: takenAt } },
    orderBy: [{ productId: 'asc' }, { takenAt: 'desc' }],
    distinct: ['productId'],
  });
  const prev = new Map(latest.map((s) => [s.productId, s]));
  const changed = rows.filter((r) => {
    const p = prev.get(r.productId);
    return !p || !sameState(r, p);
  });

  const run = await prisma.priceIndexRun.create({
    data: {
      storeId,
      takenAt,
      total: rows.length,
      green: count('GREEN'),
      yellow: count('YELLOW'),
      red: count('RED'),
      withoutIndex: count('WITHOUT_INDEX'),
    },
  });
  if (changed.length) {
    await prisma.priceIndexSnapshot.createMany({ data: changed.map((r) => ({ ...r, storeId, runId: run.id, takenAt })) });
  }
  return { skipped: false as const, runId: run.id, changed: changed.length, colorChanged: changed.filter((r) => prev.get(r.productId) && prev.get(r.productId)!.color !== r.color).length };
}

export type ChangeReason = 'we' | 'rival' | 'rival-gone' | 'rival-new' | 'external' | 'recalc';

export interface ColorChange {
  productId: string;
  offerId: string;
  at: string;
  from: IndexColor;
  to: IndexColor;
  reasons: ChangeReason[];
  /** Önceki rengin başladığı andaki durum */
  before: StatePoint;
  after: StatePoint;
}

export interface StatePoint {
  at: string;
  color: IndexColor;
  price: number;
  rivalUsd: number | null;
  rivalRub: number | null;
  ozonIndex: number | null;
  extIndex: number | null;
}

const point = (s: PriceIndexSnapshot): StatePoint => ({
  at: s.takenAt.toISOString(),
  color: s.color as IndexColor,
  price: s.price,
  rivalUsd: s.ozonMinPriceSeller,
  rivalRub: s.ozonMinPrice,
  ozonIndex: s.ozonIndex,
  extIndex: s.extIndex,
});

/** Fiyat değişimi bu oranın altındaysa yok sayılır (kur ve yuvarlama oynaması). */
const RIVAL_TOL = 0.005;

export function reasonsFor(before: StatePoint, after: StatePoint): ChangeReason[] {
  const r: ChangeReason[] = [];
  if (Math.abs(after.price - before.price) >= 0.5) r.push('we');
  if (before.rivalRub && !after.rivalRub) r.push('rival-gone');
  else if (!before.rivalRub && after.rivalRub) r.push('rival-new');
  else if (before.rivalRub && after.rivalRub && Math.abs(after.rivalRub / before.rivalRub - 1) >= RIVAL_TOL) r.push('rival');
  if (!r.length && !near(before.extIndex, after.extIndex, 0.005)) r.push('external');
  if (!r.length) r.push('recalc');
  return r;
}

/** Bir ürünün kayıtlarından (eskiden yeniye) renk değişimleri. */
export function colorChanges(snaps: PriceIndexSnapshot[]): ColorChange[] {
  const out: ColorChange[] = [];
  let streakStart: PriceIndexSnapshot | null = null;
  for (let i = 0; i < snaps.length; i++) {
    const s = snaps[i];
    const prev = snaps[i - 1];
    if (!prev) {
      streakStart = s;
      continue;
    }
    if (s.color !== prev.color && streakStart) {
      const before = point(streakStart);
      const after = point(s);
      out.push({ productId: s.productId, offerId: s.offerId, at: after.at, from: before.color, to: after.color, reasons: reasonsFor(before, after), before, after });
      streakStart = s;
    }
  }
  return out;
}

export async function loadColorChanges(storeId: string, sinceDays: number) {
  const since = new Date(Date.now() - sinceDays * 86400_000);
  const changedIds = await prisma.priceIndexSnapshot.findMany({
    where: { storeId, takenAt: { gte: since } },
    select: { productId: true },
    distinct: ['productId'],
  });
  const snaps = await prisma.priceIndexSnapshot.findMany({
    where: { storeId, productId: { in: changedIds.map((c) => c.productId) } },
    orderBy: [{ productId: 'asc' }, { takenAt: 'asc' }],
  });
  const byProduct = new Map<string, PriceIndexSnapshot[]>();
  for (const s of snaps) byProduct.set(s.productId, [...(byProduct.get(s.productId) ?? []), s]);
  const changes = [...byProduct.values()]
    .flatMap(colorChanges)
    .filter((c) => new Date(c.at) >= since)
    .sort((a, b) => b.at.localeCompare(a.at));
  const runs = await prisma.priceIndexRun.findMany({ where: { storeId, takenAt: { gte: since } }, orderBy: { takenAt: 'asc' } });
  return { changes, runs };
}

export async function loadProductHistory(storeId: string, productId: string) {
  const snaps = await prisma.priceIndexSnapshot.findMany({ where: { storeId, productId }, orderBy: { takenAt: 'asc' } });
  return { points: snaps.map(point), changes: colorChanges(snaps) };
}
