import { NextRequest, NextResponse } from 'next/server';
import { fetchCategoryAttributes, fetchAttributeValues } from '@/lib/ozon/client';
import { isWarrantyAttribute, isMergeWithSimilarAttribute } from '@/lib/ai/filler';

export const dynamic = 'force-dynamic';

interface PrewarmItem {
  categoryId: number;
  typeId: number;
}

/**
 * 🚀 Ozon Kategori Şema ve Sözlüklerini RAM'e Önceden Yükleyen Hızlandırıcı (Cache Pre-warmer)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const categories: PrewarmItem[] = body.categories || [];

    if (categories.length === 0) {
      return NextResponse.json({ success: true, prewarmed: 0 });
    }

    // Benzersiz Kategori Çiftlerini Ayıkla
    const uniqueKeys = new Map<string, PrewarmItem>();
    for (const c of categories) {
      if (c.categoryId && c.typeId) {
        const key = `${c.categoryId}_${c.typeId}`;
        if (!uniqueKeys.has(key)) {
          uniqueKeys.set(key, c);
        }
      }
    }

    const uniqueList = Array.from(uniqueKeys.values());

    // Arka planda tüm benzersiz kategorilerin nitelik ve sözlüklerini RAM'e ısıt
    await Promise.all(
      uniqueList.map(async (item) => {
        try {
          const attributes = await fetchCategoryAttributes(item.categoryId, item.typeId, 'TR');
          
          // Sözlüklü olanların ilk 25 seçeneğini de RAM'e çek
          const dictPromises = attributes.map(async (attr) => {
            if (
              attr.dictionary_id > 0 &&
              attr.id !== 85 &&
              attr.dictionary_id !== 28732849 &&
              !isWarrantyAttribute(attr) &&
              !isMergeWithSimilarAttribute(attr)
            ) {
              try {
                await fetchAttributeValues(item.categoryId, item.typeId, attr.id, 0, 25, 'RU');
              } catch (e) {}
            }
          });

          await Promise.all(dictPromises);
        } catch (err) {
          console.warn(`[Prewarm Warning] Category ${item.categoryId}/${item.typeId} could not be fully prewarmed:`, err);
        }
      })
    );

    return NextResponse.json({
      success: true,
      prewarmed: uniqueList.length,
      message: `${uniqueList.length} adet kategori şeması ve sözlüğü RAM hafızasına başarıyla önceden yüklendi.`,
    });
  } catch (error: any) {
    console.error('Prewarm error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
