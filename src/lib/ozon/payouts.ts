import { prisma } from '@/lib/db/prisma';
import { parseXlsxSheets } from '@/lib/documents/excel';
import { getCbrRates } from '@/lib/fx/cbr';
import { getOzonHeaders, ozonFetch, type OzonStore } from '@/lib/ozon/gate';

/**
 * Ozon ödemeleri (Belgeler → Ozon ödemeleri)
 *
 * Ozon'un yaptığı ödemeler API'de tek tek yok; aylık mutabakat raporunda (`/v1/finance/mutual-settlement`,
 * xlsx) "Справка(Селлер) №20260921 от 21.09.2026" satırı olarak, ruble tutarıyla geçer. Rapor
 * istenir, hazır olunca indirilir ve ödemeler OzonPayout tablosuna yazılır. Biten aylar bir kez
 * çekilir; içinde bulunulan ay ve önceki ay SYNC_TTL_MS'de bir yenilenir.
 *
 * Bekleyen bakiye yarım aylık finans raporunun (`/v1/finance/cash-flow-statement/list`) son
 * döneminin kapanış bakiyesidir. Ozon bakiye PAYOUT_THRESHOLD_USD'ye ulaşmadan ödeme yapmaz;
 * dolar karşılığı CBR kuruyla yaklaşık hesaplanır (Ozon kendi kurunu kullanır).
 */

export const PAYOUT_STORE: OzonStore = 'store1';
export const PAYOUT_THRESHOLD_USD = 1000;

// Lenora'nın Ozon'da ilk teslimatı Eylül 2026; öncesinde hesap hareketi yok.
const FIRST_MONTH = '2026-09';
const SYNC_TTL_MS = 6 * 3600 * 1000;
const REPORT_POLL_MS = 2000;
const REPORT_MAX_POLLS = 20;
// Ozon'un ödeme tarihi ile bankadaki valör tarihi arasında beklenen en uzun fark
export const MATCH_DAYS = 10;

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

function monthsSince(first: string, now: Date): string[] {
  const [fy, fm] = first.split('-').map(Number);
  const out: string[] = [];
  for (let d = new Date(Date.UTC(fy, fm - 1, 1)); monthKey(d) <= monthKey(now); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    out.push(monthKey(d));
  }
  return out;
}

/** Mutabakat raporundaki ödeme satırları */
export function parseSettlementPayments(buffer: Buffer): { docNo: string; paidAt: Date; amountRub: number }[] {
  const rows = parseXlsxSheets(buffer)[0]?.rows ?? [];
  const out: { docNo: string; paidAt: Date; amountRub: number }[] = [];
  for (const row of rows) {
    const cells = row.map((c) => (c ?? '').trim());
    if (!cells.some((c) => c.startsWith('Справка'))) continue;
    const docIdx = cells.findIndex((c) => /№\s*\S+\s+от\s+\d{2}\.\d{2}\.\d{4}/.test(c));
    const m = docIdx >= 0 ? cells[docIdx].match(/№\s*(\S+)\s+от\s+(\d{2})\.(\d{2})\.(\d{4})/) : null;
    if (!m) continue;
    // Belgeden sonra tarih (Excel seri numarası), ardından alacak ve borç sütunları gelir.
    // Ödeme satıcıya olan borcu azaltır: tutar borç sütununda eksi olarak durur.
    const afterDoc = cells.slice(docIdx + 1).filter((c) => c !== '');
    const amounts = afterDoc.slice(1).map(Number).filter((n) => Number.isFinite(n) && n !== 0);
    const amount = amounts.length ? Math.abs(amounts[amounts.length - 1]) : 0;
    if (!amount) continue;
    out.push({ docNo: m[1], paidAt: new Date(Date.UTC(+m[4], +m[3] - 1, +m[2])), amountRub: amount });
  }
  return out;
}

/** Ayın mutabakat raporu (xlsx). Ay henüz kapanmadıysa Ozon "finance document not found" der; null döner. */
async function fetchSettlementReport(store: OzonStore, month: string): Promise<Buffer | null> {
  const headers = getOzonHeaders(store);
  let created: { result: { code: string } };
  try {
    created = await ozonFetch('/v1/finance/mutual-settlement', { date: month, language: 'EN' }, headers);
  } catch (err: any) {
    if (/finance document not found/i.test(err?.message ?? '')) return null;
    throw err;
  }
  for (let i = 0; i < REPORT_MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, REPORT_POLL_MS));
    const info = await ozonFetch<{ result: { status: string; file?: string; error?: string } }>(
      '/v1/report/info',
      { code: created.result.code },
      headers
    );
    if (info.result.status === 'success' && info.result.file) {
      const res = await fetch(info.result.file, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Mutabakat raporu indirilemedi (${res.status}).`);
      return Buffer.from(await res.arrayBuffer());
    }
    if (info.result.status === 'failed') throw new Error(`Ozon mutabakat raporu oluşturamadı: ${info.result.error || month}`);
  }
  throw new Error(`Ozon ${month} mutabakat raporunu zamanında hazırlamadı, biraz sonra yenileyin.`);
}

/** Eksik ya da eskimiş ayların raporlarını çekip ödemeleri yazar. */
export async function syncOzonPayouts({ force = false }: { force?: boolean } = {}): Promise<{ synced: string[] }> {
  const store = PAYOUT_STORE;
  const now = new Date();
  const months = monthsSince(FIRST_MONTH, now);
  const marks = new Map(
    (await prisma.ozonPayoutSync.findMany({ where: { storeId: store } })).map((s) => [s.month, s.syncedAt])
  );

  const synced: string[] = [];
  for (const month of months) {
    const last = marks.get(month);
    const [y, m] = month.split('-').map(Number);
    // Ay bittikten 5 gün sonra çekilmiş bir rapor kesindir; sonra bir daha sorulmaz.
    const settledAfter = new Date(Date.UTC(y, m, 6));
    const settled = last && last >= settledAfter;
    const fresh = last && now.getTime() - last.getTime() < SYNC_TTL_MS;
    if (settled || (fresh && !force)) continue;

    const report = await fetchSettlementReport(store, month);
    // Ay kapanmadan rapor yok; işaret konmaz, sonraki açılışta yeniden sorulur.
    if (!report) continue;

    for (const p of parseSettlementPayments(report)) {
      const known = await prisma.ozonPayout.findUnique({
        where: { storeId_ozonDocNo: { storeId: store, ozonDocNo: p.docNo } },
      });
      if (known) {
        // Banka tarafına dokunulmaz; yalnızca Ozon'un tutar ve tarihi güncellenir.
        await prisma.ozonPayout.update({ where: { id: known.id }, data: { paidAt: p.paidAt, amountRub: p.amountRub } });
        continue;
      }
      // Rapordan önce yalnızca dekontla kaydedilmiş, tarihi yakın ödeme varsa onunla birleşir.
      const bankOnly = await prisma.ozonPayout.findMany({
        where: { storeId: store, ozonDocNo: null, receivedAt: { not: null } },
      });
      const twin = bankOnly
        .map((b) => ({ b, days: Math.abs(b.receivedAt!.getTime() - p.paidAt.getTime()) / 86_400_000 }))
        .filter((x) => x.days <= MATCH_DAYS)
        .sort((x, y) => x.days - y.days)[0]?.b;
      const ozonFields = { ozonDocNo: p.docNo, paidAt: p.paidAt, amountRub: p.amountRub };
      if (twin) await prisma.ozonPayout.update({ where: { id: twin.id }, data: ozonFields });
      else await prisma.ozonPayout.create({ data: { storeId: store, ...ozonFields } });
    }
    await prisma.ozonPayoutSync.upsert({
      where: { storeId_month: { storeId: store, month } },
      update: { syncedAt: now },
      create: { storeId: store, month, syncedAt: now },
    });
    synced.push(month);
  }
  return { synced };
}

export interface PendingBalance {
  rub: number;
  usd: number | null;
  usdRate: number | null;
  periodEnd: string | null; // YYYY-MM-DD
}

/** Ozon'da biriken, henüz ödenmemiş bakiye (son finans döneminin kapanışı). */
export async function getPendingBalance(): Promise<PendingBalance> {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const res = await ozonFetch<{ result: { details?: any } }>(
    '/v1/finance/cash-flow-statement/list',
    { date: { from: from.toISOString(), to: now.toISOString() }, with_details: true, page: 1, page_size: 10 },
    getOzonHeaders(PAYOUT_STORE)
  );
  const details: any[] = [].concat(res.result?.details ?? []);
  const latest = details.sort((a, b) => String(b.period?.begin).localeCompare(String(a.period?.begin)))[0];
  const rub = Number(latest?.end_balance_amount) || 0;
  const rates = await getCbrRates(now).catch(() => null);
  const usdRate = rates?.USD ?? null;
  return {
    rub,
    usd: usdRate ? Math.round((rub / usdRate) * 100) / 100 : null,
    usdRate,
    periodEnd: latest?.period?.end ? String(latest.period.end).slice(0, 10) : null,
  };
}
