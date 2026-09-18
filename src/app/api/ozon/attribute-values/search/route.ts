import { NextRequest, NextResponse } from 'next/server';
import { searchAttributeValues } from '@/lib/ozon/client';
import { OzonLanguage } from '@/lib/ozon/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('description_category_id');
    const typeId = searchParams.get('type_id');
    const attributeId = searchParams.get('attribute_id');
    const query = searchParams.get('query') || '';
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

    if (query.trim().length < 2) {
      return NextResponse.json({
        success: true,
        query,
        totalCount: 0,
        data: [],
      });
    }

    const results = await searchAttributeValues(
      Number(categoryId),
      Number(typeId),
      Number(attributeId),
      query,
      limit,
      language
    );

    return NextResponse.json({
      success: true,
      query,
      attribute_id: Number(attributeId),
      totalCount: results.length,
      data: results,
    });
  } catch (error: any) {
    console.error('Attribute search API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Sözlük araması yapılırken bir hata oluştu.',
      },
      { status: 500 }
    );
  }
}
