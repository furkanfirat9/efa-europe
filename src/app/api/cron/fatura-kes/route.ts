import { NextRequest, NextResponse } from 'next/server';
import { IssueError, issueInvoice, listInvoiceOrders } from '@/lib/efatura/issue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Kargoya verilmiş sayılan durumlar: satış faturası bu andan itibaren kesilir. */
const SHIPPED = ['delivering', 'driver_pickup', 'delivered'];

/**
 * Muhasebe ajanı: kargoya verilmiş ama satış faturası kesilmemiş siparişlerin e-Arşiv faturasını keser.
 *
 *   POST {}                               → bütün uygun siparişler
 *   POST { postingNumbers: ["…", "…"] }   → yalnız bunlar (yine uygunsa)
 *
 * Kullanıcı 2026-10-21'de ajanın bu faturaları sormadan kesmesine izin verdi. Trendyol yalnız canlı
 * sunucunun IP'sini kabul ettiği için ajan yerelden kesemez; bu uç canlıda çalışır. Panelin giriş
 * kapısı (src/proxy.ts) /api/cron/ adreslerini geçirir; kapıyı burada CRON_SECRET tutar.
 *
 * Ölçüt Fatura oluştur sayfasıyla aynı (listInvoiceOrders "pending"), ayrıca kesilemeyen sipariş
 * (blocked) atlanır. issueInvoice aynı siparişe ikinci fatura kesmez. Sırayla kesilir.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET tanımlı değil.' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Yetkisiz.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const only: string[] | null = Array.isArray(body?.postingNumbers) ? body.postingNumbers.map(String) : null;

  try {
    const { env, pending } = await listInvoiceOrders();
    const due = pending.filter(
      (r) => SHIPPED.includes(r.status) && !r.blocked && r.issue?.status !== 'SENDING' && (!only || only.includes(r.postingNumber))
    );
    const skipped = pending
      .filter((r) => SHIPPED.includes(r.status) && (!only || only.includes(r.postingNumber)) && !due.includes(r))
      .map((r) => ({ postingNumber: r.postingNumber, reason: r.blocked ?? 'Önceki gönderimin sonucu bekleniyor.' }));

    const issued: { postingNumber: string; invoiceNo: string | null; providerStatus: string | null }[] = [];
    const failed: { postingNumber: string; error: string }[] = [];
    for (const r of due) {
      try {
        const issue = await issueInvoice(r.postingNumber);
        issued.push({ postingNumber: r.postingNumber, invoiceNo: issue.invoiceNo, providerStatus: issue.providerStatus });
      } catch (err) {
        failed.push({
          postingNumber: r.postingNumber,
          error: err instanceof IssueError || err instanceof Error ? err.message : 'Fatura kesilemedi.',
        });
      }
    }

    console.log('[cron/fatura-kes]', JSON.stringify({ env, issued, failed, skipped }));
    return NextResponse.json({ success: true, env, issued, failed, skipped });
  } catch (error: any) {
    console.error('[cron/fatura-kes] hata:', error);
    return NextResponse.json({ success: false, error: error.message || 'Faturalar kesilemedi.' }, { status: 500 });
  }
}
