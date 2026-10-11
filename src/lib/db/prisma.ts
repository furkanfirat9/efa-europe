import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Veri tabanında (Prisma Postgres) rol başına 45 bağlantı sınırı var. Prisma'nın varsayılan havuzu "çekirdek × 2 + 1"
 * bağlantı; Vercel'de her sıcak fonksiyon kopyası bu havuzu ayrı tutuyor ve boştaki bağlantıları kapatmıyor.
 * 2026-10-11: 45'in 44'ü Vercel'deki boş havuzlardaydı, bilgisayardaki tedarik taraması bağlantı açamadı
 * ("too many connections for role"). Bu yüzden havuz küçük tutulur: Vercel'de 2, bilgisayarda 5. Adreste
 * connection_limit zaten yazılıysa ona dokunulmaz.
 */
function datasourceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  const url = new URL(raw);
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', process.env.VERCEL ? '2' : '5');
  return url.toString();
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
