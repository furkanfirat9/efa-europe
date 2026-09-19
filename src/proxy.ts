import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readSessionToken, SESSION_COOKIE } from '@/lib/auth/session';

/**
 * Panelin giriş kapısı (Next 16'da middleware'in yeni adı: proxy).
 *
 * Oturumu olmayan istek hiçbir sayfaya ya da API ucuna ulaşamaz:
 *   - sayfa isteği → /login adresine yönlendirilir (nereye gitmek istediği korunur)
 *   - API isteği   → 401 ve kısa bir JSON hata
 *
 * Burada yalnızca çerezin imzası ve süresi kontrol edilir (veritabanına gidilmez).
 */

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout'];

const isPublic = (pathname: string) => PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (isPublic(pathname)) {
    // Girişi olan kullanıcı giriş sayfasına gelirse panele alınır.
    if (session && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (session) return NextResponse.next();

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
