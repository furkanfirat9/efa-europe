import { prisma } from '@/lib/db/prisma';
import { getOzonHeaders } from '@/lib/ozon/gate';
import { fetchPostingsForRange, postingTotalPrice } from '@/lib/ozon/postings';

/**
 * Dashboard "Bugün" bölümü: günlük sipariş sayısı ve siparişlerin durumu (Avrupa mağazası).
 *
 * Son LIVE_DAYS gün Ozon'dan canlı okunur (`/v4/posting/fbs/list`); veri tabanı eşitlemesini
 * beklemeden doğru durum görünür. Daha eski siparişler veri tabanından gelir: teslim edilenler
 * toplam teslim sayısına eklenir, hâlâ yolda ya da bekleyen eski sipariş varsa (saatlik cron
 * durumlarını tazeliyor) onlar da sayılır ki 31 günden uzun süren teslimat gözden kaçmasın.
 */

const STORE = 'store1';
const MSK_MS = 3 * 3600 * 1000;
const DAY_MS = 86_400_000;
export const LIVE_DAYS = 31;
/** Günlük grafik için gösterilen gün sayısı (bugün dahil). */
const CHART_DAYS = 30;
/** Dashboard 5 dakikada bir yenilenir; birden fazla sekme Ozon'u ayrı ayrı yormasın. */
const CACHE_MS = 2 * 60 * 1000;

export type StatusBucket = 'awaiting' | 'delivering' | 'delivered' | 'cancelled';

const BUCKET_OF: Record<string, StatusBucket> = {
  awaiting_registration: 'awaiting',
  acceptance_in_progress: 'awaiting',
  awaiting_approve: 'awaiting',
  awaiting_packaging: 'awaiting',
  awaiting_deliver: 'awaiting',
  delivering: 'delivering',
  driver_pickup: 'delivering',
  sent_by_seller: 'delivering',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

export interface BucketTotal {
  count: number;
  amountUsd: number;
}

export interface OrderPulse {
  /** Son 30 gün (eskiden yeniye), iptaller hariç; son eleman bugün. */
  daily: { date: string; orders: number; revenueUsd: number }[];
  today: number;
  todayRevenueUsd: number;
  /** Dün, bu saate kadar (karşılaştırma için) */
  yesterdaySoFar: { orders: number; revenueUsd: number };
  /** Bugünden önceki 7 tam günün ortalaması */
  avg7: number;
  /** Son 31 gün, Ozon'dan */
  live: Record<StatusBucket, BucketTotal>;
  /** 31 günden eski siparişler, veri tabanından (iptaller sayılmaz) */
  older: Record<Exclude<StatusBucket, 'cancelled'>, BucketTotal>;
  liveDays: number;
  asOf: string;
}

const mskDate = (ms: number) => new Date(ms + MSK_MS).toISOString().slice(0, 10);
const empty = (): BucketTotal => ({ count: 0, amountUsd: 0 });

let cache: { at: number; value: OrderPulse } | null = null;

export async function loadOrderPulse({ force = false } = {}): Promise<OrderPulse> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const now = new Date();
  const since = new Date(now.getTime() - LIVE_DAYS * DAY_MS);
  const headers = getOzonHeaders(STORE);
  if (!headers['Client-Id'] || !headers['Api-Key']) throw new Error('Avrupa mağazasının Ozon API bilgileri tanımlı değil.');

  const [postings, olderRows] = await Promise.all([
    fetchPostingsForRange(since.toISOString(), now.toISOString(), headers),
    prisma.ozonOrder.groupBy({
      by: ['status'],
      where: { storeId: STORE, inProcessAt: { lt: since }, status: { not: 'cancelled' } },
      _count: { _all: true },
      _sum: { totalPrice: true },
    }),
  ]);

  const live: Record<StatusBucket, BucketTotal> = { awaiting: empty(), delivering: empty(), delivered: empty(), cancelled: empty() };
  const todayStart = Date.parse(`${mskDate(now.getTime())}T00:00:00Z`) - MSK_MS;
  const chartStart = todayStart - (CHART_DAYS - 1) * DAY_MS;
  const daily = Array.from({ length: CHART_DAYS }, (_, i) => ({ date: mskDate(chartStart + i * DAY_MS), orders: 0, revenueUsd: 0 }));
  const yesterdaySoFar = { orders: 0, revenueUsd: 0 };
  const yesterdayStart = todayStart - DAY_MS;
  const yesterdayNow = now.getTime() - DAY_MS;

  for (const p of postings) {
    const amount = postingTotalPrice(p);
    const bucket = BUCKET_OF[p.status];
    if (bucket) {
      live[bucket].count++;
      live[bucket].amountUsd += amount;
    }
    if (p.status === 'cancelled') continue;
    const at = Date.parse(p.in_process_at || p.shipment_date || '');
    if (!Number.isFinite(at)) continue;
    if (at >= yesterdayStart && at < yesterdayNow) {
      yesterdaySoFar.orders++;
      yesterdaySoFar.revenueUsd += amount;
    }
    if (at < chartStart) continue;
    const day = daily[Math.floor((at - chartStart) / DAY_MS)];
    if (day) {
      day.orders++;
      day.revenueUsd += amount;
    }
  }

  const older: OrderPulse['older'] = { awaiting: empty(), delivering: empty(), delivered: empty() };
  for (const row of olderRows) {
    const bucket = BUCKET_OF[row.status];
    if (!bucket || bucket === 'cancelled') continue;
    older[bucket].count += row._count._all;
    older[bucket].amountUsd += row._sum.totalPrice ?? 0;
  }

  const previous7 = daily.slice(-8, -1);
  const value: OrderPulse = {
    daily,
    today: daily[daily.length - 1].orders,
    todayRevenueUsd: daily[daily.length - 1].revenueUsd,
    yesterdaySoFar,
    avg7: previous7.reduce((s, d) => s + d.orders, 0) / previous7.length,
    live,
    older,
    liveDays: LIVE_DAYS,
    asOf: now.toISOString(),
  };
  cache = { at: Date.now(), value };
  return value;
}
