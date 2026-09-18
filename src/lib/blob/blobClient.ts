import { put, del } from '@vercel/blob';

/**
 * Uploads a PDF label to Vercel Blob storage
 * @param fileName File name with .pdf extension
 * @param data Buffer or Base64 string
 * @returns Public URL of the uploaded blob
 */
export async function uploadLabelPdf(
  fileName: string,
  data: Buffer | string
): Promise<{ url: string; pathname: string }> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');
  
  // Clean filename and ensure .pdf
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const blobPath = `labels/${Date.now()}-${safeName}`;

  const token = process.env.BLOB_READ_WRITE_TOKEN;

  const blob = await put(blobPath, buffer, {
    access: 'private',
    contentType: 'application/pdf',
    token: token || undefined,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
  };
}

/**
 * Deletes a file from Vercel Blob storage
 * @param url The full URL of the blob to delete
 */
export async function deleteLabelPdf(url: string): Promise<void> {
  try {
    if (url && (url.includes('.blob.vercel-storage.com'))) {
      await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN || undefined });
    }
  } catch (err) {
    console.error('Failed to delete blob:', url, err);
  }
}
