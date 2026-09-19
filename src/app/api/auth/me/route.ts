import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SESSION_COOKIE } from '@/lib/auth/session';

/** GET → oturumdaki kullanıcı adı (arayüzde göstermek için). */
export async function GET(request: NextRequest) {
  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ success: false, error_message: 'Oturum yok.' }, { status: 401 });
  }
  return NextResponse.json({ success: true, username: session.name });
}
