import { NextResponse } from 'next/server';
import { getLSSettings } from '@/lib/fulfillment/client';

export async function GET() {
  try {
    const data = await getLSSettings();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API /fulfillment/settings Error:', error);
    return NextResponse.json(
      { success: false, error_message: error.message || 'Depo ayarları alınamadı.' },
      { status: 500 }
    );
  }
}
