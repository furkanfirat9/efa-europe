import { NextRequest, NextResponse } from 'next/server';
import { fetchAttributeValues } from '@/lib/ozon/client';
import { OzonLanguage } from '@/lib/ozon/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('description_category_id');
    const typeId = searchParams.get('type_id');
    const attributeId = searchParams.get('attribute_id');
    const lastValueId = Number(searchParams.get('last_value_id') || '0');
    const limit = Number(searchParams.get('limit') || '50');
    const language = (searchParams.get('language') || 'TR') as OzonLanguage;

    if (!categoryId || !typeId || !attributeId) {
      return NextResponse.json(
        {
          success: false,
          error: 'description_category_id, type_id ve attribute_id parametreleri zorunludur.',
        },
        { status: 400 }
      );
    }

    const result = await fetchAttributeValues(
      Number(categoryId),
      Number(typeId),
      Number(attributeId),
      lastValueId,
      limit,
      language
    );

    return NextResponse.json({
      success: true,
      attribute_id: Number(attributeId),
      totalCount: result.length,
      data: result,
    });
  } catch (error: any) {
    console.error('Attribute values API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Sözlük değerleri alınırken bir hata oluştu.',
      },
      { status: 500 }
    );
  }
}
