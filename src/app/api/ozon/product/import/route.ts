import { NextRequest, NextResponse } from 'next/server';
import { importProductToOzon } from '@/lib/ozon/client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    if (!payload || !payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Geçersiz ürün yükleme paketi. "items" dizisi bulunamadı.',
        },
        { status: 400 }
      );
    }

    // Tüm öğelerin temel alan kontrolleri
    for (let i = 0; i < payload.items.length; i++) {
      const item = payload.items[i];

      // Ozon OfferId Kuralı: En fazla 50 karakter
      if (item.offer_id) {
        item.offer_id = String(item.offer_id).trim().slice(0, 50);
      }

      const itemLabel = `Ürün #${i + 1} (${item.offer_id || 'Model Belirtilmemiş'})`;

      if (!item.offer_id) {
        return NextResponse.json(
          { success: false, error: `${itemLabel}: Model Numarası / offer_id zorunludur.` },
          { status: 400 }
        );
      }
      if (!item.name) {
        return NextResponse.json(
          { success: false, error: `${itemLabel}: Rusça SEO Ürün Başlığı (name) zorunludur.` },
          { status: 400 }
        );
      }
      if (!item.price || Number(item.price) <= 0) {
        return NextResponse.json(
          { success: false, error: `${itemLabel}: Lütfen geçerli bir Satış Fiyatı ($) giriniz.` },
          { status: 400 }
        );
      }
      if (!item.primary_image) {
        return NextResponse.json(
          { success: false, error: `${itemLabel}: Lütfen en az bir Ana Görsel (primary_image) URL linki giriniz.` },
          { status: 400 }
        );
      }
    }

    const result = await importProductToOzon(payload);

    return NextResponse.json({
      success: true,
      taskId: result.taskId,
      message: `Ürün Ozon kuyruğuna başarıyla alındı! Görev ID: ${result.taskId}`,
    });
  } catch (error: any) {
    console.error('Ozon product import error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Ozon ürün yükleme isteği başarısız oldu.',
      },
      { status: 500 }
    );
  }
}
