'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Layers,
  Sparkles,
  Play,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  ExternalLink,
  Plus,
  Image as ImageIcon,
  Edit3,
  X,
  RefreshCw,
  Info,
  DollarSign,
  Package,
  Zap,
  SlidersHorizontal,
  FolderTree,
  Search,
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { PreFilledAttribute, AttributeSelectedValue, isWarrantyAttribute, isMergeWithSimilarAttribute, isIgnoredAttribute, isCountryOfOriginAttribute, isStrictSingleValueAttribute } from '@/lib/ai/filler';
import AttributeSelectCard from '@/components/AttributeSelectCard';
import { PRESET_CATEGORIES, PresetCategory } from '@/lib/constants/presetCategories';
import PresetCategorySelector from '@/components/PresetCategorySelector';
import CategoryTreeModal from '@/components/CategoryTreeModal';
import { toast } from 'sonner';
import { looksLikeModelCode } from '@/lib/ozon/offerId';

export interface SelectedCategoryInfo {
  categoryId: number;
  typeId: number;
  categoryName: string;
  typeName: string;
  typeNameTR?: string;
  path: string[];
  confidence?: number;
}

export interface BulkProductItem {
  id: string;
  asin?: string;
  rawQuery: string;
  brand: string;
  modelNo: string;
  category: SelectedCategoryInfo | null;
  russianSeoTitle: string;
  price: string;
  oldPrice: string;
  primaryImage: string;
  additionalImages: string[];
  barcode: string;
  dimensions: { widthMm: number; heightMm: number; depthMm: number };
  weightG: number;
  attributes: PreFilledAttribute[];
  status: 'idle' | 'researching' | 'ready' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
  ozonTaskId?: number;
  selected: boolean;
  duplicateMatch?: {
    isDuplicate: boolean;
    offerId?: string;
    name?: string;
    price?: string;
    status?: string;
    source?: 'ozon_live' | 'catalog_memory';
  };
}


export default function TopluYuklePage() {
  const [inputText, setInputText] = useState('');
  const [items, setItems] = useState<BulkProductItem[]>([]);
  const [isDetectingCategories, setIsDetectingCategories] = useState(false);
  const [isParallelRunning, setIsParallelRunning] = useState(false);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [globalMessage, setGlobalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 15-20 Kanallı Canlı İlerleme Çubuğu Durumu
  const [activeTaskProgress, setActiveTaskProgress] = useState<{
    label: string;
    current: number;
    total: number;
    percent: number;
  } | null>(null);

  // KATEGORİ SEÇİMİ DURUMU (Toplu Yükleme Öncesi Belirlenen Ortak Kategori)
  const [selectedBatchCategory, setSelectedBatchCategory] = useState<SelectedCategoryInfo | null>(PRESET_CATEGORIES[0]);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [isSearchingCategory, setIsSearchingCategory] = useState(false);
  const [suggestedCategories, setSuggestedCategories] = useState<SelectedCategoryInfo[]>([]);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [isTreeModalOpen, setIsTreeModalOpen] = useState(false);

  // Kart 1 ve Kart 2'nin Açılır/Kapanır Durumu (Varsayılan KAPALI)
  const [isManualInputCardOpen, setIsManualInputCardOpen] = useState(false);
  const [isPresetCategoryCardOpen, setIsPresetCategoryCardOpen] = useState(false);

  // Detaylı Nitelik Düzenleme Modalı
  const [editingItem, setEditingItem] = useState<BulkProductItem | null>(null);
  const [showImageModalItem, setShowImageModalItem] = useState<BulkProductItem | null>(null);
  const [isFetchingModalGallery, setIsFetchingModalGallery] = useState(false);
  const [categoryModalItem, setCategoryModalItem] = useState<BulkProductItem | null>(null);
  const [treeModalTargetItemId, setTreeModalTargetItemId] = useState<string | null>(null);

  // Amazon Avcısı'ndan Gelen Ürünleri Otomatik Yükle
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('AMAZON_TRANSFER_ITEMS');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const transferItems: BulkProductItem[] = parsed.map((item: any, idx: number) => {
              const gallery = Array.isArray(item.galleryImages) && item.galleryImages.length > 0
                ? item.galleryImages
                : (item.image ? [item.image] : []);

              return {
                id: `amazon-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
                asin: item.asin || '',
                rawQuery: item.title || `${item.brand} ${item.modelNo}`,
                brand: item.brand || '',
                modelNo: String(item.modelNo || item.asin || `${item.brand || 'SKU'}-${idx + 1}`).trim().slice(0, 45),
                category: null, // Dinamik Kategori Tespiti için başlangıçta boş bırak
                russianSeoTitle: '',
                price: item.price || '',
                oldPrice: item.oldPrice || '',
                primaryImage: gallery[0] || item.image || '',
                additionalImages: gallery.length > 1 ? gallery.slice(1) : [],
                barcode: '',
                dimensions: { widthMm: 0, heightMm: 0, depthMm: 0 },
                weightG: 0,
                attributes: [],
                status: 'idle',
                selected: true,
              };
            });

            setItems((prev) => [...prev, ...transferItems]);
            setGlobalMessage({
              type: 'success',
              text: `⚡ Amazon Avcısı'ndan ${transferItems.length} adet ürün (çoklu galeri görselleriyle) aktarıldı! Lütfen "1. Adım: AI ile Kategorileri Tespit Et" butonuna basınız.`,
            });
            sessionStorage.removeItem('AMAZON_TRANSFER_ITEMS');
          }
        } catch (e) {
          console.error('Amazon transfer items parse error:', e);
        }
      }
    }
  }, []);

  // Yüksek Hızlı Eşzamanlı Havuz Motoru (Concurrency Worker Pool)
  async function runConcurrentPool<T, R>(
    tasks: T[],
    concurrencyLimit: number,
    taskFn: (item: T, idx: number) => Promise<R>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<R[]> {
    const results: R[] = new Array(tasks.length);
    let nextIndex = 0;
    let completedCount = 0;

    const workers = Array.from({ length: Math.min(concurrencyLimit, tasks.length) }, async () => {
      while (nextIndex < tasks.length) {
        const currentIdx = nextIndex++;
        try {
          results[currentIdx] = await taskFn(tasks[currentIdx], currentIdx);
        } catch (err: any) {
          results[currentIdx] = err;
        } finally {
          completedCount++;
          if (onProgress) onProgress(completedCount, tasks.length);
        }
      }
    });

    await Promise.all(workers);
    return results;
  }

  // Tüm Ürünlerin Kategorilerini 15-20 Kanallı AI ile Otomatik Tespit Et (1. ADIM)
  const handleBulkDetectCategories = async () => {
    if (items.length === 0) return;

    setIsDetectingCategories(true);
    setGlobalMessage(null);

    try {
      // 15'li Parçalar Halinde Grupla (Gemini Batch Standardı)
      const CHUNK_SIZE = 15;
      const chunks: BulkProductItem[][] = [];
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        chunks.push(items.slice(i, i + CHUNK_SIZE));
      }

      setActiveTaskProgress({
        label: '⚡ 15-20 Kanallı AI Kategori Tespiti',
        current: 0,
        total: items.length,
        percent: 0,
      });

      let totalProcessed = 0;
      // Kategorisi bulunamayan ya da isteği başarısız olan ürünler; mesajda söylenir.
      let notFound = 0;
      let failed = 0;

      // 4 Eşzamanlı Paralel Kategori Kanalı
      await runConcurrentPool(
        chunks,
        4,
        async (chunkItems) => {
          const payload = {
            items: chunkItems.map((i) => ({
              id: i.id,
              query: i.rawQuery || `${i.brand} ${i.modelNo}`,
            })),
          };

          const res = await fetch('/api/ai/bulk-detect-categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const data = await res.json().catch(() => ({}));
          if (data.success && data.results) {
            notFound += data.results.filter((r: any) => !r.category).length;
            setItems((prev) =>
              prev.map((item) => {
                const found = data.results.find((r: any) => r.id === item.id);
                return found ? { ...item, category: found.category } : item;
              })
            );
          } else {
            failed += chunkItems.length;
          }

          totalProcessed += chunkItems.length;
          const currentDone = Math.min(totalProcessed, items.length);
          setActiveTaskProgress({
            label: '⚡ 15-20 Kanallı AI Kategori Tespiti',
            current: currentDone,
            total: items.length,
            percent: Math.round((currentDone / items.length) * 100),
          });
        }
      );

      // 🚀 Tespit Edilen Kategorileri Arka Planda Sessizce RAM'e Isıt (Pre-warm)
      setTimeout(() => {
        setItems((currentItems) => {
          const catsToPrewarm = currentItems
            .map((i) => i.category)
            .filter((c): c is SelectedCategoryInfo => Boolean(c && c.categoryId && c.typeId));

          if (catsToPrewarm.length > 0) {
            fetch('/api/ozon/prewarm-categories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ categories: catsToPrewarm }),
            }).catch(() => {});
          }
          return currentItems;
        });
      }, 100);

      const detected = items.length - notFound - failed;
      const problems = [
        notFound > 0 && `${notFound} ürünün kategorisi bulunamadı`,
        failed > 0 && `${failed} ürün için tespit başarısız oldu`,
      ].filter(Boolean);
      setGlobalMessage(
        problems.length > 0
          ? {
              type: 'error',
              text: `${detected} ürünün kategorisi bulundu; ${problems.join(', ')}. Bunları tablodaki "Kategori Seç" ile seçin ya da tespiti tekrar çalıştırın.`,
            }
          : {
              type: 'success',
              text: `✅ ${items.length} ürünün Ozon kategorisi 15-20 kanallı yüksek hızlı paralel havuz ile tespit edildi!`,
            }
      );
    } catch (err: any) {
      setGlobalMessage({
        type: 'error',
        text: err.message || 'Kategoriler tespit edilirken hata oluştu.',
      });
    } finally {
      setIsDetectingCategories(false);
      setActiveTaskProgress(null);
    }
  };

  // Örnek Modelleri Ekle
  const handleInsertSampleQueries = () => {
    setInputText(`Philips NA350/00\nPhilips NA330/00\nTefal EY9018\nTefal EY7528E0\nTefal FW4018E0`);
  };

  // Kategori Arama veya AI ile Tespit Etme
  const handleSearchOrDetectCategory = async (overrideQuery?: string) => {
    const q = overrideQuery || categorySearchQuery || inputText.split('\n')[0] || '';
    if (!q.trim()) return;

    setIsSearchingCategory(true);
    try {
      const res = await fetch('/api/ai/research-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productQuery: q.trim(), language: 'TR' }),
      });
      const data = await res.json();
      if (data.success && data.data?.suggestedCategories?.length > 0) {
        setSuggestedCategories(data.data.suggestedCategories);
        setIsCategoryPickerOpen(true);
      }
    } catch (e) {
      console.error('Kategori arama hatası:', e);
    } finally {
      setIsSearchingCategory(false);
    }
  };

  // Metin Alanından Kuyruğa Ekle
  const handleParseAndAddItems = () => {
    if (!inputText.trim()) return;

    const lines = inputText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const newItems: BulkProductItem[] = lines.map((line, idx) => {
      const parts = line.split('|').map((p) => p.trim());
      const query = parts[0];
      const price = parts[1] || '';
      const image = parts[2] || '';

      return {
        id: `item-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
        rawQuery: query,
        brand: '',
        modelNo: query,
        category: selectedBatchCategory,
        russianSeoTitle: '',
        price: price,
        oldPrice: '',
        primaryImage: image,
        additionalImages: [],
        barcode: '',
        dimensions: { widthMm: 0, heightMm: 0, depthMm: 0 },
        weightG: 0,
        attributes: [],
        status: 'idle',
        selected: true,
      };
    });

    setItems((prev) => [...prev, ...newItems]);
    setInputText('');
    setGlobalMessage({
      type: 'success',
      text: `${newItems.length} ürün kuyruğa eklendi. Mükerrer ürün ve token koruma kontrolü yapılıyor...`,
    });

    // Mükerrer / Token Koruma Kontrolünü Anında Başlat
    const rawQueries = newItems.map((i) => i.rawQuery);
    fetch('/api/ozon/check-duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: rawQueries }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.results) {
          let dupeCount = 0;
          setItems((prev) =>
            prev.map((item) => {
              const match = data.results.find((r: any) => r.query === item.rawQuery);
              if (match && match.result.isDuplicate) {
                dupeCount++;
                return {
                  ...item,
                  selected: false, // Token Tasarrufu: Zaten yüklü olanları otomatik seçimden çıkar
                  duplicateMatch: {
                    isDuplicate: true,
                    offerId: match.result.matchedProduct?.offerId,
                    name: match.result.matchedProduct?.name,
                    price: match.result.matchedProduct?.price,
                    status: match.result.matchedProduct?.status,
                    source: match.result.matchedProduct?.source,
                  },
                };
              }
              return item;
            })
          );

          if (dupeCount > 0) {
            setGlobalMessage({
              type: 'success',
              text: `✅ ${newItems.length} ürün kuyrukta. 💡 ${dupeCount} ürün mağazanızda zaten yüklü olduğu için boşa token harcamamak adına otomatik seçimden kaldırıldı.`,
            });
          }
        }
      })
      .catch((err) => console.error('Bulk duplicate check error:', err));
  };

  // Mükerrer Olanları Seçimden Kaldır (Token Tasarrufu)
  const handleDeselectDuplicates = () => {
    setItems((prev) =>
      prev.map((i) => (i.duplicateMatch?.isDuplicate ? { ...i, selected: false } : i))
    );
  };

  // Tümünü Seç
  const handleSelectAllItems = () => {
    setItems((prev) => prev.map((i) => ({ ...i, selected: true })));
  };


  // Tek Bir Ürünü Araştır (Helper)
  const researchSingleItem = async (item: BulkProductItem, targetCat: SelectedCategoryInfo): Promise<Partial<BulkProductItem>> => {
    // 1. Marka ve Model Tespiti
    // Amazon'dan gelen üründe marka ve model kodu avcıdan gelir. Eskiden marka başlığın ilk kelimesi,
    // model kodu başlığın tamamıydı; yapay zekâ temiz kod döndürmeyince offer_id başlığın ilk 50 harfi
    // oluyordu. Model kodu gibi görünmeyen değer gönderilmez; kodu yapay zekâ bulur.
    const brandGuess = item.brand || item.rawQuery.split(' ')[0] || 'Genel';
    const modelGuess = looksLikeModelCode(item.modelNo) ? item.modelNo.trim() : '';

    // 2. Canlı Google Search Grounding ile Nitelik Doldurma
    const fillRes = await fetch('/api/ai/fill-attributes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: targetCat.categoryId,
        typeId: targetCat.typeId,
        categoryName: targetCat.categoryName,
        typeName: targetCat.typeName,
        brand: brandGuess,
        modelNo: modelGuess,
        productQuery: item.rawQuery,
        asin: item.asin || undefined,
        language: 'RU',
      }),
    });
    const fillData = await fillRes.json();
    if (!fillData.success) {
      throw new Error(fillData.error || 'Nitelikler araştırılırken hata oluştu.');
    }

    const resData = fillData.data;
    // Yapay zekânın bulduğu kod model kodu gibi değilse (başlık, seri adı) kullanılmaz; ikisi de
    // yoksa model kodu boş kalır ve tablodaki kırmızı kutudan elle girilir.
    const aiModel = String(resData.modelNo || '').trim();
    const finalModel = looksLikeModelCode(aiModel) ? aiModel : modelGuess;

    return {
      brand: resData.brand || brandGuess,
      modelNo: finalModel,
      category: targetCat,
      russianSeoTitle: resData.russianSeoTitle || `${resData.brand || brandGuess} ${finalModel || item.rawQuery}`,
      barcode: resData.barcode || '',
      dimensions: resData.dimensions || { widthMm: 0, heightMm: 0, depthMm: 0 },
      weightG: resData.weightG || 0,
      attributes: resData.attributes || [],
      status: 'ready',
      errorMessage: undefined,
    };
  };

  // Tüm Ürünleri Paralel Olarak Canlı Araştır (2. ADIM)
  const handleRunParallelResearch = async () => {
    // Kategori kontrolü
    const unassigned = items.filter((i) => !i.category && !selectedBatchCategory);
    if (unassigned.length > 0) {
      setGlobalMessage({
        type: 'error',
        text: `${unassigned.length} ürünün kategorisi yok. Tablodaki "Kategori Seç" ile seçin ya da önce "1. Adım: AI ile Kategorileri Tespit Et" butonuna basın.`,
      });
      return;
    }

    const idleOrErrorItems = items.filter((i) => i.status === 'idle' || i.status === 'error');
    if (idleOrErrorItems.length === 0) {
      setGlobalMessage({ type: 'error', text: 'Araştırılacak beklemede olan ürün bulunamadı.' });
      return;
    }

    setIsParallelRunning(true);
    setGlobalMessage(null);

    // Tümünü araştırılıyor durumuna al
    setItems((prev) =>
      prev.map((item) =>
        item.status === 'idle' || item.status === 'error'
          ? { ...item, status: 'researching', category: item.category || selectedBatchCategory }
          : item
      )
    );

    const CONCURRENCY_LIMIT = 16; // 16 Eşzamanlı Paralel Hat
    setActiveTaskProgress({
      label: `⚡ 16 Kanallı Canlı AI Nitelik & SEO Araştırması`,
      current: 0,
      total: idleOrErrorItems.length,
      percent: 0,
    });

    // 16 Kanallı Havuz ile Eşzamanlı Çalıştır
    await runConcurrentPool(
      idleOrErrorItems,
      CONCURRENCY_LIMIT,
      async (targetItem) => {
        try {
          const targetCat = targetItem.category || selectedBatchCategory;
          if (!targetCat) throw new Error('Kategori belirlenemedi');
          const update = await researchSingleItem(targetItem, targetCat);
          setItems((prev) =>
            prev.map((item) => (item.id === targetItem.id ? { ...item, ...update } : item))
          );
        } catch (err: any) {
          setItems((prev) =>
            prev.map((item) =>
              item.id === targetItem.id
                ? { ...item, status: 'error', errorMessage: err.message || 'Hata oluştu' }
                : item
            )
          );
        }
      },
      (completed, total) => {
        setActiveTaskProgress({
          label: `⚡ 16 Kanallı Canlı AI Nitelik & SEO Araştırması`,
          current: completed,
          total: total,
          percent: Math.round((completed / total) * 100),
        });
      }
    );

    setIsParallelRunning(false);
    setActiveTaskProgress(null);
    setGlobalMessage({
      type: 'success',
      text: `🎉 ${idleOrErrorItems.length} ürünün 16 kanallı AI araştırması tamamlandı! Şimdi fiyat ve görsellerinizi kontrol edip tek tıkla Ozon'a yükleyebilirsiniz.`,
    });
  };

  // Tekil Yeniden Araştırma
  const handleRetrySingle = async (itemId: string) => {
    const target = items.find((i) => i.id === itemId);
    if (!target) return;
    const cat = target.category || selectedBatchCategory;
    if (!cat) {
      setGlobalMessage({ type: 'error', text: 'Lütfen bir kategori seçiniz.' });
      return;
    }

    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: 'researching', errorMessage: undefined } : i))
    );

    try {
      const update = await researchSingleItem(target, cat);
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...update } : i)));
    } catch (err: any) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, status: 'error', errorMessage: err.message || 'Hata' } : i
        )
      );
    }
  };

  // Satır İçi Değer Güncelleme
  const handleUpdateItemField = (id: string, field: keyof BulkProductItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // Satır Sil
  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  // Tümünü Tekrar 'Hazır' Durumuna Al (Nitelikler & SEO Korunur)
  const handleResetAllToReady = () => {
    setItems((prev) =>
      prev.map((i) => ({
        ...i,
        status: i.attributes && i.attributes.length > 0 ? 'ready' : i.status,
        selected: true,
      }))
    );
    setGlobalMessage({
      type: 'success',
      text: 'Araştırılmış tüm ürünler tekrar "Hazır" durumuna alındı ve seçildi. Şimdi 3. Adım ile doğrudan Ozon\'a yükleyebilirsiniz.',
    });
  };

  // Tekil Ürünü 'Hazır' Durumuna Al
  const handleSetItemToReady = (id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: 'ready', selected: true } : i))
    );
  };

  // Canlı Amazon Galeri Çekme (Modal İçinden)
  const handleFetchModalGallery = async (item: BulkProductItem) => {
    if (!item.asin) {
      toast.warning('Bu ürün için Amazon ASIN kodu bulunamadı.');
      return;
    }
    setIsFetchingModalGallery(true);
    try {
      const res = await fetch('/api/amazon/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asin: item.asin, fallbackImage: item.primaryImage }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.images) && data.images.length > 0) {
        const newPrimary = data.images[0];
        const newAdditionals = data.images.slice(1);
        handleUpdateItemField(item.id, 'primaryImage', newPrimary);
        handleUpdateItemField(item.id, 'additionalImages', newAdditionals);
        setShowImageModalItem((prev) =>
          prev && prev.id === item.id
            ? { ...prev, primaryImage: newPrimary, additionalImages: newAdditionals }
            : prev
        );
        toast.success(`${data.images.length} görsel Amazon'dan çekildi`);
      } else {
        toast.error(data.error || 'Amazon galerisi çekilemedi.');
      }
    } catch (e: any) {
      toast.error('Galeri çekilemedi', { description: e.message });
    } finally {
      setIsFetchingModalGallery(false);
    }
  };

  // Seçilen Ek Görseli Ana Görsel Yap
  const handleSwapPrimaryImage = (itemId: string, targetImgUrl: string) => {
    const target = items.find((i) => i.id === itemId);
    if (!target) return;
    const oldPrimary = target.primaryImage;
    const newAdditionals = [
      oldPrimary,
      ...target.additionalImages.filter((img) => img !== targetImgUrl),
    ].filter((img) => img && img.trim().length > 0);

    handleUpdateItemField(itemId, 'primaryImage', targetImgUrl);
    handleUpdateItemField(itemId, 'additionalImages', newAdditionals);
    setShowImageModalItem((prev) =>
      prev && prev.id === itemId
        ? { ...prev, primaryImage: targetImgUrl, additionalImages: newAdditionals }
        : prev
    );
  };

  // Tümünü Seç / Kaldır
  const handleToggleSelectAll = (checked: boolean) => {
    setItems((prev) => prev.map((i) => ({ ...i, selected: checked })));
  };

  // Ozon Payload Üretici (Tekil Ürün İçin)
  const buildSingleOzonPayload = (item: BulkProductItem) => {
    const validImages = [item.primaryImage, ...item.additionalImages].filter((img) => img && img.trim().length > 0);

    const formattedAttributes = item.attributes
      .filter((attr) => (attr.selectedValues && attr.selectedValues.length > 0) || (attr.valueText && attr.valueText.trim().length > 0))
      .map((attr) => {
        const isStrictSingle = isStrictSingleValueAttribute({ attributeId: attr.attributeId, name: attr.name }) || !attr.isCollection;
        if (attr.isCollection && !isStrictSingle && attr.selectedValues && attr.selectedValues.length > 0) {
          return {
            complex_id: 0,
            id: attr.attributeId,
            values: attr.selectedValues.map((v) => ({
              dictionary_value_id: v.dictionaryValueId || 0,
              value: v.value,
            })),
          };
        }
        const firstVal = attr.selectedValues?.[0]?.value || attr.valueText || '';
        const firstDictId = attr.selectedValues?.[0]?.dictionaryValueId || attr.dictionaryValueId || 0;
        return {
          complex_id: 0,
          id: attr.attributeId,
          values: [
            {
              dictionary_value_id: firstDictId,
              value: firstVal,
            },
          ],
        };
      });

    return {
      attributes: formattedAttributes,
      barcode: item.barcode || undefined,
      description_category_id: item.category?.categoryId || selectedBatchCategory?.categoryId || 0,
      type_id: item.category?.typeId || selectedBatchCategory?.typeId || undefined,
      currency_code: 'USD',
      depth: Number(item.dimensions.depthMm) || 0,
      dimension_unit: 'mm',
      height: Number(item.dimensions.heightMm) || 0,
      images: validImages.slice(1),
      name: item.russianSeoTitle,
      offer_id: (item.modelNo || item.id || `SKU-${Date.now()}`).trim().slice(0, 50),
      old_price: item.oldPrice ? item.oldPrice : undefined,
      price: item.price,
      primary_image: item.primaryImage || validImages[0] || '',
      vat: '0',
      weight: Number(item.weightG) || 0,
      weight_unit: 'g',
      width: Number(item.dimensions.widthMm) || 0,
    };
  };

  // Toplu Ozon Yükleme (Batch Upload)
  const handleBatchUploadToOzon = async () => {
    const selectedItems = items.filter((i) => i.selected && (i.status === 'ready' || i.status === 'error' || i.status === 'success'));

    if (selectedItems.length === 0) {
      setGlobalMessage({
        type: 'error',
        text: 'Lütfen Ozon\'a yüklemek için en az bir ürün seçiniz.',
      });
      return;
    }

    // Eksik alan kontrolü (Model kodu, Fiyat ve Görsel)
    for (const item of selectedItems) {
      // offer_id model kodundan oluşur; başlık parçası mağazada bozuk ürün kodu bırakıyordu.
      if (!looksLikeModelCode(item.modelNo)) {
        setGlobalMessage({
          type: 'error',
          text: `"${item.rawQuery.slice(0, 50)}" için geçerli bir model kodu yok. Tablodaki kırmızı "Model kodu" kutusuna girin (örn: HD9350/90); Ozon'da ürün kodu olarak kullanılır.`,
        });
        return;
      }
      if (!item.price || Number(item.price) <= 0) {
        setGlobalMessage({
          type: 'error',
          text: `"${item.modelNo}" için lütfen geçerli bir satış fiyatı ($) giriniz.`,
        });
        return;
      }
      if (!item.primaryImage || !item.primaryImage.trim()) {
        setGlobalMessage({
          type: 'error',
          text: `"${item.modelNo}" için lütfen ana görsel URL bağlantısı giriniz.`,
        });
        return;
      }
    }

    setIsBatchUploading(true);
    setGlobalMessage(null);

    // Ürünleri uploading durumuna al
    setItems((prev) =>
      prev.map((i) =>
        selectedItems.some((s) => s.id === i.id) ? { ...i, status: 'uploading' } : i
      )
    );

    // Her ürünü Ozon'a gönder
    for (const item of selectedItems) {
      try {
        const payloadItem = buildSingleOzonPayload(item);
        const res = await fetch('/api/ozon/product/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [payloadItem] }),
        });
        const resData = await res.json();

        if (resData.success) {
          const taskId = resData.taskId;
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, status: 'success', ozonTaskId: taskId } : i
            )
          );

          // Katalog Hafızasına Kaydet
          try {
            const seriesAttr = item.attributes.find((a) => a.attributeId === 9048);
            const namingAttr = item.attributes.find(
              (a) => a.attributeId === 12141 || a.attributeId === 20776
            );
            const partAttr = item.attributes.find((a) => a.attributeId === 4381);
            const colorAttr = item.attributes.find((a) => a.attributeId === 10096);
            const volumeAttr = item.attributes.find((a) => a.attributeId === 6378);

            await fetch('/api/catalog-memory', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                asin: item.asin || undefined,
                brand: item.brand,
                modelNo: item.modelNo,
                categoryId: item.category?.categoryId || selectedBatchCategory?.categoryId,
                typeId: item.category?.typeId || selectedBatchCategory?.typeId,
                categoryName: item.category?.categoryName || selectedBatchCategory?.categoryName,
                typeName: item.category?.typeName || selectedBatchCategory?.typeName,
                seriesMergeCode: seriesAttr?.valueText || '',
                namingTemplateModel: namingAttr?.valueText || '',
                partNumber: partAttr?.valueText || item.modelNo,
                aspects: {
                  color: colorAttr?.valueText || '',
                  volumeLiters: volumeAttr?.valueText || '',
                },
                finalTitle: item.russianSeoTitle,
                productQuery: item.rawQuery,
                ozonTaskId: String(taskId),
              }),
            });
          } catch (memErr) {}
        } else {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: 'error', errorMessage: resData.error || 'Yükleme başarısız' }
                : i
            )
          );
        }
      } catch (err: any) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: 'error', errorMessage: err.message || 'Bağlantı hatası' }
              : i
          )
        );
      }
    }

    setIsBatchUploading(false);
    setGlobalMessage({
      type: 'success',
      text: 'Seçili ürünlerin Ozon yükleme işlemi tamamlandı! Ozon Task ID\'lerini tablodan kontrol edebilirsiniz.',
    });
  };

  const readyCount = items.filter((i) => i.status === 'ready').length;
  const successCount = items.filter((i) => i.status === 'success').length;
  const selectedCount = items.filter((i) => i.selected).length;
  const canUploadCount = items.filter((i) => i.selected && (i.status === 'ready' || i.status === 'success' || i.status === 'error')).length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Üst Başlık */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Toplu Ürün Yükleme (Paralel AI)</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Hedef kategorinizi belirleyin, modelleri verin; Google canlı arama ile eş zamanlı araştırıp, hızlıca fiyat/görsellerinizi girerek tek tıkla Ozon&apos;a yükleyin.
          </p>
        </div>

        {/* Sayaç Rozetleri */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-slate-500" />
            <span>Toplam: {items.length}</span>
          </div>
          <div className="px-3.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Yüklenen: {successCount}</span>
          </div>
        </div>
      </div>

      {/* 15-20 Kanallı Canlı Paralel İlerleme Çubuğu */}
      {activeTaskProgress && (
        <div className="p-5 rounded-2xl bg-linear-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg space-y-3 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-sm font-bold tracking-wide">{activeTaskProgress.label}</span>
            </div>
            <span className="text-xs font-mono font-bold bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-xs">
              {activeTaskProgress.current} / {activeTaskProgress.total} Ürün (%{activeTaskProgress.percent})
            </span>
          </div>

          {/* İlerleme Çubuğu */}
          <div className="w-full bg-black/20 rounded-full h-3 p-0.5 backdrop-blur-xs overflow-hidden">
            <div
              className="bg-linear-to-r from-emerald-400 to-cyan-300 h-full rounded-full transition-all duration-300 shadow-xs"
              style={{ width: `${Math.max(activeTaskProgress.percent, 3)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-blue-100 font-medium">
            <span>🚀 16 Eşzamanlı Gemini 3.8 Flash kanalıyla Google Canlı Arama yürütülüyor</span>
            <span>Kalan: {Math.max(0, activeTaskProgress.total - activeTaskProgress.current)} ürün</span>
          </div>
        </div>
      )}

      {/* Global Bildirim */}
      {globalMessage && (
        <div
          className={`p-4 rounded-xl text-sm font-medium flex items-start gap-3 border transition-all ${
            globalMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {globalMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">{globalMessage.text}</div>
          <button onClick={() => setGlobalMessage(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. KART: TOPLU MODEL GİRİŞ KUTUSU (VARSAYILAN KAPALI) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setIsManualInputCardOpen(!isManualInputCardOpen)}
          className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50/80 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0">
              1
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Manuel Model Girişi (Alt Alta Yazma)
                <span className="text-xs font-normal text-slate-400">
                  {isManualInputCardOpen ? '— Açık' : '— Kapalı (Tıklayarak Aç)'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Amazon Avcısı yerine elinizdeki model listesini manuel alt alta yapıştırarak eklemek için kullanın.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            {isManualInputCardOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {isManualInputCardOpen && (
          <div className="p-6 pt-2 space-y-4 border-t border-slate-100 animate-in fade-in duration-200">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleInsertSampleQueries}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" /> Örnek Airfryer Modelleri Doldur
              </button>
            </div>
            <div className="space-y-2">
              <textarea
                rows={4}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Her satıra bir marka/model yazınız (Örn: Philips NA350/00&#10;Tefal EY9018&#10;Tefal EY7528E0)&#10;Dilerseniz boru (|) ile fiyat ve resim de ekleyebilirsiniz: Philips NA350/00 | 180 | https://.../img.jpg"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50"
              />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Yazdığınız tüm ürünler aşağıdaki seçili Ozon kategorisinde paralel araştırılacaktır.</span>
                <button
                  type="button"
                  onClick={handleParseAndAddItems}
                  disabled={!inputText.trim()}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Kuyruğa Ekle
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. KART: HEDEF OZON KATEGORİ SEÇİCİ (VARSAYILAN KAPALI) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setIsPresetCategoryCardOpen(!isPresetCategoryCardOpen)}
          className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50/80 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0">
              2
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Ortak Varsayılan Ozon Kategorisi Seçimi
                <span className="text-xs font-normal text-slate-400">
                  {isPresetCategoryCardOpen ? '— Açık' : '— Kapalı (Tıklayarak Aç)'}
                </span>
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-500">Mevcut Ortak Kategori:</span>
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  <FolderTree className="w-3 h-3 text-blue-500" />
                  {selectedBatchCategory?.typeNameTR || selectedBatchCategory?.typeName || 'Seçilmemiş'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            {isPresetCategoryCardOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {isPresetCategoryCardOpen && (
          <div className="p-6 pt-2 space-y-4 border-t border-slate-100 animate-in fade-in duration-200">
            <PresetCategorySelector
              selectedTypeId={selectedBatchCategory?.typeId}
              onSelectCategory={(cat) => {
                setSelectedBatchCategory(cat);
                setIsCategoryPickerOpen(false);
              }}
              title="Ortak Hedef Ozon Kategorisini Seçin"
            />

            {/* Manuel Ozon Arama Butonları */}
            <div className="flex items-center justify-between px-2 text-xs pt-2">
              <button
                type="button"
                onClick={() => setIsCategoryPickerOpen(!isCategoryPickerOpen)}
                className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{isCategoryPickerOpen ? 'Özel Kategori Aramayı Kapat' : 'Hazır listede yok mu? Ozon ağacında arayın'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTreeModalTargetItemId(null);
                  setIsTreeModalOpen(true);
                }}
                className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1.5 bg-blue-50/70 hover:bg-blue-100/80 px-2.5 py-1 rounded-lg border border-blue-200/60 transition-colors"
              >
                <FolderTree className="w-3.5 h-3.5" /> 🌲 Tüm Ağaçtan Seç
              </button>
            </div>

            {/* Manuel Ozon Arama & AI Tespit Alanı (Gerektiğinde Açılır) */}
            {isCategoryPickerOpen && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 mt-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Farklı Bir Ozon Kategorisi Arayın:</span>
                  <button
                    type="button"
                    onClick={() => setIsCategoryPickerOpen(false)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Kapat
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={categorySearchQuery}
                      onChange={(e) => setCategorySearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchOrDetectCategory()}
                      placeholder="Örn: Vantilatör, Buharlı paspas, Saç maşası..."
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSearchOrDetectCategory()}
                    disabled={isSearchingCategory}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSearchingCategory ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Aranıyor...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Ağaçta Bul</span>
                      </>
                    )}
                  </button>
                </div>

                {/* AI Kategori Önerileri */}
                {suggestedCategories.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <span className="text-xs font-bold text-slate-700 block">Bulunan Ozon Kategorileri:</span>
                    {suggestedCategories.map((cat, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedBatchCategory(cat);
                          setIsCategoryPickerOpen(false);
                        }}
                        className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/50 cursor-pointer flex items-center justify-between transition-all"
                      >
                        <div>
                          <div className="font-bold text-xs text-slate-900">{cat.typeName}</div>
                          <div className="text-[11px] text-slate-500">{cat.path.join(' › ')}</div>
                        </div>
                        <span className="px-2 py-1 rounded-sm bg-blue-100 text-blue-800 text-[10px] font-bold">
                          Seç
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. ADIM: TABLO VE TOPLU AKSİYONLAR */}
      {items.length > 0 && (
        <div className="space-y-4">
          {/* ⚠️ TOKEN TASARRUFU & MÜKERRER ÜRÜN UYARI BANNERI */}
          {items.filter((i) => i.duplicateMatch?.isDuplicate).length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50/95 border-2 border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-800 animate-in fade-in-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-200 text-amber-900 shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-700 animate-bounce" />
                </div>
                <div>
                  <div className="text-xs font-bold text-amber-950 flex items-center gap-2">
                    <span>Token Tasarrufu: {items.filter((i) => i.duplicateMatch?.isDuplicate).length} Ürün Zaten Mağazanızda Yüklü!</span>
                    <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                      Otomatik Koruma
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Boşa Gemini 3.8 tokeni tüketmemek için mağazanızda zaten var olan ürünler otomatik olarak seçimden çıkarıldı.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDeselectDuplicates}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Yüklüleri Seçimden Kaldır</span>
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllItems}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100/60 text-amber-900 border border-amber-300 text-xs font-medium transition-colors"
                >
                  Tümünü Seç
                </button>
              </div>
            </div>
          )}

          {/* Aksiyon Çubuğu */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* 1. ADIM BUTONU */}
              <button
                type="button"
                onClick={handleBulkDetectCategories}
                disabled={isDetectingCategories || isParallelRunning || isBatchUploading || items.length === 0}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 shadow-xs shadow-indigo-500/20 transition-all"
              >
                {isDetectingCategories ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AI Kategorileri Eşliyor...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>1. Adım: AI ile Kategorileri Bul ({items.filter((i) => i.category).length}/{items.length})</span>
                  </>
                )}
              </button>

              {/* 2. ADIM BUTONU */}
              <button
                type="button"
                onClick={handleRunParallelResearch}
                disabled={isDetectingCategories || isParallelRunning || isBatchUploading || items.length === 0}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-xs shadow-blue-500/20 transition-all"
              >
                {isParallelRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Google ile Nitelikler Araştırılıyor...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>2. Adım: Nitelikleri Canlı Araştır</span>
                  </>
                )}
              </button>

              {items.some((i) => i.status === 'success' || i.status === 'error') && (
                <button
                  type="button"
                  onClick={handleResetAllToReady}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 border border-slate-300 transition-all"
                  title="Nitelikleri koruyarak tüm ürünleri tekrar yüklenebilir 'Hazır' durumuna getirir"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                  <span>Tümünü &apos;Hazır&apos;a Al</span>
                </button>
              )}

              <span className="text-xs text-slate-500 font-medium pl-2">
                {readyCount} ürün hazır • {selectedCount} seçili
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* 3. ADIM BUTONU */}
              <button
                type="button"
                onClick={handleBatchUploadToOzon}
                disabled={isDetectingCategories || isParallelRunning || isBatchUploading || canUploadCount === 0}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 shadow-xs shadow-emerald-500/20 transition-all"
              >
                {isBatchUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Ozon&apos;a Yükleniyor...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>3. Adım: Seçili {canUploadCount} Ürünü Ozon&apos;a Yükle</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Hızlı Tablo Görünümü */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={items.length > 0 && items.every((i) => i.selected)}
                        onChange={(e) => handleToggleSelectAll(e.target.checked)}
                        className="rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="p-3 min-w-[220px]">Model, Marka & Kategori</th>
                    <th className="p-3 min-w-[280px]">Rusça SEO Başlık</th>
                    <th className="p-3 min-w-[130px]">Teknik Bilgi</th>
                    <th className="p-3 min-w-[120px]">💰 Fiyat ($)</th>
                    <th className="p-3 min-w-[220px]">🖼️ Ana Görsel URL</th>
                    <th className="p-3 min-w-[120px]">Nitelikler</th>
                    <th className="p-3 min-w-[120px] text-right">Durum</th>
                    <th className="p-3 w-12 text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {items.map((item) => {
                    const volumeAttr = item.attributes.find((a) => a.attributeId === 6378);
                    const powerAttr = item.attributes.find((a) => a.attributeId === 4851);
                    const seriesAttr = item.attributes.find((a) => a.attributeId === 9048);

                    return (
                      <tr key={item.id} className={`hover:bg-slate-50/60 transition-colors ${item.selected ? 'bg-blue-50/10' : ''}`}>
                        {/* Checkbox */}
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={(e) => handleUpdateItemField(item.id, 'selected', e.target.checked)}
                            className="rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>

                        {/* Model, Marka & Kategori */}
                        <td className="p-3">
                          <div className="font-bold text-slate-900 leading-snug">{item.rawQuery}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {item.category ? (
                              <button
                                type="button"
                                onClick={() => setCategoryModalItem(item)}
                                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-all cursor-pointer group"
                                title="Kategoriyi değiştirmek için tıklayın"
                              >
                                <FolderTree className="w-3 h-3 text-blue-500" />
                                <span>{item.category.typeNameTR || item.category.typeName}</span>
                                <Edit3 className="w-2.5 h-2.5 text-blue-400 group-hover:text-blue-600 transition-colors ml-0.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setCategoryModalItem(item)}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer transition-all"
                                title="Manuel kategori atamak için tıklayın"
                              >
                                <Plus className="w-3 h-3 text-amber-600" />
                                <span>Kategori Seç</span>
                              </button>
                            )}
                            {item.brand && (
                              <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-slate-100 text-slate-700">
                                {item.brand}
                              </span>
                            )}
                            {seriesAttr?.valueText && (
                              <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono bg-purple-50 text-purple-700 border border-purple-100">
                                {seriesAttr.valueText}
                              </span>
                            )}
                          </div>
                          <label className="mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                            <span className="shrink-0">Model kodu</span>
                            <input
                              type="text"
                              value={item.modelNo}
                              onChange={(e) => handleUpdateItemField(item.id, 'modelNo', e.target.value)}
                              placeholder="örn: HD9350/90"
                              aria-invalid={!looksLikeModelCode(item.modelNo)}
                              title="Ozon'da ürün kodu (offer_id) olarak kullanılır"
                              className={`w-36 px-1.5 py-0.5 rounded-sm border font-mono text-[11px] text-slate-900 focus:outline-hidden focus:ring-1 ${
                                looksLikeModelCode(item.modelNo)
                                  ? 'border-slate-200 focus:ring-blue-500'
                                  : 'border-red-400 bg-red-50 focus:ring-red-500'
                              }`}
                            />
                          </label>
                          {item.duplicateMatch?.isDuplicate && (
                            <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300">
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>Zaten Mağazada: {item.duplicateMatch.offerId || ''}</span>
                            </div>
                          )}
                        </td>


                        {/* Rusça Başlık */}
                        <td className="p-3">
                          {item.status === 'ready' || item.status === 'success' || item.status === 'uploading' ? (
                            <textarea
                              rows={2}
                              value={item.russianSeoTitle}
                              onChange={(e) => handleUpdateItemField(item.id, 'russianSeoTitle', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500 bg-white leading-relaxed"
                            />
                          ) : (
                            <span className="text-slate-400 italic">Araştırma bekleniyor...</span>
                          )}
                        </td>

                        {/* Teknik Bilgi (Litre / Watt / Ebat) */}
                        <td className="p-3 space-y-1">
                          <div className="flex flex-wrap gap-1">
                            {volumeAttr?.valueText && (
                              <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                {volumeAttr.valueText} L
                              </span>
                            )}
                            {powerAttr?.valueText && (
                              <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                {powerAttr.valueText} W
                              </span>
                            )}
                          </div>
                          {item.dimensions?.widthMm > 0 && (
                            <div className="text-[10px] font-mono text-slate-400">
                              {item.dimensions.widthMm}x{item.dimensions.heightMm}x{item.dimensions.depthMm} mm
                            </div>
                          )}
                        </td>

                        {/* Fiyat ($) */}
                        <td className="p-3 space-y-1">
                          <div className="relative">
                            <span className="absolute left-2 top-1.5 text-slate-400 text-xs font-semibold">$</span>
                            <input
                              type="number"
                              step="0.01"
                              value={item.price}
                              onChange={(e) => handleUpdateItemField(item.id, 'price', e.target.value)}
                              placeholder="Fiyat"
                              className="w-full pl-5 pr-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 bg-white"
                            />
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            value={item.oldPrice}
                            onChange={(e) => handleUpdateItemField(item.id, 'oldPrice', e.target.value)}
                            placeholder="Eski Fiyat"
                            className="w-full px-2 py-1 text-[11px] rounded-sm border border-slate-200 text-slate-400 bg-white"
                          />
                        </td>

                        {/* Ana Görsel ve Galeri */}
                        <td className="p-3 space-y-1.5 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setShowImageModalItem(item)}
                              className="relative group shrink-0 w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer"
                              title="Tüm Görsel Galerisini Aç"
                            >
                              {item.primaryImage ? (
                                <img
                                  src={item.primaryImage}
                                  alt="Önizleme"
                                  className="w-full h-full object-contain p-0.5 group-hover:scale-110 transition-transform"
                                  onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                  <ImageIcon className="w-4 h-4" />
                                </div>
                              )}
                              {item.additionalImages?.length > 0 && (
                                <span className="absolute bottom-0 right-0 bg-blue-600 text-white font-bold text-[8px] px-1 rounded-tl">
                                  +{item.additionalImages.length}
                                </span>
                              )}
                            </button>

                            <input
                              type="text"
                              value={item.primaryImage}
                              onChange={(e) => handleUpdateItemField(item.id, 'primaryImage', e.target.value)}
                              placeholder="https://.../resim.jpg"
                              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500 bg-white"
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setShowImageModalItem(item)}
                              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-sm transition-colors"
                            >
                              <ImageIcon className="w-3 h-3" />
                              <span>{1 + (item.additionalImages?.length || 0)} Görsel Galerisi</span>
                            </button>
                            {item.asin && (
                              <span className="text-[10px] font-mono text-slate-400">
                                ASIN: {item.asin}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Nitelikler Modal Butonu */}
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => setEditingItem(item)}
                            disabled={item.attributes.length === 0}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] flex items-center gap-1.5 border border-slate-200 disabled:opacity-40"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                            <span>{item.attributes.length} Nitelik</span>
                          </button>
                        </td>

                        {/* Durum */}
                        <td className="p-3 text-right">
                          {item.status === 'idle' && (
                            <span className="px-2 py-1 rounded-sm text-[10px] font-semibold bg-slate-100 text-slate-600">
                              Beklemede
                            </span>
                          )}
                          {item.status === 'researching' && (
                            <span className="px-2 py-1 rounded-sm text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 justify-end">
                              <Loader2 className="w-3 h-3 animate-spin" /> Araştırılıyor
                            </span>
                          )}
                          {item.status === 'ready' && (
                            <span className="px-2 py-1 rounded-sm text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 justify-end">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Hazır
                            </span>
                          )}
                          {item.status === 'uploading' && (
                            <span className="px-2 py-1 rounded-sm text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1 justify-end">
                              <Loader2 className="w-3 h-3 animate-spin" /> Yükleniyor
                            </span>
                          )}
                          {item.status === 'success' && (
                            <div className="space-y-0.5">
                              <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-block">
                                Yüklendi ✅
                              </span>
                              {item.ozonTaskId && (
                                <div className="text-[10px] font-mono text-slate-500">
                                  ID: {item.ozonTaskId}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => handleSetItemToReady(item.id)}
                                className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 justify-end mt-0.5"
                                title="Bu ürünü tekrar 'Hazır' durumuna getir"
                              >
                                <RefreshCw className="w-2.5 h-2.5" /> Tekrar Yükle
                              </button>
                            </div>
                          )}
                          {item.status === 'error' && (
                            <div className="space-y-1">
                              <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-block">
                                Hata
                              </span>
                              <div className="text-[10px] text-rose-600 max-w-[120px] truncate" title={item.errorMessage}>
                                {item.errorMessage}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRetrySingle(item.id)}
                                className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 justify-end"
                              >
                                <RefreshCw className="w-2.5 h-2.5" /> Tekrar Dene
                              </button>
                            </div>
                          )}
                        </td>

                        {/* İşlem */}
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-sm"
                            title="Satırı Kaldır"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DETAYLI NİTELİK DÜZENLEME MODALI */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Nitelik Düzenleyici: {editingItem.rawQuery}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingItem.brand} • {editingItem.category?.typeName || 'Kategori'}
                </p>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Attribute Cards */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {editingItem.attributes.map((attr) => (
                  <AttributeSelectCard
                    key={attr.attributeId}
                    attribute={attr}
                    categoryId={editingItem.category?.categoryId || selectedBatchCategory?.categoryId || 0}
                    typeId={editingItem.category?.typeId || selectedBatchCategory?.typeId || 0}
                    language="RU"
                    onValueChange={(attrId, valText, dictId, selVals) => {
                      const updatedAttributes = editingItem.attributes.map((a) =>
                        a.attributeId === attrId
                          ? {
                              ...a,
                              valueText: valText,
                              dictionaryValueId: dictId,
                              selectedValues: selVals || [{ value: valText, dictionaryValueId: dictId }],
                              matchStatus: valText ? 'matched' as const : 'manual_needed' as const,
                            }
                          : a
                      );

                      const updatedItem = { ...editingItem, attributes: updatedAttributes };
                      setEditingItem(updatedItem);
                      setItems((prev) =>
                        prev.map((i) => (i.id === editingItem.id ? updatedItem : i))
                      );
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 shadow-xs"
              >
                Tamam ve Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🖼️ INTERAKTİF ÜRÜN GÖRSEL GALERİSİ MODALI */}
      {showImageModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <span>Görsel Galerisi & Yönetimi</span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      {1 + (showImageModalItem.additionalImages?.length || 0)} Görsel
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 max-w-xl truncate mt-0.5">
                    {showImageModalItem.brand} • {showImageModalItem.modelNo} — {showImageModalItem.rawQuery}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {showImageModalItem.asin && (
                  <button
                    type="button"
                    onClick={() => handleFetchModalGallery(showImageModalItem)}
                    disabled={isFetchingModalGallery}
                    className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    title="Amazon ürün sayfasından 6-10 adet yüksek çözünürlüklü görseli canlı çeker"
                  >
                    {isFetchingModalGallery ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                        <span>Amazon'dan Çekiliyor...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 text-amber-600" />
                        <span>Amazon Galerisini Yenile</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => setShowImageModalItem(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Görsel Vitrini & Galeri */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
              {/* 1. ANA VİTRİN GÖRSELİ KARTI */}
              <div className="bg-white p-4 rounded-xl border-2 border-blue-500 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-700 flex items-center gap-1.5 uppercase tracking-wide">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    ⭐ 1. Ana Vitrin Görseli (Ozon Primary Image)
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">Müşterinin ilk göreceği kapak görseli</span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-36 h-36 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center relative group">
                    {showImageModalItem.primaryImage ? (
                      <img
                        src={showImageModalItem.primaryImage}
                        alt="Ana Görsel"
                        className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">Görsel Yok</span>
                    )}
                    {showImageModalItem.primaryImage && (
                      <a
                        href={showImageModalItem.primaryImage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-white/90 shadow-xs text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Yeni Sekmede Büyüt"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex-1 space-y-2 w-full">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Ana Görsel Bağlantısı (URL):
                    </label>
                    <input
                      type="text"
                      value={showImageModalItem.primaryImage}
                      onChange={(e) => {
                        handleUpdateItemField(showImageModalItem.id, 'primaryImage', e.target.value);
                        setShowImageModalItem({ ...showImageModalItem, primaryImage: e.target.value });
                      }}
                      placeholder="https://m.media-amazon.com/images/I/...jpg"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                    />
                    <p className="text-[11px] text-slate-500 leading-normal">
                      💡 Aşağıdaki galeri görsellerinden herhangi birini tek tıkla <strong>"Ana Görsel Yap"</strong> butonuna basarak buraya taşıyabilirsiniz.
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. EK GALERİ GÖRSELLERİ IZGARASI */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                    <Layers className="w-4 h-4 text-slate-600" />
                    Ek Galeri Görselleri ({showImageModalItem.additionalImages?.length || 0} Adet)
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...(showImageModalItem.additionalImages || []), ''];
                      handleUpdateItemField(showImageModalItem.id, 'additionalImages', updated);
                      setShowImageModalItem({ ...showImageModalItem, additionalImages: updated });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-600" />
                    Manuel URL Ekle
                  </button>
                </div>

                {(!showImageModalItem.additionalImages || showImageModalItem.additionalImages.length === 0) ? (
                  <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-300 text-slate-400 space-y-2">
                    <ImageIcon className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="text-xs font-medium">Henüz ek galeri görseli eklenmedi.</p>
                    {showImageModalItem.asin && (
                      <button
                        type="button"
                        onClick={() => handleFetchModalGallery(showImageModalItem)}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 inline-flex items-center gap-1.5"
                      >
                        <Zap className="w-3.5 h-3.5" /> Amazon'dan Tüm Görselleri Otomatik Getir
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {showImageModalItem.additionalImages.map((imgUrl, idx) => (
                      <div
                        key={idx}
                        className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2 flex flex-col justify-between group hover:border-blue-300 transition-colors"
                      >
                        {/* Görsel Önizleme */}
                        <div className="w-full h-32 bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center relative border border-slate-100">
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt={`Galeri #${idx + 1}`}
                              className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                              onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                            />
                          ) : (
                            <span className="text-[10px] text-slate-400">Boş URL</span>
                          )}

                          <span className="absolute top-1 left-1 bg-slate-900/70 text-white font-mono text-[9px] px-1.5 py-0.5 rounded-sm">
                            #{idx + 2}
                          </span>

                          {imgUrl && (
                            <a
                              href={imgUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="absolute top-1 right-1 p-1 rounded-sm bg-white/90 text-slate-700 shadow-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Büyük Boyut Aç"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>

                        {/* URL Düzenleme */}
                        <input
                          type="text"
                          value={imgUrl}
                          onChange={(e) => {
                            const updated = [...showImageModalItem.additionalImages];
                            updated[idx] = e.target.value;
                            handleUpdateItemField(showImageModalItem.id, 'additionalImages', updated);
                            setShowImageModalItem({ ...showImageModalItem, additionalImages: updated });
                          }}
                          placeholder="https://...jpg"
                          className="w-full px-2 py-1 text-[10px] font-mono rounded-sm border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500 bg-white"
                        />

                        {/* Kart Aksiyonları */}
                        <div className="flex items-center gap-1 pt-1 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => handleSwapPrimaryImage(showImageModalItem.id, imgUrl)}
                            disabled={!imgUrl}
                            className="flex-1 py-1 rounded-sm bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors disabled:opacity-40"
                            title="Bu görseli 1. Ana Vitrin Görseli yap"
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>Ana Görsel Yap</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = showImageModalItem.additionalImages.filter((_, i) => i !== idx);
                              handleUpdateItemField(showImageModalItem.id, 'additionalImages', updated);
                              setShowImageModalItem({ ...showImageModalItem, additionalImages: updated });
                            }}
                            className="p-1 rounded-sm bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Görseli Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Ozon API'sine <strong>1 Ana + {showImageModalItem.additionalImages?.filter(Boolean).length || 0} Ek Görsel</strong> gönderilecek.
              </div>

              <button
                type="button"
                onClick={() => setShowImageModalItem(null)}
                className="px-6 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 shadow-xs transition-all"
              >
                Kaydet ve Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🏷️ TEKİL ÜRÜN MANUEL KATEGORİ DEĞİŞTİRME MODALI */}
      {categoryModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <FolderTree className="w-5 h-5 text-blue-600" />
                  Kategori Değiştir / Manuel Seç
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 max-w-xl truncate">
                  {categoryModalItem.rawQuery}
                </p>
              </div>
              <button
                onClick={() => setCategoryModalItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-blue-600 font-medium">Şu Anki Kategori: </span>
                    <strong className="font-bold text-blue-950">
                      {categoryModalItem.category?.typeNameTR || categoryModalItem.category?.typeName || 'Belirlenmedi'}
                    </strong>
                  </div>
                  <span className="text-[11px] text-blue-600 font-medium">Aşağıdan seçiniz 👇</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setTreeModalTargetItemId(categoryModalItem.id);
                    setIsTreeModalOpen(true);
                  }}
                  className="w-full py-2 px-3 rounded-lg border border-blue-300 bg-white hover:bg-blue-100 text-blue-800 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <FolderTree className="w-4 h-4 text-blue-600" />
                  <span>🌲 Hazır Listede Yok mu? Canlı Ozon Kategori Ağacından Seç</span>
                </button>
              </div>

              <PresetCategorySelector
                selectedTypeId={categoryModalItem.category?.typeId}
                onSelectCategory={(cat) => {
                  setItems((prev) =>
                    prev.map((i) =>
                      i.id === categoryModalItem.id
                        ? {
                            ...i,
                            category: {
                              categoryId: cat.categoryId,
                              typeId: cat.typeId,
                              categoryName: cat.categoryName,
                              typeName: cat.typeName,
                              typeNameTR: cat.label,
                              path: [cat.groupName, cat.categoryName, cat.label],
                            },
                            // Kategori değiştiğinde eski nitelikleri sıfırla ki doğru kategoriye göre araştırılsın
                            status: i.status === 'ready' ? 'idle' : i.status,
                            attributes: i.status === 'ready' ? [] : i.attributes,
                          }
                        : i
                    )
                  );
                  setGlobalMessage({
                    type: 'success',
                    text: `✅ "${categoryModalItem.rawQuery.slice(0, 35)}..." için kategori "${cat.label}" olarak değiştirildi!`,
                  });
                  setCategoryModalItem(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 🌲 Ozon Canlı Kategori Ağacı Manuel Seçim Modalı */}
      <CategoryTreeModal
        isOpen={isTreeModalOpen}
        onClose={() => {
          setIsTreeModalOpen(false);
          setTreeModalTargetItemId(null);
        }}
        selectedTypeId={
          treeModalTargetItemId
            ? items.find((i) => i.id === treeModalTargetItemId)?.category?.typeId
            : selectedBatchCategory?.typeId
        }
        onSelectCategory={(cat) => {
          if (treeModalTargetItemId) {
            // Tekil ürün için ağaçtan seçildi
            setItems((prev) =>
              prev.map((i) =>
                i.id === treeModalTargetItemId
                  ? {
                      ...i,
                      category: {
                        categoryId: cat.categoryId,
                        typeId: cat.typeId,
                        categoryName: cat.categoryName,
                        typeName: cat.typeName,
                        typeNameTR: cat.typeName,
                        path: cat.path,
                      },
                      status: i.status === 'ready' ? 'idle' : i.status,
                      attributes: i.status === 'ready' ? [] : i.attributes,
                    }
                  : i
              )
            );
            setGlobalMessage({
              type: 'success',
              text: `✅ Kategori ağaçtan "${cat.typeName}" olarak başarıyla seçildi!`,
            });
            setCategoryModalItem(null);
            setTreeModalTargetItemId(null);
            setIsTreeModalOpen(false);
          } else {
            // Genel toplu kategori seçimi için
            setSelectedBatchCategory({
              categoryId: cat.categoryId,
              typeId: cat.typeId,
              categoryName: cat.categoryName,
              typeName: cat.typeName,
              typeNameTR: cat.typeName,
              path: cat.path,
            });
            setIsCategoryPickerOpen(false);
            setIsTreeModalOpen(false);
          }
        }}
      />
    </div>
  );
}

