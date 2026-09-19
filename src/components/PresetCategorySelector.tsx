'use client';

import React, { useState, useMemo } from 'react';
import {
  PRESET_CATEGORIES,
  PRESET_CATEGORY_GROUPS,
  PresetCategory,
} from '@/lib/constants/presetCategories';
import {
  Search,
  Check,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';

interface PresetCategorySelectorProps {
  selectedTypeId?: number;
  onSelectCategory: (category: PresetCategory) => void;
  title?: string;
}

export default function PresetCategorySelector({
  selectedTypeId,
  onSelectCategory,
}: PresetCategorySelectorProps) {
  const [activeGroupFilter, setActiveGroupFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtrelenmis Kategoriler (A'dan Z'ye Sabit Sıralı)
  const filteredCategories = useMemo(() => {
    const list = PRESET_CATEGORIES.filter((cat) => {
      const matchesGroup = activeGroupFilter === 'all' || cat.groupId === activeGroupFilter;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesGroup;

      return (
        matchesGroup &&
        (cat.label.toLowerCase().includes(q) ||
          cat.russianLabel.toLowerCase().includes(q) ||
          cat.typeName.toLowerCase().includes(q) ||
          cat.categoryName.toLowerCase().includes(q) ||
          cat.groupName.toLowerCase().includes(q) ||
          String(cat.typeId).includes(q))
      );
    });

    return list.sort((a, b) => a.label.localeCompare(b.label, 'tr', { sensitivity: 'base' }));
  }, [activeGroupFilter, searchQuery]);


  const currentSelected = useMemo(() => {
    return PRESET_CATEGORIES.find((c) => c.typeId === selectedTypeId);
  }, [selectedTypeId]);

  return (
    <div className="space-y-3.5">
      {/* 1. Arama & Filtreleme Çubuğu */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Hazır kategorilerde ara (Örn: Airfryer, Kahve, Ütü, Kase, Blender)..."
            className="w-full pl-10 pr-9 py-2.5 bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/15 transition-all"
          />

          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Departman Sekmeleri (Minimal Pills) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveGroupFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeGroupFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
            }`}
          >
            Tümü ({PRESET_CATEGORIES.length})
          </button>

          {PRESET_CATEGORY_GROUPS.map((grp) => {
            const isActive = activeGroupFilter === grp.id;
            return (
              <button
                key={grp.id}
                type="button"
                onClick={() => setActiveGroupFilter(grp.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
                }`}
              >
                <span>{grp.icon}</span>
                <span>{grp.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Temiz ve Minimalist Kategori Izgarası */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[290px] overflow-y-auto pr-1 select-none">
        {filteredCategories.map((cat) => {
          const isSelected = selectedTypeId === cat.typeId;
          return (
            <div
              key={cat.id}
              onClick={() => onSelectCategory(cat)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group ${
                isSelected
                  ? 'bg-blue-50/90 border-blue-600 ring-2 ring-blue-500/20'
                  : 'bg-white hover:bg-slate-50 border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0 p-1.5 rounded-lg bg-slate-50 group-hover:bg-white border border-slate-100 transition-colors">
                    {cat.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate leading-tight">
                      {cat.label}
                    </div>
                    <div className="text-[11px] text-blue-600 font-medium truncate mt-0.5">
                      {cat.russianLabel}
                    </div>
                  </div>
                </div>

                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center border shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-200 bg-white group-hover:border-slate-300'
                  }`}
                >
                  {isSelected && <Check className="w-2.5 h-2.5 stroke-3" />}
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                <span className="truncate max-w-[100px]">{cat.groupName}</span>
                <span className="font-mono text-slate-400">ID: {cat.typeId}</span>
              </div>
            </div>
          );
        })}

        {filteredCategories.length === 0 && (
          <div className="col-span-full py-8 text-center text-slate-400 text-xs">
            Aramanıza uygun hazır kategori bulunamadı.
          </div>
        )}
      </div>

      {/* 3. Minimal Seçili Kategori Özeti */}
      {currentSelected && (
        <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200/80 flex items-center justify-between gap-2.5 animate-in fade-in-50">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0">{currentSelected.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-sm bg-blue-600 text-white">
                  SEÇİLİ
                </span>
                <span className="text-xs font-bold text-slate-900 truncate">
                  {currentSelected.label} ({currentSelected.russianLabel})
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                {currentSelected.path.join(' › ')}
              </p>
            </div>
          </div>

          <div className="text-right text-[10px] font-mono text-slate-500 shrink-0">
            <div>Tip: <strong className="text-blue-700">{currentSelected.typeId}</strong></div>
          </div>
        </div>
      )}
    </div>
  );
}
