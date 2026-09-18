import { NextRequest, NextResponse } from 'next/server';
import { findOzonCategories } from '@/lib/ai/research';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body.query || body.productQuery;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Lütfen araştırılacak bir ürün adı veya model numarası giriniz.',
        },
        { status: 400 }
      );
    }

    const result = await findOzonCategories(query.trim());

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Category search error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Kategori tespiti sırasında hata oluştu.',
      },
      { status: 500 }
    );
  }
}
