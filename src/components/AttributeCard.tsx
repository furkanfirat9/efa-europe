'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Check,
  Tag,
  BookOpen,
  Edit3,
  ListOrdered,
  Layers,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { OzonAttribute, OzonAttributeValue, OzonLanguage } from '@/lib/ozon/types';

interface AttributeCardProps {
  attribute: OzonAttribute;
  categoryId: number;
  typeId: number;
  language: OzonLanguage;
}

export default function AttributeCard({
  attribute,
  categoryId,
  typeId,
  language,
}: AttributeCardProps) {
  const isDictionary = attribute.dictionary_id > 0;

  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<OzonAttributeValue[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [lastValueId, setLastValueId] = useState(0);
  const [loadingValues, setLoadingValues] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OzonAttributeValue[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial batch of values
  const loadValues = async (loadMore = false) => {
    if (!isDictionary) return;
    setLoadingValues(true);
    setError(null);

    const currentLastId = loadMore ? lastValueId : 0;

    try {
      const res = await fetch(
        `/api/ozon/attribute-values?description_category_id=${categoryId}&type_id=${typeId}&attribute_id=${attribute.id}&last_value_id=${currentLastId}&limit=30&language=${language}`
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Sözlük değerleri alınamadı.');
      }

      const newValues: OzonAttributeValue[] = data.data || [];
      setValues((prev) => (loadMore ? [...prev, ...newValues] : newValues));
      setHasNext(!!data.has_next);

      if (newValues.length > 0) {
        setLastValueId(newValues[newValues.length - 1].id);
      }
    } catch (err: any) {
      setError(err.message || 'Değerler yüklenirken hata oluştu.');
    } finally {
      setLoadingValues(false);
    }
  };

  // Handle Search Input with debounce
  const handleSearchChange = (q: string) => {
    setSearchQuery(q);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!q || q.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/ozon/attribute-values/search?description_category_id=${categoryId}&type_id=${typeId}&attribute_id=${attribute.id}&query=${encodeURIComponent(
            q.trim()
          )}&limit=30&language=${language}`
        );
        const data = await res.json();
        if (data.success) {
          setSearchResults(data.data || []);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  };

  const handleToggleExpand = () => {
    if (!expanded && isDictionary && values.length === 0 && !searchQuery) {
      loadValues(false);
    }
    setExpanded(!expanded);
  };

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        attribute.is_required
          ? 'bg-amber-50/30 border-amber-200/90 shadow-xs'
          : 'bg-white border-slate-200/90 shadow-xs'
      }`}
    >
      {/* Card Header */}
      <div className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h5 className="font-bold text-slate-900 text-sm leading-snug">{attribute.name}</h5>
            {attribute.group_name && (
              <span className="text-[10px] text-slate-400 font-medium">
                Grup: {attribute.group_name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {attribute.is_required ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white shadow-xs">
                Zorunlu
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                Opsiyonel
              </span>
            )}

            {attribute.is_aspect && (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                Varyant
              </span>
            )}
          </div>
        </div>

        {attribute.description && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
            {attribute.description}
          </p>
        )}

        {/* Feature / Behavior Meta Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] font-medium">
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
            ID: {attribute.id}
          </span>
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
            Tip: {attribute.type}
          </span>

          {isDictionary ? (
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium border border-blue-100">
              <BookOpen className="w-3 h-3 text-blue-600" />
              <span>Sözlük ID: {attribute.dictionary_id}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-medium border border-emerald-100">
              <Edit3 className="w-3 h-3 text-emerald-600" />
              <span>Serbest Metin / Giriş</span>
            </span>
          )}

          {attribute.is_collection ? (
            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
              Çoklu Seçim (Dizi{attribute.max_value_count > 0 ? ` - Max: ${attribute.max_value_count}` : ''})
            </span>
          ) : (
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
              Tekli Değer
            </span>
          )}
        </div>
      </div>

      {/* Card Body: Interactive Values / Input Inspector */}
      {isDictionary ? (
        <div className="border-t border-slate-100 bg-slate-50/50 rounded-b-xl overflow-hidden">
          {/* Toggle Accordion Header */}
          <button
            onClick={handleToggleExpand}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-blue-700 hover:bg-blue-50/60 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              <span>{expanded ? 'Sözlük Değerlerini ve Aramayı Gizle' : 'Alabileceği Değerleri Gör / Canlı Ara'}</span>
            </span>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Expanded Dictionary Explorer */}
          {expanded && (
            <div className="p-4 pt-2 space-y-3 bg-white border-t border-slate-100">
              {/* Search Bar for this specific attribute */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={`"${attribute.name}" içinde ara (örn: ${
                    attribute.id === 85 ? 'Zara, Apple, Nike' : 'Pamuk, Siyah, TR'
                  })...`}
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                {isSearching && (
                  <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>

              {/* Error state */}
              {error && (
                <div className="text-[11px] text-red-600 bg-red-50 p-2 rounded border border-red-100">
                  {error}
                </div>
              )}

              {/* Search Results Display */}
              {searchQuery.trim().length >= 2 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <span>Arama Sonuçları ({searchResults.length})</span>
                    <span className="text-blue-600">Canlı Ozon API Sorgusu</span>
                  </div>

                  {searchResults.length === 0 && !isSearching ? (
                    <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-lg">
                      &quot;{searchQuery}&quot; ile eşleşen bir sözlük değeri bulunamadı.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1">
                      {searchResults.map((item) => (
                        <div
                          key={item.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/80 border border-blue-200/80 text-xs text-blue-900 hover:bg-blue-100 transition-colors shadow-2xs"
                        >
                          {item.picture && (
                            <img
                              src={item.picture}
                              alt={item.value}
                              className="w-3.5 h-3.5 rounded object-cover"
                            />
                          )}
                          <span className="font-medium">{item.value}</span>
                          <span className="text-[10px] font-mono text-blue-500 bg-white/80 px-1 rounded">
                            {item.id}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Paginated Standard Values List */
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <span>Kayıtlı Örnek Değerler ({values.length})</span>
                    {hasNext && <span className="text-[10px] text-slate-400">Daha fazla kayıt var</span>}
                  </div>

                  {loadingValues && values.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      <RefreshCw className="w-4 h-4 text-blue-600 animate-spin mx-auto mb-1" />
                      Değerler yükleniyor...
                    </div>
                  ) : values.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 rounded-lg">
                      Değer bulunamadı veya arama yapılması gerekiyor.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1">
                      {values.map((item) => (
                        <div
                          key={item.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-800 hover:bg-slate-200/70 transition-colors shadow-2xs"
                        >
                          {item.picture && (
                            <img
                              src={item.picture}
                              alt={item.value}
                              className="w-3.5 h-3.5 rounded object-cover"
                            />
                          )}
                          <span className="font-medium">{item.value}</span>
                          <span className="text-[10px] font-mono text-slate-500 bg-white px-1 rounded border border-slate-200">
                            {item.id}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Load More Button */}
                  {hasNext && (
                    <button
                      onClick={() => loadValues(true)}
                      disabled={loadingValues}
                      className="w-full mt-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      {loadingValues ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <span>Daha Fazla Değer Yükle (+30)</span>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Free Input Demonstration */
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 rounded-b-xl text-xs space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-600 block">Giriş Alanı Türü</span>
          <div className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-slate-400 text-xs font-mono">
            {attribute.type === 'String' && '[Metin Girişi (String)]'}
            {attribute.type === 'Decimal' && '[Sayısal / Ondalık Değer (Decimal)]'}
            {attribute.type === 'Integer' && '[Tam Sayı (Integer)]'}
            {attribute.type === 'Multiline' && '[Çok Satırlı Metin (Multiline)]'}
            {attribute.type === 'URL' && '[Web Bağlantısı (URL)]'}
            {attribute.type === 'RichText' && '[Zengin Metin / HTML (RichText)]'}
            {!['String', 'Decimal', 'Integer', 'Multiline', 'URL', 'RichText'].includes(attribute.type) &&
              `[${attribute.type} tipi giriş beklenir]`}
          </div>
        </div>
      )}
    </div>
  );
}
