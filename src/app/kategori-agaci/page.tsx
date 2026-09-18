'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderTree,
  Search,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Download,
  Layers,
  Sparkles,
  Tag,
  ListFilter,
  Check,
  Globe,
} from 'lucide-react';
import { OzonCategoryNode, OzonAttribute, OzonLanguage } from '@/lib/ozon/types';
import AttributeCard from '@/components/AttributeCard';

export default function KategoriAgaciPage() {
  const [language, setLanguage] = useState<OzonLanguage>('TR');
  const [treeData, setTreeData] = useState<OzonCategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drilldown selections
  const [selectedRoot, setSelectedRoot] = useState<OzonCategoryNode | null>(null);
  const [selectedSub, setSelectedSub] = useState<OzonCategoryNode | null>(null);
  const [selectedLeaf, setSelectedLeaf] = useState<{
    categoryId: number;
    categoryName: string;
    typeId: number;
    typeName: string;
    disabled?: boolean;
    path: string[];
  } | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Attributes inspection
  const [attributes, setAttributes] = useState<OzonAttribute[]>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [attributeError, setAttributeError] = useState<string | null>(null);
  const [attributeFilter, setAttributeFilter] = useState<'all' | 'required' | 'aspect' | 'dictionary' | 'input'>('all');

  // Fetch Category Tree from API
  const handleFetchTree = useCallback(async (langToFetch: OzonLanguage) => {
    setLoading(true);
    setError(null);
    setSelectedRoot(null);
    setSelectedSub(null);
    setSelectedLeaf(null);
    setAttributes([]);

    try {
      const res = await fetch(`/api/ozon/category-tree?language=${langToFetch}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Kategori ağacı alınamadı.');
      }

      const list: OzonCategoryNode[] = data.data || [];
      setTreeData(list);
      if (list.length > 0) {
        setSelectedRoot(list[0]);
        if (list[0].children && list[0].children.length > 0) {
          setSelectedSub(list[0].children[0]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Bilinmeyen bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on page load
  useEffect(() => {
    handleFetchTree(language);
  }, [handleFetchTree, language]);

  // Fetch Attributes for selected Leaf
  const handleFetchAttributes = async (categoryId: number, typeId: number) => {
    setLoadingAttributes(true);
    setAttributeError(null);
    setAttributes([]);

    try {
      const res = await fetch(
        `/api/ozon/category-attributes?description_category_id=${categoryId}&type_id=${typeId}&language=${language}`
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Nitelikler yüklenemedi.');
      }

      setAttributes(data.data || []);
    } catch (err: any) {
      setAttributeError(err.message || 'Nitelikler yüklenirken hata oluştu.');
    } finally {
      setLoadingAttributes(false);
    }
  };

  // Flatten leaf nodes for global search
  const flatLeafNodes = useMemo(() => {
    const list: Array<{
      categoryId: number;
      categoryName: string;
      typeId: number;
      typeName: string;
      disabled?: boolean;
      path: string[];
    }> = [];

    const traverse = (node: OzonCategoryNode, currentPath: string[], latestCatId: number, latestCatName: string) => {
      const name = node.category_name || node.type_name || '';
      const newPath = [...currentPath, name];
      const catId = node.description_category_id !== undefined ? node.description_category_id : latestCatId;
      const catName = node.category_name || latestCatName;

      if (node.type_id !== undefined && node.type_name) {
        list.push({
          categoryId: catId,
          categoryName: catName,
          typeId: node.type_id,
          typeName: node.type_name,
          disabled: node.disabled,
          path: newPath,
        });
      }

      if (node.children && node.children.length > 0) {
        node.children.forEach((child) => traverse(child, newPath, catId, catName));
      }
    };

    treeData.forEach((root) => {
      traverse(root, [], root.description_category_id || 0, root.category_name || '');
    });

    return list;
  }, [treeData]);

  // Filtered search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return flatLeafNodes.filter(
      (item) =>
        item.typeName.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q) ||
        item.typeId.toString().includes(q) ||
        item.categoryId.toString().includes(q) ||
        item.path.some((p) => p.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [flatLeafNodes, searchQuery]);

  // Filtered attributes
  const filteredAttributes = useMemo(() => {
    if (attributeFilter === 'required') {
      return attributes.filter((a) => a.is_required);
    }
    if (attributeFilter === 'aspect') {
      return attributes.filter((a) => a.is_aspect);
    }
    if (attributeFilter === 'dictionary') {
      return attributes.filter((a) => a.dictionary_id > 0);
    }
    if (attributeFilter === 'input') {
      return attributes.filter((a) => a.dictionary_id === 0);
    }
    return attributes;
  }, [attributes, attributeFilter]);

  // Total stats
  const stats = useMemo(() => {
    return {
      rootCount: treeData.length,
      totalTypes: flatLeafNodes.length,
    };
  }, [treeData, flatLeafNodes]);

  // Download JSON
  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(treeData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ozon-category-tree-${language}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-blue-600" />
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Ozon Kategori Ağacı & Nitelik Müfettişi</h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Ozon hiyerarşisi, ürün tipleri, zorunlu nitelikler ve canlı sözlük araması
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Language Selector */}
            <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
              <Globe className="w-3.5 h-3.5 text-slate-400 ml-2 mr-1" />
              {(['TR', 'RU', 'EN'] as OzonLanguage[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    setLanguage(lang);
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    language === lang
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lang === 'TR' ? 'Türkçe (TR)' : lang === 'RU' ? 'Rusça (RU)' : 'İngilizce (EN)'}
                </button>
              ))}
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => handleFetchTree(language)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
              title="Ağacı Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Yenile</span>
            </button>

            {/* Download JSON Button */}
            {treeData.length > 0 && (
              <button
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-all shadow-sm"
                title="JSON Olarak İndir"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>JSON</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl w-full mx-auto p-6 md:p-8 flex-1 flex flex-col space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-3 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Kategori ağacı yüklenirken bir hata oluştu</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => handleFetchTree(language)}
              className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"
            >
              Tekrar Dene
            </button>
          </div>
        )}

        {/* Loading State Skeleton */}
        {loading && (
          <div className="space-y-4">
            <div className="h-10 bg-slate-200/70 rounded-xl animate-pulse w-full" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="h-[520px] bg-white border border-slate-200 rounded-xl p-4 space-y-3 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/3 mb-4" />
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="h-9 bg-slate-100 rounded-lg w-full" />
                ))}
              </div>
              <div className="h-[520px] bg-white border border-slate-200 rounded-xl p-4 space-y-3 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/3 mb-4" />
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-9 bg-slate-100 rounded-lg w-full" />
                ))}
              </div>
              <div className="h-[520px] bg-white border border-slate-200 rounded-xl p-4 space-y-3 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/3 mb-4" />
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="h-9 bg-slate-100 rounded-lg w-full" />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tree Explorer View */}
        {treeData.length > 0 && !loading && (
          <div className="space-y-6">
            {/* Stats & Search Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search Box */}
              <div className="md:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Kategori, ürün tipi veya ID ara (örn: Telefon, 92341, Fantezi, Ayakkabı)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full px-2 py-0.5"
                  >
                    Temizle
                  </button>
                )}
              </div>

              {/* Quick Summary Pill */}
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center justify-between shadow-sm text-xs">
                <div className="flex items-center gap-2 text-slate-600">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>Ana Kategori: <strong className="text-slate-900">{stats.rootCount}</strong></span>
                </div>
                <div className="h-4 w-px bg-slate-200" />
                <div className="flex items-center gap-2 text-slate-600">
                  <Tag className="w-4 h-4 text-indigo-600" />
                  <span>Ürün Türü: <strong className="text-slate-900">{stats.totalTypes}</strong></span>
                </div>
              </div>
            </div>

            {/* Search Results Mode */}
            {searchQuery.trim() ? (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Arama Sonuçları ({searchResults.length} sonuç bulundu)
                  </span>
                  <span className="text-[11px] text-slate-400">Ürün türüne tıklayarak nitelikleri inceleyin</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      &quot;{searchQuery}&quot; aramasına uygun kategori veya ürün tipi bulunamadı.
                    </div>
                  ) : (
                    searchResults.map((item, idx) => (
                      <div
                        key={`${item.categoryId}-${item.typeId}-${idx}`}
                        onClick={() => {
                          setSelectedLeaf(item);
                          handleFetchAttributes(item.categoryId, item.typeId);
                        }}
                        className={`p-4 hover:bg-blue-50/50 cursor-pointer transition-colors flex items-center justify-between gap-4 ${
                          selectedLeaf?.typeId === item.typeId ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-slate-900">{item.typeName}</span>
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">
                              Type ID: {item.typeId}
                            </span>
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-mono">
                              Cat ID: {item.categoryId}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {item.path.join(' › ')}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* Drilldown 3-Column Explorer */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Column 1: Root Categories */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[520px]">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>1. Ana Kategoriler ({treeData.length})</span>
                    <span className="text-[10px] text-slate-400 font-normal">Level 1</span>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-1.5 space-y-0.5">
                    {treeData.map((root) => {
                      const isSelected = selectedRoot?.description_category_id === root.description_category_id;
                      return (
                        <button
                          key={root.description_category_id}
                          onClick={() => {
                            setSelectedRoot(root);
                            const firstSub = root.children && root.children.length > 0 ? root.children[0] : null;
                            setSelectedSub(firstSub);
                            setSelectedLeaf(null);
                            setAttributes([]);
                          }}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center justify-between transition-all ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-sm font-semibold'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate pr-2">{root.category_name}</span>
                          <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Column 2: Subcategories */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[520px]">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>2. Alt Kategoriler ({selectedRoot?.children?.length || 0})</span>
                    <span className="text-[10px] text-slate-400 font-normal">Level 2</span>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-1.5 space-y-0.5">
                    {!selectedRoot || !selectedRoot.children || selectedRoot.children.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Alt kategori bulunamadı
                      </div>
                    ) : (
                      selectedRoot.children.map((sub, idx) => {
                        const isSelected =
                          selectedSub?.description_category_id === sub.description_category_id ||
                          selectedSub?.category_name === sub.category_name;
                        return (
                          <button
                            key={sub.description_category_id || idx}
                            onClick={() => {
                              setSelectedSub(sub);
                              setSelectedLeaf(null);
                              setAttributes([]);
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center justify-between transition-all ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                                : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <span className="truncate block">{sub.category_name || sub.type_name}</span>
                              {sub.description_category_id && (
                                <span className={`text-[10px] font-mono block ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                  ID: {sub.description_category_id}
                                </span>
                              )}
                            </div>
                            <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Column 3: Types / Leaf Nodes */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[520px]">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>3. Ürün Türleri ({selectedSub?.children?.length || 0})</span>
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-mono">
                      Yüklenebilir
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-1.5 space-y-0.5">
                    {!selectedSub || !selectedSub.children || selectedSub.children.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Ürün tipi seçmek için bir alt kategoriye tıklayın
                      </div>
                    ) : (
                      selectedSub.children.map((leaf, idx) => {
                        const isSelected = selectedLeaf?.typeId === leaf.type_id;
                        const catId = selectedSub.description_category_id || selectedRoot?.description_category_id || 0;
                        const catName = selectedSub.category_name || selectedRoot?.category_name || '';

                        return (
                          <button
                            key={leaf.type_id || idx}
                            onClick={() => {
                              const leafObj = {
                                categoryId: catId,
                                categoryName: catName,
                                typeId: leaf.type_id || 0,
                                typeName: leaf.type_name || '',
                                disabled: leaf.disabled,
                                path: [selectedRoot?.category_name || '', selectedSub?.category_name || '', leaf.type_name || ''],
                              };
                              setSelectedLeaf(leafObj);
                              handleFetchAttributes(catId, leaf.type_id || 0);
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center justify-between transition-all ${
                              isSelected
                                ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                                : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <span className="block truncate">{leaf.type_name}</span>
                              <span className={`text-[10px] block font-mono ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                                Type ID: {leaf.type_id}
                              </span>
                            </div>
                            <Check className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'opacity-0'}`} />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Selected Category Details & Attributes Inspector */}
            {selectedLeaf && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                {/* Header Info */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                        Seçili Ürün Türü
                      </span>
                      <h3 className="text-base font-bold text-slate-900">{selectedLeaf.typeName}</h3>
                    </div>
                    <p className="text-xs text-slate-500">
                      Hiyerarşi: <span className="text-slate-700 font-medium">{selectedLeaf.path.join(' › ')}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                      <span className="text-slate-400 block text-[10px]">Description Category ID</span>
                      <span className="font-mono font-bold text-slate-800">{selectedLeaf.categoryId}</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                      <span className="text-slate-400 block text-[10px]">Type ID</span>
                      <span className="font-mono font-bold text-slate-800">{selectedLeaf.typeId}</span>
                    </div>
                    <a
                      href={`/?catId=${selectedLeaf.categoryId}&typeId=${selectedLeaf.typeId}&catName=${encodeURIComponent(selectedLeaf.categoryName)}&typeName=${encodeURIComponent(selectedLeaf.typeName)}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Bu Kategoriyle Ürün Yükle</span>
                    </a>
                  </div>
                </div>

                {/* Attributes Section */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ListFilter className="w-4 h-4 text-blue-600" />
                      <h4 className="text-sm font-bold text-slate-900">
                        Kategori Nitelikleri ({attributes.length})
                      </h4>
                    </div>

                    {/* Attribute Filters */}
                    {attributes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                        <button
                          onClick={() => setAttributeFilter('all')}
                          className={`px-2.5 py-1 rounded font-medium transition-all ${
                            attributeFilter === 'all'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Tümü ({attributes.length})
                        </button>
                        <button
                          onClick={() => setAttributeFilter('required')}
                          className={`px-2.5 py-1 rounded font-medium transition-all ${
                            attributeFilter === 'required'
                              ? 'bg-amber-500 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Zorunlu ({attributes.filter((a) => a.is_required).length})
                        </button>
                        <button
                          onClick={() => setAttributeFilter('aspect')}
                          className={`px-2.5 py-1 rounded font-medium transition-all ${
                            attributeFilter === 'aspect'
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Varyant ({attributes.filter((a) => a.is_aspect).length})
                        </button>
                        <button
                          onClick={() => setAttributeFilter('dictionary')}
                          className={`px-2.5 py-1 rounded font-medium transition-all ${
                            attributeFilter === 'dictionary'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Sözlük ({attributes.filter((a) => a.dictionary_id > 0).length})
                        </button>
                        <button
                          onClick={() => setAttributeFilter('input')}
                          className={`px-2.5 py-1 rounded font-medium transition-all ${
                            attributeFilter === 'input'
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Serbest Giriş ({attributes.filter((a) => a.dictionary_id === 0).length})
                        </button>
                      </div>
                    )}
                  </div>

                  {loadingAttributes && (
                    <div className="p-8 text-center bg-slate-50 rounded-xl space-y-2">
                      <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
                      <p className="text-xs font-semibold text-slate-700">Nitelikler Ozon API&apos;den Çekiliyor...</p>
                    </div>
                  )}

                  {attributeError && (
                    <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                      {attributeError}
                    </div>
                  )}

                  {!loadingAttributes && attributes.length === 0 && !attributeError && (
                    <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                      Bu kategoriye ait nitelik bulunamadı veya henüz yüklenmedi.
                    </div>
                  )}

                  {!loadingAttributes && filteredAttributes.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredAttributes.map((attr) => (
                        <AttributeCard
                          key={attr.id}
                          attribute={attr}
                          categoryId={selectedLeaf.categoryId}
                          typeId={selectedLeaf.typeId}
                          language={language}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
