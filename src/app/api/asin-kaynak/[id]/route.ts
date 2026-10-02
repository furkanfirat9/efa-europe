import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/**
 * Onay ekranındaki kararı yazar. Kararlar sonraki taramalarda korunur:
 * asin_source_import.mjs `linkMethod: 'manual'` kayıtların ASIN'ini ve durumunu değiştirmez,
 * yalnızca Amazon fiyat/stok alanlarını tazeler.
 *
 *   PATCH { action: 'approve' }                  → bağlı ASIN doğru
 *   PATCH { action: 'set-asin', asin: 'B0…' }    → doğru ASIN bu
 *   PATCH { action: 'not-on-amazon' }            → ürün Amazon'da satılmıyor
 */

const fail = (status: number, message: string) =>
  NextResponse.json({ success: false, error_message: message }, { status });

// Başka ASIN'e ait Amazon bilgisi yeni ASIN'le karışmasın; bir sonraki taramada dolar.
const CLEARED_AMAZON = {
  checks: Prisma.DbNull,
  amzTitle: null,
  amzBrand: null,
  amzModel: null,
  amzImage: null,
  priceNetEur: null,
  priceGrossEur: null,
  listPriceEur: null,
  availability: null,
  inStock: null,
  soldBy: null,
  soldByAmazon: null,
  deliveryText: null,
  checkedAt: null,
};

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/asin-kaynak/[id]'>) {
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const row = await prisma.productSource.findUnique({ where: { id } });
    if (!row) return fail(404, 'Ürün bulunamadı.');

    const now = new Date();
    let data;
    if (body.action === 'approve') {
      if (!row.asin) return fail(400, 'Bu ürüne bağlı ASIN yok; önce ASIN girin.');
      data = { asinStatus: 'MANUAL', linkMethod: 'manual', verifiedAt: now };
    } else if (body.action === 'set-asin') {
      const asin = typeof body.asin === 'string' ? body.asin.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{10}$/.test(asin)) return fail(400, 'ASIN 10 karakter olmalı (ör. B0DKKL9152).');
      data = { ...CLEARED_AMAZON, asin, asinStatus: 'MANUAL', linkMethod: 'manual', verifiedAt: now };
    } else if (body.action === 'not-on-amazon') {
      data = { ...CLEARED_AMAZON, asin: null, asinStatus: 'NOT_ON_AMAZON', linkMethod: 'manual', verifiedAt: now };
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
