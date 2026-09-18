import { NextRequest, NextResponse } from 'next/server';
import { fetchCategoryAttributes } from '@/lib/ozon/client';
import { OzonLanguage } from '@/lib/ozon/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('description_category_id');
    const typeId = searchParams.get('type_id');
    const language = (searchParams.get('language') || 'TR') as OzonLanguage;

    if (!categoryId || !typeId) {
      return NextResponse.json(
        {
          success: false,
          error: 'description_category_id ve type_id parametreleri zorunludur.',
        },
        { status: 400 }
      );
    }

    const attributes = await fetchCategoryAttributes(
      Number(categoryId),
      Number(typeId),
      language
    );

    return NextResponse.json({
      success: true,
      description_category_id: Number(categoryId),
      type_id: Number(typeId),
      totalAttributes: attributes.length,
      requiredAttributesCount: attributes.filter((a) => a.is_required).length,
      data: attributes,
    });
  } catch (error: any) {
    console.error('Category attributes API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Nitelikler alınırken bir hata oluştu.',
      },
      { status: 500 }
    );
  }
}
