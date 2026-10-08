import { createHash, randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import type { EArchiveIssue, OzonOrder, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getTryRate } from '@/lib/fx/evds';
import { refreshOpenOrderStatuses } from '@/lib/orders/openStatus';
import { parseUblInvoice, type ParsedInvoice } from '@/lib/sales-invoices/ubl';
import { CURRENT_STORE, OWN_TAX_ID, ORDER_STORE_ID, saveParsedInvoice } from '@/lib/sales-invoices/service';
import {
  createEArchive,
  downloadEArchive,
  efaturaEnv,
  FINAL_OK,
  getEArchiveStatus,
  isFinalStatus,
  TrendyolError,
  type EfaturaEnv,
} from './trendyol';

/**
 * Panelden e-Arşiv satış faturası kesme (/fatura).
 *
 * Fatura, GİB portalında kesilen faturalarla aynı içeriktedir: USD, KDV %0 (351),
 * transit ticaret notu, yabancı alıcı VKN 2222222222. Gönderi ve takip numarası notta
 * durur; takip numarası faturayı depo gümrük formuna (CN22 / CP72) bağlar. Sevk tarihi
 * yazılmaz: Ozon'un tarihi sanal işlenen siparişlerde formdaki gerçek tarihten erken.
 */

/**
 * Liste bu günden sonra gelen siparişlerle başlar: panelden fatura kesmeye başlanan gün.
 * Canlıya geçilen gün TRENDYOL_EFATURA_START_DATE ile sabitlenir; daha eski siparişler
 * GİB portalında faturalandı ve listeye hiç girmez.
 */
export const invoicingStartDate = () => new Date(`${process.env.TRENDYOL_EFATURA_START_DATE || '2026-09-01'}T00:00:00+03:00`);

export class IssueError extends Error {}

// ─── Latin harfe çevirme ────────────────────────────────────────────────────
// Trendyol'un güvenlik duvarı bazı metinleri (kimi Rusça ürün adları, hatta düz bir
// "Idempotency testi" notu) HTML 403 ile reddediyor. Engelde müşteri ve ürün metinleri
// Latin harfle bir kez daha gönderilir; sabit notlarımız engele takılmıyor.

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export const transliterate = (text: string) =>
  text.replace(/[а-яё]/gi, (ch) => {
    const latin = CYRILLIC[ch.toLowerCase()];
    return ch === ch.toLowerCase() ? latin : latin.charAt(0).toUpperCase() + latin.slice(1);
  });

// ─── Fatura gövdesi ─────────────────────────────────────────────────────────

interface OrderProduct {
  name?: string;
  offer_id?: string;
  price?: string | number;
  quantity?: string | number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const mskDate = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

const zeroVat = (taxableAmount: number) => ({
  totalTaxAmount: 0,
  subTotalTaxes: [
    {
      taxType: 'KDV',
      taxableAmount,
      taxAmount: 0,
      percent: 0,
      taxExemptionReasonCode: 351,
      taxExemptionReason: 'KDV - İstisna Olmayan Diğer',
    },
  ],
});

/** Fatura kesilebilir mi; kesilemiyorsa nedeni. Liste ve kesme aynı kuralı kullanır. */
export function blockingReason(order: OzonOrder): string | null {
  if (order.status === 'cancelled') return 'Sipariş iptal edilmiş.';
  if (order.currency !== 'USD') return `Sipariş para birimi USD değil (${order.currency}).`;
  const products = (order.productsJson as OrderProduct[] | null) ?? [];
  if (!products.length) return 'Siparişte ürün bilgisi yok.';
  if (products.some((p) => !(Number(p.price) > 0) || !(Number(p.quantity) > 0))) return 'Ürün fiyatı ya da adedi eksik.';
  if (!order.customerName?.trim()) return 'Müşteri adı yok.';
  if (!order.inProcessAt) return 'Sipariş tarihi yok.';
  return null;
}

function buildPayload(order: OzonOrder, fx: { rate: number; rateDate: Date }, invoiceUuid: string, latin: boolean) {
  const t = (s: string) => (latin ? transliterate(s) : s);
  const products = order.productsJson as OrderProduct[];

  const lines = products.map((p) => {
    const quantity = Number(p.quantity);
    const unitPriceAmount = Number(p.price);
    const amount = round2(quantity * unitPriceAmount);
    return {
      itemName: t(p.name?.trim() || p.offer_id || 'Ozon ürünü'),
      quantity,
      unitCode: 'C62',
      unitPriceAmount,
      subtotal: amount,
      totalAmount: amount,
      totalDiscountAmount: 0,
      totalTax: zeroVat(amount),
    };
  });
  const total = round2(lines.reduce((s, l) => s + l.totalAmount, 0));
  const tracking = (order.rawDataJson as { tracking_number?: string } | null)?.tracking_number?.trim();
  const city = order.customerCity || order.customerRegion || 'Москва';

  return {
    // DAP serisi portala (source PORTAL) kayıtlı; SYSTEM ile "default prefix not found" dönüyor.
    source: 'PORTAL',
    localReferenceId: order.postingNumber,
    notes: [
      'Transit ticaret kapsamında satıştır.',
      `Gönderi No: ${order.postingNumber}`,
      ...(tracking ? [`Takip No: ${tracking}`] : []),
    ],
    invoiceIdentification: {
      invoiceType: 'EARSIVFATURA',
      invoiceTypeCode: 'SATIS',
      autoInvoiceId: true,
      invoiceUuid,
    },
    receiverInfo: {
      // Yabancı alıcı için GİB'in genel VKN'si; ad unvan olarak tek alanda.
      taxId: '2222222222',
      name: t(order.customerName!.trim()),
      countryCode: 'RU',
      city: t(city),
      // İlçe zorunlu (şemada yok ama API 422 veriyor); Ozon ilçe vermiyor, bölge yazılır.
      district: t(order.customerRegion || city),
      ...(order.customerAddressTail ? { address: t(order.customerAddressTail).slice(0, 500) } : {}),
    },
    invoiceTotal: {
      totalRawPrice: total,
      totalSubtotal: total,
      totalAmount: total,
      totalDiscountAmount: 0,
      payableAmount: total,
    },
    totalTax: zeroVat(total),
    invoiceLines: lines,
    references: { orderInfo: { orderId: order.postingNumber, orderDate: mskDate(order.inProcessAt!) } },
    currencyInfo: {
      currency: 'USD',
      hasExchange: true,
      calculationRate: fx.rate,
      sourceCurrency: 'USD',
      targetCurrency: 'TRY',
      exchangeDate: `${fx.rateDate.toISOString().slice(0, 10)}T00:00:00Z`,
    },
  };
}

// ─── Kesme ──────────────────────────────────────────────────────────────────

const describe = (err: unknown) =>
  err instanceof TrendyolError ? err.detail : err instanceof Error ? err.message : String(err);

/**
 * Siparişin faturasını keser. Aynı sipariş için ikinci fatura oluşmaz:
 *   - kayıt (env + gönderi no tekil) Trendyol'a gitmeden önce yazılır,
 *   - sonucu belirsiz kalan gönderim, aynı UUID'nin durumu sorularak tamamlanır ya da
 *     aynı UUID ile tekrarlanır (Trendyol aynı UUID'yi ikinci kez kabul etmez).
 */
export async function issueInvoice(postingNumber: string): Promise<EArchiveIssue> {
  const env = efaturaEnv();
  const order = await prisma.ozonOrder.findFirst({ where: { postingNumber, storeId: ORDER_STORE_ID } });
  if (!order) throw new IssueError('Sipariş bulunamadı.');
  const reason = blockingReason(order);
  if (reason) throw new IssueError(reason);

  let issue = await prisma.eArchiveIssue.findUnique({ where: { env_postingNumber: { env, postingNumber } } });
  if (issue?.status === 'ISSUED') return issue;

  // Belgeler'de satış faturası bağlanmış sipariş GİB portalında faturalanmıştır; test
  // ortamında da kesilmez. (Panelin kendi faturası yukarıda ISSUED olarak dönmüştür.)
  const gib = await prisma.salesInvoice.findFirst({ where: { store: CURRENT_STORE, postingNumber }, select: { invoiceNo: true } });
  if (gib) throw new IssueError(`Bu siparişin faturası zaten var (${gib.invoiceNo}).`);

  // Önceki gönderimin sonucu bilinmiyorsa önce Trendyol'a sorulur.
  if (issue?.status === 'SENDING') {
    const found = await getEArchiveStatus(issue.invoiceUuid);
    if (found) return markIssued(issue.id, found.invoiceId ?? null, found.status);
  }

  // Kur, fatura gününde (İstanbul) geçerli TCMB kuru. EVDS günü UTC okuduğu için gün
  // İstanbul saatiyle verilir; yoksa gece 00–03 arası bir önceki günün kuru alınır
  // (29.09 02:01'de kesilen DAP2026000000001–003 bu yüzden 25.09 bülteniyle kesildi).
  const fx = await getTryRate('USD', new Date(`${mskDate(new Date())}T00:00:00Z`));
  if (!fx) throw new IssueError('TCMB dolar kuru alınamadı; fatura yanlış kurla kesilmesin diye durduruldu.');

  if (!issue) {
    try {
      issue = await prisma.eArchiveIssue.create({
        data: { env, postingNumber, invoiceUuid: randomUUID(), status: 'SENDING' },
      });
    } catch (err) {
      // Aynı anda ikinci tıklama: kaydı diğer istek açtı.
      if ((err as { code?: string }).code === 'P2002') throw new IssueError('Bu siparişin faturası şu anda kesiliyor.');
      throw err;
    }
  } else if (issue.status === 'FAILED') {
    // Önceki deneme kesin olarak reddedildi, o UUID ile fatura yok; yenisiyle başlanır.
    issue = await prisma.eArchiveIssue.update({
      where: { id: issue.id },
      data: { invoiceUuid: randomUUID(), status: 'SENDING', error: null, transliterated: false },
    });
  }

  let latin = false;
  let payload = buildPayload(order, fx, issue.invoiceUuid, latin);
  try {
    let created;
    try {
      created = await createEArchive(payload);
    } catch (err) {
      if (!(err instanceof TrendyolError && err.isWafBlock)) throw err;
      latin = true;
      payload = buildPayload(order, fx, issue.invoiceUuid, latin);
      created = await createEArchive(payload);
    }
    await prisma.eArchiveIssue.update({
      where: { id: issue.id },
      data: { transliterated: latin, payload: payload as Prisma.InputJsonValue },
    });
    return markIssued(issue.id, created.invoiceId, created.status, created.issuedAt);
  } catch (err) {
    // 409 "uuid kullanılamaz": bu UUID ile fatura daha önce oluşmuş olabilir.
    if (err instanceof TrendyolError && err.status === 409) {
      const found = await getEArchiveStatus(issue.invoiceUuid).catch(() => null);
      if (found) return markIssued(issue.id, found.invoiceId ?? null, found.status);
    }
    // Trendyol'un yanıt veremediği durumlarda fatura oluşmuş olabilir: kayıt SENDING
    // kalır, sonraki denemede önce durum sorulur. Kesin ret (4xx) FAILED olur.
    const definite = err instanceof TrendyolError && err.status >= 400 && err.status < 500;
    const message = err instanceof TrendyolError && err.isWafBlock
      ? 'Trendyol güvenlik duvarı Latin harfli metni de engelledi.'
      : describe(err);
    await prisma.eArchiveIssue.update({
      where: { id: issue.id },
      data: {
        status: definite ? 'FAILED' : 'SENDING',
        error: message,
        transliterated: latin,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    throw new IssueError(definite ? message : `${message} Fatura kesilmiş olabilir; tekrar denediğinizde önce durumu kontrol edilir.`);
  }
}

// Trendyol zamanı saat dilimi olmadan İstanbul saatiyle veriyor ("2026-09-28T13:27:23.932").
const parseTrTime = (value?: string) => (value ? new Date(/[Z+]/.test(value.slice(10)) ? value : `${value}+03:00`) : new Date());

const markIssued = (id: string, invoiceNo: string | null, providerStatus: string | null, issuedAt?: string) =>
  prisma.eArchiveIssue.update({
    where: { id },
    data: { status: 'ISSUED', invoiceNo, providerStatus, error: null, issuedAt: parseTrTime(issuedAt) },
  });

// ─── Tamamlama ──────────────────────────────────────────────────────────────

/**
 * Kesilmiş faturanın Trendyol durumunu günceller. Canlıda fatura tamamlanınca (205)
 * XML'i ve PDF'i indirilip Belgeler → Satış faturaları'na kaydedilir. Test ortamındaki
 * faturalar yasal değildir; oraya yazılmaz.
 */
export async function refreshIssue(issue: EArchiveIssue): Promise<EArchiveIssue> {
  if (issue.status !== 'ISSUED') return issue;

  let current = issue;
  if (!isFinalStatus(issue.providerStatus)) {
    const found = await getEArchiveStatus(issue.invoiceUuid);
    if (found && (found.status !== issue.providerStatus || (found.invoiceId && !issue.invoiceNo))) {
      current = await prisma.eArchiveIssue.update({
        where: { id: issue.id },
        data: { providerStatus: found.status, invoiceNo: found.invoiceId ?? issue.invoiceNo },
      });
    }
  }

  if (current.env === 'production' && current.providerStatus === FINAL_OK && !current.salesInvoiceId) {
    current = await saveToSalesInvoices(current);
  }
  return current;
}

/** Belgeler kaydı için XML'in beklendiği süre */
const XML_WAIT_MS = 15 * 60_000;

async function saveToSalesInvoices(issue: EArchiveIssue): Promise<EArchiveIssue> {
  const existing = await prisma.salesInvoice.findUnique({
    where: { store_uuid: { store: CURRENT_STORE, uuid: issue.invoiceUuid } },
    select: { id: true },
  });
  if (existing) {
    return prisma.eArchiveIssue.update({ where: { id: issue.id }, data: { salesInvoiceId: existing.id } });
  }

  const [xml, pdf] = await Promise.all([downloadEArchive(issue.invoiceUuid, 'xml'), downloadEArchive(issue.invoiceUuid, 'pdf')]);

  // Asıl kaynak faturanın XML'i. Canlıda XML bazen PDF'ten birkaç dakika sonra çıkıyor
  // (DAP2026000000004); o süre beklenir. Sonra da yoksa (test ortamında hiç yok) bilgiler
  // gönderdiğimiz gövdeden alınır ve PDF asıl dosya olarak saklanır.
  const waitForXml = Date.now() - (issue.issuedAt ?? issue.updatedAt).getTime() < XML_WAIT_MS;
  let parsed: ParsedInvoice;
  let original: { bytes: Buffer; name: string; contentType: string };
  if (xml) {
    parsed = parseUblInvoice(new TextDecoder('utf-8').decode(xml));
    if (parsed.sellerTaxId !== OWN_TAX_ID) throw new Error(`Faturanın satıcısı Lenora değil (${parsed.sellerTaxId}).`);
    original = { bytes: xml, name: `${parsed.invoiceNo}.xml`, contentType: 'application/xml' };
  } else if (pdf && issue.payload && issue.invoiceNo && !waitForXml) {
    parsed = parsedFromPayload(issue);
    original = { bytes: pdf, name: `${parsed.invoiceNo}.pdf`, contentType: 'application/pdf' };
  } else {
    return issue; // dosyalar henüz hazır değil; sonraki yenilemede
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN || undefined;
  const blob = await put(`sales-invoices/${CURRENT_STORE}/${Date.now()}-${original.name}`, original.bytes, {
    access: 'private',
    contentType: original.contentType,
    token,
  });
  const saved = await saveParsedInvoice(parsed, {
    url: blob.url,
    name: original.name,
    contentType: original.contentType,
    size: original.bytes.length,
    hash: createHash('sha256').update(original.bytes).digest('hex'),
  });

  if (pdf) {
    const pdfName = `${parsed.invoiceNo}.pdf`;
    const pdfBlob = await put(`sales-invoices/${CURRENT_STORE}/pdf/${Date.now()}-${pdfName}`, pdf, {
      access: 'private',
      contentType: 'application/pdf',
      token,
    });
    await prisma.salesInvoice.update({
      where: { id: saved.id },
      data: { pdfUrl: pdfBlob.url, pdfName, pdfSize: pdf.length },
    });
  }

  return prisma.eArchiveIssue.update({ where: { id: issue.id }, data: { salesInvoiceId: saved.id } });
}

interface SentPayload {
  notes: string[];
  receiverInfo: { name: string; city: string; countryCode: string };
  invoiceTotal: { payableAmount: number; totalSubtotal: number };
  invoiceLines: { itemName: string; quantity: number; unitCode: string; unitPriceAmount: number; totalAmount: number }[];
  currencyInfo: { currency: string; calculationRate: number };
}

/** XML yokken Belgeler kaydı: Trendyol'a gönderilen gövde + Trendyol'un verdiği no ve zaman. */
function parsedFromPayload(issue: EArchiveIssue): ParsedInvoice {
  const p = issue.payload as unknown as SentPayload;
  const at = new Date((issue.issuedAt ?? issue.updatedAt).getTime() + 3 * 3600_000).toISOString();
  return {
    invoiceNo: issue.invoiceNo!,
    uuid: issue.invoiceUuid,
    profile: 'EARSIVFATURA',
    typeCode: 'SATIS',
    issueDate: at.slice(0, 10),
    issueTime: at.slice(11, 19),
    sellerName: null,
    sellerTaxId: OWN_TAX_ID,
    customerName: p.receiverInfo.name,
    customerCountry: p.receiverInfo.countryCode,
    customerCity: p.receiverInfo.city,
    currency: p.currencyInfo.currency,
    totalAmount: p.invoiceTotal.payableAmount,
    taxExclusive: p.invoiceTotal.totalSubtotal,
    taxAmount: 0,
    allowanceTotal: 0,
    exemptionCode: '351',
    exemptionReason: 'KDV - İstisna Olmayan Diğer',
    fxRate: p.currencyInfo.calculationRate,
    notes: p.notes,
    postingNumber: issue.postingNumber,
    lines: p.invoiceLines.map((l) => ({
      name: l.itemName,
      quantity: l.quantity,
      unitCode: l.unitCode,
      unitPrice: l.unitPriceAmount,
      amount: l.totalAmount,
      taxPercent: 0,
      gtip: null,
      originCountry: null,
    })),
    data: { kaynak: "Trendyol'a gönderilen gövde (XML alınamadı)", ...(issue.payload as Record<string, unknown>) },
  };
}

// ─── Liste ──────────────────────────────────────────────────────────────────

export interface InvoiceOrderRow {
  postingNumber: string;
  orderDate: string | null;
  status: string;
  statusName: string | null;
  image: string | null;
  offerId: string | null;
  productName: string | null;
  itemCount: number;
  customerName: string | null;
  amount: number;
  currency: string;
  /** Kesilemiyorsa nedeni */
  blocked: string | null;
  issue: {
    status: string;
    invoiceNo: string | null;
    providerStatus: string | null;
    transliterated: boolean;
    error: string | null;
    invoiceUuid: string;
    issuedAt: string;
    /** Canlıda Belgeler → Satış faturaları'na yazıldı mı (test ortamında her zaman true) */
    saved: boolean;
  } | null;
  /** GİB portalında kesilip Belgeler → Satış faturaları'nda siparişe bağlanmış fatura */
  gibInvoice: { id: string; invoiceNo: string; hasPdf: boolean } | null;
}

/** Yenilemede en fazla bu kadar fatura için Trendyol'a durum sorulur. */
const REFRESH_LIMIT = 10;

export async function listInvoiceOrders(): Promise<{ env: EfaturaEnv; startDate: string; pending: InvoiceOrderRow[]; invoiced: InvoiceOrderRow[] }> {
  const env = efaturaEnv();
  const start = invoicingStartDate();

  // Listede görünen durum (Kargoda / Teslim Edildi) veri tabanından gelir; geçmiş aylardaki
  // açık siparişler önce Ozon'dan tazelenir. Başarısız olursa liste yine açılır.
  await refreshOpenOrderStatuses(ORDER_STORE_ID).catch((err) =>
    console.warn('Açık siparişlerin durumu tazelenemedi:', err instanceof Error ? err.message : err)
  );

  const [orders, issuesRaw, gib] = await Promise.all([
    prisma.ozonOrder.findMany({
      where: { storeId: ORDER_STORE_ID, status: { not: 'cancelled' }, inProcessAt: { gte: start } },
      orderBy: { inProcessAt: 'desc' },
    }),
    prisma.eArchiveIssue.findMany({ where: { env } }),
    prisma.salesInvoice.findMany({
      where: { store: CURRENT_STORE, postingNumber: { not: null } },
      select: { id: true, postingNumber: true, invoiceNo: true, pdfUrl: true },
    }),
  ]);

  // İşlenmekte olan faturaların durumu sayfa açılınca güncellenir.
  let refreshed = 0;
  const issues: EArchiveIssue[] = [];
  for (const issue of issuesRaw) {
    const needs = issue.status === 'ISSUED' && (!isFinalStatus(issue.providerStatus) || (env === 'production' && issue.providerStatus === FINAL_OK && !issue.salesInvoiceId));
    if (needs && refreshed < REFRESH_LIMIT) {
      refreshed++;
      issues.push(await refreshIssue(issue).catch((err) => {
        console.error('e-Arşiv durumu güncellenemedi:', issue.postingNumber, err);
        return issue;
      }));
    } else {
      issues.push(issue);
    }
  }

  const issueByPosting = new Map(issues.map((i) => [i.postingNumber, i]));
  // Belgeler'de satış faturası bağlanmış siparişler GİB portalında faturalandı: kesilmez,
  // "Faturalanan"da GİB faturasıyla görünür. Panelin canlıda Belgeler'e yazdığı kendi
  // faturaları GİB sayılmaz.
  const ownSalesInvoices = new Set(issues.map((i) => i.salesInvoiceId).filter(Boolean));
  const gibByPosting = new Map(
    gib.filter((g) => !ownSalesInvoices.has(g.id)).map((g) => [g.postingNumber!, { id: g.id, invoiceNo: g.invoiceNo, hasPdf: !!g.pdfUrl }])
  );

  const rows: InvoiceOrderRow[] = orders.map((o) => {
    const products = (o.productsJson as OrderProduct[] | null) ?? [];
    const issue = issueByPosting.get(o.postingNumber);
    return {
      postingNumber: o.postingNumber,
      orderDate: o.inProcessAt?.toISOString() ?? null,
      status: o.status,
      statusName: o.statusName,
      image: o.productImage,
      offerId: o.productOfferId ?? products[0]?.offer_id ?? null,
      productName: o.productTitle ?? products[0]?.name ?? null,
      itemCount: products.reduce((s, p) => s + (Number(p.quantity) || 0), 0),
      customerName: o.customerName,
      amount: round2(products.reduce((s, p) => s + Number(p.price) * Number(p.quantity), 0) || o.totalPrice),
      currency: o.currency,
      blocked: blockingReason(o),
      issue: issue
        ? {
            status: issue.status,
            invoiceNo: issue.invoiceNo,
            providerStatus: issue.providerStatus,
            transliterated: issue.transliterated,
            error: issue.error,
            invoiceUuid: issue.invoiceUuid,
            issuedAt: (issue.issuedAt ?? issue.updatedAt).toISOString(),
            saved: env !== 'production' || !!issue.salesInvoiceId,
          }
        : null,
      gibInvoice: gibByPosting.get(o.postingNumber) ?? null,
    };
  });

  const isInvoiced = (r: InvoiceOrderRow) => !!r.gibInvoice || r.issue?.status === 'ISSUED';
  return {
    env,
    startDate: start.toISOString(),
    pending: rows.filter((r) => !isInvoiced(r)),
    invoiced: rows.filter(isInvoiced),
  };
}
