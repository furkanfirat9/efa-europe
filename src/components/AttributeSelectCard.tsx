'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  BookOpen,
  CheckCircle2,
  Layers,
  CheckSquare,
  Square,
  Lock,
  FileText,
} from 'lucide-react';
import {
  PreFilledAttribute,
  AttributeSelectedValue,
  isWarrantyAttribute,
  isMergeWithSimilarAttribute,
  isNamingTemplateAttribute,
  isIgnoredAttribute,
} from '@/lib/ai/filler';
import { OzonAttributeValue, OzonLanguage } from '@/lib/ozon/types';

interface AttributeSelectCardProps {
  attribute: PreFilledAttribute;
  categoryId: number;
  typeId: number;
  language?: OzonLanguage;
  onValueChange: (
    attributeId: number,
    valueText: string,
    dictValueId?: number,
    selectedValues?: AttributeSelectedValue[]
  ) => void;
}

export default function AttributeSelectCard({
  attribute,
  categoryId,
  typeId,
  language = 'RU',
  onValueChange,
}: AttributeSelectCardProps) {
  const isDictionary = attribute.dictionaryId > 0;
  const isMultiSelect = attribute.isCollection;
  const isWarranty = isWarrantyAttribute({ id: attribute.attributeId, name: attribute.name });
  const isMerge = isMergeWithSimilarAttribute({ id: attribute.attributeId, name: attribute.name });
  const isIgnored = isIgnoredAttribute({ id: attribute.attributeId, name: attribute.name });
  const isLocked = attribute.isReadOnly || isWarranty || isMerge || isIgnored;

  const isDescription =
    attribute.attributeId === 4191 ||
    attribute.type.toLowerCase().includes('multiline') ||
    attribute.type.toLowerCase().includes('rich') ||
    attribute.name.toLowerCase().includes('kısa bilgi') ||
    attribute.name.toLowerCase().includes('açıklama') ||
    attribute.name.toLowerCase().includes('аннотация');

  const isSeriesModelCard =
    attribute.attributeId === 9048 ||
    attribute.name.toLowerCase().includes('tek bir karta birleştirmek') ||
    attribute.name.toLowerCase().includes('объединения в одну карточку');

  const isNamingTemplate =
    isNamingTemplateAttribute({ id: attribute.attributeId, name: attribute.name }) ||
    attribute.attributeId === 12141 ||
    attribute.attributeId === 20776;

  // Dropdown Durumu
  const [isOpen, setIsOpen] = useState(false);
  const [values, setValues] = useState<OzonAttributeValue[]>([]);
  const [loadingValues, setLoadingValues] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OzonAttributeValue[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [lastValueId, setLastValueId] = useState(0);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Seçili değerler listesi (Çoklu veya Tekli)
  const currentSelectedValues: AttributeSelectedValue[] = isWarranty
    ? [{ value: '15 дней', dictionaryValueId: attribute.dictionaryValueId || 972120566 }]
    : isMerge
    ? [{ value: attribute.valueText }]
    : attribute.selectedValues && attribute.selectedValues.length > 0
    ? attribute.selectedValues
    : attribute.valueText
    ? [{ value: attribute.valueText, dictionaryValueId: attribute.dictionaryValueId }]
    : [];

  // Dışarı tıklandığında dropdown'ı kapat
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sözlük Değerlerini Yükle
  const loadValues = async (loadMore = false) => {
    if (!isDictionary || isLocked) return;
    setLoadingValues(true);

    const currentLastId = loadMore ? lastValueId : 0;

    try {
      const res = await fetch(
        `/api/ozon/attribute-values?description_category_id=${categoryId}&type_id=${typeId}&attribute_id=${attribute.attributeId}&last_value_id=${currentLastId}&limit=30&language=${language}`
      );
      const data = await res.json();
      if (data.success) {
        const newValues: OzonAttributeValue[] = data.data || [];
        setValues((prev) => (loadMore ? [...prev, ...newValues] : newValues));
        setHasNext(!!data.has_next);
        if (newValues.length > 0) {
          setLastValueId(newValues[newValues.length - 1].id);
        }
      }
    } catch (e) {
      console.error('Sözlük değerleri yüklenemedi:', e);
    } finally {
      setLoadingValues(false);
    }
  };

  // Açılır Listeyi Açtığında İlk Değerleri Yükle
  const handleToggleOpen = () => {
    if (isLocked) return;
    if (!isOpen && values.length === 0 && isDictionary) {
      loadValues(false);
    }
    setIsOpen(!isOpen);
  };

  // Canlı Arama (Debounced)
  const handleSearchChange = (query: string) => {
    if (isLocked) return;
    setSearchQuery(query);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/ozon/attribute-values/search?description_category_id=${categoryId}&type_id=${typeId}&attribute_id=${attribute.attributeId}&query=${encodeURIComponent(
            query.trim()
          )}&limit=30&language=${language}`
        );
        const data = await res.json();
        if (data.success) {
          setSearchResults(data.data || []);
        }
      } catch (e) {
        console.error('Arama hatası:', e);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  // Seçenek Tıklandığında
  const handleToggleOption = (item: OzonAttributeValue) => {
    if (isLocked) return;

    if (isMultiSelect) {
      const existsIndex = currentSelectedValues.findIndex(
        (v) => v.dictionaryValueId === item.id || v.value.toLowerCase() === item.value.toLowerCase()
      );

      let updated: AttributeSelectedValue[];
      if (existsIndex >= 0) {
        updated = currentSelectedValues.filter((_, i) => i !== existsIndex);
      } else {
        updated = [...currentSelectedValues, { value: item.value, dictionaryValueId: item.id }];
      }

      const combinedText = updated.map((v) => v.value).join(', ');
      onValueChange(attribute.attributeId, combinedText, undefined, updated);
    } else {
      onValueChange(attribute.attributeId, item.value, item.id, [
        { value: item.value, dictionaryValueId: item.id },
      ]);
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  // Belirli bir seçimi chip üzerinden sil
  const handleRemoveChip = (e: React.MouseEvent, index: number) => {
    if (isLocked) return;
    e.stopPropagation();
    const updated = currentSelectedValues.filter((_, i) => i !== index);
    const combinedText = updated.map((v) => v.value).join(', ');
    onValueChange(
      attribute.attributeId,
      combinedText,
      updated.length > 0 ? updated[0].dictionaryValueId : undefined,
      updated
    );
  };

  // Tüm Seçimi Temizle
  const handleClearAll = (e: React.MouseEvent) => {
    if (isLocked) return;
    e.stopPropagation();
    onValueChange(attribute.attributeId, '', undefined, []);
  };

  const isFilled = isLocked || currentSelectedValues.length > 0 || (attribute.valueText && attribute.valueText.trim().length > 0);

  return (
    <div
      className={`p-4 rounded-xl border space-y-2.5 transition-all relative ${
        isDescription
          ? 'md:col-span-2 bg-gradient-to-br from-slate-50 to-blue-50/20 border-blue-200 shadow-xs'
          : isLocked
          ? 'bg-slate-100/70 border-slate-300 shadow-2xs'
          : attribute.isRequired
          ? 'bg-amber-50/20 border-amber-200/90'
          : 'bg-white border-slate-200'
      }`}
    >
      {/* Kart Başlığı ve Bilgileri */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs text-slate-900 block">{attribute.name}</span>
            {isDescription && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                <FileText className="w-3 h-3 text-blue-600" /> Ürün Açıklaması (Аннотация - SEO)
              </span>
            )}
            {isSeriesModelCard && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                🔗 Seri Kart Kodu (Varyant Birleştirme)
              </span>
            )}
            {isNamingTemplate && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1">
                🏷️ Vitrin Model Adı (Şablon)
              </span>
            )}
            {isIgnored && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-200 text-slate-500 border border-slate-300 flex items-center gap-0.5">
                <Lock className="w-2.5 h-2.5 text-slate-400" /> Pasif (Kullanılmıyor)
              </span>
            )}
            {isWarranty && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-200 text-slate-800 border border-slate-300 flex items-center gap-0.5">
                <Lock className="w-2.5 h-2.5 text-slate-600" /> Sabit (15 Gün)
              </span>
            )}
            {isMerge && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-200 text-slate-800 border border-slate-300 flex items-center gap-0.5">
                <Lock className="w-2.5 h-2.5 text-slate-600" /> Sabit (Kategori)
              </span>
            )}
            {isLocked && !isIgnored && !isWarranty && !isMerge && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-200 text-slate-800 border border-slate-300 flex items-center gap-0.5">
                <Lock className="w-2.5 h-2.5 text-slate-600" /> Salt Okunur
              </span>
            )}
            {isMultiSelect && !isLocked && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-0.5">
                <Layers className="w-2.5 h-2.5" /> Çoklu Seçim
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 mt-0.5">
            <span>ID: {attribute.attributeId}</span>
            <span>•</span>
            <span>{attribute.type}</span>
            {isDictionary && (
              <>
                <span>•</span>
                <span className="text-blue-600 font-sans flex items-center gap-0.5">
                  <BookOpen className="w-2.5 h-2.5" /> Sözlük ID: {attribute.dictionaryId}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isLocked ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-white flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" /> Salt Okunur
            </span>
          ) : attribute.isRequired ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white">
              Zorunlu
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
              Opsiyonel
            </span>
          )}

          {isFilled && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
              <Check className="w-3 h-3" /> {isLocked ? 'Sabitlendi' : isMultiSelect ? `${currentSelectedValues.length} Seçildi` : 'Eşleşti'}
            </span>
          )}
        </div>
      </div>

      {/* KİLİTLİ ALANLAR (GARANTİ 15 GÜN VEYA BENZER ÜRÜNLERLE BİRLEŞME) */}
      {isLocked ? (
        <div className="w-full p-2.5 rounded-lg bg-slate-200/80 border border-slate-300 text-xs font-bold text-slate-800 flex items-center justify-between select-none shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span>
              {isWarranty ? '15 дней (15 Gün)' : attribute.valueText || 'Kategori Adı'}
            </span>
            {isWarranty && (
              <span className="text-[10px] font-mono text-slate-600 bg-white/90 px-1.5 py-0.2 rounded border border-slate-300">
                ID: 972120566
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500 font-normal italic">
            {isWarranty ? 'Sabit Mağaza Standartı' : isMerge ? 'Sabit Kategori Adı (Otomatik)' : 'Salt Okunur'}
          </span>
        </div>
      ) : isDictionary ? (
        /* SÖZLÜK TÜRÜ: AÇILIR LİSTE (CHECKBOX'LI ÇOKLU VEYA TEKLİ) */
        <div className="relative" ref={dropdownRef}>
          {/* Seçim Kutusu / Chip Alanı */}
          <div
            onClick={handleToggleOpen}
            className={`w-full p-2 rounded-lg text-xs font-medium cursor-pointer border flex items-center justify-between transition-all select-none min-h-[38px] ${
              isFilled
                ? 'bg-blue-50/40 border-blue-300 text-slate-900 shadow-2xs'
                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
            }`}
          >
            {/* Çoklu Seçim Chip'leri veya Tekli Değer */}
            <div className="flex flex-wrap items-center gap-1.5 min-w-0 pr-2">
              {currentSelectedValues.length > 0 ? (
                currentSelectedValues.map((val, idx) => (
                  <span
                    key={`${val.value}-${idx}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100/80 text-blue-900 border border-blue-200 rounded-md text-xs font-medium shadow-2xs"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span className="truncate max-w-[140px]">{val.value}</span>
                    {val.dictionaryValueId && (
                      <span className="text-[9px] font-mono text-blue-600 bg-white/80 px-1 rounded">
                        {val.dictionaryValueId}
                      </span>
                    )}
                    {isMultiSelect && (
                      <button
                        type="button"
                        onClick={(e) => handleRemoveChip(e, idx)}
                        className="hover:text-red-600 hover:bg-blue-200/60 p-0.5 rounded transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))
              ) : (
                <span className="text-slate-400 pl-1">
                  {isMultiSelect ? 'Seçenekleri işaretleyiniz (Çoklu seçim)...' : 'Ozon sözlüğünden seçiniz...'}
                </span>
              )}
            </div>

            {/* Sağ Butonlar */}
            <div className="flex items-center gap-1 text-slate-400 shrink-0">
              {isFilled && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="p-1 hover:text-red-500 hover:bg-red-50 rounded"
                  title="Tümünü Temizle"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {isOpen ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>

          {/* Açılır Menü Listesi (Checkbox Seçenekleri) */}
          {isOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 space-y-2 max-h-72 flex flex-col animate-in fade-in-50 zoom-in-95">
              {/* Liste İçi Canlı Arama Çubuğu */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  placeholder={`"${attribute.name}" içinde ara...`}
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                {isSearching && (
                  <RefreshCw className="w-3 h-3 text-blue-600 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
                )}
              </div>

              {/* Seçenekler Listesi */}
              <div className="overflow-y-auto flex-1 space-y-1 pr-1">
                {searchQuery.trim().length >= 2 ? (
                  searchResults.length === 0 && !isSearching ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      &quot;{searchQuery}&quot; ile eşleşen sonuç bulunamadı.
                    </div>
                  ) : (
                    searchResults.map((item) => {
                      const isSelected = currentSelectedValues.some(
                        (v) => v.dictionaryValueId === item.id || v.value.toLowerCase() === item.value.toLowerCase()
                      );
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleToggleOption(item)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer flex items-center justify-between transition-colors select-none ${
                            isSelected
                              ? 'bg-blue-50 text-blue-900 font-semibold border border-blue-200'
                              : 'hover:bg-slate-100 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {isMultiSelect ? (
                              isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 shrink-0" />
                              )
                            ) : (
                              isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            )}

                            {item.picture && (
                              <img src={item.picture} alt="" className="w-4 h-4 rounded object-cover" />
                            )}
                            <span className="truncate">{item.value}</span>
                          </div>

                          <span className="text-[10px] font-mono text-slate-400 shrink-0 bg-slate-50 px-1 py-0.2 rounded">
                            {item.id}
                          </span>
                        </div>
                      );
                    })
                  )
                ) : (
                  loadingValues && values.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      <span>Değerler yükleniyor...</span>
                    </div>
                  ) : values.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      Değer bulunamadı veya arama yapınız.
                    </div>
                  ) : (
                    values.map((item) => {
                      const isSelected = currentSelectedValues.some(
                        (v) => v.dictionaryValueId === item.id || v.value.toLowerCase() === item.value.toLowerCase()
                      );
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleToggleOption(item)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer flex items-center justify-between transition-colors select-none ${
                            isSelected
                              ? 'bg-blue-50 text-blue-900 font-semibold border border-blue-200'
                              : 'hover:bg-slate-100 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {isMultiSelect ? (
                              isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 shrink-0" />
                              )
                            ) : (
                              isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            )}

                            {item.picture && (
                              <img src={item.picture} alt="" className="w-4 h-4 rounded object-cover" />
                            )}
                            <span className="truncate">{item.value}</span>
                          </div>

                          <span className="text-[10px] font-mono text-slate-400 shrink-0 bg-slate-50 px-1 py-0.2 rounded">
                            {item.id}
                          </span>
                        </div>
                      );
                    })
                  )
                )}

                {hasNext && !searchQuery && (
                  <button
                    type="button"
                    onClick={() => loadValues(true)}
                    disabled={loadingValues}
                    className="w-full py-1 text-center text-[11px] text-blue-600 font-semibold hover:underline"
                  >
                    {loadingValues ? 'Yükleniyor...' : '+ Daha Fazla Değer Göster'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : isDescription ? (
        /* AÇIKLAMA / KISA BİLGİ (ID: 4191) ÇOK SATIRLI TEXTAREA ALANI */
        <div className="space-y-1.5">
          <textarea
            rows={7}
            value={attribute.valueText}
            onChange={(e) => onValueChange(attribute.attributeId, e.target.value, undefined, [{ value: e.target.value }])}
            placeholder="Rusça SEO Ürün Açıklaması ve Öne Çıkan Özellikler Listesi..."
            className="w-full px-3.5 py-2.5 rounded-xl text-xs leading-relaxed font-normal focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white border border-slate-300 text-slate-900 shadow-2xs resize-y"
          />
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span>Ozon arama indeksinde ve ürün sayfasında görünecek ana Rusça metin</span>
            <span className="font-mono font-medium">{attribute.valueText?.length || 0} karakter</span>
          </div>
        </div>
      ) : (
        /* SERBEST METİN / SAYISAL ALAN GİRİŞİ */
        <div className="space-y-1">
          <input
            type="text"
            disabled={isLocked}
            value={attribute.valueText}
            onChange={(e) => onValueChange(attribute.attributeId, e.target.value, undefined, [{ value: e.target.value }])}
            placeholder={
              isIgnored
                ? 'Bu nitelik devre dışıdır (Doldurulmaz)'
                : isSeriesModelCard
                ? 'Örn: ph-5400-kahve (Seri Birleştirme Kodu)...'
                : isNamingTemplate
                ? 'Örn: NA350/00 9 л с двумя чашами 2750 Вт (SEO Vitrin Modeli)...'
                : `Değer giriniz (${attribute.type})...`
            }
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
              isLocked
                ? 'bg-slate-100/80 border-slate-200 text-slate-400 cursor-not-allowed'
                : isFilled
                ? 'bg-white border-slate-300 text-slate-900 font-semibold shadow-2xs'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          />
          {isSeriesModelCard && (
            <p className="text-[11px] text-slate-400 px-1">
              Aynı seri koduna sahip tüm varyantlar ve modeller Ozon&apos;da tek bir ürün kartında birleşir.
            </p>
          )}
          {isNamingTemplate && (
            <p className="text-[11px] text-amber-700/80 px-1">
              Ozon bu alanı vitrin başlığına ekler. Marka hariç, Model No + En önemli 1-2 teknik özellik (örn: 9 л, 2750 Вт) girilmesi Ozon aramasında ürünü öne çıkarır.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
