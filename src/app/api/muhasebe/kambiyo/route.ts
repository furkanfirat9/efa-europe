import { NextRequest, NextResponse } from 'next/server';
import { getFxLoss } from '@/lib/accounting/fxLoss';

/** GET ?year=2026&month=10 → ayın kambiyo zararı (kart kuru − faturanın TCMB kuru) */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const year = Number(params.get('year'));
    const month = Number(params.get('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ success: false, error_message: 'Geçerli bir yıl ve ay gerekli.' }, { status: 400 });
    }
    return NextResponse.json({ success: true, ...(await getFxLoss(year, month)) });
  } catch (error: any) {
    console.error('API /muhasebe/kambiyo GET Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Kambiyo zararı hesaplanamadı.' },
      { status: 500 }
    );
  }
}
