import { prisma } from '@/lib/db/prisma';
import { readDeviceToken, readSessionToken, type DevicePayload, type SessionPayload } from './session';

/**
 * Çerezin imzası ve süresi yetmez: kullanıcı silinmiş ya da oturum sürümü artmışsa
 * ("Tüm cihazlardan çık", şifre değişikliği) çerez geçersizdir. Bu kontrol her istekte
 * veritabanına sorulur; panelin 1-2 kullanıcısı için yükü önemsizdir ve iptal anında işler.
 */

async function currentVersion(uid: string): Promise<number | null> {
  const user = await prisma.panelUser.findUnique({ where: { id: uid }, select: { sessionVersion: true } });
  return user?.sessionVersion ?? null;
}

export async function getValidSession(token?: string | null): Promise<SessionPayload | null> {
  const session = await readSessionToken(token);
  if (!session) return null;
  return (await currentVersion(session.uid)) === session.ver ? session : null;
}

export async function getValidDevice(token?: string | null): Promise<DevicePayload | null> {
  const device = await readDeviceToken(token);
  if (!device) return null;
  return (await currentVersion(device.uid)) === device.ver ? device : null;
}
