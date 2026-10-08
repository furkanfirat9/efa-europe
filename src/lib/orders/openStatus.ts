import { syncOzonOrdersToDb } from '@/lib/db/orders';
import { prisma } from '@/lib/db/prisma';
import { getOzonHeaders, type OzonStore } from '@/lib/ozon/gate';
import { enrichPostingsWithProductDetails, fetchPostingsForRange } from '@/lib/ozon/postings';

/**
 * Açık siparişlerin durumunu Ozon'dan tazeler.
 *
 * Siparişler sayfası bir ayı bir kez indirir, sonra yalnızca içinde bulunulan ayı tazeler.
 * Geçmiş aydaki bir sipariş ay bittikten sonra teslim edilirse veri tabanında "Kargoda"
 * kalıyordu; durumu veri tabanından okuyan her ekran (Siparişler, Fatura oluştur, Belgeler)
 * eski durumu gösteriyordu. Burada ayına bakılmaksızın kesinleşmemiş her sipariş, en eskisinin
 * tarihinden bugüne kadarki gönderi listesiyle yeniden yazılır. Upsert yalnızca Ozon'dan gelen
 * alanları yazar; alış fiyatı, tedarikçi, not gibi elle girilen alanlar korunur.
 */

/** Bu durumlardan sonra sipariş değişmez. */
const FINAL_STATUSES = ['delivered', 'cancelled'];

/**
 * Aynı sunucu kopyasında en sık bu aralıkla Ozon'a sorulur. Sayfalar açıldıkça çağrılır;
 * saatlik cron da ayrıca çalışır.
 */
const MIN_INTERVAL_MS = 10 * 60 * 1000;
const lastRun = new Map<string, number>();

export interface OpenStatusResult {
  skipped: boolean;
  open: number;
  updated: number;
}

export async function refreshOpenOrderStatuses(
  storeId: OzonStore = 'store1',
  { force = false }: { force?: boolean } = {}
): Promise<OpenStatusResult> {
  if (!force && Date.now() - (lastRun.get(storeId) ?? 0) < MIN_INTERVAL_MS) {
    return { skipped: true, open: 0, updated: 0 };
  }
  lastRun.set(storeId, Date.now());

  const open = await prisma.ozonOrder.findMany({
    where: { storeId, status: { notIn: FINAL_STATUSES }, inProcessAt: { not: null } },
    select: { postingNumber: true, status: true, inProcessAt: true },
  });
  if (open.length === 0) return { skipped: false, open: 0, updated: 0 };

  const headers = getOzonHeaders(storeId);
  if (!headers['Client-Id'] || !headers['Api-Key']) return { skipped: true, open: open.length, updated: 0 };

  // En eski açık siparişin bir gün öncesinden bugüne; liste sipariş tarihine göre süzülür.
  const oldest = Math.min(...open.map((o) => o.inProcessAt!.getTime()));
  const since = new Date(oldest - 24 * 3600 * 1000).toISOString();
  const postings = await fetchPostingsForRange(since, new Date().toISOString(), headers);

  const openByNo = new Map(open.map((o) => [o.postingNumber, o.status]));
  const changed = postings.filter((p) => openByNo.has(p.posting_number) && p.status && p.status !== openByNo.get(p.posting_number));
  if (changed.length === 0) return { skipped: false, open: open.length, updated: 0 };

  await enrichPostingsWithProductDetails(changed, headers);
  const { count } = await syncOzonOrdersToDb(changed, storeId);
  return { skipped: false, open: open.length, updated: count };
}
