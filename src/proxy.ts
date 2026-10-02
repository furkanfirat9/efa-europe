import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getValidSession } from '@/lib/auth/guard';
import { SESSION_COOKIE, sessionCookieOptions, sessionNeedsTouch, touchSessionToken } from '@/lib/auth/session';

/**
 * Panelin giriş kapısı (Next 16'da middleware'in yeni adı: proxy; Node.js üzerinde çalışır).
 *
 * Oturumu olmayan istek hiçbir sayfaya ya da API ucuna ulaşamaz:
 *   - sayfa isteği → /login adresine yönlendirilir (nereye gitmek istediği korunur)
 *   - API isteği   → 401 ve kısa bir JSON hata
 *
 * Oturum çerezinin imzası ve süresi kontrol edilir, ardından veritabanından oturumun
 * iptal edilip edilmediğine bakılır (guard.ts). Panel kullanıldıkça son işlem zamanı
 * birkaç dakikada bir yenilenir; 12 saat işlem olmazsa oturum kapanır.
 */

// /api/cron: Vercel Cron'un çerezi yoktur; bu adresler CRON_SECRET'ı kendileri kontrol eder.
// /api/hava-durumu: giriş sayfasının hava durumu; yalnızca herkese açık veri döner.
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/api/auth/device', '/api/hava-durumu', '/api/cron'];

const isPublic = (pathname: string) => PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  let session;
  try {
    session = await getValidSession(request.cookies.get(SESSION_COOKIE)?.value);
  } catch (error) {
    console.error('proxy: oturum kontrol edilemedi', error);
    return NextResponse.json(
      { success: false, error_message: 'Oturum kontrol edilemedi. Biraz sonra tekrar deneyin.' },
      { status: 503 }
    );
  }

  if (isPublic(pathname)) {
    // Girişi olan kullanıcı giriş sayfasına gelirse panele alınır.
    if (session && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (session) {
    const response = NextResponse.next();
    if (sessionNeedsTouch(session)) {
      response.cookies.set(SESSION_COOKIE, await touchSessionToken(session), sessionCookieOptions(session));
    }
    return response;
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, error_message: 'Oturum gerekli. Lütfen tekrar giriş yapın.' },
      { status: 401 }
    );
  }

  const loginUrl = new URL('/login', request.url);
  // Girişten sonra kullanıcının gitmek istediği sayfaya dönebilmek için.
  if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Statik dosyalar ve Next'in kendi varlıkları dışındaki her istek buradan geçer.
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|mjs|map|txt|xml|woff|woff2|ttf)$).*)'],
};
