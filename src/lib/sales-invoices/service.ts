import type { Prisma, SalesInvoice, SalesInvoiceLine } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { computeFx, CURRENT_STORE } from '@/lib/documents/service';
import type { ParsedInvoice } from './ubl';

export { CURRENT_STORE };

/** Lenora'nın vergi numarası; başka satıcının faturası (ör. diğer mağaza) kaydedilmez. */
export const OWN_TAX_ID = '6081754939';

/** Lenora'nın siparişleri OzonOrder tablosunda bu mağaza kimliğiyle durur (Avrupa mağazası). */
export const ORDER_STORE_ID = 'store1';

/** Gönderi no faturanın notlarında yazıyorsa faturadan gelmiştir ve değiştirilemez; değilse elle seçilmiştir. */
export const isPostingFromInvoice = (notes: unknown, postingNumber: string | null) =>
  !!postingNumber && Array.isArray(notes) && notes.some((n) => typeof n === 'string' && n.includes(postingNumber));

/** Toplamlarda eksiye yazılan fatura tipleri */
export const NEGATIVE_TYPES = new Set(['IADE']);

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Okunan faturayı kaydeder. Kur faturanın üzerindekidir; faturada yoksa
 * (dövizli faturada olmamalı) TCMB kuruna düşülür ve kaynağı yazılır.
 */
export async function saveParsedInvoice(
  parsed: ParsedInvoice,
  file: { url: string; name: string; contentType: string; size: number; hash: string }
) {
  let fxRate = parsed.fxRate;
  let fxSource: string | null = fxRate == null ? null : parsed.currency === 'TRY' ? 'TL' : 'Fatura';
  if (fxRate == null) {
    const fx = await computeFx({
      currency: parsed.currency,
      documentDate: new Date(`${parsed.issueDate}T00:00:00Z`),
    }).catch(() => null);
    if (fx?.fxRate != null) {
      fxRate = fx.fxRate;
      fxSource = fx.fxSource;
    }
  }

  return prisma.salesInvoice.create({
    data: {
      store: CURRENT_STORE,
      invoiceNo: parsed.invoiceNo,
      uuid: parsed.uuid,
      profile: parsed.profile,
      typeCode: parsed.typeCode,
      issueDate: new Date(`${parsed.issueDate}T00:00:00Z`),
      issueTime: parsed.issueTime,
      customerName: parsed.customerName,
      customerCountry: parsed.customerCountry,
      customerCity: parsed.customerCity,
      currency: parsed.currency,
      totalAmount: parsed.totalAmount,
      taxExclusive: parsed.taxExclusive,
      taxAmount: parsed.taxAmount,
      allowanceTotal: parsed.allowanceTotal,
      exemptionCode: parsed.exemptionCode,
      exemptionReason: parsed.exemptionReason,
      fxRate,
      fxSource,
      totalTry: fxRate == null ? null : round2(parsed.totalAmount * fxRate),
      postingNumber: parsed.postingNumber,
      notes: parsed.notes,
      data: parsed.data as Prisma.InputJsonValue,
      fileUrl: file.url,
      fileName: file.name,
      fileContentType: file.contentType,
      fileSize: file.size,
      fileHash: file.hash,
      lines: {
        create: parsed.lines.map((line, position) => ({ position, ...line })),
      },
    },
    include: { lines: true },
  });
}

export type SalesInvoiceWithLines = SalesInvoice & { lines: SalesInvoiceLine[] };

/** İstemciye giden biçim: blob adresleri ve dosya özeti gönderilmez. */
export function toSalesDto(inv: SalesInvoiceWithLines) {
  return {
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    uuid: inv.uuid,
    profile: inv.profile,
    typeCode: inv.typeCode,
    issueDate: isoDate(inv.issueDate)!,
    issueTime: inv.issueTime,
    customerName: inv.customerName,
    customerCountry: inv.customerCountry,
    customerCity: inv.customerCity,
    currency: inv.currency,
    totalAmount: inv.totalAmount,
    taxExclusive: inv.taxExclusive,
    taxAmount: inv.taxAmount,
    allowanceTotal: inv.allowanceTotal,
    exemptionCode: inv.exemptionCode,
    exemptionReason: inv.exemptionReason,
    fxRate: inv.fxRate,
    fxSource: inv.fxSource,
    totalTry: inv.totalTry,
    postingNumber: inv.postingNumber,
    postingFromInvoice: isPostingFromInvoice(inv.notes, inv.postingNumber),
    notes: Array.isArray(inv.notes) ? (inv.notes as string[]) : [],
    data: inv.data as Record<string, unknown>,
    fileName: inv.fileName,
    fileSize: inv.fileSize,
    hasPdf: !!inv.pdfUrl,
    pdfName: inv.pdfName,
    createdAt: inv.createdAt.toISOString(),
    lines: [...inv.lines]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        id: l.id,
        name: l.name,
        quantity: l.quantity,
        unitCode: l.unitCode,
        unitPrice: l.unitPrice,
        amount: l.amount,
        taxPercent: l.taxPercent,
        gtip: l.gtip,
        originCountry: l.originCountry,
      })),
  };
}

export type SalesInvoiceDto = ReturnType<typeof toSalesDto>;
