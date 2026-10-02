import { NextRequest, NextResponse } from 'next/server';
import { buildProposals } from '@/lib/pricing/proposals';
import { OzonRateLimitError } from '@/lib/ozon/gate';

/**
 * Fiyat ve stok önerileri (salt okuma; Ozon'a hiçbir şey yazmaz).
 *   GET [?vat=net|gross] → { proposals, eurUsd, eurUsdDate, vatMode }
 *   vat verilmezse src/lib/pricing/rules.ts içindeki PRICING.vatMode kullanılır.
 * Kurallar: src/lib/pricing/rules.ts
 */
export async function GET(request: NextRequest) {
  try {
    const vat = request.nextUrl.searchParams.get('vat');
    const mode = vat === 'net' || vat === 'gross' ? vat : undefined;
    return NextResponse.json({ success: true, ...(await buildProposals(mode)) });
  } catch (error) {
    const status = error instanceof OzonRateLimitError ? 429 : 500;
    const message = error instanceof Error ? error.message : 'Öneriler hesaplanamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status });
  }
}
