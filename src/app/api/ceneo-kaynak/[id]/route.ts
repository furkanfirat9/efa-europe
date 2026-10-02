import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/**
 * Ceneo onay ekranındaki kararı yazar. Kararlar sonraki taramalarda korunur:
 * MANUAL ürün aranmaz, yalnızca teklifleri tazelenir; NOT_IN_POLAND ürün taranmaz.
 *
 *   PATCH { action: 'approve', ceneoId }    → adaylardan bu Ceneo ürünü doğru
 *   PATCH { action: 'set-id', ceneoId }     → doğru Ceneo ürünü bu (numara ya da ceneo.pl linki)
 *   PATCH { action: 'reject', ceneoId }     → bu aday yanlış; aday kalmazsa ürün yeniden aranır
 *   PATCH { action: 'not-in-poland' }       → ürün Ceneo'da yok; kaynak Amazon.de / amazon.pl
 */

const fail = (status: number, message: string) =>
  NextResponse.json({ success: false, error_message: message }, { status });

interface Candidate {
  id: string;
  name?: string | null;
}

// Başka Ceneo ürününe ait teklifler yeni eşleşmeyle karışmasın; bir sonraki taramada dolar.
const CLEARED_OFFERS = {
  ceneoMatchedCode: null,
  ceneoWeightG: null,
  ceneoOffers: Prisma.DbNull,
};

/** "192123361" ya da "https://www.ceneo.pl/192123361#tab=…" → "192123361" */
function parseCeneoId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  return s.match(/ceneo\.pl\/(\d+)/)?.[1] ?? (/^\d{4,12}$/.test(s) ? s : null);
}

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/ceneo-kaynak/[id]'>) {
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const row = await prisma.productSource.findUnique({ where: { id } });
    if (!row) return fail(404, 'Ürün bulunamadı.');

    const candidates = (Array.isArray(row.ceneoCandidates) ? row.ceneoCandidates : []) as unknown as Candidate[];
    const ceneoId = parseCeneoId(body.ceneoId);
    let data: Prisma.ProductSourceUpdateInput;

    if (body.action === 'approve') {
      const cand = candidates.find((c) => c.id === ceneoId);
      if (!cand) return fail(400, 'Bu aday ürünün listesinde yok.');
      data = { ...CLEARED_OFFERS, ceneoStatus: 'MANUAL', ceneoProductId: cand.id, ceneoName: cand.name ?? null };
    } else if (body.action === 'set-id') {
      if (!ceneoId) return fail(400, 'Ceneo ürün numarası ya da ceneo.pl linki girin (ör. 192123361).');
      const cand = candidates.find((c) => c.id === ceneoId);
      data = { ...CLEARED_OFFERS, ceneoStatus: 'MANUAL', ceneoProductId: ceneoId, ceneoName: cand?.name ?? null };
    } else if (body.action === 'reject') {
      const rest = candidates.filter((c) => c.id !== ceneoId);
      if (rest.length === candidates.length) return fail(400, 'Bu aday ürünün listesinde yok.');
      data = {
        ceneoCandidates: rest.length ? (rest as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        ...(rest.length ? {} : { ceneoStatus: null }),
      };
    } else if (body.action === 'not-in-poland') {
      data = { ...CLEARED_OFFERS, ceneoStatus: 'NOT_IN_POLAND', ceneoProductId: null, ceneoName: null, ceneoCandidates: Prisma.DbNull };
    } else {
      return fail(400, 'Geçersiz işlem.');
    }

    const updated = await prisma.productSource.update({ where: { id }, data });
    return NextResponse.json({ success: true, row: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Karar kaydedilemedi.';
    return NextResponse.json({ success: false, error_message: message }, { status: 500 });
  }
}
