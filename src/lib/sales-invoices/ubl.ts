import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

/**
 * UBL-TR faturası okuyucu.
 *
 * GİB e-Arşiv portalı faturayı ZIP içinde (bir XML + bir HTML), Trendyol E-Faturam
 * gibi entegratörler doğrudan XML olarak verir. İkisi de aynı UBL-TR biçimindedir;
 * her bilginin sabit bir yeri olduğu için yapay zekâya gerek yoktur.
 */

// Tekrarlayabilen etiketler her zaman dizi olarak okunur; tek elemanlı faturada da
// yapı değişmesin.
const ARRAY_TAGS = new Set([
  'Note',
  'AdditionalDocumentReference',
  'InvoiceLine',
  'TaxTotal',
  'TaxSubtotal',
  'WithholdingTaxTotal',
  'AllowanceCharge',
  'PartyIdentification',
  'AdditionalItemIdentification',
  'Delivery',
  'PaymentMeans',
  'OrderReference',
  'DespatchDocumentReference',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  // Değerler metin kalır: GTİP ve vergi numaraları gibi baştaki sıfırlar kaybolmasın.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (tagName) => ARRAY_TAGS.has(tagName),
});

type Node = any;

const arr = (value: Node): Node[] => (value == null ? [] : Array.isArray(value) ? value : [value]);

const text = (node: Node): string | null => {
  if (node == null) return null;
  if (typeof node === 'string') return node.trim() || null;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object' && '#text' in node) return text(node['#text']);
  return null;
};

const num = (node: Node): number | null => {
  const value = text(node);
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const attr = (node: Node, name: string): string | null =>
  node && typeof node === 'object' && typeof node[`@_${name}`] === 'string' ? node[`@_${name}`] : null;

/** Kişi olarak yazılan tarafta (şahıs işletmesi) ad, PartyName yerine Person içinde durur. */
function partyName(party: Node): string | null {
  const name = text(party?.PartyName?.Name);
  if (name) return name;
  const person = party?.Person;
  const full = [person?.FirstName, person?.MiddleName, person?.FamilyName].map(text).filter(Boolean).join(' ');
  return full || null;
}

function partyTaxId(party: Node): string | null {
  const ids = arr(party?.PartyIdentification).map((p) => ({ scheme: attr(p.ID, 'schemeID'), id: text(p.ID) }));
  return (ids.find((i) => i.scheme === 'VKN' || i.scheme === 'TCKN') ?? ids[0])?.id ?? null;
}

// GİB portalı ülke kodunu yazmıyor, yalnızca Türkçe adı veriyor.
const COUNTRY_BY_NAME: Record<string, string> = {
  'rusya federasyonu': 'RU',
  rusya: 'RU',
  'türkiye': 'TR',
  turkiye: 'TR',
  belarus: 'BY',
  'beyaz rusya': 'BY',
  kazakistan: 'KZ',
  ermenistan: 'AM',
  'kırgızistan': 'KG',
  'özbekistan': 'UZ',
  'azerbaycan': 'AZ',
  'gürcistan': 'GE',
};

function countryCode(country: Node): string | null {
  const code = text(country?.IdentificationCode);
  if (code) return code.toUpperCase();
  const name = text(country?.Name);
  if (!name) return null;
  return COUNTRY_BY_NAME[name.toLocaleLowerCase('tr-TR')] ?? name;
}

/** Gömülü şablon, logo, imza görseli ve dijital imza veri değildir; dosyanın neredeyse tamamını kaplar. */
function stripEmbedded(invoice: Node) {
  delete invoice.UBLExtensions;
  for (const ref of arr(invoice.AdditionalDocumentReference)) {
    const obj = ref?.Attachment?.EmbeddedDocumentBinaryObject;
    if (obj && typeof obj === 'object') {
      ref.Attachment.EmbeddedDocumentBinaryObject = {
        ...Object.fromEntries(Object.entries(obj).filter(([k]) => k.startsWith('@_'))),
        '#text': '(orijinal dosyada)',
      };
    } else if (typeof obj === 'string') {
      ref.Attachment.EmbeddedDocumentBinaryObject = '(orijinal dosyada)';
    }
  }
  return invoice;
}

// "Gönderi No: 24947813-0297-1" — Ozon gönderi numarası
const POSTING_PATTERN = /G[öo]nderi\s*No\s*[:：]\s*(\d{5,}-\d{3,}(?:-\d+)?)/i;

export interface ParsedInvoiceLine {
  name: string;
  quantity: number | null;
  unitCode: string | null;
  unitPrice: number | null;
  amount: number | null;
  taxPercent: number | null;
  gtip: string | null;
  originCountry: string | null;
}

export interface ParsedInvoice {
  invoiceNo: string;
  uuid: string;
  profile: string | null;
  typeCode: string | null;
  issueDate: string;
  issueTime: string | null;
  sellerName: string | null;
  sellerTaxId: string | null;
  customerName: string | null;
  customerCountry: string | null;
  customerCity: string | null;
  currency: string;
  totalAmount: number;
  taxExclusive: number | null;
  taxAmount: number | null;
  allowanceTotal: number | null;
  exemptionCode: string | null;
  exemptionReason: string | null;
  fxRate: number | null;
  notes: string[];
  postingNumber: string | null;
  lines: ParsedInvoiceLine[];
  /** Faturanın tamamı (gömülü dosyalar hariç) */
  data: Record<string, unknown>;
}

export class InvoiceParseError extends Error {}

/** Tek bir UBL XML'ini okur. Fatura değilse InvoiceParseError fırlatır. */
export function parseUblInvoice(xml: string): ParsedInvoice {
  let doc: Node;
  try {
    doc = parser.parse(xml.replace(/^﻿/, ''));
  } catch {
    throw new InvoiceParseError('XML okunamadı; dosya bozuk olabilir.');
  }
  const invoice = doc?.Invoice;
  if (!invoice || typeof invoice !== 'object') {
    throw new InvoiceParseError('Bu dosya bir UBL faturası değil.');
  }

  const invoiceNo = text(invoice.ID);
  const uuid = text(invoice.UUID);
  const issueDate = text(invoice.IssueDate);
  const currency = text(invoice.DocumentCurrencyCode)?.toUpperCase() ?? null;
  const total = invoice.LegalMonetaryTotal ?? {};
  const totalAmount = num(total.PayableAmount) ?? num(total.TaxInclusiveAmount);
  if (!invoiceNo || !uuid || !issueDate || !/^\d{4}-\d{2}-\d{2}/.test(issueDate) || !currency || totalAmount == null) {
    throw new InvoiceParseError('Faturada zorunlu bilgiler (no, ETTN, tarih, döviz, tutar) eksik.');
  }

  const seller = invoice.AccountingSupplierParty?.Party;
  const customer = invoice.AccountingCustomerParty?.Party;

  const taxTotal = arr(invoice.TaxTotal)[0];
  const subtotals = arr(taxTotal?.TaxSubtotal);
  const exempt = subtotals.find((s) => text(s?.TaxCategory?.TaxExemptionReasonCode));

  const notes = arr(invoice.Note).map(text).filter((n): n is string => !!n);
  const postingNumber = notes.map((n) => n.match(POSTING_PATTERN)?.[1]).find(Boolean) ?? null;

  const fxRate = currency === 'TRY' ? 1 : num(invoice.PricingExchangeRate?.CalculationRate);

  const lines: ParsedInvoiceLine[] = arr(invoice.InvoiceLine).map((line) => {
    const lineTax = arr(arr(line.TaxTotal)[0]?.TaxSubtotal)[0];
    const goods = arr(line.Delivery)[0]?.Shipment?.GoodsItem;
    return {
      name: text(line.Item?.Name) ?? text(line.Item?.Description) ?? '—',
      quantity: num(line.InvoicedQuantity),
      unitCode: attr(line.InvoicedQuantity, 'unitCode'),
      unitPrice: num(line.Price?.PriceAmount),
      amount: num(line.LineExtensionAmount),
      taxPercent: num(lineTax?.Percent),
      gtip: text(arr(goods)[0]?.RequiredCustomsID),
      originCountry: text(line.Item?.OriginCountry?.IdentificationCode) ?? text(line.Item?.OriginCountry?.Name),
    };
  });

  return {
    invoiceNo,
    uuid: uuid.toLowerCase(),
    profile: text(invoice.ProfileID),
    typeCode: text(invoice.InvoiceTypeCode)?.toUpperCase() ?? null,
    issueDate: issueDate.slice(0, 10),
    issueTime: text(invoice.IssueTime),
    sellerName: partyName(seller),
    sellerTaxId: partyTaxId(seller),
    customerName: partyName(customer),
    customerCountry: countryCode(customer?.PostalAddress?.Country),
    customerCity: text(customer?.PostalAddress?.CityName) ?? text(customer?.PostalAddress?.CitySubdivisionName),
    currency,
    totalAmount,
    taxExclusive: num(total.TaxExclusiveAmount),
    taxAmount: num(taxTotal?.TaxAmount),
    allowanceTotal: num(total.AllowanceTotalAmount),
    exemptionCode: text(exempt?.TaxCategory?.TaxExemptionReasonCode),
    exemptionReason: text(exempt?.TaxCategory?.TaxExemptionReason),
    fxRate,
    notes,
    postingNumber,
    lines,
    data: stripEmbedded(invoice),
  };
}

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/**
 * Yüklenen dosyadaki faturaları okur: ZIP ise içindeki her XML, değilse dosyanın kendisi.
 * ZIP'teki HTML görünüm dosyası ve fatura olmayan XML'ler atlanır.
 */
export function readInvoiceFile(bytes: Uint8Array): { kind: 'zip' | 'xml'; invoices: ParsedInvoice[] } {
  const decoder = new TextDecoder('utf-8');

  if (isZip(bytes)) {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes, { filter: (f) => f.name.toLowerCase().endsWith('.xml') });
    } catch {
      throw new InvoiceParseError('ZIP dosyası açılamadı.');
    }
    const invoices: ParsedInvoice[] = [];
    let lastError: InvoiceParseError | null = null;
    for (const content of Object.values(entries)) {
      try {
        invoices.push(parseUblInvoice(decoder.decode(content)));
      } catch (err) {
        if (err instanceof InvoiceParseError) lastError = err;
        else throw err;
      }
    }
    if (!invoices.length) throw lastError ?? new InvoiceParseError('ZIP içinde fatura XML\'i bulunamadı.');
    return { kind: 'zip', invoices };
  }

  return { kind: 'xml', invoices: [parseUblInvoice(decoder.decode(bytes))] };
}
