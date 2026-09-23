import { NextRequest, NextResponse } from 'next/server';
import {
  getAllCatalogMemory,
  saveProductToMemory,
  findRelevantCatalogMemory,
  deleteCatalogMemory,
} from '@/lib/db/catalogMemory';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get('brand');
    const categoryId = searchParams.get('categoryId');
    const typeId = searchParams.get('typeId');
    const query = searchParams.get('query');

    if (brand || categoryId) {
      const records = await findRelevantCatalogMemory(
        brand || '',
        categoryId ? parseInt(categoryId, 10) : undefined,
        typeId ? parseInt(typeId, 10) : undefined,
        query || undefined
      );
      return NextResponse.json({ success: true, count: records.length, data: records });
    }

    const allRecords = await getAllCatalogMemory();
    return NextResponse.json({ success: true, count: allRecords.length, data: allRecords });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.brand || !body.modelNo || !body.seriesMergeCode) {
      return NextResponse.json(
        { success: false, error: 'Marka, Model No ve Kart Birleştirici Kod (seriesMergeCode) zorunludur.' },
        { status: 400 }
      );
    }

    const saved = await saveProductToMemory(body);
    return NextResponse.json({ success: true, data: saved });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID parametresi zorunludur.' }, { status: 400 });
    }

    const deleted = await deleteCatalogMemory(id);
    return NextResponse.json({ success: deleted });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
