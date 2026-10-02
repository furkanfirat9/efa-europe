import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/**
 * Art arda hatalı giriş sınırı. Hatalı denemeler üç anahtarla sayılır:
 *   - IP adresi
 *   - kullanıcı adı (saldırgan IP değiştirse de aynı hesaba yapılan denemeler sayılır)
 *   - tanıdık tarayıcı (daha önce giriş yapılmış tarayıcının çerezindeki kimlik)
 *
 * Tanıdık tarayıcıdan gelen deneme yalnızca kendi sayacına bakar; böylece saldırgan
 * hesabı kilitlese bile kullanıcı kendi tarayıcısından girebilir. Çerez çalınırsa
 * sınırsız deneme olmasın diye tanıdık tarayıcının da kendi sınırı vardır.
 *
 * Bir anahtarda 15 dakika içinde 5 hatalı deneme olursa o anahtar son hatalı denemeden
 * itibaren 15 dakika kilitlenir. Kilit bitince sayaç sıfırdan başlar. Başarılı giriş,
 * taşıdığı anahtarların sayacını sıfırlar.
 */

export const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export type LimitKey = { ip: string } | { username: string } | { deviceId: string };

export interface LimitState {
  /** Kilit kalkana kadar kalan süre (ms); kilit yoksa 0 */
  retryAfterMs: number;
  /** Kilitlenmeden önce kalan hatalı deneme hakkı */
  remaining: number;
}

async function keyState(key: LimitKey): Promise<LimitState> {
  const now = Date.now();
  const where = key as Prisma.LoginAttemptWhereInput;
  const windowStart = new Date(now - WINDOW_MS);

  const lastSuccess = await prisma.loginAttempt.findFirst({
    where: { ...where, success: true, createdAt: { gte: windowStart } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const failures = await prisma.loginAttempt.findMany({
    where: { ...where, success: false, createdAt: { gt: lastSuccess?.createdAt ?? windowStart } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
    take: MAX_FAILURES,
  });

  const lockedUntil = failures.length >= MAX_FAILURES ? failures[0].createdAt.getTime() + WINDOW_MS : 0;
  return {
    retryAfterMs: Math.max(lockedUntil - now, 0),
    remaining: MAX_FAILURES - failures.length,
  };
}

/** Anahtarlardan herhangi biri kilitliyse giriş kilitlidir; kalan hak en azı kadardır. */
export async function checkLimit(keys: LimitKey[]): Promise<LimitState> {
  const states = await Promise.all(keys.map(keyState));
  return {
    retryAfterMs: Math.max(0, ...states.map((s) => s.retryAfterMs)),
    remaining: Math.min(MAX_FAILURES, ...states.map((s) => s.remaining)),
  };
}

export async function recordAttempt(attempt: {
  ip: string;
  username: string;
  deviceId: string | null;
  success: boolean;
}): Promise<void> {
  await prisma.loginAttempt.create({ data: attempt });
  if (attempt.success) {
    // Kayıtlar inceleme için 90 gün tutulur.
    await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } });
  }
}
