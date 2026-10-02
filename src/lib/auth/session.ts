/**
 * Panelin iki çerezi: oturum ve tanıdık tarayıcı. İkisi de sunucunun AUTH_SECRET ile
 * imzaladığı kısa belgelerdir. Biçim: base64url(payload).base64url(imza) — imza HMAC-SHA256.
 *
 * Bu dosya yalnızca imza ve süreyi kontrol eder. Çerezin iptal edilip edilmediği
 * (kullanıcının oturum sürümü) veritabanına bakılarak `guard.ts` içinde kontrol edilir.
 * Çerezin içeriği gizli değildir, ama imza olmadan üretilemez.
 */

export const SESSION_COOKIE = 'panel_session';
export const DEVICE_COOKIE = 'panel_device';

/** Hiç işlem yapılmazsa oturum bu kadar sonra kapanır. */
export const SESSION_IDLE_SECONDS = 12 * 60 * 60;
/** Panel kullanılsa da en geç bu kadar sonra yeniden giriş istenir. */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
/** Son işlem zamanı en fazla bu sıklıkta yenilenir; her istekte çerez yazılmasın. */
export const SESSION_TOUCH_SECONDS = 5 * 60;
/** Tanıdık tarayıcı çerezinin ömrü. */
export const DEVICE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export interface SessionPayload {
  typ: 'session';
  /** Kullanıcı kimliği */
  uid: string;
  /** Kullanıcı adı (arayüzde göstermek için) */
  name: string;
  /** Kullanıcının oturum sürümü; veritabanındakiyle aynı olmalı */
  ver: number;
  /** Son işlem zamanı, saniye cinsinden unix zamanı */
  act: number;
  /** Mutlak bitiş zamanı (girişten 7 gün sonra) */
  exp: number;
}

export interface DevicePayload {
  typ: 'device';
  uid: string;
  name: string;
  ver: number;
  /** Tarayıcının kimliği; hatalı denemeler bu kimlikle sayılır */
  did: string;
  exp: number;
}

const encoder = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error('AUTH_SECRET tanımlı değil ya da 32 karakterden kısa.');
  }
  return value;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function sign(payload: SessionPayload | DevicePayload): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await key(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** İmzası geçersiz, türü farklı ya da süresi dolmuşsa null döner. */
async function verify<T extends SessionPayload | DevicePayload>(
  token: string | null | undefined,
  typ: T['typ']
): Promise<T | null> {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  try {
    const valid = await crypto.subtle.verify('HMAC', await key(), fromBase64Url(signature), encoder.encode(body));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as T;
    if (payload?.typ !== typ || !payload.uid || typeof payload.ver !== 'number') return null;
    if (typeof payload.exp !== 'number' || payload.exp <= now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionToken(user: { id: string; username: string; sessionVersion: number }): Promise<string> {
  const t = now();
  return sign({
    typ: 'session',
    uid: user.id,
    name: user.username,
    ver: user.sessionVersion,
    act: t,
    exp: t + SESSION_MAX_AGE_SECONDS,
  });
}

/** Son işlem zamanı yenilenmiş kopya; mutlak bitiş zamanı değişmez. */
export function touchSessionToken(session: SessionPayload): Promise<string> {
  return sign({ ...session, act: now() });
}

export async function readSessionToken(token?: string | null): Promise<SessionPayload | null> {
  const payload = await verify<SessionPayload>(token, 'session');
  if (!payload || typeof payload.act !== 'number') return null;
  if (payload.act + SESSION_IDLE_SECONDS <= now()) return null;
  return payload;
}

/** Son işlem zamanı yenilenmeli mi? */
export const sessionNeedsTouch = (session: SessionPayload) => session.act + SESSION_TOUCH_SECONDS <= now();

export function createDeviceToken(
  user: { id: string; username: string; sessionVersion: number },
  deviceId: string
): Promise<string> {
  return sign({
    typ: 'device',
    uid: user.id,
    name: user.username,
    ver: user.sessionVersion,
    did: deviceId,
    exp: now() + DEVICE_MAX_AGE_SECONDS,
  });
}

export async function readDeviceToken(token?: string | null): Promise<DevicePayload | null> {
  const payload = await verify<DevicePayload>(token, 'device');
  return payload?.did ? payload : null;
}

const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

/**
 * Çerez, oturumun mutlak bitişine kadar tutulur; boşta kalma süresi belgenin içinde kontrol edilir.
 * Oturum verilmezse yeni açılan oturum içindir (tam süre).
 */
export const sessionCookieOptions = (session?: Pick<SessionPayload, 'exp'>) => ({
  ...baseCookieOptions,
  maxAge: session ? Math.max(session.exp - now(), 0) : SESSION_MAX_AGE_SECONDS,
});

export const deviceCookieOptions = { ...baseCookieOptions, maxAge: DEVICE_MAX_AGE_SECONDS };

export const clearedCookieOptions = { ...baseCookieOptions, maxAge: 0 };
