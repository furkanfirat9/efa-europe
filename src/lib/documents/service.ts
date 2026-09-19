import type { AccountingDocument, AccountingDocumentLine } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getTryRate } from '@/lib/fx/evds';
import { categoryLabel } from './categories';

export const CURRENT_STORE = 'lenora';

/** Faturada alıcı olarak şirketin farklı yazılışları geçebilir ("LENORA LIMITED SIRKETI" gibi). */
export const isOwnBuyer = (buyerName?: string | null) => (buyerName ? /lenora/i.test(buyerName) : null);

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

/** Onaydan önce eksik ya da şüpheli olan her şey; kayıt sırasında yeniden hesaplanır. */
export async function buildWarnings(
  doc: Pick<
    AccountingDocument,
    'id' | 'store' | 'kind' | 'documentDate' | 'currency' | 'totalAmount' | 'category' | 'buyerName' | 'fxRate' | 'dedupKey'
  >,
  extra: string[] = []
): Promise<string[]> {
  const warnings = [...extra];
  if (!doc.documentDate) warnings.push('Belge tarihi okunamadı.');
  if (!doc.currency) warnings.push('Para birimi okunamadı.');
  if (doc.totalAmount == null) warnings.push('Toplam tutar okunamadı.');
  if (!doc.category) warnings.push('Kategori seçilmedi.');
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
