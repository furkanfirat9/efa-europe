import { NextResponse } from 'next/server';
import { loadScanStatus } from '@/lib/sourcing/scanStatus';

export const dynamic = 'force-dynamic';

/** Tedarik taramalarının (Amazon.de, amazon.pl, Ceneo) son durumu. Salt okuma. */
export async function GET() {
  try {
    return NextResponse.json({ success: true, channels: await loadScanStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tarama durumu alınamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status: 500 });
  }
}
