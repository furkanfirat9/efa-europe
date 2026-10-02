import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { getValidDevice } from '@/lib/auth/guard';
import { checkLimit, recordAttempt, type LimitKey, type LimitState } from '@/lib/auth/loginLimit';
import {
  createDeviceToken,
  createSessionToken,
  DEVICE_COOKIE,
  deviceCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/session';

/** POST { username, password } → oturum çerezi + tanıdık tarayıcı çerezi */

// Kullanıcı adı yanlış olduğunda da şifre kontrolü kadar zaman harcanır; böylece
// yanıt süresinden kullanıcı adının var olup olmadığı anlaşılamaz.
let decoyHash: Promise<string> | null = null;
const getDecoyHash = () => (decoyHash ??= hashPassword('gecersiz-parola-ornegi'));

function lockedResponse(limit: LimitState) {
  const retryAfter = Math.ceil(limit.retryAfterMs / 1000);
  return NextResponse.json(
    { success: false, error_message: 'Çok fazla hatalı deneme yapıldı.', retry_after: retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';

    const { username: rawUsername, password } = await request.json();
    if (typeof rawUsername !== 'string' || typeof password !== 'string' || !rawUsername.trim() || !password) {
      return NextResponse.json({ success: false, error_message: 'Kullanıcı adı ve şifre gerekli.' }, { status: 400 });
    }
    const username = rawUsername.trim().toLowerCase();

    const user = await prisma.panelUser.findUnique({ where: { username } });

    // Bu hesaba daha önce giriş yapmış tarayıcı yalnızca kendi sayacına bakar.
    const device = await getValidDevice(request.cookies.get(DEVICE_COOKIE)?.value);
    const knownDevice = device && user && device.uid === user.id ? device : null;
    const keys: LimitKey[] = knownDevice ? [{ deviceId: knownDevice.did }] : [{ ip }, { username }];

    const before = await checkLimit(keys);
    if (before.retryAfterMs > 0) return lockedResponse(before);

    const valid = user
      ? await verifyPassword(password, user.passwordHash)
      : (await verifyPassword(password, await getDecoyHash()), false);

    await recordAttempt({ ip, username, deviceId: knownDevice?.did ?? null, success: Boolean(user && valid) });

    if (!user || !valid) {
      const after = await checkLimit(keys);
      if (after.retryAfterMs > 0) return lockedResponse(after);
      return NextResponse.json(
        { success: false, error_message: 'Kullanıcı adı ya da şifre hatalı.', remaining: after.remaining },
        { status: 401 }
      );
    }

    await prisma.panelUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const response = NextResponse.json({ success: true, username: user.username });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(user), sessionCookieOptions());
    // Tarayıcı aynı kimliği korur; süresi her girişte 90 gün uzar.
    response.cookies.set(
      DEVICE_COOKIE,
      await createDeviceToken(user, knownDevice?.did ?? randomUUID()),
      deviceCookieOptions
    );
    return response;
  } catch (error: any) {
    console.error('API /api/auth/login Error:', error);
    return NextResponse.json(
      { success: false, error_message: 'Giriş yapılamadı: ' + (error.message || 'bilinmeyen hata') },
      { status: 500 }
    );
  }
}
