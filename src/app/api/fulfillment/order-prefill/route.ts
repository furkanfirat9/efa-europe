import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getEcbEurUsd } from '@/lib/fx/ecb';
import { extractProductMeta } from '@/lib/orders/productMeta';
import { getOzonHeaders, ozonFetch, OzonRateLimitError } from '@/lib/ozon/gate';
import { fetchPackageLabelPdf, OzonLabelPendingError } from '@/lib/ozon/packageLabel';

export const dynamic = 'force-dynamic';

/** LS formunun boş bırakılınca gönderdiği varsayılan koli; bu ölçülerle açılmış kayıt örnek alınmaz. */
const DEFAULT_PARCEL = { lengthMm: 300, widthMm: 200, heightMm: 150, weightGr: 1200 };

/** Hız sınırında her etiket çağrısı en çok 2 kez yeniden denenir (5 denemede ~40 sn dönüyordu). */
const LABEL_MAX_RETRIES = 2;

interface Parcel {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  weightGr: number;
  /** Ekranda gösterilecek kaynak açıklaması */
  source: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Aynı ürünle daha önce açılmış sevkiyat görevi: elle ölçülüp girilmiş gerçek koli. */
async function parcelFromPreviousTask(offerId: string, postingNumber: string): Promise<Parcel | null> {
  const sameProduct = await prisma.ozonOrder.findMany({
    where: { productOfferId: offerId, postingNumber: { not: postingNumber } },
    select: { postingNumber: true },
  });
  if (sameProduct.length === 0) return null;

  const tasks = await prisma.arbitrageOrder.findMany({
    where: { ozonOrderId: { in: sameProduct.map((o) => o.postingNumber) } },
    orderBy: { createdAt: 'desc' },
  });
  const task = tasks.find(
    (t) =>
      t.lengthMm !== DEFAULT_PARCEL.lengthMm ||
      t.widthMm !== DEFAULT_PARCEL.widthMm ||
      t.heightMm !== DEFAULT_PARCEL.heightMm ||
      t.weightGr !== DEFAULT_PARCEL.weightGr
  );
  if (!task) return null;

  return {
    lengthMm: task.lengthMm,
    widthMm: task.widthMm,
    heightMm: task.heightMm,
    weightGr: task.weightGr,
    source: `${task.ozonOrderId} görevinden (${task.createdAt.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })})`,
  };
}

/** Ozon kartındaki paket ölçüleri ve ağırlığı. */
async function parcelFromOzonCard(offerId: string): Promise<Parcel | null> {
  const res = await ozonFetch<{
    result: {
      depth: number;
      width: number;
      height: number;
      dimension_unit: string;
      weight: number;
      weight_unit: string;
    }[];
  }>('/v4/product/info/attributes', { filter: { offer_id: [offerId], visibility: 'ALL' }, limit: 1 }, getOzonHeaders('store1'));

  const card = res.result?.[0];
  if (!card || !card.depth || !card.width || !card.height || !card.weight) return null;

  const mm = (v: number) => Math.round(card.dimension_unit === 'cm' ? v * 10 : card.dimension_unit === 'in' ? v * 25.4 : v);
  const grams = Math.round(card.weight_unit === 'kg' ? card.weight * 1000 : card.weight_unit === 'lb' ? card.weight * 453.592 : card.weight);
  return { lengthMm: mm(card.depth), widthMm: mm(card.width), heightMm: mm(card.height), weightGr: grams, source: 'Ozon kartından' };
}

/** Ozon kargo etiketi. Form beklediği için kısa denenir; alınamazsa kullanıcı PDF'i elle seçer. */
async function fetchLabel(postingNumber: string, status: string | null): Promise<{ name: string; base64: string } | null> {
  if (status !== 'awaiting_deliver') return null;
  const pdf = await fetchPackageLabelPdf(postingNumber, 'store1', LABEL_MAX_RETRIES);
  return { name: `posting-label-${postingNumber}.pdf`, base64: pdf.toString('base64') };
}

/**
 * GET /api/fulfillment/order-prefill?postingNumber=…
 *
 * Sipariş seçicide seçilen siparişin sevkiyat formuna gelen bilgileri: beyan değeri (satış $ ÷ ECB EUR/USD),
 * Ozon kargo etiketi (sipariş "gönderime hazır" ise) ve koli ölçüleri/ağırlığı (aynı ürünün önceki
 * görevinden, yoksa Ozon kartından). Hiçbir şeyi kaydetmez ve LS'ye göndermez; form yine elle gönderilir.
 */
export async function GET(request: NextRequest) {
  try {
    const postingNumber = request.nextUrl.searchParams.get('postingNumber')?.trim();
    if (!postingNumber) {
      return NextResponse.json({ success: false, error_message: 'Sipariş numarası eksik.' }, { status: 400 });
    }

    const order = await prisma.ozonOrder.findUnique({ where: { postingNumber } });
    if (!order || order.storeId !== 'store1') {
      return NextResponse.json({ success: false, error_message: 'Sipariş bulunamadı.' }, { status: 404 });
    }

    const notes: string[] = [];
    const { offerId } = extractProductMeta(order);

    // Beyan değeri
    let declaredValueEur: number | null = null;
    let ecb: { rate: number; date: string } | null = null;
    try {
      ecb = await getEcbEurUsd();
      declaredValueEur = round2((Number(order.totalPrice) || 0) / ecb.rate);
    } catch {
      notes.push('ECB kuru alınamadı; beyan değerini elle girin.');
    }

    // Etiket ve koli ölçüleri birbirini beklemez: etiket ucu sınıra takılınca koli de gecikiyordu.
    const [labelResult, parcelResult] = await Promise.allSettled([
      fetchLabel(postingNumber, order.status),
      offerId ? parcelFromPreviousTask(offerId, postingNumber).then((p) => p ?? parcelFromOzonCard(offerId)) : null,
    ]);

    // Ozon kargo etiketi: yalnız gönderime hazır siparişte basılabilir
    let label: { name: string; base64: string } | null = null;
    if (order.status !== 'awaiting_deliver') {
      notes.push('Sipariş Ozon\'da henüz paketlenmedi; etiket "gönderime hazır" olunca alınabilir.');
    } else if (labelResult.status === 'fulfilled') {
      label = labelResult.value;
    } else {
      console.warn('[Fulfillment] Etiket alınamadı:', labelResult.reason instanceof Error ? labelResult.reason.message : labelResult.reason);
      notes.push(
        labelResult.reason instanceof OzonRateLimitError
          ? "Ozon etiket servisi şu an yanıt vermiyor; PDF'i elle seçin ya da birazdan siparişi yeniden seçin."
          : labelResult.reason instanceof OzonLabelPendingError
            ? "Ozon etiketi henüz hazırlamadı; birazdan siparişi yeniden seçin ya da PDF'i elle seçin."
            : "Ozon etiketi alınamadı; PDF'i elle seçin."
      );
    }

    // Koli ölçüleri ve ağırlık
    let parcel: Parcel | null = null;
    if (parcelResult.status === 'fulfilled') {
      parcel = parcelResult.value;
    } else {
      console.warn('[Fulfillment] Koli ölçüleri alınamadı:', parcelResult.reason instanceof Error ? parcelResult.reason.message : parcelResult.reason);
    }
    if (!parcel) notes.push('Koli ölçüleri bulunamadı; elle girin.');

    return NextResponse.json({ success: true, postingNumber, declaredValueEur, ecb, label, parcel, notes });
  } catch (error: any) {
    console.error('API /fulfillment/order-prefill Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Sipariş bilgileri alınamadı.' },
      { status: 500 }
    );
  }
}
