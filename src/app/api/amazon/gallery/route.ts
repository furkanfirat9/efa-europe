import { NextRequest, NextResponse } from 'next/server';
import { fetchAmazonProductGallery } from '@/lib/amazon/amazonCrawler';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { asin, fallbackImage } = body;

    if (!asin || typeof asin !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Geçersiz ASIN kodu.' },
        { status: 400 }
      );
    }

    const images = await fetchAmazonProductGallery(asin.trim(), fallbackImage);

    return NextResponse.json({
      success: true,
      asin: asin.trim(),
      totalImages: images.length,
      images,
    });
  } catch (error: any) {
    console.error('Amazon gallery route error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Amazon galeri görselleri alınamadı.',
      },
      { status: 500 }
    );
  }
}
