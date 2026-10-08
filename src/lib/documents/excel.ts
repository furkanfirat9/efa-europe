import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

export interface ParsedSheet {
  name: string;
  rows: string[][];
}

/** XML karakter referanslarını (&amp;, &#x41F;, &#1040; vb.) çözer. */
export function decodeXmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** "A" -> 0, "B" -> 1, "Z" -> 25, "AA" -> 26 */
function colToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}

export function isExcelFile(mimeType?: string | null, fileName?: string | null): boolean {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return true;
  if (!mimeType) return false;
  return (
    mimeType.includes('spreadsheetml') ||
    mimeType.includes('ms-excel') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

/**
 * Excel (.xlsx) dosyasını fflate ve fast-xml-parser ile hızlıca açar ve
 * satır satır metin tablosuna çevirir.
 */
export function parseXlsxSheets(buffer: Buffer): ParsedSheet[] {
  const unzipped = unzipSync(new Uint8Array(buffer));
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
  });

  // 1. Paylaşılan metinleri (sharedStrings) yükle
  let sharedStrings: string[] = [];
  if (unzipped['xl/sharedStrings.xml']) {
    const sstXml = strFromU8(unzipped['xl/sharedStrings.xml']);
    const sstObj = parser.parse(sstXml);
    const sis = Array.isArray(sstObj.sst?.si)
      ? sstObj.sst.si
      : sstObj.sst?.si
        ? [sstObj.sst.si]
        : [];

    sharedStrings = sis.map((s: any) => {
      if (!s) return '';
      if (typeof s.t === 'string') return decodeXmlEntities(s.t);
      if (s.t && typeof s.t['#text'] === 'string') return decodeXmlEntities(s.t['#text']);
      if (s.r) {
        const runs = Array.isArray(s.r) ? s.r : [s.r];
        return runs
          .map((r: any) => {
            if (!r) return '';
            if (typeof r.t === 'string') return decodeXmlEntities(r.t);
            if (r.t && typeof r.t['#text'] === 'string') return decodeXmlEntities(r.t['#text']);
            return '';
          })
          .join('');
      }
      return '';
    });
  }

  // 2. Sayfa adlarını bul (xl/workbook.xml)
  const sheetNameMap = new Map<string, string>();
  if (unzipped['xl/workbook.xml']) {
    try {
      const wbXml = strFromU8(unzipped['xl/workbook.xml']);
      const wbObj = parser.parse(wbXml);
      const sheetsList = Array.isArray(wbObj.workbook?.sheets?.sheet)
        ? wbObj.workbook.sheets.sheet
        : wbObj.workbook?.sheets?.sheet
          ? [wbObj.workbook.sheets.sheet]
          : [];
      sheetsList.forEach((s: any, idx: number) => {
        const name = s['@_name'] || `Sayfa ${idx + 1}`;
        sheetNameMap.set(`sheet${idx + 1}.xml`, decodeXmlEntities(name));
      });
    } catch {
      // Workbook okunamasa da dosya adından devam edilir
    }
  }

  // 3. Çalışma sayfalarını oku (xl/worksheets/sheet*.xml)
  const sheetFiles = Object.keys(unzipped)
    .filter((k) => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'))
    .sort();

  const results: ParsedSheet[] = [];

  for (const sheetPath of sheetFiles) {
    const baseName = sheetPath.split('/').pop() || 'sheet1.xml';
    const sheetName = sheetNameMap.get(baseName) || `Sayfa ${results.length + 1}`;

    const sheetXml = strFromU8(unzipped[sheetPath]);
    const sheetObj = parser.parse(sheetXml);
    const rawRows = Array.isArray(sheetObj.worksheet?.sheetData?.row)
      ? sheetObj.worksheet.sheetData.row
      : sheetObj.worksheet?.sheetData?.row
        ? [sheetObj.worksheet.sheetData.row]
        : [];

    const parsedRows: string[][] = [];

    for (const r of rawRows) {
      const cs = Array.isArray(r.c) ? r.c : r.c ? [r.c] : [];
      const rowArr: string[] = [];

      for (const c of cs) {
        const ref = c['@_r'] || '';
        const colMatch = ref.match(/^[A-Z]+/);
        const colIdx = colMatch ? colToIndex(colMatch[0]) : rowArr.length;

        const t = c['@_t'];
        let v = c.v;
        if (v && typeof v === 'object' && v['#text']) v = v['#text'];

        let val = '';
        if (t === 's' && v !== undefined) {
          val = sharedStrings[Number(v)] || '';
        } else if (t === 'inlineStr' && c.is) {
          // Ayrıştırıcı sayısal metni sayıya çevirir (Ozon raporlarında "№20260911" değil "0.0" gibi)
          const text = typeof c.is.t === 'object' && c.is.t !== null ? c.is.t['#text'] : c.is.t;
          val = text == null ? '' : decodeXmlEntities(String(text));
        } else if (v !== undefined) {
          val = decodeXmlEntities(String(v));
        }

        // Boş hücrelerin kolon kaymasını engelle
        while (rowArr.length < colIdx) rowArr.push('');
        rowArr[colIdx] = val;
      }

      // Tamamen boş satırları atla
      if (rowArr.some((cell) => cell && cell.trim().length > 0)) {
        // Sondaki gereksiz boş hücreleri temizle
        while (rowArr.length > 0 && !rowArr[rowArr.length - 1]?.trim()) {
          rowArr.pop();
        }
        parsedRows.push(rowArr);
      }
    }

    if (parsedRows.length > 0) {
      results.push({ name: sheetName, rows: parsedRows });
    }
  }

  return results;
}

/**
 * Sayfaları Gemini için temiz bir metin/tablo formatına çevirir.
 * Çok uzun tablolarda token sınırını korumak için baş ve son satırları önceliklendirir.
 */
export function sheetsToText(sheets: ParsedSheet[], maxRowsPerSheet = 120): string {
  const sections: string[] = [];

  for (const sheet of sheets) {
    const lines: string[] = [];
    lines.push(`--- Sayfa: ${sheet.name} (${sheet.rows.length} satır) ---`);

    if (sheet.rows.length <= maxRowsPerSheet) {
      for (const row of sheet.rows) {
        lines.push(row.map((cell) => (cell ?? '').trim()).join(' | '));
      }
    } else {
      // Baş kısım (başlıklar, ilk 80 satır)
      for (let i = 0; i < 80; i++) {
        lines.push(sheet.rows[i].map((cell) => (cell ?? '').trim()).join(' | '));
      }
      lines.push(`... [Aradaki ${sheet.rows.length - 100} satır atlandı] ...`);
      // Son kısım (toplamlar, özetler - son 20 satır)
      for (let i = sheet.rows.length - 20; i < sheet.rows.length; i++) {
        lines.push(sheet.rows[i].map((cell) => (cell ?? '').trim()).join(' | '));
      }
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

/**
 * Tablodan Ozon gönderi/sipariş numaralarını (örn. 0115746247-0354) tespit eder.
 */
export function extractPostingNumbersFromSheets(sheets: ParsedSheet[]): string[] {
  const regex = /\b\d{8,12}-\d{4}(?:-\d+)?\b/g;
  const numbers = new Set<string>();

  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const cell of row) {
        if (!cell) continue;
        const matches = cell.match(regex);
        if (matches) {
          for (const m of matches) numbers.add(m);
        }
      }
    }
  }

  return [...numbers];
}
