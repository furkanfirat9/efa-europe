import { NextRequest, NextResponse } from 'next/server';
import {
  checkDuplicateProduct,
  checkBulkDuplicates,
  syncOzonCatalogFromApi,
  getOzonLiveCatalog,
} from '@/lib/ozon/duplicateChecker';
import { loadCatalogMemory } from '@/lib/db/catalogMemory';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, queries, modelNo, brand, sync } = body;

    // Eğer sync: true istenmişse veya önbellek boşsa senkronize et
    let liveCatalog = getOzonLiveCatalog();
    if (sync || liveCatalog.length === 0) {
      liveCatalog = await syncOzonCatalogFromApi();
    }

    const memoryRecords = await loadCatalogMemory();

    // Toplu kontrol (Bulk)
    if (Array.isArray(queries) && queries.length > 0) {
      const results = checkBulkDuplicates(queries, memoryRecords);
      const duplicateCount = results.filter((r) => r.result.isDuplicate).length;
      return NextResponse.json({
        success: true,
        isBulk: true,
        totalChecked: queries.length,
        duplicateCount,
        results,
      });
    }

    // Tekli kontrol (Single)
    if (!query && !modelNo) {
      return NextResponse.json(
        { success: false, error: 'query veya modelNo parametresi gereklidir.' },
        { status: 400 }
      );
    }

    const matchResult = checkDuplicateProduct(query || modelNo || '', modelNo, brand, memoryRecords);

    return NextResponse.json({
      success: true,
      data: matchResult,
    });
  } catch (error: any) {
    console.error('Check duplicate error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Mükerrer kontrolü sırasında hata oluştu.' },
      { status: 500 }
    );
  }
}
