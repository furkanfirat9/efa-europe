import { NextRequest, NextResponse } from 'next/server';
import { getProductImportInfo } from '@/lib/ozon/client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId } = body;

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'taskId parametresi zorunludur.' },
        { status: 400 }
      );
    }

    const result = await getProductImportInfo(Number(taskId));

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Get import info error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Yükleme durumu sorgulanamadı.',
      },
      { status: 500 }
    );
  }
}
