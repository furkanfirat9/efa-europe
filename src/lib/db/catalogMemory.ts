import fs from 'fs';
import path from 'path';

export interface CatalogProductRecord {
  id: string;
  asin?: string;
  brand: string;
  modelNo: string;
  categoryId: number;
  typeId: number;
  categoryName: string;
  typeName: string;
  seriesMergeCode: string; // ID 9048 (örn: ph-3000-airfryer)
  namingTemplateModel: string; // ID 12141 / 20776 (örn: NA350/00 9 л с двумя чашами 2750 Вт)
  partNumber?: string; // ID 4381 (örn: NA350/00)
  aspects?: {
    color?: string;
    volumeLiters?: string | number;
    powerWatt?: string | number;
    [key: string]: any;
  };
  finalTitle?: string;
  ozonTaskId?: string;
  productQuery?: string;
  createdAt: string;
  updatedAt: string;
}

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'catalog_memory.json');

// Dizin ve dosya yoksa oluştur
function ensureDbFile(): void {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

/**
 * Tüm kayıtları oku
 */
export function getAllCatalogMemory(): CatalogProductRecord[] {
  try {
    ensureDbFile();
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error('Katalog hafızası okunurken hata:', error);
    return [];
  }
}

/**
 * Atomik olarak kayıtları kaydet
 */
function saveAllCatalogMemory(records: CatalogProductRecord[]): void {
  ensureDbFile();
  const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
  fs.writeFileSync(tempFile, JSON.stringify(records, null, 2), 'utf-8');
  fs.renameSync(tempFile, DB_FILE);
}

/**
 * Yeni ürün kaydet veya var olanı güncelle (Marka + Model No + Kategori bazlı)
 */
export function saveProductToMemory(
  record: Omit<CatalogProductRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): CatalogProductRecord {
  const records = getAllCatalogMemory();
  const now = new Date().toISOString();

  // Var olan kaydı bul (Marka ve ModelNo eşleşmesi)
  const existingIndex = records.findIndex(
    (r) =>
      r.brand.toLowerCase() === record.brand.toLowerCase() &&
      r.modelNo.toLowerCase() === record.modelNo.toLowerCase() &&
      r.categoryId === record.categoryId
  );

  let savedRecord: CatalogProductRecord;

  if (existingIndex >= 0) {
    // Güncelle
    savedRecord = {
      ...records[existingIndex],
      ...record,
      id: records[existingIndex].id,
      updatedAt: now,
    };
    records[existingIndex] = savedRecord;
  } else {
    // Yeni Ekle
    const newId = `${record.brand.toLowerCase().replace(/[^a-z0-9]/g, '')}-${record.modelNo
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')}-${Date.now()}`;
    savedRecord = {
      ...record,
      id: newId,
      createdAt: now,
      updatedAt: now,
    };
    records.unshift(savedRecord); // En başa ekle
  }

  saveAllCatalogMemory(records);
  return savedRecord;
}

/**
 * Yapay zekaya referans sunmak için marka, kategori ve modele göre en alakalı geçmiş kayıtları bul
 */
export function findRelevantCatalogMemory(
  brand: string,
  categoryId?: number,
  typeId?: number,
  query?: string,
  limit = 5
): CatalogProductRecord[] {
  const records = getAllCatalogMemory();
  if (records.length === 0) return [];

  const brandLower = (brand || '').toLowerCase().trim();
  const queryLower = (query || '').toLowerCase().trim();

  // Puanlama sistemi ile sırala
  const scored = records.map((record) => {
    let score = 0;
    const recBrand = record.brand.toLowerCase();
    const recModel = record.modelNo.toLowerCase();

    // 1. Marka eşleşmesi (+10 puan)
    if (brandLower && recBrand === brandLower) {
      score += 10;
    }

    // 2. Kategori ID eşleşmesi (+8 puan)
    if (categoryId && record.categoryId === categoryId) {
      score += 8;
    }

    // 3. Tip ID eşleşmesi (+5 puan)
    if (typeId && record.typeId === typeId) {
      score += 5;
    }

    // 4. Sorgu içinde model/seri benzerliği (+5 puan)
    if (queryLower && (queryLower.includes(recModel) || recModel.includes(queryLower))) {
      score += 5;
    }

    return { record, score };
  });

  // En yüksek puanlı ve en az 10 puan almış (aynı marka veya aynı kategori) olanları getir
  return scored
    .filter((item) => item.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.record);
}

/**
 * Belirli bir kaydı sil
 */
export function deleteCatalogMemory(id: string): boolean {
  const records = getAllCatalogMemory();
  const filtered = records.filter((r) => r.id !== id);
  if (filtered.length !== records.length) {
    saveAllCatalogMemory(filtered);
    return true;
  }
  return false;
}
