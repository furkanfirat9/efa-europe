import { GoogleGenAI } from '@google/genai';
import { CATEGORY_KEYS, DOCUMENT_CATEGORIES } from './categories';
import {
  extractPostingNumbersFromSheets,
  isExcelFile,
  parseXlsxSheets,
  sheetsToText,
} from './excel';

/**
 * Belgeden (PDF / görsel / Excel) muhasebe bilgilerini Gemini ile okur.
 * Sonuç her zaman kullanıcının onayına sunulur; burada hiçbir şey kaydedilmez.
 */

export type DocumentKind = 'invoice' | 'credit_note' | 'ozon_upd' | 'ozon_report' | 'income_report' | 'not_invoice';

export interface ExtractedLine {
  description: string;
  quantity: number | null;
  amount: number | null;
  isShipping: boolean;
  /** Ozon belgeleri gibi çok kalemli belgelerde satırın kendi kategorisi */
  category: string | null;
}

export interface ExtractedDocument {
  documentKind: DocumentKind;
  platform: 'amazon' | 'allegro' | 'ozon' | 'other' | null;
  documentNo: string | null;
  ksefNo: string | null;
  documentDate: string | null;
  sellerName: string | null;
  sellerCountry: string | null;
  sellerTaxId: string | null;
  buyerName: string | null;
  currency: string | null;
  totalAmount: number | null;
  orderNumber: string | null;
  postingNumbers?: string[];
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
  suggestedCategory: string | null;
  lines: ExtractedLine[];
  uncertainFields: string[];
  notes: string | null;
}

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, 'null'], ...extra });

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    documentKind: {
      type: 'string',
      enum: ['invoice', 'credit_note', 'ozon_upd', 'ozon_report', 'income_report', 'not_invoice'],
    },
    platform: nullable('string', { enum: ['amazon', 'allegro', 'ozon', 'other', null] }),
    documentNo: nullable('string'),
    ksefNo: nullable('string'),
    documentDate: nullable('string', { description: 'YYYY-MM-DD' }),
    sellerName: nullable('string'),
    sellerCountry: nullable('string', { description: 'ISO 3166-1 alpha-2, ör. PL, LU, DE, RU' }),
    sellerTaxId: nullable('string'),
    buyerName: nullable('string'),
    currency: nullable('string', { description: 'ISO 4217, ör. EUR, PLN, USD, RUB' }),
    totalAmount: nullable('number'),
    orderNumber: nullable('string'),
    postingNumbers: {
      type: 'array',
      items: { type: 'string' },
      description: 'Belgede adı geçen Ozon gönderi numaraları (örn: 0115746247-0354)',
    },
    servicePeriodStart: nullable('string', { description: 'YYYY-MM-DD' }),
    servicePeriodEnd: nullable('string', { description: 'YYYY-MM-DD' }),
    suggestedCategory: nullable('string', { enum: [...CATEGORY_KEYS, null] }),
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quantity: nullable('number'),
          amount: nullable('number'),
          isShipping: { type: 'boolean' },
          category: nullable('string', { enum: [...CATEGORY_KEYS, null] }),
        },
        required: ['description', 'quantity', 'amount', 'isShipping', 'category'],
      },
    },
    uncertainFields: { type: 'array', items: { type: 'string' } },
    notes: nullable('string'),
  },
  required: [
    'documentKind',
    'platform',
    'documentNo',
    'ksefNo',
    'documentDate',
    'sellerName',
    'sellerCountry',
    'sellerTaxId',
    'buyerName',
    'currency',
    'totalAmount',
    'orderNumber',
    'postingNumbers',
    'servicePeriodStart',
    'servicePeriodEnd',
    'suggestedCategory',
    'lines',
    'uncertainFields',
    'notes',
  ],
};

const categoryList = DOCUMENT_CATEGORIES.map((c) => `- ${c.key}: ${c.group} › ${c.label}`).join('\n');

const PROMPT = `Ekteki belge, Türkiye'deki "LENORA TARIM ÜRÜNLERİ SAN. VE TİC. LTD. ŞTİ." şirketinin
yurtdışından aldığı bir alış, hizmet veya pazar yeri (Ozon) gider faturası/raporudur. Belgeyi oku ve istenen alanları JSON olarak döndür.

Genel kurallar:
- Belgede yazmayan hiçbir bilgiyi uydurma; bulamadığın alanı null bırak.
- Tarihleri YYYY-MM-DD biçimine çevir ("7.09.2026", "2026-09-06", "19 September 2026" gibi yazılışlar olabilir).
- Tutarları sayıya çevir. Polonya ve Almanya'da ondalık ayırıcı virgüldür: "139,89" = 139.89, "1.234,56" = 1234.56.
- totalAmount: belgenin KDV DAHİL ödenecek toplamıdır ("Razem do zapłaty", "Kwota należności ogółem", "Gesamtpreis",
  "Zahlbetrag", "In total for payment" ve benzeri). KDV kırılımıyla ilgilenmiyoruz.
- currency: toplamın para birimidir.
- Emin olmadığın alanların adını uncertainFields listesine yaz.

Tuzaklar:
- Amazon faturalarında KDV tablosunun altında "PLN29.45" gibi ayrı bir PLN tutarı yer alabilir. Bu, KDV'nin zloti
  karşılığıdır; toplam DEĞİLDİR. Amazon faturasının toplamı ve para birimi "Gesamtpreis"/"Zahlbetrag" satırındadır.
- Kargo satırlarını ("Versandkosten", "Allegro Kurier", "DPD", "InPost", "Dostawa" vb.) lines içinde isShipping=true
  olarak işaretle; bunlar ürün değildir.
- lines: belgedeki ürün/hizmet satırları; amount her satırın KDV dahil tutarıdır. Satır yoksa boş dizi döndür.

Ozon belgeleri ve Excel raporları:
- Ozon'un UPD'si ("Unified Transfer Document", "Универсальный передаточный документ") tek belgede birden çok hizmeti
  toplar. Satıcı "Internet solutions LLC"dir, para birimi genelde USD'dir, toplam "In total for payment" satırındadır.
- Ozon эквайринг (aracı banka / ödeme alma) Excel raporları ("Детальный отчет о перевыставлении услуг (эквайринг)" veya hizmeti "Приём платежей от Клиентов партнёрами"):
  • documentKind: ozon_report, platform: ozon, suggestedCategory: ozon.araci_banka.
  • Satıcı: "Интернет Решения, ООО" (Internet Solutions LLC), İNN: 7704217370, ülke: RU.
  • Alıcı: belgedeki alıcı / принципал (LENORA TARIM URUNLERI GIDA SANAYI VE TICARET LIMITED SIRKETI).
  • Para birimi: RUR veya RUB ise "RUB".
  • Tarih: Dönem bitiş tarihi (servicePeriodEnd ile aynı gün).
  • Belge no: Başlıktaki rapor numarası (ör. отчёту №19857343 → 19857343).
  • postingNumbers: Tablodaki "№ Заказа" sütununda yer alan sipariş numaralarının tümü (örn. 0115746247-0354).
  • lines: her sipariş satırı description olarak "Приём платежей от Клиентов партнёрами (Заказ: ...)", amount ise KDV dahil tutar (Сумма с НДС), category: ozon.araci_banka.
- Ozon diğer gider raporları ("Отчет о суммах услуг и расходах на реализацию" vb.):
  • documentKind: ozon_report, platform: ozon.
  • Her satırı kendi hizmetine göre ata (komisyon, lojistik, depolama vb.).
- Her satırı KENDİ kategorisine ata (lines[].category):
  • "Ozon agency fee", "agency fee", komisyon → ozon.komisyon
  • nakliye/teslimat acenteliği ("freight forwarding", "delivery", "logistics") → ozon.lojistik
  • "Premium", "Premium Pro Subscription" (yüzdelik olanı dahil) → ozon.premium
  • "acquiring", banka/POS tahsilat komisyonu, "Приём платежей от Клиентов партнёрами" → ozon.araci_banka
  • ceza, "penalty", "штраф" → ozon.ceza
  • reklam, tanıtım, "Star products", "продвижение" → ozon.reklam
  Emin olamadığın satırda category null bırak.
- Belgenin tamamı tek bir kategoriye giriyorsa suggestedCategory'yi de doldur; farklı kategorilerde satırlar varsa
  suggestedCategory null olsun, satır kategorileri yeterlidir.
- Ozon UPD'sinde ve raporlarında alıcı ("Buyer" / "Принципал") şirket adıdır; belgede yazdığı gibi aktar.

Alanlar:
- documentNo: fatura numarası ("Numer faktury", "Faktura VAT sprzedaży FS …", "Rechnungsnummer", "Invoice №").
- ksefNo: Polonya KSeF numarası ("Numer KSeF", "Numer dokumentu w KSeF"); yoksa null.
- sellerName / sellerCountry / sellerTaxId: faturayı kesen satıcı; vergi numarası NIP, USt-IdNr., INN vb.
- buyerName: faturadaki alıcı ("Nabywca", "Rechnungsadresse", "Buyer") adı, belgede yazdığı gibi.
- orderNumber: platform sipariş numarası. Amazon'da "Bestellnummer" (ör. 305-8922483-9165901). Allegro satıcı
  faturalarında Allegro sipariş numarası çoğu zaman "Uwagi" (notlar) kısmında "nr zam:*156342334*" biçimindedir;
  onu al. Satıcının kendi iç sipariş kodunu (ör. "ZK 13525/COM/2026") orderNumber olarak kullanma.
- servicePeriodStart / servicePeriodEnd: üyelik ve abonelik faturalarındaki hizmet dönemi ("Okres rozliczeniowy" vb.).
- platform: amazon, allegro (Allegro'nun kendisi ya da Allegro üzerinden satış yapan satıcı), ozon ya da other.

documentKind:
- invoice: alış veya hizmet faturası
- credit_note: iade / düzeltme faturası ("Faktura korygująca", "Gutschrift", "Correction")
- ozon_upd: Ozon'un "Unified Transfer Document" (UPD / УПД) belgesi
- ozon_report: Ozon'un diğer gider raporları
- income_report: gelir belgeleri ("Отчет о реализации товара", "CompensationReport")
- not_invoice: fatura olmayan belge (kargo makbuzu, ekran görüntüsü vb.)

suggestedCategory, şu anahtarlardan biri olmalı:
${categoryList}
Satmak için alınan ürünler tedarik.mal'dır. Allegro Smart / Business Smart üyeliği uyelik.allegro_smart, Amazon Prime
uyelik.amazon_prime'dır.

notes: muhasebe için önemli gördüğün kısa bir not varsa (ör. "odwrotne obciążenie" ibaresi), yoksa null.`;

const normalizeDate = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;

const normalizeText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const normalizeNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;

export async function extractDocument(file: {
  base64?: string;
  buffer?: Buffer;
  mimeType: string;
  fileName?: string;
}): Promise<{ data: ExtractedDocument; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY tanımlı değil.');
  const model = process.env.DEFAULT_AI_MODEL || 'gemini-3.8-flash';

  const isExcel = isExcelFile(file.mimeType, file.fileName);
  let parts: any[] = [];
  let extractedPostingsFromExcel: string[] = [];

  if (isExcel) {
    const buf = file.buffer || (file.base64 ? Buffer.from(file.base64, 'base64') : null);
    if (!buf) throw new Error('Excel dosyası okunamadı: veri boş.');
    const sheets = parseXlsxSheets(buf);
    const tableText = sheetsToText(sheets);
    extractedPostingsFromExcel = extractPostingNumbersFromSheets(sheets);

    parts = [
      { text: `Ekteki belge bir Excel tablosudur (${file.fileName || 'belge.xlsx'}).\n\nTablo içeriği:\n${tableText}` },
      { text: PROMPT },
    ];
  } else {
    const base64Data = file.base64 || (file.buffer ? file.buffer.toString('base64') : '');
    if (!base64Data) throw new Error('Dosya içeriği bulunamadı.');
    parts = [{ inlineData: { data: base64Data, mimeType: file.mimeType } }, { text: PROMPT }];
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const raw = JSON.parse(response.text || '{}');
  const kinds: DocumentKind[] = ['invoice', 'credit_note', 'ozon_upd', 'ozon_report', 'income_report', 'not_invoice'];

  let currency = normalizeText(raw.currency)?.toUpperCase().slice(0, 3) ?? null;
  if (currency === 'RUR') currency = 'RUB';

  const rawPostings = Array.isArray(raw.postingNumbers)
    ? raw.postingNumbers.filter((p: unknown) => typeof p === 'string' && p.trim())
    : [];
  const mergedPostings = Array.from(new Set([...rawPostings, ...extractedPostingsFromExcel]));

  const data: ExtractedDocument = {
    documentKind: kinds.includes(raw.documentKind) ? raw.documentKind : 'invoice',
    platform: ['amazon', 'allegro', 'ozon', 'other'].includes(raw.platform) ? raw.platform : null,
    documentNo: normalizeText(raw.documentNo),
    ksefNo: normalizeText(raw.ksefNo),
    documentDate: normalizeDate(raw.documentDate),
    sellerName: normalizeText(raw.sellerName),
    sellerCountry: normalizeText(raw.sellerCountry)?.toUpperCase().slice(0, 2) ?? null,
    sellerTaxId: normalizeText(raw.sellerTaxId),
    buyerName: normalizeText(raw.buyerName),
    currency,
    totalAmount: normalizeNumber(raw.totalAmount),
    orderNumber: normalizeText(raw.orderNumber),
    postingNumbers: mergedPostings,
    servicePeriodStart: normalizeDate(raw.servicePeriodStart),
    servicePeriodEnd: normalizeDate(raw.servicePeriodEnd),
    suggestedCategory: CATEGORY_KEYS.includes(raw.suggestedCategory) ? raw.suggestedCategory : null,
    lines: Array.isArray(raw.lines)
      ? raw.lines
          .map((l: any) => ({
            description: normalizeText(l?.description) ?? '',
            quantity: normalizeNumber(l?.quantity),
            amount: normalizeNumber(l?.amount),
            isShipping: l?.isShipping === true,
            category: CATEGORY_KEYS.includes(l?.category) ? l.category : null,
          }))
          .filter((l: ExtractedLine) => l.description)
      : [],
    uncertainFields: Array.isArray(raw.uncertainFields) ? raw.uncertainFields.filter((f: unknown) => typeof f === 'string') : [],
    notes: normalizeText(raw.notes),
  };

  return { data, model };
}
