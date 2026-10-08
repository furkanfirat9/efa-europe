import { NextRequest, NextResponse } from 'next/server';
import { IssueError, issueInvoice } from '@/lib/efatura/issue';

/**
 * Siparişin e-Arşiv faturasını keser.
 *
 *   POST { postingNumber } → { issue }
 *
 * Aynı sipariş için ikinci fatura kesilmez (bkz. issueInvoice).
 */
export async function POST(request: NextRequest) {
  try {
    const { postingNumber } = await request.json().catch(() => ({}));
    if (typeof postingNumber !== 'string' || !postingNumber.trim()) {
      return NextResponse.json({ success: false, error_message: 'Gönderi numarası gerekli.' }, { status: 400 });
    }
    const issue = await issueInvoice(postingNumber.trim());
    return NextResponse.json({
      success: true,
      issue: { invoiceNo: issue.invoiceNo, providerStatus: issue.providerStatus, transliterated: issue.transliterated },
    });
  } catch (error: any) {
    if (error instanceof IssueError) {
      return NextResponse.json({ success: false, error_message: error.message }, { status: 422 });
    }
    console.error('API /api/fatura/kes POST Error:', error);
    return NextResponse.json(
      { success: false, error_message: 'Fatura kesilemedi: ' + (error.message || 'bilinmeyen hata') },
      { status: 500 }
    );
  }
}
