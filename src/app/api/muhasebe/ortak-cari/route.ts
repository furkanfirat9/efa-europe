import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { CURRENT_STORE } from '@/lib/documents/service';
import { getPartnerLedger, isEntryKind } from '@/lib/accounting/partnerLedger';

/**
 * Ortak cari hesabı (331)
 *
 *   GET                                         → bakiye, kaynak toplamları ve tüm hareketler
 *   POST { kind, date, amountTry, description } → elle hareket ekle
 *   DELETE ?id=...                              → elle girilen hareketi sil
 */

const fail = (status: number, message: string) =>
  NextResponse.json({ success: false, error_message: message }, { status });

export async function GET() {
  try {
    return NextResponse.json({ success: true, ledger: await getPartnerLedger() });
  } catch (error: any) {
    console.error('API /muhasebe/ortak-cari GET Error:', error);
    return fail(500, error.message || 'Ortak cari hesabı alınamadı.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { kind, date, description } = body;
    const amountTry = Number(body.amountTry);

    if (!isEntryKind(kind)) return fail(400, 'Geçersiz hareket türü.');
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, 'Tarih gerekli.');
    if (!Number.isFinite(amountTry) || amountTry <= 0) return fail(400, 'Tutar sıfırdan büyük olmalı.');

    const entry = await prisma.partnerLedgerEntry.create({
      data: {
        store: CURRENT_STORE,
        kind,
        date: new Date(`${date}T00:00:00Z`),
        amountTry: Math.round(amountTry * 100) / 100,
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
      },
    });
    return NextResponse.json({ success: true, id: entry.id });
  } catch (error: any) {
    console.error('API /muhasebe/ortak-cari POST Error:', error);
    return fail(500, error.message || 'Hareket kaydedilemedi.');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return fail(400, 'id gerekli.');
    const { count } = await prisma.partnerLedgerEntry.deleteMany({ where: { id, store: CURRENT_STORE } });
    if (!count) return fail(404, 'Hareket bulunamadı.');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /muhasebe/ortak-cari DELETE Error:', error);
    return fail(500, error.message || 'Hareket silinemedi.');
  }
}
