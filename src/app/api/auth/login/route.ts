import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

/** POST { username, password } → oturum çerezi */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

// Aynı adresten art arda gelen denemeleri sınırlar (sunucu yeniden başlayınca sıfırlanır).
const attempts = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

// Kullanıcı adı yanlış olduğunda da şifre kontrolü kadar zaman harcanır; böylece
// yanıt süresinden kullanıcı adının var olup olmadığı anlaşılamaz.
let decoyHash: Promise<string> | null = null;
const getDecoyHash = () => (decoyHash ??= hashPassword('gecersiz-parola-ornegi'));

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
    if (tooManyAttempts(ip)) {
      return NextResponse.json(
        { success: false, error_message: 'Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin.' },
        { status: 429 }
      );
    }

    const { username, password } = await request.json();
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return NextResponse.json({ success: false, error_message: 'Kullanıcı adı ve şifre gerekli.' }, { status: 400 });
    }

    const user = await prisma.panelUser.findUnique({ where: { username: username.trim().toLowerCase() } });
    const valid = user
      ? await verifyPassword(password, user.passwordHash)
      : (await verifyPassword(password, await getDecoyHash()), false);

    if (!user || !valid) {
      return NextResponse.json({ success: false, error_message: 'Kullanıcı adı ya da şifre hatalı.' }, { status: 401 });
    }

    attempts.delete(ip);
    await prisma.panelUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const response = NextResponse.json({ success: true, username: user.username });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(user), sessionCookieOptions);
    return response;
  } catch (error: any) {
    console.error('API /api/auth/login Error:', error);
    return NextResponse.json(
      { success: false, error_message: 'Giriş yapılamadı: ' + (error.message || 'bilinmeyen hata') },
      { status: 500 }
    );
  }
}
