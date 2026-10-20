import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/** Depoya henüz gönderilmemiş, kargolanmayı bekleyen siparişler. İptal ve teslim edilenler sayılmaz. */
export const OPEN_ORDER_STATUSES = ['awaiting_registration', 'awaiting_packaging', 'awaiting_deliver'];

/**
 * Avrupa mağazasının (store1) sevkiyat görevi (ArbitrageOrder) açılmamış açık siparişleri.
 * Fulfillment'taki sipariş seçici ile Siparişler sayfasındaki "Fulfillment'a eklenmeyenler" filtresi
 * aynı ölçütü kullanır; ikisi ayrılırsa seçicide görünen sipariş filtrede görünmez (ya da tersi).
 */
export async function ordersWithoutTaskWhere(): Promise<Prisma.OzonOrderWhereInput> {
  const records = await prisma.arbitrageOrder.findMany({ select: { ozonOrderId: true } });
  return {
    storeId: 'store1',
    status: { in: OPEN_ORDER_STATUSES },
    postingNumber: { notIn: records.map((r) => r.ozonOrderId) },
  };
}
