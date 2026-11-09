import { getOzonHeaders, ozonFetch, type OzonStore } from './gate';

/* --------------------------------------------------------------------------
   Ozon kargo etiketi (FBS).

   Ozon, etiketi tek istekte PDF olarak veren `/v2/posting/fbs/package-label`
   ucunu ve eski görev uçlarını 2 Kasım 2026'da kapattı (önce 429, sonra
   400 "obsolete method cannot be used" döndü). Etiket artık iki adımda alınır:
   görev açılır, hazır olunca dosya adresi gelir.
-------------------------------------------------------------------------- */

/** Görev ölçümde ~2 sn'de bitiyor; form beklediği için toplam ~12 sn'den uzun beklenmez. */
const POLL_GAP_MS = 1500;
const MAX_POLLS = 8;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Etiket görevi süre içinde bitmedi: birazdan yeniden denenebilir. */
export class OzonLabelPendingError extends Error {
  constructor() {
    super('Ozon etiketi henüz hazır değil.');
    this.name = 'OzonLabelPendingError';
  }
}

interface LabelTask {
  task_id: number;
  /** `big_label`: olağan etiket, `small_label`: küçük etiket. */
  task_type: string;
}

interface LabelTaskState {
  error?: { code?: string; message?: string } | null;
  file_url?: string;
  status?: {
    code?: 'pending' | 'in_progress' | 'completed' | 'error' | string;
    unprinted_postings?: { message?: string; posting_number?: string }[];
  };
}

/**
 * Tek gönderinin etiket PDF'i. Gönderi "gönderime hazır" (`awaiting_deliver`) olmalıdır.
 * `maxRetries`: hız sınırında her çağrının yeniden deneme sayısı.
 */
export async function fetchPackageLabelPdf(
  postingNumber: string,
  store: OzonStore = 'store1',
  maxRetries?: number
): Promise<Buffer> {
  const headers = getOzonHeaders(store);

  const created = await ozonFetch<{ tasks?: LabelTask[] }>(
    '/v3/posting/fbs/package-label/create',
    { posting_numbers: [postingNumber] },
    headers,
    'POST',
    maxRetries
  );
  const tasks = created.tasks ?? [];
  // İki boy birden gelirse olağan etiket alınır; çoğu gönderide yalnız biri gelir.
  const task = tasks.find((t) => t.task_type === 'big_label') ?? tasks[0];
  if (!task) throw new Error('Ozon etiket görevi açmadı.');

  for (let poll = 0; poll < MAX_POLLS; poll++) {
    await sleep(POLL_GAP_MS);
    const state = await ozonFetch<LabelTaskState>(
      '/v2/posting/fbs/package-label/get',
      { task_id: task.task_id },
      headers,
      'POST',
      maxRetries
    );

    const unprinted = state.status?.unprinted_postings?.[0];
    if (state.status?.code === 'error' || state.error?.message || unprinted) {
      throw new Error(`Ozon etiketi üretemedi: ${unprinted?.message || state.error?.message || 'bilinmeyen hata'}`);
    }
    if (state.status?.code === 'completed' && state.file_url) {
      return downloadLabel(state.file_url);
    }
  }
  throw new OzonLabelPendingError();
}

/** Dosya Ozon'un depolama adresinden iner (seller-api değil, hız sınırı kapısına girmez). */
async function downloadLabel(fileUrl: string): Promise<Buffer> {
  const res = await fetch(fileUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Ozon etiket dosyası indirilemedi [${res.status}].`);
  const pdf = Buffer.from(await res.arrayBuffer());
  // PDF olmayan yanıt etiket diye saklanmasın: LS'ye boş ya da bozuk dosya giderdi.
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('Ozon etiket dosyası PDF değil.');
  return pdf;
}
