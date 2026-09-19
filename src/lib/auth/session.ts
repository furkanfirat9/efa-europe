/**
 * Oturum çerezi: sunucunun AUTH_SECRET ile imzaladığı kısa bir belge.
 * Biçim: base64url(payload).base64url(imza) — imza HMAC-SHA256.
 *
 * Yalnızca Web Crypto kullanır; bu yüzden hem proxy (edge) hem de API uçlarında
 * (node) çalışır. Çerezin içeriği gizli değildir, ama imza olmadan üretilemez.
 */

export const SESSION_COOKIE = 'panel_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 gün

export interface SessionPayload {
  /** Kullanıcı kimliği */
  uid: string;
  /** Kullanıcı adı (arayüzde göstermek için) */
  name: string;
  /** Bitiş zamanı, saniye cinsinden unix zamanı */
  exp: number;
}

const encoder = new TextEncoder();

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

export async function createSessionToken(user: { id: string; username: string }): Promise<string> {
  const payload: SessionPayload = {
    uid: user.id,
    name: user.username,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await key(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** İmzası ya da süresi geçersizse null döner. */
export async function readSessionToken(token?: string | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await key(),
      fromBase64Url(signature),
      encoder.encode(body)
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (!payload?.uid || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
};
