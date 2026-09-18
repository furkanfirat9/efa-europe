import { NextRequest, NextResponse } from 'next/server';
import { fetchCategoryTree } from '@/lib/ozon/client';
import { OzonLanguage } from '@/lib/ozon/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const language = (searchParams.get('language') || 'TR') as OzonLanguage;

    const tree = await fetchCategoryTree(language);

    return NextResponse.json({
      success: true,
      language,
      totalRootCategories: tree.length,
      data: tree,
    });
  } catch (error: any) {
    console.error('Category tree API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Kategori ağacı alınırken bir hata oluştu.',
      },
      { status: 500 }
    );
  }
}
