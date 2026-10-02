import { NextRequest, NextResponse } from 'next/server';
import { getValidDevice } from '@/lib/auth/guard';
import { DEVICE_COOKIE } from '@/lib/auth/session';

/** GET → tanıdık tarayıcıysa kullanıcı adı (giriş formunu önceden doldurmak için). */
export async function GET(request: NextRequest) {
  const device = await getValidDevice(request.cookies.get(DEVICE_COOKIE)?.value);
  return NextResponse.json({ success: true, username: device?.name ?? null });
}
