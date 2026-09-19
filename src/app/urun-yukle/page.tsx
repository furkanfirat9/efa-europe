'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  UploadCloud,
  DollarSign,
  Percent,
  Ruler,
  Weight,
  Globe2,
  Tag,
  Sparkles,
  Package,
  Image as ImageIcon,
  Plus,
  Trash2,
  Barcode,
  Layers,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileJson,
  Send,
  Check,
  Cpu,
  FolderTree,
  ArrowRight,
  SlidersHorizontal,
  Lock,
  ListChecks,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import type {
  CategoryMatchResult,
  DeepCategoryResearchResult,
  TokenUsageStats,
} from '@/lib/ai/types';

import {
  PreFilledAttribute,
  AttributeSelectedValue,
  isWarrantyAttribute,
  isMergeWithSimilarAttribute,
  isIgnoredAttribute,
  isCountryOfOriginAttribute,
  isStrictSingleValueAttribute,
} from '@/lib/ai/filler';
import { PRESET_CATEGORIES } from '@/lib/constants/presetCategories';
import PresetCategorySelector from '@/components/PresetCategorySelector';
import AttributeSelectCard from '@/components/AttributeSelectCard';
import CategoryTreeModal from '@/components/CategoryTreeModal';

function UrunYukleContent() {
  const searchParams = useSearchParams();

  // Kategori Ağacı Modalı Durumu
  const [isTreeModalOpen, setIsTreeModalOpen] = useState(false);

  // 1. Aşama: AI Kategori Arama Durumu
  const [aiQuery, setAiQuery] = useState('');

  const [isFindingCategory, setIsFindingCategory] = useState(false);
  const [categoryMatchResult, setCategoryMatchResult] = useState<CategoryMatchResult | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Seçili Kategori
  const [selectedCategory, setSelectedCategory] = useState<{
    categoryId: number;
    categoryName: string;
    typeId: number;
    typeName: string;
    path: string[];
    confidence: number;
  } | null>(null);

  // 2. Aşama: Nitelik Odaklı Derin Araştırma Durumu
  const [productModelQuery, setProductModelQuery] = useState('');
  const [isDeepResearching, setIsDeepResearching] = useState(false);
  const [deepResearchResult, setDeepResearchResult] = useState<DeepCategoryResearchResult | null>(null);
  const [deepResearchError, setDeepResearchError] = useState<string | null>(null);
  const [isAppliedToForm, setIsAppliedToForm] = useState(false);

  // Mükerrer / Token Koruma Durumu
  const [duplicateWarning, setDuplicateWarning] = useState<any | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [isDuplicateDismissed, setIsDuplicateDismissed] = useState(false);

  // AI Token & Maliyet İstatistiği (Gemini 3.8 Flash)
  const [sessionUsage, setSessionUsage] = useState<TokenUsageStats | null>(null);


  // Grup 1: Ozon Sabit Temel Alanları (Root Fields)
  const [modelNo, setModelNo] = useState('');
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isBarcodeGenerated, setIsBarcodeGenerated] = useState(false);
  const [price, setPrice] = useState('');
  const [oldPrice, setOldPrice] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [depth, setDepth] = useState('');
  const [weight, setWeight] = useState('');
  const [primaryImage, setPrimaryImage] = useState('');
  const [additionalImages, setAdditionalImages] = useState<string[]>(['']);

  // Grup 2: Kategoriye Özel Dinamik Nitelikler
  const [categoryAttributes, setCategoryAttributes] = useState<PreFilledAttribute[]>([]);
  const [isLoadingAttributesList, setIsLoadingAttributesList] = useState(false);

  // Ozon Canlı Yükleme Durumu
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessResult, setUploadSuccessResult] = useState<{
    taskId: number;
    message: string;
  } | null>(null);
  const [importStatusInfo, setImportStatusInfo] = useState<any | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // JSON Önizleme
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  // Kategori Ağacı Sayfasından Yönlendirme Kontrolü (?catId=...&typeId=...)
  useEffect(() => {
    const paramCatId = searchParams.get('catId');
    const paramTypeId = searchParams.get('typeId');
    const paramCatName = searchParams.get('catName') || 'Seçili Kategori';
    const paramTypeName = searchParams.get('typeName') || 'Seçili Ürün Türü';

    if (paramCatId && paramTypeId) {
      const catObj = {
        categoryId: Number(paramCatId),
        categoryName: paramCatName,
        typeId: Number(paramTypeId),
        typeName: paramTypeName,
        path: [paramCatName, paramTypeName],
        confidence: 100,
      };
      handleSelectCategoryOnly(catObj);
    }
  }, [searchParams]);

  // Canlı Mükerrer / Token Koruma Kontrolü (Debounced)
  useEffect(() => {
    const queryToCheck = productModelQuery.trim() || aiQuery.trim();
    if (!queryToCheck || queryToCheck.length < 3) {
      setDuplicateWarning(null);
      setIsDuplicateDismissed(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingDuplicate(true);
      try {
        const res = await fetch('/api/ozon/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryToCheck }),
        });
        const json = await res.json();
        if (json.success && json.data?.isDuplicate) {
          setDuplicateWarning(json.data);
          setIsDuplicateDismissed(false);
        } else {
          setDuplicateWarning(null);
          setIsDuplicateDismissed(false);
        }
      } catch (e) {
        console.error('Duplicate check error:', e);
      } finally {
        setIsCheckingDuplicate(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [productModelQuery, aiQuery]);


  // Ek görsel ekle/çıkar
  const handleAddImageField = () => {
    if (additionalImages.length < 14) {
      setAdditionalImages([...additionalImages, '']);
    }
  };

  const handleRemoveImageField = (index: number) => {
    setAdditionalImages(additionalImages.filter((_, i) => i !== index));
  };

  const handleImageChange = (index: number, val: string) => {
    const updated = [...additionalImages];
    updated[index] = val;
    setAdditionalImages(updated);
  };

  // 1. STRATEJİ: Hafif ve Hızlı Kategori Bulma
  const handleFindCategories = async () => {
    if (!aiQuery.trim()) return;

    setIsFindingCategory(true);
    setCategoryError(null);
    setCategoryMatchResult(null);
    setSelectedCategory(null);
    setDeepResearchResult(null);
    setIsAppliedToForm(false);
    setCategoryAttributes([]);

    try {
      const res = await fetch('/api/ai/research-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: aiQuery.trim() }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Kategori tespiti tamamlanamadı.');
      }

      const data: CategoryMatchResult = json.data;
      setCategoryMatchResult(data);
      setProductModelQuery(aiQuery.trim());

      if (data.modelNo && !modelNo) {
        setModelNo(data.modelNo);
      }

      // Token & Maliyet Bilgisini Güncelle
      if (data.usage) {
        setSessionUsage((prev) => {
          if (!prev) return data.usage!;
          return {
            promptTokens: prev.promptTokens + data.usage!.promptTokens,
            candidatesTokens: prev.candidatesTokens + data.usage!.candidatesTokens,
            totalTokens: prev.totalTokens + data.usage!.totalTokens,
            estimatedCostUsd: prev.estimatedCostUsd + data.usage!.estimatedCostUsd,
            model: data.usage!.model,
          };
        });
      }

      // 1. Önerilen kategoriyi seç ve nitelik listesini boş olarak yükle
      if (data.suggestedCategories && data.suggestedCategories.length > 0) {
        handleSelectCategoryOnly(data.suggestedCategories[0]);
      }
    } catch (err: any) {
      setCategoryError(err.message || 'Bilinmeyen bir hata oluştu.');
    } finally {
      setIsFindingCategory(false);
    }
  };

  // Kategori Seçimi: Sadece Ozon Nitelik Listesini Çeker (Garanti 15 Gün Sabitlenir)
  const handleSelectCategoryOnly = async (category: {
    categoryId: number;
    categoryName: string;
    typeId: number;
    typeName: string;
    path: string[];
    confidence: number;
  }) => {
    setSelectedCategory(category);
    setDeepResearchResult(null);
    setIsAppliedToForm(false);
    setIsLoadingAttributesList(true);
    setDeepResearchError(null);

    try {
      const res = await fetch(
        `/api/ozon/category-attributes?description_category_id=${category.categoryId}&type_id=${category.typeId}&language=TR`
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Kategori nitelikleri alınamadı.');
      }

      // Nitelikleri başlangıç durumunda ayarla (Garanti 15 Gün ve Benzer Ürünlerle Birleşme Sabit ve Kilitlidir)
      const rawAttrs = json.data || [];
      const initialAttrs: PreFilledAttribute[] = rawAttrs.map((a: any) => {
        const isWarranty = isWarrantyAttribute({ id: a.id, name: a.name });
        const isMerge = isMergeWithSimilarAttribute({ id: a.id, name: a.name });
        const isIgnored = isIgnoredAttribute({ id: a.id, name: a.name });
        const mergeVal = category.typeName || category.categoryName;

        return {
          attributeId: a.id,
          name: a.name,
          type: a.type,
          isRequired: a.is_required,
          isAspect: a.is_aspect,
          dictionaryId: a.dictionary_id,
          isCollection: a.is_collection,
          valueText: isWarranty ? '15 дней' : isMerge ? mergeVal : '',
          dictionaryValueId: isWarranty ? 972120566 : undefined,
          selectedValues: isWarranty
            ? [{ value: '15 дней', dictionaryValueId: 972120566 }]
            : isMerge
            ? [{ value: mergeVal }]
            : [],
          matchStatus: isWarranty || isMerge || isIgnored ? 'matched' : 'manual_needed',
          isReadOnly: isWarranty || isMerge || isIgnored,
        };
      });

      setCategoryAttributes(initialAttrs);
    } catch (err: any) {
      setDeepResearchError(err.message || 'Nitelikler yüklenirken hata oluştu.');
    } finally {
      setIsLoadingAttributesList(false);
    }
  };

  // 2. STRATEJİ: Nitelik Odaklı Derin Araştırma Motoru (Ozon Sorularının Cevaplarını Araştırır)
  const handleRunDeepResearch = async () => {
    if (!selectedCategory) {
      setDeepResearchError('Lütfen önce 1. Adımdan bir Ozon kategorisi seçiniz.');
      return;
    }

    const queryToUse = productModelQuery.trim() || aiQuery.trim() || name.trim() || modelNo.trim();
    if (!queryToUse) {
      setDeepResearchError('Lütfen araştırılacak ürünün marka ve modelini yazınız (Örn: WMF Gourmet Kase Seti, Philips NA350/00).');
      return;
    }

    // Token Tasarrufu: Eğer ürün zaten yüklüyse ve kullanıcı onaylamadıysa teyit al
    if (duplicateWarning?.isDuplicate && !isDuplicateDismissed) {
      const confirmRun = window.confirm(
        `⚠️ DİKKAT (Token Tasarrufu Uyarısı):\n\nBu ürün ("${duplicateWarning.matchedProduct?.offerId} - ${duplicateWarning.matchedProduct?.name}") zaten ${duplicateWarning.matchedProduct?.source === 'ozon_live' ? 'Ozon mağazanızda' : 'katalog hafızanızda'} kayıtlı.\n\nYine de Gemini 3.8 tokeni harcayarak yeniden araştırmak istediğinize emin misiniz?`
      );
      if (!confirmRun) return;
    }

    setIsDeepResearching(true);
    setDeepResearchError(null);
    setIsAppliedToForm(false);


    try {
      const res = await fetch('/api/ai/fill-attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: selectedCategory.categoryId,
          typeId: selectedCategory.typeId,
          brand: categoryMatchResult?.brand || '',
          modelNo: categoryMatchResult?.modelNo || modelNo,
          productQuery: queryToUse,
          language: 'RU',
          categoryName: selectedCategory.categoryName,
          typeName: selectedCategory.typeName,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Nitelik odaklı derin araştırma tamamlanamadı.');
      }

      const deepData: DeepCategoryResearchResult = json.data;
      setDeepResearchResult(deepData);

      // Ek Token & Maliyet bilgisini ekle
      if (deepData.usage) {
        setSessionUsage((prev) => {
          if (!prev) return deepData.usage!;
          return {
            promptTokens: prev.promptTokens + deepData.usage!.promptTokens,
            candidatesTokens: prev.candidatesTokens + deepData.usage!.candidatesTokens,
            totalTokens: prev.totalTokens + deepData.usage!.totalTokens,
            estimatedCostUsd: prev.estimatedCostUsd + deepData.usage!.estimatedCostUsd,
            model: deepData.usage!.model,
          };
        });
      }
    } catch (err: any) {
      setDeepResearchError(err.message || 'Derin araştırma sırasında hata oluştu.');
    } finally {
      setIsDeepResearching(false);
    }
  };

  // 3. ADIM: Araştırılan Tüm Verileri Forma Doldur
  const handleApplyResearchToForm = () => {
    if (!deepResearchResult) return;

    // Grup 1 alanlarını doldur
    if (deepResearchResult.modelNo) setModelNo(deepResearchResult.modelNo);
    if (deepResearchResult.russianSeoTitle) setName(deepResearchResult.russianSeoTitle);
    if (deepResearchResult.barcode) {
      setBarcode(deepResearchResult.barcode);
      setIsBarcodeGenerated(Boolean(deepResearchResult.isBarcodeGenerated));
    }
    if (deepResearchResult.dimensions) {
      setWidth(deepResearchResult.dimensions.widthMm.toString());
      setHeight(deepResearchResult.dimensions.heightMm.toString());
      setDepth(deepResearchResult.dimensions.depthMm.toString());
    }
    if (deepResearchResult.weightG) {
      setWeight(deepResearchResult.weightG.toString());
    }

    // Grup 2 niteliklerini doldur
    if (deepResearchResult.attributes && deepResearchResult.attributes.length > 0) {
      setCategoryAttributes(deepResearchResult.attributes);
      
      // Yerel Katalog Hafızasına Kaydet
      saveCurrentToCatalogMemory(deepResearchResult.attributes);
    }

    setIsAppliedToForm(true);
  };

  // Yerel Katalog Hafızasına Ürün Kaydetme Helper'ı
  const saveCurrentToCatalogMemory = async (attrs?: PreFilledAttribute[], ozonTaskId?: string | number) => {
    try {
      if (!selectedCategory) return;
      const targetAttrs = attrs || categoryAttributes;
      const brandVal = categoryMatchResult?.brand || deepResearchResult?.brand || '';
      const modelVal = categoryMatchResult?.modelNo || modelNo || '';
      if (!brandVal || !modelVal) return;


      const seriesAttr = targetAttrs.find((a) => a.attributeId === 9048);
      const namingAttr = targetAttrs.find((a) => a.attributeId === 12141 || a.attributeId === 20776);
      const partAttr = targetAttrs.find((a) => a.attributeId === 4381);
      const colorAttr = targetAttrs.find(
        (a) => a.name.toLowerCase().includes('renk') || a.name.toLowerCase().includes('цвет')
      );
      const volumeAttr = targetAttrs.find(
        (a) => a.name.toLowerCase().includes('hacim') || a.name.toLowerCase().includes('объем')
      );

      await fetch('/api/catalog-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: brandVal,
          modelNo: modelVal,
          categoryId: selectedCategory.categoryId,
          typeId: selectedCategory.typeId,
          categoryName: selectedCategory.categoryName,
          typeName: selectedCategory.typeName,
          seriesMergeCode: seriesAttr?.valueText || '',
          namingTemplateModel: namingAttr?.valueText || '',
          partNumber: partAttr?.valueText || modelVal,
          aspects: {
            color: colorAttr?.valueText || '',
            volumeLiters: volumeAttr?.valueText || '',
          },
          finalTitle: name,
          productQuery: aiQuery,
          ozonTaskId: ozonTaskId ? String(ozonTaskId) : undefined,
        }),
      });
    } catch (e) {
      console.warn('Katalog hafızasına kaydedilemedi:', e);
    }
  };

  // Nitelik değerini elle güncelleme
  const handleUpdateAttributeValue = (
    attributeId: number,
    valueText: string,
    dictId?: number,
    selectedValues?: AttributeSelectedValue[]
  ) => {
    setCategoryAttributes((prev) =>
      prev.map((attr) =>
        attr.attributeId === attributeId
          ? {
              ...attr,
              valueText,
              dictionaryValueId: dictId,
              selectedValues: selectedValues || (valueText ? [{ value: valueText, dictionaryValueId: dictId }] : []),
              matchStatus: valueText || (selectedValues && selectedValues.length > 0) ? 'matched' : 'manual_needed',
            }
          : attr
      )
    );
  };

  // Ozon /v3/product/import Payload'ı Üretme
  const generateOzonPayload = () => {
    const validImages = [primaryImage, ...additionalImages].filter((img) => img && img.trim().length > 0);

    const formattedAttributes = categoryAttributes
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
      items: [
        {
          attributes: formattedAttributes,
          barcode: barcode || undefined,
          description_category_id: selectedCategory?.categoryId || 0,
          type_id: selectedCategory?.typeId || undefined,
          currency_code: 'USD',
          depth: Number(depth) || 0,
          dimension_unit: 'mm',
          height: Number(height) || 0,
          images: validImages.slice(1),
          name: name,
          offer_id: modelNo,
          old_price: oldPrice ? oldPrice : undefined,
          price: price,
          primary_image: primaryImage || validImages[0] || '',
          vat: '0',
          weight: Number(weight) || 0,
          weight_unit: 'g',
          width: Number(width) || 0,
        },
      ],
    };
  };

  // Canlı Ozon Görev Durumu Sorgulama
  const checkUploadStatus = async (taskId: number) => {
    setIsCheckingStatus(true);
    try {
      const res = await fetch('/api/ozon/product/import/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const json = await res.json();
      if (json.success) {
        setImportStatusInfo(json.data);
      }
    } catch (e) {
      console.error('Status check error:', e);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Canlı Ozon /v3/product/import Gönderme
  const handleUploadToOzon = async () => {
    setUploadError(null);
    setUploadSuccessResult(null);
    setImportStatusInfo(null);

    if (!modelNo.trim()) {
      setUploadError('Model Numarası / offer_id zorunludur.');
      return;
    }
    if (!name.trim()) {
      setUploadError('Rusça SEO Başlığı (name) zorunludur.');
      return;
    }
    if (!price || Number(price) <= 0) {
      setUploadError('Lütfen geçerli bir Satış Fiyatı ($) giriniz.');
      return;
    }
    if (!primaryImage.trim() && (!additionalImages[0] || !additionalImages[0].trim())) {
      setUploadError('Lütfen en az bir adet Ürün Görseli URL linki giriniz.');
      return;
    }
    if (!selectedCategory) {
      setUploadError('Lütfen ürünün ait olduğu Ozon kategorisini seçiniz.');
      return;
    }

    setIsUploading(true);

    try {
      const payload = generateOzonPayload();
      const res = await fetch('/api/ozon/product/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Ozon ürün yükleme isteği başarısız oldu.');
      }

      setUploadSuccessResult({
        taskId: json.taskId,
        message: json.message || 'Ürün Ozon kuyruğuna başarıyla alındı!',
      });

      // Ozon Task ID ile katalog hafızasını güncelle
      saveCurrentToCatalogMemory(categoryAttributes, json.taskId);

      // 2 saniye sonra otomatik ilk durum kontrolü
      setTimeout(() => {
        checkUploadStatus(json.taskId);
      }, 2500);
    } catch (err: any) {
      setUploadError(err.message || 'Ozon API bağlantısında bir hata oluştu.');
    } finally {
      setIsUploading(false);
    }
  };

  const filledCount = categoryAttributes.filter(
    (a) => (a.selectedValues && a.selectedValues.length > 0) || (a.valueText && a.valueText.trim().length > 0)
  ).length;

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-blue-600" />
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">Ozon Ürün Yükleme Stüdyosu</h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              İki Aşamalı Yapay Zeka: 1. Kategori Tespiti $\rightarrow$ 2. Nitelik Odaklı Derin Araştırma $\rightarrow$ 3. Forma Aktarma
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {sessionUsage ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-900 border border-purple-200/80 text-xs font-semibold">
                <Cpu className="w-3.5 h-3.5 text-purple-600" />
                <span>{sessionUsage.model}</span>
                <span className="text-purple-300">•</span>
                <span className="font-mono text-purple-700 font-bold">
                  {sessionUsage.totalTokens.toLocaleString()} Token
                </span>
                <span className="text-purple-300">•</span>
                <span className="px-1.5 py-0.5 rounded-sm bg-purple-200/60 font-mono text-purple-950 text-[11px] font-bold">
                  ${sessionUsage.estimatedCostUsd.toFixed(5)} USD
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 text-slate-600 border border-slate-200 text-xs font-medium">
                <Cpu className="w-3.5 h-3.5 text-slate-400" />
                <span>Model: <strong className="text-slate-800">gemini-3.8-flash</strong> (High Effort)</span>
              </div>
            )}

            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              USD / KDV %0 / 15 Gün Garanti
            </span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl w-full mx-auto p-6 md:p-8 flex-1 space-y-6">
        {/* ========================================================================= */}
        {/* İKİ TARAFLI AI ÇALIŞMA ALANI */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* SOL PANEL (6 Kolon): 1. AŞAMA - KATEGORİ SEÇİMİ */}
          <div className="lg:col-span-6 space-y-4">
            <section className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 h-full flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                      1
                    </span>
                    <h2 className="text-sm font-bold text-slate-900">
                      Ozon Kategorisi Seçin
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsTreeModalOpen(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50/80 active:bg-blue-100 font-medium px-2.5 py-1 rounded-lg border border-blue-200/60 flex items-center gap-1.5 transition-colors"
                  >
                    <FolderTree className="w-3.5 h-3.5" />
                    <span>🌲 Tüm Ağaçtan Seç</span>
                  </button>
                </div>


                {/* Gruplanmış Hazır Kategoriler Bileşeni */}
                <PresetCategorySelector
                  selectedTypeId={selectedCategory?.typeId}
                  onSelectCategory={(cat) => {
                    handleSelectCategoryOnly({
                      categoryId: cat.categoryId,
                      categoryName: cat.categoryName,
                      typeId: cat.typeId,
                      typeName: cat.typeName,
                      path: cat.path,
                      confidence: 100,
                    });
                  }}
                />

                {/* İsteğe Bağlı: AI ile Kategori Arama Açılır Bölümü */}
                <details className="group border-t border-slate-100 pt-3">
                  <summary className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer flex items-center justify-between list-none">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>Farklı bir kategori arıyorsanız AI ile tespit edin</span>
                    </span>
                    <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>

                  <div className="pt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={aiQuery}
                          onChange={(e) => setAiQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleFindCategories()}
                          placeholder="Örn: Saç maşası, Vantilatör, Buharlı paspas..."
                          className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>

                      <button
                        onClick={handleFindCategories}
                        disabled={isFindingCategory || !aiQuery.trim()}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 active:bg-black text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                      >
                        {isFindingCategory ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Aranıyor...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-3.5 h-3.5" />
                            <span>Kategori Bul</span>
                          </>
                        )}
                      </button>
                    </div>

                    {categoryError && (
                      <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
                        {categoryError}
                      </div>
                    )}
                  </div>
                </details>
              </div>


              {/* 3 Kategori Önerisi Listesi */}
              {categoryMatchResult && categoryMatchResult.suggestedCategories.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Önerilen Ozon Kategorileri (Seçiniz):
                    </span>
                    <Link
                      href="/kategori-agaci"
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-medium"
                    >
                      <FolderTree className="w-3 h-3" /> Ağaçtan Manuel Seç
                    </Link>
                  </div>

                  <div className="space-y-1.5">
                    {categoryMatchResult.suggestedCategories.map((cat, idx) => {
                      const isSelected = selectedCategory?.typeId === cat.typeId;
                      return (
                        <div
                          key={`${cat.categoryId}-${cat.typeId}-${idx}`}
                          onClick={() => handleSelectCategoryOnly(cat)}
                          className={`p-2.5 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-blue-50/80 border-blue-600 text-blue-900'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900">{cat.typeName}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-sm bg-emerald-100 text-emerald-800">
                                %{cat.confidence}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 truncate block">
                              {cat.path.join(' › ')}
                            </span>
                          </div>

                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center border shrink-0 ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* SAĞ PANEL (6 Kolon): 2. AŞAMA - ÜRÜN MODEL GİRİŞİ & NİTELİK ODAKLI DERİN ARAŞTIRMA */}
          <div className="lg:col-span-6 space-y-4">
            <section className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 h-full flex flex-col justify-between">
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-purple-600 text-white text-xs font-bold flex items-center justify-center">
                      2
                    </span>
                    <h2 className="text-sm font-bold text-slate-900">
                      Ürün Araştırması &amp; Doldurma
                    </h2>
                  </div>

                  {selectedCategory && (
                    <span className="text-[11px] font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-sm border border-purple-100">
                      {categoryAttributes.length} Nitelik Hazır
                    </span>
                  )}
                </div>

                {/* Seçili Kategori Durum Özeti */}
                {selectedCategory ? (
                  <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-100/80 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="text-purple-700">🎯</span>
                        <span className="truncate">{selectedCategory.typeName}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {selectedCategory.path.join(' › ')}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">Tip: {selectedCategory.typeId}</span>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400">
                    👈 Önce soldaki hazır kategorilerden birini seçiniz...
                  </div>
                )}

                {/* 2. ADIM ÖZEL ÜRÜN MODEL ARAMA INPUTU */}
                <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-50/80 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-purple-600" />
                      <span>Araştırılacak Marka &amp; Model Kodu:</span>
                    </label>
                    <span className="text-[10px] text-purple-700 font-semibold bg-purple-50 px-1.5 py-0.2 rounded-sm border border-purple-200">
                      Google Search + Gemini 3.8
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={productModelQuery}
                      onChange={(e) => setProductModelQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && selectedCategory && handleRunDeepResearch()}
                      placeholder={
                        selectedCategory
                          ? `Örn: ${selectedCategory.typeName} için marka ve model girin (Örn: WMF Gourmet, Philips NA350)...`
                          : 'Önce sol taraftan kategori seçiniz...'
                      }
                      disabled={!selectedCategory || isDeepResearching}
                      className="w-full pl-3.5 pr-16 py-2.5 bg-white border-2 border-purple-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 disabled:bg-slate-100 disabled:opacity-60 transition-all placeholder:font-normal"
                    />
                    {productModelQuery && (
                      <button
                        type="button"
                        onClick={() => setProductModelQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-medium"
                      >
                        Temizle
                      </button>
                    )}
                  </div>
                </div>


                {/* ⚠️ TOKEN TASARRUFU & MÜKERRER ÜRÜN UYARI KARTI */}
                {duplicateWarning?.isDuplicate && !isDuplicateDismissed && (
                  <div className="p-3.5 rounded-xl bg-amber-50/95 border-2 border-amber-300 text-slate-800 space-y-2.5 animate-in fade-in-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 animate-bounce" />
                        <span>Token Tasarrufu Uyarısı: Bu Ürün Zaten Yüklü!</span>
                      </div>
                      <span className="text-[10px] bg-amber-200 text-amber-950 font-bold px-2 py-0.5 rounded-md border border-amber-300">
                        {duplicateWarning.matchedProduct?.source === 'ozon_live' ? 'Ozon Canlı Mağaza' : 'Katalog Hafızası'}
                      </span>
                    </div>

                    <div className="bg-white/90 p-2.5 rounded-lg border border-amber-200 text-xs space-y-1.5">
                      <div className="font-semibold text-slate-900 line-clamp-2 leading-tight">
                        {duplicateWarning.matchedProduct?.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 pt-0.5 border-t border-amber-100">
                        <span><strong>Offer ID:</strong> <span className="font-mono text-purple-700 font-bold">{duplicateWarning.matchedProduct?.offerId}</span></span>
                        {duplicateWarning.matchedProduct?.price && (
                          <span><strong>Fiyat:</strong> {duplicateWarning.matchedProduct?.price} {duplicateWarning.matchedProduct?.currency || 'USD'}</span>
                        )}
                        {duplicateWarning.matchedProduct?.status && (
                          <span className="text-emerald-700 font-medium">● {duplicateWarning.matchedProduct?.status}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-0.5">
                      <p className="text-[11px] text-amber-850 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Boşa Gemini tokeni tüketmemek için araştırmayı durdurabilirsiniz.</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsDuplicateDismissed(true)}
                        className="text-[11px] font-bold text-amber-900 hover:text-amber-950 bg-amber-200/80 hover:bg-amber-200 px-2 py-1 rounded-sm transition-colors ml-2 shrink-0 border border-amber-300"
                      >
                        Yine de Araştır →
                      </button>
                    </div>
                  </div>
                )}

                {/* Araştırma Özeti Önizleme Kutusu (Bulunan Veriler) */}
                {deepResearchResult && (

                  <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-2 animate-in fade-in-50">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Derin Araştırma Tamamlandı:</span>
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-sm font-mono">
                        {deepResearchResult.attributes.filter((a) => a.valueText).length} Nitelik Bulundu
                      </span>
                    </div>

                    {deepResearchResult.researchSummaryBullets && deepResearchResult.researchSummaryBullets.length > 0 && (
                      <ul className="space-y-1 text-xs text-emerald-900 list-disc list-inside pt-1">
                        {deepResearchResult.researchSummaryBullets.map((bullet, i) => (
                          <li key={i} className="text-[11px]">{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {deepResearchError && (
                  <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
                    {deepResearchError}
                  </div>
                )}
              </div>

              {/* BUTONLAR: 2. ADIM (ARAŞTIR) & 3. ADIM (FORMA DOLDUR) */}
              <div className="space-y-2 pt-2">
                {!deepResearchResult ? (
                  <button
                    type="button"
                    onClick={handleRunDeepResearch}
                    disabled={!selectedCategory || isDeepResearching || isLoadingAttributesList}
                    className="w-full py-3 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:from-purple-800 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isDeepResearching ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>"{productModelQuery || 'Ürün'}" İnternetten Derinlemesine Araştırılıyor...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-purple-200" />
                        <span>
                          🔍 {productModelQuery.trim() ? `"${productModelQuery.trim()}"` : 'Bu Model'} İçin Nitelikleri Araştır
                        </span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleRunDeepResearch}
                      disabled={isDeepResearching}
                      className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Yeniden Araştır</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleApplyResearchToForm}
                      className={`py-2.5 px-4 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
                        isAppliedToForm
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700'
                      }`}
                    >
                      {isAppliedToForm ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Forma Aktarıldı (Tekrarla)</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-blue-200" />
                          <span>✨ Verileri Niteliklere Doldur</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* Sabit Ozon Standartları Bilgi Çubuğu */}
        <section className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">Para Birimi</span>
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                <DollarSign className="w-3 h-3 text-blue-600" /> USD ($)
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">KDV Oranı</span>
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                <Percent className="w-3 h-3 text-emerald-600" /> %0 (vat: 0)
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">Boyut Birimi</span>
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                <Ruler className="w-3 h-3 text-indigo-600" /> mm (Milimetre)
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">Ağırlık Birimi</span>
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                <Weight className="w-3 h-3 text-purple-600" /> g (Gram)
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">Garanti Kuralı</span>
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                <Lock className="w-3 h-3 text-amber-600" /> 15 Gün (15 дней)
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">Nitelik Dili</span>
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                <Globe2 className="w-3 h-3 text-rose-600" /> RU (Rusça)
              </span>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* GRUP 1: OZON SABİT TEMEL ÜRÜN BİLGİLERİ */}
        {/* ========================================================================= */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Grup 1: Temel Ürün Bilgileri (Ozon Sabit Kök Alanları)
                </h2>
                <p className="text-xs text-slate-500">
                  Yapay zeka tarafından otomatik doldurulan veya düzenlenen temel Ozon bilgileri
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
              Temel Alanlar
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sol / Orta Kolon: Kimlik, Başlık ve Fiyat */}
            <div className="lg:col-span-2 space-y-5">
              {/* Model No & Barkod */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Model No */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-blue-600" />
                      <span>Model Numarası / Model No</span>
                      <span className="text-red-500 font-bold">*</span>
                    </label>
                    <span className="text-[10px] font-mono text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded-sm">
                      offer_id
                    </span>
                  </div>
                  <input
                    type="text"
                    value={modelNo}
                    onChange={(e) => setModelNo(e.target.value)}
                    placeholder="Örn: HD7769-00"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* Barkod */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Barcode className="w-3.5 h-3.5 text-slate-600" />
                      <span>Barkod (EAN-13)</span>
                    </label>
                    {isBarcodeGenerated ? (
                      <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-sm font-medium">
                        Sistem 13 Haneli Üretti
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-sm font-medium">
                        Orijinal Barkod
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => {
                      setBarcode(e.target.value);
                      setIsBarcodeGenerated(false);
                    }}
                    placeholder="Örn: 8710103859215"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Rusça SEO Başlığı (name) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Globe2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Ozon Rusça SEO Başlığı (`name`)</span>
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">{name.length} karakter</span>
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: Кофеварка капельная Philips HD7769/00 со встроенной кофемолкой, 1000 Вт, черный"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                />
              </div>

              {/* Fiyat Bilgileri (Kullanıcı Tarafından Girilir) */}
              <div className="p-4 rounded-xl bg-blue-50/40 border border-blue-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Fiyat Belirleme (USD - $)</span>
                  </span>
                  <span className="text-[10px] text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-sm font-medium">
                    Kullanıcı Tarafından Girilir
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Satış Fiyatı */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-800 block">
                      Satış Fiyatı ($)<span className="text-red-500 font-bold">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="Örn: 189.90"
                        className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* İndirim Öncesi Üstü Çizili Fiyat */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 block">
                      Eski Fiyat (Üstü Çizili $) <span className="text-[10px] text-slate-400 font-normal">(Opsiyonel)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={oldPrice}
                        onChange={(e) => setOldPrice(e.target.value)}
                        placeholder="Örn: 229.00"
                        className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Paket Ölçüleri ve Ağırlık */}
              <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Ruler className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Paket Ölçüleri &amp; Ağırlık (AI Tarafından Araştırıldı)</span>
                  </span>
                  <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded-sm">
                    mm &amp; gram
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600 block">
                      Genişlik (mm)<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      placeholder="Örn: 212"
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600 block">
                      Yükseklik (mm)<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="Örn: 440"
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600 block">
                      Derinlik (mm)<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={depth}
                      onChange={(e) => setDepth(e.target.value)}
                      placeholder="Örn: 277"
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600 block">
                      Ağırlık (g)<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="Örn: 4600"
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Sağ Kolon: Görseller */}
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-4 h-full flex flex-col">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                  <div className="flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-800">Ürün Görselleri (Kullanıcı Girişi)</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Max: 15 Görsel</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">
                    Ana Kapak Görseli (`primary_image`)<span className="text-red-500 font-bold">*</span>
                  </label>
                  <input
                    type="url"
                    value={primaryImage}
                    onChange={(e) => setPrimaryImage(e.target.value)}
                    placeholder="Örn: https://example.com/kahve-makinesi-ana.jpg"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />

                  {primaryImage && (
                    <div className="mt-2 relative rounded-lg border border-slate-200 overflow-hidden bg-white h-28 flex items-center justify-center">
                      <img
                        src={primaryImage}
                        alt="Ana Görsel"
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700">Diğer Görseller (`images`)</label>
                    <button
                      type="button"
                      onClick={handleAddImageField}
                      disabled={additionalImages.length >= 14}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-40"
                    >
                      <Plus className="w-3 h-3" /> Görsel Ekle
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {additionalImages.map((imgUrl, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          type="url"
                          value={imgUrl}
                          onChange={(e) => handleImageChange(idx, e.target.value)}
                          placeholder={`Örn: https://example.com/detay-${idx + 1}.jpg`}
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                        {additionalImages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveImageField(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 leading-tight">
                  Görseller doğrudan genel erişilebilir HTTPS linki (JPG / PNG formatında) olmalıdır.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* GRUP 2: KATEGORİYE ÖZEL OZON NİTELİKLERİ LİSTESİ */}
        {/* ========================================================================= */}
        {selectedCategory && (
          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Grup 2: Kategori Nitelikleri ({categoryAttributes.length})
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  <strong className="text-slate-800">{selectedCategory.typeName}</strong> kategorisi için Ozon API&apos;den çekilen canlı nitelikler
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs px-3 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">
                  {filledCount} / {categoryAttributes.length} Dolduruldu
                </span>

                <button
                  type="button"
                  onClick={handleRunDeepResearch}
                  disabled={isDeepResearching || isLoadingAttributesList}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isDeepResearching ? 'animate-spin' : ''}`} />
                  <span>{isDeepResearching ? 'Araştırılıyor...' : 'Yeniden Derin Araştır'}</span>
                </button>
              </div>
            </div>

            {/* Nitelikler Grid Listesi */}
            {isLoadingAttributesList ? (
              <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Ozon API&apos;den canlı nitelikler getiriliyor...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categoryAttributes.map((attr) => (
                  <AttributeSelectCard
                    key={attr.attributeId}
                    attribute={attr}
                    categoryId={selectedCategory.categoryId}
                    typeId={selectedCategory.typeId}
                    language="RU"
                    onValueChange={handleUpdateAttributeValue}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ========================================================================= */}
        {/* AKSİYON & OZON YÜKLEME BUTONLARI */}
        {/* ========================================================================= */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Ürün Yüklemeye Hazır</h3>
              <p className="text-xs text-slate-500">
                Ozon API v3 `/v3/product/import` formatında canlı istek gönderilir ve görev takip edilir.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowJsonPreview(!showJsonPreview)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all"
              >
                <FileJson className="w-4 h-4 text-slate-500" />
                <span>{showJsonPreview ? 'JSON Gizle' : 'Ozon JSON Önizle'}</span>
              </button>

              <button
                type="button"
                onClick={handleUploadToOzon}
                disabled={isUploading}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Ozon&apos;a Yükleniyor...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Ozon&apos;a Canlı Yükle</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Hata Bildirimi */}
          {uploadError && (
            <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-start gap-2 animate-in fade-in-50">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Ozon Yükleme Hatası:</span>
                <span>{uploadError}</span>
              </div>
            </div>
          )}

          {/* Başarılı Yükleme & Canlı Görev Takip Paneli */}
          {uploadSuccessResult && (
            <div className="p-4 bg-emerald-50/70 text-emerald-950 text-xs rounded-xl border border-emerald-200 space-y-3 animate-in fade-in-50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-emerald-200/60">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold text-sm text-emerald-950 block">
                      Ürün Ozon Kuyruğuna Başarıyla Alındı!
                    </span>
                    <span className="text-[11px] text-emerald-700 font-mono">
                      Ozon Görev No (Task ID): <strong>{uploadSuccessResult.taskId}</strong>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => checkUploadStatus(uploadSuccessResult.taskId)}
                  disabled={isCheckingStatus}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                  <span>{isCheckingStatus ? 'Kontrol Ediliyor...' : 'Durumu Yenile'}</span>
                </button>
              </div>

              {/* Canlı Görev Durumu Çıktısı */}
              {importStatusInfo ? (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">İşlem Durumu:</span>
                    <span className="px-2 py-0.5 rounded-sm text-[11px] font-bold font-mono bg-emerald-100 text-emerald-900 border border-emerald-300">
                      {importStatusInfo.items?.[0]?.status || 'İşleniyor (In Progress)'}
                    </span>
                  </div>

                  {importStatusInfo.items?.[0]?.errors && importStatusInfo.items[0].errors.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-[11px] border border-red-200 space-y-1">
                      <span className="font-bold block">Ozon Doğrulama / Moderasyon Notu:</span>
                      <ul className="list-disc list-inside">
                        {importStatusInfo.items[0].errors.map((err: any, i: number) => (
                          <li key={i}>{typeof err === 'string' ? err : err.message || JSON.stringify(err)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-emerald-700 italic">
                  Ozon sunucuları ürünü işleme alıyor, durum kontrol ediliyor...
                </p>
              )}
            </div>
          )}
        </section>

        {/* JSON Önizleme Alanı */}
        {showJsonPreview && (
          <section className="bg-slate-950 text-slate-200 rounded-2xl p-6 shadow-xl space-y-3 font-mono text-xs overflow-hidden border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800">
              <span className="font-bold text-slate-300">Ozon /v3/product/import Request Payload:</span>
              <span>application/json</span>
            </div>
            <pre className="overflow-x-auto max-h-96 p-2 bg-slate-900 rounded-lg text-emerald-400 text-[11px] leading-relaxed">
              {JSON.stringify(generateOzonPayload(), null, 2)}
            </pre>
          </section>
        )}


        {/* 🌲 Ozon Canlı Kategori Ağacı Manuel Seçim Modalı */}
        <CategoryTreeModal
          isOpen={isTreeModalOpen}
          onClose={() => setIsTreeModalOpen(false)}
          selectedTypeId={selectedCategory?.typeId}
          onSelectCategory={(cat) => {
            handleSelectCategoryOnly({
              categoryId: cat.categoryId,
              categoryName: cat.categoryName,
              typeId: cat.typeId,
              typeName: cat.typeName,
              path: cat.path,
              confidence: 100,
            });
          }}
        />
      </div>
    </main>

  );
}

export default function UrunYuklePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Yükleniyor...</div>}>
      <UrunYukleContent />
    </Suspense>
  );
}
