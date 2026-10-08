import { put } from '@vercel/blob';
import { PAYOUT_STORE } from '@/lib/ozon/payouts';

// Vercel fonksiyonlarında istek gövdesi 4,5 MB ile sınırlı.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

export const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN || undefined;

export interface ReceiptFields {
  receivedTry: number;
  receivedAt: Date;
  bankReference: string | null;
  receipt: { receiptUrl: string; receiptName: string; receiptContentType: string; receiptSize: number } | null;
}

/**
 * Dekont formunu (receivedTry, receivedAt, bankReference?, file?) doğrular; dosya varsa
 * private Blob'a yükler. Hata metni kullanıcıya gösterilecek biçimdedir.
 */
export async function readReceiptForm(form: FormData): Promise<ReceiptFields | { error: string }> {
  const receivedTry = Number(form.get('receivedTry'));
  const receivedAt = String(form.get('receivedAt') ?? '');
  const bankReference = String(form.get('bankReference') ?? '').trim() || null;
  if (!Number.isFinite(receivedTry) || receivedTry <= 0) return { error: 'Gelen TL tutarı gerekli.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedAt)) return { error: 'Geliş tarihi gerekli.' };

  const file = form.get('file');
  let receipt: ReceiptFields['receipt'] = null;
  if (file instanceof File && file.size > 0) {
    const contentType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
    if (!ALLOWED_TYPES.has(contentType)) return { error: 'Dekont PDF ya da görsel olmalı.' };
    if (file.size > MAX_BYTES) return { error: 'Dosya 4 MB’tan büyük olamaz.' };
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const blob = await put(`ozon-payouts/${PAYOUT_STORE}/${Date.now()}-${safeName}`, Buffer.from(await file.arrayBuffer()), {
      access: 'private',
      contentType,
      token: blobToken(),
    });
    receipt = { receiptUrl: blob.url, receiptName: file.name, receiptContentType: contentType, receiptSize: file.size };
  }

  return {
    receivedTry: Math.round(receivedTry * 100) / 100,
    receivedAt: new Date(`${receivedAt}T00:00:00Z`),
    bankReference,
    receipt,
  };
}
