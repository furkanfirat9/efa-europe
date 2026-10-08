import dns from 'node:dns';

/**
 * Trendyol E-Faturam istemcisi (yalnızca sunucu).
 *
 * .env: TRENDYOL_EFATURA_ENV (staging | production), TRENDYOL_EFATURA_EMAIL, TRENDYOL_EFATURA_PASSWORD
 *
 * Test ortamı IPv4 beyaz listesiyle açılıyor (en fazla 3 adres, portalın entegrasyon
 * ekranından); listede olmayan adres Cloudflare'in HTML 403 sayfasını alır. Canlıda IP
 * sınırı yok, panel Vercel'den doğrudan bağlanır. IPv6 desteklenmiyor.
 */

// Makinede IPv6 da açıksa Node önce onu deneyebiliyor; Trendyol IPv6 adresini tanımıyor.
dns.setDefaultResultOrder('ipv4first');

export type EfaturaEnv = 'staging' | 'production';

export const efaturaEnv = (): EfaturaEnv =>
  process.env.TRENDYOL_EFATURA_ENV === 'production' ? 'production' : 'staging';

const baseUrl = () =>
  efaturaEnv() === 'production'
    ? 'https://apigateway.trendyolecozum.com'
    : 'https://stage-apigateway.trendyolefaturam.com';

export class TrendyolError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
  }

  /**
   * Trendyol'un güvenlik duvarı isteği faturaya ulaşmadan HTML 403 ile reddetti.
   * Kimi Rusça ürün adlarında ("Фильтр для душа … картридж") ve öngörülemeyen
   * başka metinlerde oluyor; aynı istek Latin harflerle geçiyor.
   */
  get isWafBlock() {
    return this.status === 403 && typeof this.body === 'string' && this.body.trimStart().startsWith('<');
  }

  /** Trendyol'un JSON hata mesajı (ProblemDetail: detail / title, doğrulamada errors[]). */
  get detail(): string {
    const b = this.body as { detail?: string; title?: string; errors?: { field?: string; defaultMessage?: string }[] } | null;
    if (b && typeof b === 'object') {
      if (Array.isArray(b.errors) && b.errors.length) {
        return b.errors.map((e) => [e.field, e.defaultMessage].filter(Boolean).join(': ')).join('; ');
      }
      if (b.detail || b.title) return String(b.detail ?? b.title);
    }
    return this.message;
  }
}

interface Session {
  env: EfaturaEnv;
  token: string;
  userId: number;
  companyId: number;
  expiresAt: number;
}

let session: Session | null = null;

const decodeJwt = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

async function signIn(): Promise<Session> {
  const env = efaturaEnv();
  // Token 24 saat geçerli; bitimine 5 dakika kala yenilenir.
  if (session && session.env === env && session.expiresAt - 5 * 60_000 > Date.now()) return session;

  const email = process.env.TRENDYOL_EFATURA_EMAIL;
  const password = process.env.TRENDYOL_EFATURA_PASSWORD;
  if (!email || !password) throw new Error('TRENDYOL_EFATURA_EMAIL / TRENDYOL_EFATURA_PASSWORD tanımlı değil.');

  const res = await fetch(`${baseUrl()}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    const blocked = text.trimStart().startsWith('<');
    throw new TrendyolError(
      blocked
        ? "Trendyol'a bağlanılamadı: bu bilgisayarın IP adresi Trendyol portalındaki izin listesinde değil."
        : `Trendyol girişi başarısız (HTTP ${res.status}).`,
      res.status,
      text
    );
  }

  // Gövde kullanıcı numarası; token başlıkta gelir. Şirket numarası token'daki yetki
  // listesinin anahtarıdır (Lenora 9249000001). Kurum kaydının id'si (9249) reddedilir.
  const token = res.headers.get('x-access-token');
  if (!token) throw new Error('Trendyol girişinde token gelmedi.');
  const claims = decodeJwt(token);
  const companyId = Number(Object.keys(claims.privs ?? {})[0]);
  if (!companyId) throw new Error('Trendyol token\'ında şirket numarası yok.');

  session = { env, token, userId: Number(text.trim()), companyId, expiresAt: claims.exp * 1000 };
  return session;
}

async function call<T>(method: 'GET' | 'POST', path: string, data?: unknown, retried = false): Promise<T> {
  const { token } = await signIn();
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    body: data ? JSON.stringify(data) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();

  // Oturum beklenenden önce düştüyse bir kez yeniden giriş yapılır.
  if (res.status === 401 && !retried) {
    session = null;
    return call(method, path, data, true);
  }

  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // HTML (güvenlik duvarı) ya da düz metin
  }
  if (!res.ok) throw new TrendyolError(`${method} ${path} → HTTP ${res.status}`, res.status, body);
  return body as T;
}

export const getCompanyId = async () => (await signIn()).companyId;

export interface EArchiveCreated {
  invoiceId: string;
  invoiceUuid: string;
  status: string;
  issuedAt?: string;
  gibStatus?: string;
}

export interface EArchiveStatus {
  status: string;
  gibStatus?: string;
  invoiceId?: string;
  invoiceUuid: string;
}

export const createEArchive = (payload: unknown) =>
  call<EArchiveCreated>('POST', '/api/invoice/v2/documents/earchive', payload);

/** Bulunamazsa null (404: bu UUID ile fatura hiç oluşmamış). */
export async function getEArchiveStatus(invoiceUuid: string): Promise<EArchiveStatus | null> {
  try {
    return await call<EArchiveStatus>('GET', `/api/invoice/documents/earchive/status/${invoiceUuid}`);
  } catch (err) {
    if (err instanceof TrendyolError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Faturanın PDF ya da XML dosyası; yoksa null. Fatura işlenirken (durum 20) Trendyol
 * 409 verir. Test ortamında XML hiç yok (indirme adresi 404), PDF var.
 */
export async function downloadEArchive(invoiceUuid: string, fileExtension: 'pdf' | 'xml'): Promise<Buffer | null> {
  let url: string;
  try {
    url = await call<string>('POST', '/api/invoice/documents/download', {
      companyId: await getCompanyId(),
      documentType: 'EARCHIVE',
      fileExtension,
      invoiceUuid,
    });
  } catch (err) {
    if (err instanceof TrendyolError && err.status === 409) return null;
    throw err;
  }
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Fatura dosyası indirilemedi (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

/** Trendyol durum kodları */
export const FINAL_OK = '205';
export const isFinalStatus = (status?: string | null) => !!status && ['205', '305', '29', '405'].includes(status);
export const isErrorStatus = (status?: string | null) => status === '29' || status === '405';
