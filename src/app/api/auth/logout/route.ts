import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getValidSession } from '@/lib/auth/guard';
import { clearedCookieOptions, DEVICE_COOKIE, SESSION_COOKIE } from '@/lib/auth/session';

/**
 * POST              → bu tarayıcının oturum çerezini siler (tanıdık tarayıcı kalır)
 * POST { all: true } → kullanıcının oturum sürümünü artırır: bütün cihazlardaki oturum
 *                      ve tanıdık tarayıcı çerezleri geçersiz olur, bu tarayıcı dahil.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const all = body?.all === true;

  if (all) {
    const session = await getValidSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ success: false, error_message: 'Oturum gerekli.' }, { status: 401 });
    }
    await prisma.panelUser.update({ where: { id: session.uid }, data: { sessionVersion: { increment: 1 } } });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, '', clearedCookieOptions);
  if (all) response.cookies.set(DEVICE_COOKIE, '', clearedCookieOptions);
  return response;
}
