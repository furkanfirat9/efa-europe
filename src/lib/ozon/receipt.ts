/**
 * Ozon ödemesinin banka dekontundan TL tutarı, tarih ve dönem referansını okur. Yapay zekâ
 * kullanılmaz: PDF'in metni düz kalıplarla aranır. Bulunamayan alan boş döner, kullanıcı
 * onay ekranında elle tamamlar.
 *
 * Örnek (Ziraat, gelen EFT): "...Tutar:1.040.679,35;Mesaj: ... Pmnt for serv. ... Rep.20260901 ...
 * VALÖR : 21.09.2026 ... Hesabınıza 1.040.679,35 TL ... Yatırılmıştır."
 */

export interface ParsedReceipt {
  receivedTry: number | null;
  receivedAt: string | null; // YYYY-MM-DD
  bankReference: string | null;
}

const trNumber = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

function firstMatch(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m;
  }
  return null;
}

export function parseReceiptText(raw: string): ParsedReceipt {
  const text = raw.replace(/\s+/g, ' ');

  const amount = firstMatch(text, [
    /Hesab[ıi]n[ıi]za\s+([\d.]+,\d{2})\s*TL/i,
    /Tutar\s*:?\s*([\d.]+,\d{2})/i,
    /([\d.]+,\d{2})\s*(?:TRY|TL)\b/,
  ]);

  const date = firstMatch(text, [
    /VAL[ÖO]R\s*:?\s*(\d{2})[./](\d{2})[./](\d{4})/i,
    /[İI]ŞLEM\s+TAR[İI]H[İI]\s*:?\s*(\d{2})[./](\d{2})[./](\d{4})/i,
    /(\d{2})[./](\d{2})[./](\d{4})/,
  ]);

  const ref = text.match(/Rep\.?\s*(\d{8})/i);

  return {
    receivedTry: amount ? trNumber(amount[1]) : null,
    receivedAt: date ? `${date[3]}-${date[2]}-${date[1]}` : null,
    bankReference: ref ? `Rep.${ref[1]}` : null,
  };
}

/** PDF'in metnini çıkarır; metin katmanı yoksa (taranmış belge) boş döner. */
export async function pdfText(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
