import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getEcbEurUsd } from '@/lib/fx/ecb';
import { extractProductMeta } from '@/lib/orders/productMeta';
import { getOzonHeaders, ozonFetch, ozonFetchBuffer } from '@/lib/ozon/gate';

export const dynamic = 'force-dynamic';

/** LS formunun boş bırakılınca gönderdiği varsayılan koli; bu ölçülerle açılmış kayıt örnek alınmaz. */
const DEFAULT_PARCEL = { lengthMm: 300, widthMm: 200, heightMm: 150, weightGr: 1200 };

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

    // Ozon kargo etiketi: yalnız gönderime hazır siparişte basılabilir
    let label: { name: string; base64: string } | null = null;
    if (order.status === 'awaiting_deliver') {
      try {
        const pdf = await ozonFetchBuffer(
          '/v2/posting/fbs/package-label',
          { posting_number: [postingNumber] },
          getOzonHeaders('store1')
        );
        label = { name: `posting-label-${postingNumber}.pdf`, base64: pdf.toString('base64') };
      } catch (err) {
        console.warn('[Fulfillment] Etiket alınamadı:', err instanceof Error ? err.message : err);
        notes.push("Ozon etiketi alınamadı; PDF'i elle seçin.");
      }
    } else {
      notes.push('Sipariş Ozon\'da henüz paketlenmedi; etiket "gönderime hazır" olunca alınabilir.');
    }

    // Koli ölçüleri ve ağırlık
    let parcel: Parcel | null = null;
    if (offerId) {
      try {
        parcel = (await parcelFromPreviousTask(offerId, postingNumber)) ?? (await parcelFromOzonCard(offerId));
      } catch (err) {
        console.warn('[Fulfillment] Koli ölçüleri alınamadı:', err instanceof Error ? err.message : err);
      }
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
