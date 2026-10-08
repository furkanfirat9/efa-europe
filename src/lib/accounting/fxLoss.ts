import { prisma } from '@/lib/db/prisma';
import { CURRENT_STORE } from '@/lib/documents/service';

/**
 * Kambiyo zararı (656): kartla yapılan döviz alışlarında bankanın kuru ile faturanın TCMB
 * kuru arasındaki fark.
 *
 * Fatura, tarihindeki TCMB kuruyla TL'ye çevrilir (Belgeler → totalTry). Karttan çekilen
 * gerçek TL ise siparişe yazılan alış tutarıdır (OzonOrder.buyPriceTry). Fark gider olur;
 * kart kuru TCMB'den ucuz kaldıysa negatif çıkar (kambiyo kârı) ve toplamdan düşer.
 *
 * Bir fatura birden fazla siparişi, bir sipariş birden fazla faturayı kapsayabildiği için
 * birbirine bağlı belgeler ve siparişler tek grup olarak karşılaştırılır. Grup, en son
 * faturasının ayına yazılır. Siparişlerinden birinin TL tutarı yoksa grup atlanır.
 */
export async function getFxLoss(year: number, month: number): Promise<{ total: number; count: number }> {
  const docs = await prisma.accountingDocument.findMany({
    where: { store: CURRENT_STORE, status: 'confirmed', postingNumbers: { isEmpty: false }, currency: { not: 'TRY' } },
    include: { lines: true },
  });

  // Belgenin mal alımı kısmının TL karşılığı (çok kalemli belgelerde kalemlere göre dağıtılır)
  const goodsTry = (doc: (typeof docs)[number]) => {
    const tl = doc.totalTry ?? 0;
    const lineSum = doc.lines.reduce((acc, l) => acc + (l.amount ?? 0), 0);
    if (!doc.category && doc.lines.length && lineSum > 0) {
      return doc.lines
        .filter((l) => (l.category ?? '').startsWith('tedarik'))
        .reduce((acc, l) => acc + (tl * (l.amount ?? 0)) / lineSum, 0);
    }
    return (doc.category ?? '').startsWith('tedarik') ? tl : 0;
  };

  const goodsDocs = docs.filter((d) => d.totalTry != null && goodsTry(d) > 0);
  if (!goodsDocs.length) return { total: 0, count: 0 };

  // Belge ↔ sipariş bağlantılarından gruplar (birleşim-bul)
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const d of goodsDocs) for (const pn of d.postingNumbers) union(`d:${d.id}`, `o:${pn}`);

  const postings = [...new Set(goodsDocs.flatMap((d) => d.postingNumbers))];
  const orders = await prisma.ozonOrder.findMany({
    where: { postingNumber: { in: postings } },
    select: { postingNumber: true, buyPrice: true, buyCurrency: true, buyPriceTry: true },
  });
  const orderTry = new Map(
    orders.map((o) => [o.postingNumber, o.buyPriceTry ?? (o.buyCurrency === 'TRY' ? o.buyPrice : null)])
  );

  const groups = new Map<string, { invoiceTry: number; lastDate: Date | null; postings: Set<string> }>();
  for (const d of goodsDocs) {
    const key = find(`d:${d.id}`);
    const g = groups.get(key) ?? { invoiceTry: 0, lastDate: null, postings: new Set<string>() };
    g.invoiceTry += goodsTry(d);
    if (d.documentDate && (!g.lastDate || d.documentDate > g.lastDate)) g.lastDate = d.documentDate;
    d.postingNumbers.forEach((pn) => g.postings.add(pn));
    groups.set(key, g);
  }

  let total = 0;
  let count = 0;
  for (const g of groups.values()) {
    if (!g.lastDate || g.lastDate.getUTCFullYear() !== year || g.lastDate.getUTCMonth() + 1 !== month) continue;
    const paid = [...g.postings].map((pn) => orderTry.get(pn));
    if (paid.some((v) => v == null)) continue;
    total += (paid as number[]).reduce((a, b) => a + b, 0) - g.invoiceTry;
    count += g.postings.size;
  }

  return { total: Math.round(total * 100) / 100, count };
}
