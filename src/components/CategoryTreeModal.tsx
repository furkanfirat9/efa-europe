'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderTree,
  Search,
  RefreshCw,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';
import { OzonCategoryNode, OzonLanguage } from '@/lib/ozon/types';

interface FlatLeafCategory {
  categoryId: number;
  categoryName: string;
  typeId: number;
  typeName: string;
  path: string[];
}

interface CategoryTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCategory: (category: {
    categoryId: number;
    categoryName: string;
    typeId: number;
    typeName: string;
    path: string[];
  }) => void;
  selectedTypeId?: number;
}

// Bellek İçi Kalıcı Ağaç Önbelleği
const globalTreeCache: { [key in OzonLanguage]?: OzonCategoryNode[] } = {};

/**
 * Kategori Ağacını A'dan Z'ye Deterministik Olarak Sıralar
 */
function sortCategoryTree(nodes: OzonCategoryNode[], langLocale: string = 'tr'): OzonCategoryNode[] {
  return [...nodes]
    .sort((a, b) => {
      const nameA = (a.category_name || a.type_name || '').trim();
      const nameB = (b.category_name || b.type_name || '').trim();
      return nameA.localeCompare(nameB, langLocale, { sensitivity: 'base' });
    })
    .map((node) => ({
      ...node,
      children: node.children ? sortCategoryTree(node.children, langLocale) : undefined,
    }));
}

export default function CategoryTreeModal({
  isOpen,
  onClose,
  onSelectCategory,
  selectedTypeId,
}: CategoryTreeModalProps) {
  const [language, setLanguage] = useState<OzonLanguage>('TR');
  const [treeData, setTreeData] = useState<OzonCategoryNode[]>(globalTreeCache[language] || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drilldown durumları
  const [selectedRoot, setSelectedRoot] = useState<OzonCategoryNode | null>(null);
  const [selectedSub, setSelectedSub] = useState<OzonCategoryNode | null>(null);

  // Arama durumu
  const [searchQuery, setSearchQuery] = useState('');

  // ESC ile kapatma
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Kategori Ağacını Çek ve Sırala
  const fetchTree = useCallback(async (lang: OzonLanguage) => {
    if (globalTreeCache[lang] && globalTreeCache[lang]!.length > 0) {
      const cached = globalTreeCache[lang]!;
      setTreeData(cached);
      if (!selectedRoot && cached.length > 0) {
        setSelectedRoot(cached[0]);
        setSelectedSub(cached[0].children?.[0] || null);
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ozon/category-tree?language=${lang}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Kategori ağacı alınamadı.');
      }
      const rawList: OzonCategoryNode[] = data.data || [];
      const sortedList = sortCategoryTree(rawList, lang === 'RU' ? 'ru' : 'tr');
      globalTreeCache[lang] = sortedList;
      setTreeData(sortedList);

      if (sortedList.length > 0) {
        setSelectedRoot(sortedList[0]);
        if (sortedList[0].children && sortedList[0].children.length > 0) {
          setSelectedSub(sortedList[0].children[0]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Kategori ağacı yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [selectedRoot]);

  useEffect(() => {
    if (isOpen) {
      if (globalTreeCache[language]) {
        const cached = globalTreeCache[language]!;
        setTreeData(cached);
        if (!selectedRoot && cached.length > 0) {
          setSelectedRoot(cached[0]);
          setSelectedSub(cached[0].children?.[0] || null);
        }
      } else {
        fetchTree(language);
      }
    }
  }, [isOpen, language, fetchTree, selectedRoot]);

  // Ağaçtaki tüm yaprak (leaf) kategorilerini düz liste olarak indeksle (parentDescId aktarımıyla)
  const allLeafCategories = useMemo<FlatLeafCategory[]>(() => {
    const list: FlatLeafCategory[] = [];
    const traverse = (node: OzonCategoryNode, currentPath: string[], parentDescId: number = 0) => {
      const nodeName = node.category_name || node.type_name || '';
      const pathNow = nodeName ? [...currentPath, nodeName] : currentPath;
      const descId = node.description_category_id || parentDescId;

      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          traverse(child, pathNow, descId);
        }
      } else {
        const catId = node.description_category_id || descId;
        const catName = pathNow[pathNow.length - 2] || node.category_name || 'Kategori';
        const typeId = node.type_id || 0;
        const typeName = node.type_name || node.category_name || 'Ürün Tipi';

        list.push({
          categoryId: catId,
          categoryName: catName,
          typeId: typeId,
          typeName: typeName,
          path: pathNow,
        });
      }
    };

    for (const root of treeData) {
      traverse(root, [], root.description_category_id || 0);
    }

    const locale = language === 'RU' ? 'ru' : 'tr';
    return list.sort((a, b) => a.typeName.localeCompare(b.typeName, locale, { sensitivity: 'base' }));
  }, [treeData, language]);

  // Arama sonuçları (Deterministik ve A-Z Sıralı)
  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];

    const matched = allLeafCategories.filter((item) => {
      return (
        item.typeName.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q) ||
        item.path.some((p) => p.toLowerCase().includes(q)) ||
        String(item.typeId).includes(q) ||
        String(item.categoryId).includes(q)
      );
    });

    const locale = language === 'RU' ? 'ru' : 'tr';

    return matched.sort((a, b) => {
      const aStarts = a.typeName.toLowerCase().startsWith(q) ? 1 : 0;
      const bStarts = b.typeName.toLowerCase().startsWith(q) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;

      return a.typeName.localeCompare(b.typeName, locale, { sensitivity: 'base' });
    }).slice(0, 60);
  }, [searchQuery, allLeafCategories, language]);

  // Bir kategoriyi seç ve kapat
  const handleSelectAndClose = (cat: FlatLeafCategory) => {
    onSelectCategory(cat);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-xs animate-in fade-in-50">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] max-h-[750px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Başlık Çubuğu */}
        <div className="p-4 sm:px-6 border-b border-slate-100 flex items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <FolderTree className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Ozon Kategori Ağacı (Sabit A-Z Sıralı)</span>
              </h2>
              <p className="text-[11px] text-slate-500">
                Kategoriler alfabetik ve sabit sırada tutulur, kolayca bulabilirsiniz.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Dil Seçici */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setLanguage('TR');
                  fetchTree('TR');
                }}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  language === 'TR' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                TR
              </button>
              <button
                type="button"
                onClick={() => {
                  setLanguage('RU');
                  fetchTree('RU');
                }}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  language === 'RU' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                RU
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Canlı Arama Inputu */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/60">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tüm Ozon ağacında anlık ara (Örn: Kahve, Airfryer, Tencere, Ütü, Buhar, Kulaklık, ID)..."
              className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-2xs font-medium"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Modal İçeriği: Arama Sonuçları VEYA 3 Sütunlu Ağaç */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-xs font-medium">Ozon kategori ağacı yükleniyor...</p>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-xs text-red-600 font-medium">{error}</p>
              <button
                type="button"
                onClick={() => fetchTree(language)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
              >
                Tekrar Dene
              </button>
            </div>
          ) : searchQuery.trim() ? (
            /* Arama Sonuçları Görünümü (A'dan Z'ye Sıralı) */
            <div className="h-full overflow-y-auto p-4 space-y-2">
              <div className="text-xs font-semibold text-slate-500 pb-1">
                Bulunan Kategoriler ({searchResults.length}):
              </div>

              {searchResults.map((cat, idx) => {
                const isSelected = selectedTypeId === cat.typeId;
                return (
                  <div
                    key={`${cat.categoryId}-${cat.typeId}-${idx}`}
                    onClick={() => handleSelectAndClose(cat)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-blue-50 border-blue-600 shadow-xs'
                        : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {cat.typeName}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {cat.path.join(' › ')}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right text-[10px] font-mono text-slate-400 hidden sm:block">
                        <div>Kat ID: {cat.categoryId}</div>
                        <div>Tip ID: {cat.typeId}</div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectAndClose(cat);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Seç</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {searchResults.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-xs">
                  "{searchQuery}" aramasına uygun kategori bulunamadı.
                </div>
              )}
            </div>
          ) : (
            /* 3 Sütunlu Ağaç Gezgini (A'dan Z'ye Sabit Sıralı) */
            <div className="h-full grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* 1. Sütun: Ana Kategoriler (A-Z) */}
              <div className="h-full flex flex-col overflow-hidden bg-slate-50/40">
                <div className="p-2.5 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  1. Ana Kategori ({treeData.length})
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {treeData.map((root, idx) => {
                    const isSelected = selectedRoot?.category_name === root.category_name;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSelectedRoot(root);
                          setSelectedSub(root.children?.[0] || null);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-xs font-bold'
                            : 'text-slate-700 hover:bg-slate-100/80'
                        }`}
                      >
                        <span className="truncate">{root.category_name}</span>
                        <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Sütun: Alt Kategoriler (A-Z) */}
              <div className="h-full flex flex-col overflow-hidden bg-white">
                <div className="p-2.5 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  2. Alt Kategori ({selectedRoot?.children?.length || 0})
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {selectedRoot?.children?.map((sub, idx) => {
                    const isSelected = selectedSub?.category_name === sub.category_name;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSelectedSub(sub);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-blue-50 text-blue-900 border border-blue-200 font-bold shadow-2xs'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{sub.category_name}</span>
                        <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                      </button>
                    );
                  })}
                  {!selectedRoot?.children?.length && (
                    <div className="p-4 text-center text-slate-400 text-xs">
                      Alt kategori bulunmuyor.
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Sütun: Ürün Tipleri (A-Z) */}
              <div className="h-full flex flex-col overflow-hidden bg-white">
                <div className="p-2.5 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  3. Ürün Tipi ({selectedSub?.children?.length || (selectedSub ? 1 : 0)})
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {selectedSub?.children && selectedSub.children.length > 0 ? (
                    selectedSub.children.map((leaf, idx) => {
                      const catId =
                        leaf.description_category_id ||
                        selectedSub.description_category_id ||
                        selectedRoot?.description_category_id ||
                        0;
                      const catName = selectedSub.category_name || 'Kategori';
                      const typeId = leaf.type_id || 0;
                      const typeName = leaf.type_name || leaf.category_name || 'Ürün';

                      const leafObj: FlatLeafCategory = {
                        categoryId: catId,
                        categoryName: catName,
                        typeId: typeId,
                        typeName: typeName,
                        path: [selectedRoot?.category_name || '', selectedSub.category_name || '', typeName],
                      };
                      const isSelected = selectedTypeId === typeId;

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectAndClose(leafObj)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-all group ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-xs font-bold'
                              : 'text-slate-700 hover:bg-blue-50/70 hover:text-blue-900'
                          }`}
                        >
                          <span className="truncate">{typeName}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-all shrink-0 ${
                            isSelected
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-800'
                          }`}>
                            Seç
                          </span>
                        </button>
                      );
                    })
                  ) : selectedSub ? (
                    /* Tek yaprak seviyesi */
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectAndClose({
                          categoryId: selectedSub.description_category_id || selectedRoot?.description_category_id || 0,
                          categoryName: selectedSub.category_name || 'Kategori',
                          typeId: selectedSub.type_id || 0,
                          typeName: selectedSub.type_name || selectedSub.category_name || 'Ürün Tipi',
                          path: [selectedRoot?.category_name || '', selectedSub.category_name || ''],
                        })
                      }
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between text-slate-700 hover:bg-blue-50/70 hover:text-blue-900 transition-all group"
                    >
                      <span className="truncate">{selectedSub.category_name}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-800 transition-all">
                        Seç
                      </span>
                    </button>
                  ) : (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      👈 Lütfen ortadaki sütundan bir alt kategori seçiniz.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Alt Bilgi Çubuğu */}
        <div className="p-3.5 px-6 border-t border-slate-100 bg-white flex items-center justify-between text-xs text-slate-500">
          <span>Toplam {allLeafCategories.length} Ozon ürün tipi hazır • A&apos;dan Z&apos;ye sıralı</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
