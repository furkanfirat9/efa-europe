import { createHash } from 'node:crypto';
import { get } from '@vercel/blob';
import { prisma } from '@/lib/db/prisma';
import { extractDocument, type ExtractedDocument } from './extract';
import {
  CURRENT_STORE,
  isCategorised,
  isOtherStoreBuyer,
  legacyPostingNumber,
  productUnits,
  saveExtractedDocument,
  type DocumentWithLines,
} from './service';

/**
 * Siparişe yüklenmiş alış faturasını Belgeler'e işler.
 *
 * Siparişler sayfasında belge yüklenince arka planda, Belgeler'deki "Oku"
 * düğmesiyle de elle çalışır. Dosya kopyalanmaz: siparişin blob adresi paylaşılır
 * (fileShared). Aynı dosya başka bir siparişte zaten okunmuşsa yeniden okunmaz,
 * sipariş o belgeye eklenir ve belge kontrol için onay bekleyenlere döner. Okuma
 * sorunsuzsa (hiç uyarı yoksa) belge doğrudan onaylanır; aksi hâlde onay bekleyenlere düşer.
 */

export class IngestError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

// Gemini'nin okuyabildiği türler; Word / Excel belgeleri Belgeler'e işlenmez.
export const READABLE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

const listOf = (postings: string[]) => postings.join(', ') || '—';

/**
 * Aynı fatura dosyası başka bir siparişe yüklendiğinde ne olacağına karar verir.
 * Bir fatura, içindeki ürün adedinden fazla siparişe ait olamaz; bu durumda eklemek
 * kesin bir hatadır (yanlış dosya). Aksi hâlde sipariş eklenir ama sessizce değil:
 * belge kontrol için onay bekleyenlere alınır.
 */
export async function checkSharedInvoice(fileHash: string, postingNumber: string) {
  const doc = await prisma.accountingDocument.findUnique({
    where: { store_fileHash: { store: CURRENT_STORE, fileHash } },
    include: { lines: true },
  });
  if (!doc || doc.postingNumbers.includes(postingNumber)) return null;

  const label = doc.documentNo ?? doc.fileName;
  const units = productUnits(doc.lines);
  const blocked =
    units > 0 && doc.postingNumbers.length + 1 > units
      ? `Bu fatura (${label}) zaten ${listOf(doc.postingNumbers)} siparişine bağlı ve faturada ${units} ürün var; ${postingNumber} için yer yok. Yanlış dosyayı yüklemiş olabilirsiniz.`
      : null;
  const notice = `Bu fatura (${label}) ${listOf(doc.postingNumbers)} siparişine de bağlı. ${postingNumber} aynı belgeye eklendi; kontrol etmeniz için belge onay bekleyenlere alındı.`;
  return { doc, blocked, notice };
}

/** Uyarısız ve eksiksiz okunan belgeyi onaylar; onaylayamazsa belgeyi olduğu gibi döner. */
async function autoConfirmIfClean(doc: DocumentWithLines): Promise<DocumentWithLines> {
  const warnings = Array.isArray(doc.warnings) ? doc.warnings : [];
  const complete =
    !!doc.documentDate &&
    !!doc.currency &&
    doc.totalAmount != null &&
    doc.fxRate != null &&
    isCategorised({ category: doc.category, lines: doc.lines });
  if (warnings.length || !complete) return doc;
  return prisma.accountingDocument.update({
    where: { id: doc.id },
    data: { status: 'confirmed' },
    include: { lines: true },
  });
}

export async function ingestOrderDocument(
  postingNumber: string,
  { autoConfirm = true }: { autoConfirm?: boolean } = {}
): Promise<{ document: DocumentWithLines; merged: boolean }> {
  const order = await prisma.ozonOrder.findUnique({
    where: { postingNumber },
    select: { postingNumber: true, documentUrl: true, documentName: true, documentContentType: true, documentSize: true },
  });
  if (!order?.documentUrl) throw new IngestError(404, 'Siparişe yüklenmiş belge bulunamadı.');

  const already = await prisma.accountingDocument.findFirst({
    where: { store: CURRENT_STORE, postingNumbers: { has: order.postingNumber } },
    select: { id: true },
  });
  if (already) throw new IngestError(409, 'Bu siparişin belgesi zaten listede.', { existingId: already.id });

  const contentType = order.documentContentType || 'application/pdf';
  if (!READABLE_TYPES.has(contentType)) {
    throw new IngestError(415, 'Yalnızca PDF ve görsel belgeler okunabilir.');
  }

  const blobResult = await get(order.documentUrl, {
    access: 'private',
    token: process.env.BLOB_READ_WRITE_TOKEN || undefined,
  });
  if (!blobResult || blobResult.statusCode !== 200) throw new IngestError(502, 'Belge depodan okunamadı.');

  const buffer = Buffer.from(await new Response(blobResult.stream).arrayBuffer());
  const fileHash = createHash('sha256').update(buffer).digest('hex');

  // Aynı fatura başka bir siparişe de yüklenmişse (tek faturada iki siparişin ürünü)
  // yeniden okunmaz; bu sipariş mevcut belgeye eklenir ve belge kontrole düşer.
  const shared = await checkSharedInvoice(fileHash, order.postingNumber);
  if (shared) {
    if (shared.blocked) throw new IngestError(409, shared.blocked);
    const postingNumbers = [...shared.doc.postingNumbers, order.postingNumber];
    const previous = Array.isArray(shared.doc.warnings) ? (shared.doc.warnings as string[]) : [];
    const merged = await prisma.accountingDocument.update({
      where: { id: shared.doc.id },
      data: {
        postingNumbers,
        postingNumber: legacyPostingNumber(postingNumbers),
        status: 'draft',
        warnings: [
          ...previous,
          `${order.postingNumber} aynı fatura dosyasıyla eklendi (önceden ${listOf(shared.doc.postingNumbers)}); faturada bu siparişin de ürünü olduğunu kontrol edin.`,
        ],
      },
      include: { lines: true },
    });
    return { document: merged, merged: true };
  }

  let extracted: ExtractedDocument | null = null;
  let aiModel: string | null = null;
  const extraWarnings: string[] = [];
  try {
    const result = await extractDocument({ base64: buffer.toString('base64'), mimeType: contentType });
    extracted = result.data;
    aiModel = result.model;
  } catch (err) {
    console.error('Sipariş belgesi okunamadı:', postingNumber, err);
    extraWarnings.push('Belge otomatik okunamadı; bilgileri elle doldurun.');
  }

  if (extracted?.documentKind === 'income_report') {
    throw new IngestError(422, 'Bu bir gelir belgesi (satış / tazminat raporu); Belgeler sayfasına yüklenmez.');
  }
  if (isOtherStoreBuyer(extracted?.buyerName)) {
    throw new IngestError(422, `Bu belge diğer mağazaya ait (alıcı: ${extracted?.buyerName}).`);
  }
  if (extracted?.uncertainFields.length) {
    extraWarnings.push(`Emin olunamayan alanlar: ${extracted.uncertainFields.join(', ')}.`);
  }

  const saved = await saveExtractedDocument({
    extracted,
    aiModel,
    extraWarnings,
    postingNumber: order.postingNumber,
    file: {
      url: order.documentUrl,
      name: order.documentName || 'belge',
      contentType,
      size: order.documentSize ?? buffer.length,
      hash: fileHash,
      shared: true,
    },
  });

  return { document: autoConfirm ? await autoConfirmIfClean(saved) : saved, merged: false };
}
