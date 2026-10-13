import { createHash } from 'node:crypto';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { isCategoryKey } from './categories';
import type { DocumentKind, ExtractedDocument } from './extract';
import { autoConfirmIfClean, IngestError, ingestOrderDocument } from './order-ingest';
import { CURRENT_STORE, isOtherStoreBuyer, saveExtractedDocument, type DocumentWithLines } from './service';

/**
 * Muhasebe ajanının belge işleme yolu (kullanıcı, 2026-10-13: "Gemini kullanılmasın").
 *
 * Belgeyi ajan okur (scripts/muhasebe_belge.mjs); burada yalnız panelin kendi kayıt kurallarıyla
 * (kur, mükerrer anahtarı, sipariş eşleştirmesi, uyarılar, uyarısızsa otomatik onay) Belgeler'e yazılır.
 * Üç kaynak:
 *  - siparişe yüklenmiş alış faturası → ingestOrderDocument(…, { provided })
 *  - sohbette verilen dosya → ingestFileDocument
 *  - Belgeler'e okunmadan yüklenmiş taslak → fillDraftDocument
 */

export const AGENT_MODEL = 'muhasebe-ajani (Claude)';

const KINDS: DocumentKind[] = ['invoice', 'credit_note', 'ozon_upd', 'ozon_report', 'income_report', 'not_invoice'];
const PLATFORMS = ['amazon', 'allegro', 'ozon', 'other'] as const;

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const date = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const category = (v: unknown): string | null => (isCategoryKey(v) ? v : null);
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter((x): x is string => !!x) : []);

/** Ajanın yazdığı JSON'u panelin beklediği biçime getirir; geçersiz alan sessizce null olur, uyarıya yazılır. */
export function normalizeAgentExtraction(raw: Record<string, any>): { extracted: ExtractedDocument; problems: string[] } {
  const problems: string[] = [];
  const kind = KINDS.includes(raw.documentKind) ? (raw.documentKind as DocumentKind) : 'invoice';
  if (!KINDS.includes(raw.documentKind)) problems.push(`belge türü "${raw.documentKind}" tanınmadı`);
  const platform = PLATFORMS.includes(raw.platform) ? raw.platform : null;
  if (raw.suggestedCategory != null && !category(raw.suggestedCategory)) problems.push(`kategori "${raw.suggestedCategory}" geçersiz`);
  for (const k of ['documentDate', 'servicePeriodStart', 'servicePeriodEnd'])
    if (raw[k] != null && !date(raw[k])) problems.push(`${k} "${raw[k]}" YYYY-MM-DD değil`);
  const lines = Array.isArray(raw.lines) ? raw.lines : [];
  return {
    problems,
    extracted: {
      documentKind: kind,
      platform,
      documentNo: text(raw.documentNo),
      ksefNo: text(raw.ksefNo),
      documentDate: date(raw.documentDate),
      sellerName: text(raw.sellerName),
      sellerCountry: text(raw.sellerCountry)?.toUpperCase() ?? null,
      sellerTaxId: text(raw.sellerTaxId),
      buyerName: text(raw.buyerName),
      currency: text(raw.currency)?.toUpperCase().replace(/^RUR$/, 'RUB') ?? null,
      totalAmount: num(raw.totalAmount),
      orderNumber: text(raw.orderNumber),
      postingNumbers: texts(raw.postingNumbers),
      servicePeriodStart: date(raw.servicePeriodStart),
      servicePeriodEnd: date(raw.servicePeriodEnd),
      suggestedCategory: category(raw.suggestedCategory),
      lines: lines.map((l: Record<string, any>) => ({
        description: text(l.description) ?? '—',
        quantity: num(l.quantity),
        amount: num(l.amount),
        isShipping: !!l.isShipping,
        category: category(l.category),
      })),
      uncertainFields: texts(raw.uncertainFields),
      notes: text(raw.notes),
    },
  };
}

function rejectIfNotExpense(extracted: ExtractedDocument) {
  if (extracted.documentKind === 'income_report') {
    throw new IngestError(422, 'Bu bir gelir belgesi (satış / tazminat raporu); Belgeler sayfasına yüklenmez.');
  }
  if (isOtherStoreBuyer(extracted.buyerName)) {
    throw new IngestError(422, `Bu belge diğer mağazaya ait (alıcı: ${extracted.buyerName}); Lenora'nın giderine yazılmaz.`);
  }
}

const warningsOf = (extracted: ExtractedDocument, problems: string[]) => [
  ...problems.map((p) => `Ajan: ${p}.`),
  ...(extracted.uncertainFields.length ? [`Emin olunamayan alanlar: ${extracted.uncertainFields.join(', ')}.`] : []),
];

/** Siparişler sayfasına yüklenmiş alış faturası */
export async function ingestOrderDocumentByAgent(postingNumber: string, raw: Record<string, any>) {
  const { extracted, problems } = normalizeAgentExtraction(raw);
  rejectIfNotExpense(extracted);
  const result = await ingestOrderDocument(postingNumber, { provided: { extracted, aiModel: AGENT_MODEL } });
  if (!problems.length || result.merged) return result;
  const previous = Array.isArray(result.document.warnings) ? (result.document.warnings as string[]) : [];
  const document = await prisma.accountingDocument.update({
    where: { id: result.document.id },
    data: { status: 'draft', warnings: [...previous, ...problems.map((p) => `Ajan: ${p}.`)] },
    include: { lines: true },
  });
  return { ...result, document };
}

/** Sohbette verilen dosya: Blob'a konur ve Belgeler'e yazılır (Belgeler'deki yüklemeyle aynı yol) */
export async function ingestFileDocument(input: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  raw: Record<string, any>;
}): Promise<DocumentWithLines> {
  const fileHash = createHash('sha256').update(input.buffer).digest('hex');
  const same = await prisma.accountingDocument.findUnique({
    where: { store_fileHash: { store: CURRENT_STORE, fileHash } },
    select: { id: true, status: true },
  });
  if (same) throw new IngestError(409, 'Bu dosya daha önce yüklenmiş.', { existingId: same.id, existingStatus: same.status });

  const { extracted, problems } = normalizeAgentExtraction(input.raw);
  rejectIfNotExpense(extracted);

  const safeName = input.fileName.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-120) || 'belge';
  const blob = await put(`documents/${CURRENT_STORE}/${Date.now()}-${safeName}`, input.buffer, {
    access: 'private',
    contentType: input.contentType,
    token: process.env.BLOB_READ_WRITE_TOKEN || undefined,
  });
  const saved = await saveExtractedDocument({
    extracted,
    aiModel: AGENT_MODEL,
    extraWarnings: warningsOf(extracted, problems),
    file: { url: blob.url, name: input.fileName, contentType: input.contentType, size: input.buffer.length, hash: fileHash },
  });
  return autoConfirmIfClean(saved);
}

/**
 * Belgeler'e okunmadan yüklenmiş taslağı doldurur. Taslak silinip aynı dosyayla yeniden kaydedilir:
 * kur, mükerrer anahtarı, sipariş eşleştirmesi ve uyarılar panelin kendi yolundan hesaplansın diye.
 */
export async function fillDraftDocument(id: string, raw: Record<string, any>): Promise<DocumentWithLines> {
  const doc = await prisma.accountingDocument.findUnique({ where: { id } });
  if (!doc || doc.store !== CURRENT_STORE) throw new IngestError(404, 'Belge bulunamadı.');
  if (doc.status !== 'draft') throw new IngestError(409, 'Yalnız onay bekleyen (taslak) belge doldurulur.');
  if (!doc.fileUrl || !doc.fileHash) throw new IngestError(422, 'Taslağın dosyası yok.');

  const { extracted, problems } = normalizeAgentExtraction(raw);
  rejectIfNotExpense(extracted);

  const file = {
    url: doc.fileUrl,
    name: doc.fileName ?? 'belge',
    contentType: doc.fileContentType ?? 'application/pdf',
    size: doc.fileSize ?? 0,
    hash: doc.fileHash,
    shared: doc.fileShared,
  };
  await prisma.accountingDocument.delete({ where: { id } });
  const saved = await saveExtractedDocument({
    extracted,
    aiModel: AGENT_MODEL,
    extraWarnings: warningsOf(extracted, problems),
    file,
    postingNumbers: doc.postingNumbers,
  });
  return autoConfirmIfClean(saved);
}
