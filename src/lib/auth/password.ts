import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Panel şifreleri: scrypt (Node'un yerleşik algoritması, ek paket gerekmez).
 * Saklanan biçim:  scrypt$N$r$p$tuz$özet   (tuz ve özet base64)
 * Düz şifre hiçbir yerde saklanmaz; doğrulama sabit zamanlı karşılaştırmayla yapılır.
 *
 * Bu dosya hem uygulama hem `scripts/panel-user.mjs` tarafından kullanılır;
 * biçim değişirse eski özetler doğrulanamaz.
 */

const scrypt = (password: string, salt: Buffer, keyLength: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptCb(password, salt, keyLength, options, (err, derived) => (err ? reject(err) : resolve(derived)));
  });

const PARAMS = { N: 16384, r: 8, p: 1, keyLength: 64 };

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, PARAMS.keyLength, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
  });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');

  const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
