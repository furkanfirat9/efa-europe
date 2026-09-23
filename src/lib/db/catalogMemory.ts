import type { CatalogMemory, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/*
  Panelden yüklenen ürünlerin hafızası. Eskiden data/catalog_memory.json dosyasında
  tutuluyordu; Vercel'de dosyaya yazılamadığı için canlı siteden yapılan yüklemeler
  hafızaya hiç girmiyordu. Artık CatalogMemory tablosundadır; eski kayıtlar
  scripts/seed_catalog_memory.mjs ile bir kez aktarıldı.
*/

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

function toRecord(row: CatalogMemory): CatalogProductRecord {
  return {
    id: row.id,
    asin: row.asin ?? undefined,
    brand: row.brand,
    modelNo: row.modelNo,
    categoryId: row.categoryId ?? 0,
    typeId: row.typeId ?? 0,
    categoryName: row.categoryName ?? '',
    typeName: row.typeName ?? '',
    seriesMergeCode: row.seriesMergeCode ?? '',
    namingTemplateModel: row.namingTemplateModel ?? '',
    partNumber: row.partNumber ?? undefined,
    aspects: (row.aspects as CatalogProductRecord['aspects']) ?? undefined,
    finalTitle: row.finalTitle ?? undefined,
    ozonTaskId: row.ozonTaskId ?? undefined,
    productQuery: row.productQuery ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Tüm kayıtlar, en yeni başta (dosyadaki sırayla aynı: yeni kayıt başa eklenirdi).
 * Okunamazsa hata fırlatır; mükerrer kontrolleri bunu kullanır, çünkü boş hafıza
 * "hiçbiri yüklü değil" demek olur.
 */
export async function loadCatalogMemory(): Promise<CatalogProductRecord[]> {
  const rows = await prisma.catalogMemory.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toRecord);
}

/**
 * loadCatalogMemory'nin hata yutan hâli: yapay zekâya referans gibi, hafıza olmadan da
 * sürebilen işler için.
 */
export async function getAllCatalogMemory(): Promise<CatalogProductRecord[]> {
  try {
    return await loadCatalogMemory();
  } catch (error) {
    console.error('Katalog hafızası okunurken hata:', error);
    return [];
  }
}

/**
 * Yeni ürün kaydet veya var olanı güncelle (Marka + Model No + Kategori bazlı)
 */
export async function saveProductToMemory(
  record: Omit<CatalogProductRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<CatalogProductRecord> {
  const data = {
    asin: record.asin || null,
    brand: record.brand,
    modelNo: record.modelNo,
    categoryId: record.categoryId ?? null,
    typeId: record.typeId ?? null,
    categoryName: record.categoryName ?? null,
    typeName: record.typeName ?? null,
    seriesMergeCode: record.seriesMergeCode ?? null,
    namingTemplateModel: record.namingTemplateModel ?? null,
    partNumber: record.partNumber ?? null,
    aspects: (record.aspects ?? undefined) as Prisma.InputJsonValue | undefined,
    finalTitle: record.finalTitle ?? null,
    productQuery: record.productQuery ?? null,
    ozonTaskId: record.ozonTaskId ?? null,
  };

  // Var olan kaydı bul (Marka ve ModelNo eşleşmesi, büyük/küçük harf duyarsız)
  const existing = await prisma.catalogMemory.findFirst({
    where: {
      brand: { equals: record.brand, mode: 'insensitive' },
      modelNo: { equals: record.modelNo, mode: 'insensitive' },
      categoryId: record.categoryId ?? null,
    },
  });

  const saved = existing
    ? await prisma.catalogMemory.update({ where: { id: existing.id }, data })
    : await prisma.catalogMemory.create({ data });
  return toRecord(saved);
}

/**
 * Yapay zekaya referans sunmak için marka, kategori ve modele göre en alakalı geçmiş kayıtları bul
 */
export async function findRelevantCatalogMemory(
  brand: string,
  categoryId?: number,
  typeId?: number,
  query?: string,
  limit = 5
): Promise<CatalogProductRecord[]> {
  const records = await getAllCatalogMemory();
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
export async function deleteCatalogMemory(id: string): Promise<boolean> {
  const { count } = await prisma.catalogMemory.deleteMany({ where: { id } });
  return count > 0;
}
