import { NextResponse } from 'next/server';
import { listInvoiceOrders } from '@/lib/efatura/issue';

/**
 * Fatura oluştur sayfasının listesi
 *
 *   GET → { env, startDate, pending, invoiced }
 *
 * Başlangıç gününden sonraki, iptal edilmemiş her sipariş faturası kesilene kadar
 * "pending"de durur. İşlenmekte olan faturaların Trendyol durumu burada güncellenir.
 */
export async function GET() {
  try {
    return NextResponse.json({ success: true, ...(await listInvoiceOrders()) });
  } catch (error: any) {
    console.error('API /api/fatura GET Error:', error);
    return NextResponse.json(
      { success: false, error_message: 'Siparişler alınamadı: ' + (error.message || 'bilinmeyen hata') },
      { status: 500 }
    );
  }
}
