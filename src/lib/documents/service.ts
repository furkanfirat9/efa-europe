import type { AccountingDocument, AccountingDocumentLine } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getTryRate } from '@/lib/fx/evds';
import { categoryLabel } from './categories';
import type { ExtractedDocument } from './extract';

export const CURRENT_STORE = 'lenora';

/** Faturada alıcı olarak şirketin farklı yazılışları geçebilir ("LENORA LIMITED SIRKETI" gibi). */
export const isOwnBuyer = (buyerName?: string | null) => (buyerName ? /lenora/i.test(buyerName) : null);

/**
 * Kullanıcının ikinci Ozon mağazası bu ad altında; o mağazanın belgeleri Lenora'nın
 * giderine karışmamalı. İkinci mağaza da panele eklenirse buradaki liste yerine
 * belgenin mağazası seçilir.
 */
const OTHER_STORE_BUYERS = [/elif\s*fırat/i, /elif\s*firat/i];

export const isOtherStoreBuyer = (buyerName?: string | null) =>
  !!buyerName && OTHER_STORE_BUYERS.some((pattern) => pattern.test(buyerName));

const normalizeKey = (s: string) => s.toLocaleUpperCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Mükerrer kontrol anahtarı: KSeF numarası varsa o (Polonya'da benzersizdir),
 * yoksa satıcı (vergi no ya da ad) + belge no. Farklı satıcılar aynı numarayı
 * kullanabildiği için yalnızca belge no yetmez.
 */
export function buildDedupKey(doc: {
  ksefNo?: string | null;
  documentNo?: string | null;
  sellerTaxId?: string | null;
  sellerName?: string | null;
}): string | null {
  if (doc.ksefNo) return `ksef:${normalizeKey(doc.ksefNo)}`;
  const seller = doc.sellerTaxId || doc.sellerName;
  if (doc.documentNo && seller) return `no:${normalizeKey(seller)}:${normalizeKey(doc.documentNo)}`;
  return null;
}

export const parseIsoDate = (value?: string | null): Date | null =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Tarih + para birimi + tutardan TL karşılığı. Kur bulunamazsa alanlar boş kalır. */
export async function computeFx(input: { currency?: string | null; documentDate?: Date | null; totalAmount?: number | null }) {
  const empty = { fxRate: null, fxRateDate: null, fxSource: null, totalTry: null };
  if (!input.currency || !input.documentDate) return empty;
  const fx = await getTryRate(input.currency, input.documentDate);
  if (!fx) return empty;
  return {
    fxRate: fx.rate,
    fxRateDate: fx.rateDate,
    fxSource: fx.source,
    totalTry: input.totalAmount != null ? Math.round(input.totalAmount * fx.rate * 100) / 100 : null,
  };
}

/** Faturadaki ürün adedi (kargo satırları hariç; adedi okunamayan satır 1 sayılır). */
export const productUnits = (lines: Pick<AccountingDocumentLine, 'quantity' | 'isShipping'>[]) =>
  Math.round(lines.filter((l) => !l.isShipping).reduce((acc, l) => acc + (l.quantity ?? 1), 0));

/** Onaydan önce eksik ya da şüpheli olan her şey; kayıt sırasında yeniden hesaplanır. */
export async function buildWarnings(
  doc: Pick<
    AccountingDocument,
    | 'id'
    | 'store'
    | 'kind'
    | 'documentDate'
    | 'currency'
    | 'totalAmount'
    | 'category'
    | 'buyerName'
    | 'fxRate'
    | 'dedupKey'
    | 'postingNumbers'
  >,
  extra: string[] = [],
  lines: Pick<AccountingDocumentLine, 'amount' | 'category' | 'quantity' | 'isShipping'>[] = []
): Promise<string[]> {
  const warnings = [...extra];
  // Bir fatura içindeki ürün adedinden fazla siparişe ait olamaz; yanlış bağlantı işaretidir.
  const units = productUnits(lines);
  if (units > 0 && doc.postingNumbers.length > units) {
    warnings.push(`Faturada ${units} ürün var ama ${doc.postingNumbers.length} siparişe bağlı; siparişleri kontrol edin.`);
  }
  if (!doc.documentDate) warnings.push('Belge tarihi okunamadı.');
  if (!doc.currency) warnings.push('Para birimi okunamadı.');
  if (doc.totalAmount == null) warnings.push('Toplam tutar okunamadı.');
  if (!isCategorised({ ...doc, lines })) {
    warnings.push(
      lines.length > 1 ? 'Kategorisiz kalem var; belge ya da satır kategorisi seçin.' : 'Kategori seçilmedi.'
    );
  }
  // Ozon belgeleri gibi çok kalemli belgelerde satırların toplamı belge toplamını tutmalı.
  if (lines.length > 1 && doc.totalAmount != null) {
    const sum = lines.reduce((acc, l) => acc + (l.amount ?? 0), 0);
    if (Math.abs(sum - doc.totalAmount) > 0.02) {
      warnings.push(`Kalemlerin toplamı (${sum.toFixed(2)}) belge toplamını tutmuyor.`);
    }
  }
  if (doc.currency && doc.documentDate && doc.fxRate == null) {
    warnings.push(`${doc.currency} için TCMB kuru bulunamadı; TL karşılığı hesaplanamadı.`);
  }
  if (isOwnBuyer(doc.buyerName) === false) {
    warnings.push(`Alıcı şirket görünmüyor: "${doc.buyerName}".`);
  }
  if (doc.kind === 'credit_note') warnings.push('Bu bir düzeltme / iade faturası.');
  if (doc.kind === 'not_invoice') warnings.push('Belge fatura gibi görünmüyor.');
  if (doc.dedupKey) {
    const duplicate = await prisma.accountingDocument.findFirst({
      where: { store: doc.store, dedupKey: doc.dedupKey, status: 'confirmed', NOT: { id: doc.id } },
      select: { id: true, documentNo: true },
    });
    if (duplicate) warnings.push(`Bu belge daha önce kaydedilmiş (${duplicate.documentNo ?? 'aynı numara'}).`);
  }
  return warnings;
}

/**
 * Belge kategorili sayılır: ya belgenin kendi kategorisi vardır ya da (Ozon UPD'si
 * gibi çok kalemli belgelerde) her kalemin kategorisi vardır.
 */
export function isCategorised(doc: {
  category: string | null;
  lines: Pick<AccountingDocumentLine, 'category'>[];
}): boolean {
  if (doc.category) return true;
  return doc.lines.length > 0 && doc.lines.every((l) => !!l.category);
}

export type DocumentWithLines = AccountingDocument & { lines: AccountingDocumentLine[] };

/** İstemciye giden biçim: blob adresi ve dosya özeti gönderilmez. */
export function toDto(doc: DocumentWithLines) {
  return {
    id: doc.id,
    status: doc.status as 'draft' | 'confirmed',
    kind: doc.kind,
    platform: doc.platform,
    category: doc.category,
    categoryLabel: categoryLabel(doc.category),
    documentNo: doc.documentNo,
    ksefNo: doc.ksefNo,
    documentDate: isoDate(doc.documentDate),
    sellerName: doc.sellerName,
    sellerCountry: doc.sellerCountry,
    sellerTaxId: doc.sellerTaxId,
    buyerName: doc.buyerName,
    buyerIsOwn: doc.buyerIsOwn,
    currency: doc.currency,
    totalAmount: doc.totalAmount,
    orderNumber: doc.orderNumber,
    postingNumbers: doc.postingNumbers,
    fileShared: doc.fileShared,
    servicePeriodStart: isoDate(doc.servicePeriodStart),
    servicePeriodEnd: isoDate(doc.servicePeriodEnd),
    fxRate: doc.fxRate,
    fxRateDate: isoDate(doc.fxRateDate),
    fxSource: doc.fxSource,
    totalTry: doc.totalTry,
    notes: doc.notes,
    warnings: Array.isArray(doc.warnings) ? (doc.warnings as string[]) : [],
    fileName: doc.fileName,
    fileContentType: doc.fileContentType,
    fileSize: doc.fileSize,
    createdAt: doc.createdAt.toISOString(),
    lines: [...doc.lines]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        amount: l.amount,
        category: l.category,
        isShipping: l.isShipping,
      })),
  };
}

export type AccountingDocumentDto = ReturnType<typeof toDto>;

/**
 * Eski tek gönderi no alanı; yayındaki eski sürüm okuduğu için ilk sipariş oraya da yazılır.
 * Yeni sürüm yayına alınıp alan kaldırıldığında bu yardımcı da kalkar.
 */
export const legacyPostingNumber = (postingNumbers: string[]) => postingNumbers[0] ?? null;

/**
 * Faturadaki platform sipariş numarasına göre siparişleri bulur (tedarikçi sipariş no alanı).
 * Tek Amazon siparişinde birden fazla Ozon siparişinin ürünü alınmış olabilir; hepsi döner.
 */
export async function findOrdersByOrderNumber(orderNumber?: string | null): Promise<string[]> {
  const value = orderNumber?.trim();
  if (!value || value.length < 4) return [];
  const orders = await prisma.ozonOrder.findMany({
    where: { supplierOrderId: { contains: value } },
    select: { postingNumber: true },
    orderBy: { inProcessAt: 'desc' },
  });
  return orders.map((o) => o.postingNumber);
}

/**
 * Okunan belgeyi taslak olarak kaydeder (kur, mükerrer anahtarı, sipariş eşleştirmesi
 * ve uyarılarla birlikte). Hem doğrudan yüklemede hem siparişteki belgeyi okumada kullanılır.
 */
export async function saveExtractedDocument(input: {
  extracted: ExtractedDocument | null;
  aiModel: string | null;
  extraWarnings?: string[];
  file: { url: string; name: string; contentType: string; size: number; hash: string; shared?: boolean };
  postingNumber?: string | null;
}): Promise<DocumentWithLines> {
  const { extracted, aiModel, file } = input;
  const documentDate = parseIsoDate(extracted?.documentDate);

  const fields = {
    kind: extracted?.documentKind ?? 'invoice',
    platform: extracted?.platform ?? null,
    category: extracted?.suggestedCategory ?? null,
    documentNo: extracted?.documentNo ?? null,
    ksefNo: extracted?.ksefNo ?? null,
    documentDate,
    sellerName: extracted?.sellerName ?? null,
    sellerCountry: extracted?.sellerCountry ?? null,
    sellerTaxId: extracted?.sellerTaxId ?? null,
    buyerName: extracted?.buyerName ?? null,
    buyerIsOwn: isOwnBuyer(extracted?.buyerName),
    currency: extracted?.currency ?? null,
    totalAmount: extracted?.totalAmount ?? null,
    orderNumber: extracted?.orderNumber ?? null,
    servicePeriodStart: parseIsoDate(extracted?.servicePeriodStart),
    servicePeriodEnd: parseIsoDate(extracted?.servicePeriodEnd),
    notes: extracted?.notes ?? null,
  };

  const extraWarnings = [...(input.extraWarnings ?? [])];
  // Siparişten okunan belge o siparişe aittir; faturadaki sipariş no başka siparişleri de getirebilir.
  const found = await findOrdersByOrderNumber(fields.orderNumber);
  const postingNumbers = [...new Set([...(input.postingNumber ? [input.postingNumber] : []), ...found])];
  const guessed = postingNumbers.filter((p) => p !== input.postingNumber);
  if (guessed.length) {
    extraWarnings.push(`Sipariş ${guessed.join(', ')} ile eşleştirildi; kontrol edin.`);
  }

  const fx = await computeFx(fields).catch((err) => {
    console.error('Kur alınamadı:', err);
    return computeFx({});
  });

  const created = await prisma.accountingDocument.create({
    data: {
      store: CURRENT_STORE,
      status: 'draft',
      ...fields,
      ...fx,
      postingNumbers,
      postingNumber: legacyPostingNumber(postingNumbers),
      dedupKey: buildDedupKey(fields),
      aiModel,
      fileUrl: file.url,
      fileName: file.name,
      fileContentType: file.contentType,
      fileSize: file.size,
      fileHash: file.hash,
      fileShared: file.shared ?? false,
      lines: {
        create: (extracted?.lines ?? []).map((line, position) => ({
          position,
          description: line.description,
          quantity: line.quantity,
          amount: line.amount,
          isShipping: line.isShipping,
          category: line.category,
        })),
      },
    },
    include: { lines: true },
  });

  const warnings = await buildWarnings(created, extraWarnings, created.lines);
  return prisma.accountingDocument.update({
    where: { id: created.id },
    data: { warnings },
    include: { lines: true },
  });
}
