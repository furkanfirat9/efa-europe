import { prisma } from '@/lib/db/prisma';
import { countPendingInvoices } from '@/lib/efatura/issue';
import { OPEN_ORDER_STATUSES, ordersWithoutTaskWhere } from '@/lib/fulfillment/missing';

/**
 * Dashboard "Yapılacaklar": bekleyen işlerin sayısı, her biri ilgili sayfaya gider.
 * Yalnız veri tabanından okur (Ozon'a gitmez); Siparişler, Fulfillment ve Fatura oluştur
 * sayfalarının ölçütleri kullanılır.
 */

const STORE = 'store1';
const MSK_MS = 3 * 3600 * 1000;
const DAY_MS = 86_400_000;
/** Ozon'un "Отгрузить до" tarihine tanınan ek süre (Siparişler sayfasındaki geri sayımla aynı). */
const SHIP_GRACE_DAYS = 6;
/** Son sevk gününe bu kadar ya da daha az gün kalan sipariş listelenir (0 = bugün son gün). */
const SHIP_WARN_DAYS = 1;
const WAREHOUSE_ALERT_DAYS = 7;

export interface DashboardTodo {
  key: 'unfulfilled' | 'shipDue' | 'noCost' | 'uninvoiced' | 'warehouse';
  label: string;
  count: number;
  href: string;
  /** Ek açıklama (ör. süresi geçenlerin sayısı) */
  note?: string;
  /** Hemen bakılması gereken iş */
  urgent: boolean;
}

/** UTC+3 takvim günü numarası */
const mskDay = (ms: number) => Math.floor((ms + MSK_MS) / DAY_MS);

export async function loadTodos(now = new Date()): Promise<DashboardTodo[]> {
  const local = new Date(now.getTime() + MSK_MS);
  // Alış girilmesi beklenen dönem: bu ay ve geçen ay (Siparişler'deki "Hesaplanmayan" ay ay bakıyor)
  const costSince = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) - MSK_MS);

  const [unfulfilled, awaiting, noCost, uninvoiced, warehouse] = await Promise.all([
    ordersWithoutTaskWhere().then((where) => prisma.ozonOrder.count({ where })),
    prisma.ozonOrder.findMany({
      where: { storeId: STORE, status: { in: OPEN_ORDER_STATUSES }, shipmentDate: { not: null } },
      select: { shipmentDate: true },
    }),
    prisma.ozonOrder.count({
      where: {
        storeId: STORE,
        status: { not: 'cancelled' },
        inProcessAt: { gte: costSince },
        AND: [
          { OR: [{ buyPrice: null }, { buyPrice: { lte: 0 } }] },
          { OR: [{ sourcePrice: null }, { sourcePrice: { lte: 0 } }] },
        ],
      },
    }),
    countPendingInvoices(),
    prisma.warehouseReport.count({
      where: {
        source: 'warehouse',
        type: { in: ['damage', 'inspection'] },
        createdAt: { gte: new Date(now.getTime() - WAREHOUSE_ALERT_DAYS * DAY_MS) },
      },
    }),
  ]);

  const today = mskDay(now.getTime());
  const daysLeft = awaiting.map((o) => mskDay(o.shipmentDate!.getTime()) + SHIP_GRACE_DAYS - today);
  const shipDue = daysLeft.filter((d) => d <= SHIP_WARN_DAYS).length;
  const overdue = daysLeft.filter((d) => d < 0).length;

  return [
    {
      key: 'shipDue',
      label: 'Sevk süresi dolmak üzere',
      count: shipDue,
      href: '/siparisler?status=awaiting',
      note: overdue ? `${overdue} siparişin süresi geçti` : 'Bugün ya da yarın son gün',
      urgent: shipDue > 0,
    },
    {
      key: 'unfulfilled',
      label: "Fulfillment'a eklenmemiş",
      count: unfulfilled,
      href: '/siparisler?status=unfulfilled',
      note: 'Sevkiyat görevi açılmamış açık siparişler',
      urgent: unfulfilled > 0,
    },
    {
      key: 'noCost',
      label: 'Alışı girilmemiş',
      count: noCost,
      href: '/siparisler?status=uncalculated',
      note: 'Bu ay ve geçen ay; kâr tahminî kalıyor',
      urgent: false,
    },
    {
      key: 'uninvoiced',
      label: 'Faturası kesilmemiş',
      count: uninvoiced,
      href: '/fatura',
      note: 'İptal edilmemiş bütün siparişler',
      urgent: false,
    },
    {
      key: 'warehouse',
      label: 'Depo bildirimi',
      count: warehouse,
      href: '/fulfillment',
      note: `Son ${WAREHOUSE_ALERT_DAYS} günde hasar ya da muayene`,
      urgent: warehouse > 0,
    },
  ];
}
