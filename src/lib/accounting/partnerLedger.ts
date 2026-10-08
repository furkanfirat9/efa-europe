import { prisma } from '@/lib/db/prisma';
import { CURRENT_STORE } from '@/lib/documents/service';

/**
 * Ortak cari hesabı (331 Ortaklara Borçlar): şirketin ortağa borcu.
 *
 * Şirketin henüz kendi kartı yok; giderleri ortak kendi cebinden karşılıyor. Bakiye üç
 * kaynaktan, her istekte yeniden hesaplanır:
 *
 *  1. Sipariş alışları: Siparişler'de ödeme kartı seçilmiş her alış. Kart boşsa sayılmaz.
 *  2. Belgeler'deki onaylı giderler. Ozon kalemleri sayılmaz (Ozon kendi ödemesinden düşer);
 *     siparişe bağlı mal alımı faturası da sayılmaz, o alış zaten 1. maddede siparişin
 *     kartına göre karar verir. Aynı alım iki kez yazılmasın diye.
 *  3. Elle girilen hareketler (PartnerLedgerEntry): şirkete gönderilen para, panelde kaydı
 *     olmayan giderler ve şirketin ortağa geri ödemeleri.
 */

const EUROPE_STORE = 'store1';

export const ENTRY_KINDS = {
  transfer: { label: 'Şirkete para gönderildi', sign: 1 },
  expense: { label: 'Şahsi kartla gider (panel dışı)', sign: 1 },
  repayment: { label: 'Şirket geri ödedi', sign: -1 },
} as const;

export type EntryKind = keyof typeof ENTRY_KINDS;

export const isEntryKind = (v: unknown): v is EntryKind => typeof v === 'string' && v in ENTRY_KINDS;

export type MovementSource = 'order' | 'document' | EntryKind;

export interface PartnerMovement {
  /** Elle girilen harekette kayıt kimliği; silme yalnızca bunlar için var. */
  id: string;
  source: MovementSource;
  date: string | null; // YYYY-MM-DD
  description: string;
  /** Şirketin borcunu artıranlar pozitif, geri ödemeler negatif. */
  amountTry: number;
  manual: boolean;
}

export interface PartnerLedger {
  balance: number;
  orders: { total: number; count: number; missingTry: number };
  documents: { total: number; count: number };
  transfers: number;
  expenses: number;
  repayments: number;
  movements: PartnerMovement[];
}

const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getPartnerLedger(): Promise<PartnerLedger> {
  const [orders, documents, entries] = await Promise.all([
    prisma.ozonOrder.findMany({
      where: { storeId: EUROPE_STORE, buyPrice: { not: null }, paymentCard: { not: null } },
      select: {
        postingNumber: true,
        buyPrice: true,
        buyCurrency: true,
        buyPriceTry: true,
        purchaseDate: true,
        inProcessAt: true,
        paymentCard: true,
        supplier: true,
        productTitle: true,
      },
    }),
    prisma.accountingDocument.findMany({
      where: { store: CURRENT_STORE, status: 'confirmed' },
      include: { lines: true },
    }),
    prisma.partnerLedgerEntry.findMany({ where: { store: CURRENT_STORE } }),
  ]);

  const movements: PartnerMovement[] = [];

  // 1. Kartla ödenmiş sipariş alışları
  let orderTotal = 0;
  let orderCount = 0;
  let missingTry = 0;
  for (const o of orders) {
    if (!o.paymentCard?.trim()) continue;
    const tl = o.buyPriceTry ?? (o.buyCurrency === 'TRY' ? o.buyPrice : null);
    if (tl == null) {
      missingTry++;
      continue;
    }
    orderTotal += tl;
    orderCount++;
    movements.push({
      id: `order:${o.postingNumber}`,
      source: 'order',
      date: isoDay(o.purchaseDate ?? o.inProcessAt),
      description: `${o.postingNumber} · ${o.supplier || 'alış'} · ${o.paymentCard.trim()}`,
      amountTry: tl,
      manual: false,
    });
  }

  // 2. Belgeler: Ozon kalemleri ve siparişe bağlı mal alımı hariç
  let docTotal = 0;
  let docCount = 0;
  for (const doc of documents) {
    const tl = doc.totalTry ?? 0;
    if (!tl) continue;
    const lineSum = doc.lines.reduce((acc, l) => acc + (l.amount ?? 0), 0);
    const parts: { category: string; amount: number }[] =
      !doc.category && doc.lines.length && lineSum > 0
        ? doc.lines.map((l) => ({ category: l.category ?? 'diger', amount: (tl * (l.amount ?? 0)) / lineSum }))
        : [{ category: doc.category ?? 'diger', amount: tl }];

    const linkedToOrder = doc.postingNumbers.length > 0;
    const amount = parts
      .filter((p) => !p.category.startsWith('ozon'))
      .filter((p) => !(p.category.startsWith('tedarik') && linkedToOrder))
      .reduce((acc, p) => acc + p.amount, 0);
    if (amount <= 0) continue;

    docTotal += amount;
    docCount++;
    movements.push({
      id: `document:${doc.id}`,
      source: 'document',
      date: isoDay(doc.documentDate),
      description: [doc.sellerName, doc.documentNo].filter(Boolean).join(' · ') || 'Belge',
      amountTry: round2(amount),
      manual: false,
    });
  }

  // 3. Elle girilen hareketler
  const sums: Record<EntryKind, number> = { transfer: 0, expense: 0, repayment: 0 };
  for (const e of entries) {
    if (!isEntryKind(e.kind)) continue;
    sums[e.kind] += e.amountTry;
    movements.push({
      id: e.id,
      source: e.kind,
      date: isoDay(e.date),
      description: e.description || ENTRY_KINDS[e.kind].label,
      amountTry: ENTRY_KINDS[e.kind].sign * e.amountTry,
      manual: true,
    });
  }

  movements.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  return {
    balance: round2(orderTotal + docTotal + sums.transfer + sums.expense - sums.repayment),
    orders: { total: round2(orderTotal), count: orderCount, missingTry },
    documents: { total: round2(docTotal), count: docCount },
    transfers: round2(sums.transfer),
    expenses: round2(sums.expense),
    repayments: round2(sums.repayment),
    movements,
  };
}
