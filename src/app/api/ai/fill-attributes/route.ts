import { NextRequest, NextResponse } from 'next/server';
import { deepCategoryProductResearch } from '@/lib/ai/research';
import { OzonLanguage } from '@/lib/ozon/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { categoryId, typeId, brand, modelNo, productQuery, language = 'RU', categoryName, typeName, asin } = body;

    if (!categoryId || !typeId) {
      return NextResponse.json(
        {
          success: false,
          error: 'categoryId ve typeId parametreleri zorunludur.',
        },
        { status: 400 }
      );
    }

    const result = await deepCategoryProductResearch(
      Number(categoryId),
      Number(typeId),
      brand || '',
      modelNo || '',
      productQuery || '',
      language as OzonLanguage,
      categoryName,
      typeName,
      asin || undefined
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Deep research attributes error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Nitelik odaklı derin araştırma sırasında hata oluştu.',
      },
      { status: 500 }
    );
  }
}
