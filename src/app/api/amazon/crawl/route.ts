import { NextRequest, NextResponse } from 'next/server';
import { crawlAmazonProducts } from '@/lib/amazon/amazonCrawler';
import { AmazonCrawlOptions, MAX_PURCHASE_EUR } from '@/lib/amazon/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body: AmazonCrawlOptions = await request.json();
    const brand = (body.brand || '').trim();
    const keyword = (body.keyword || '').trim();

    if (!brand && !keyword && !body.customUrl) {
      return NextResponse.json(
        { success: false, totalFound: 0, pagesScanned: 0, items: [], error: 'Bir marka ya da arama kelimesi girin.' },
        { status: 400 }
      );
    }

    const result = await crawlAmazonProducts({
      brand,
      keyword,
      category: body.category || 'all',
      maxPages: Number(body.maxPages) || 1,
      maxItems: body.maxItems !== undefined ? Number(body.maxItems) : 5,
      maxPriceEur: Math.min(Number(body.maxPriceEur) || MAX_PURCHASE_EUR, MAX_PURCHASE_EUR),
      hideExistingOzon: body.hideExistingOzon !== undefined ? Boolean(body.hideExistingOzon) : false,
      customUrl: body.customUrl,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Amazon crawl API error:', error);
    return NextResponse.json(
      {
        success: false,
        totalFound: 0,
        pagesScanned: 0,
        items: [],
        error: error.message || 'Amazon ürün taraması sırasında hata oluştu.',
      },
      { status: 500 }
    );
  }
}
