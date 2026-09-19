'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, X } from 'lucide-react';
import { AvailableSupplier } from '../useOrders';

interface OrderSupplierDropdownProps {
  supplierFilter: string;
  onSelectSupplier: (supplier: string) => void;
  availableSuppliers: AvailableSupplier[];
}

export const OrderSupplierDropdown: React.FC<OrderSupplierDropdownProps> = ({
  supplierFilter,
  onSelectSupplier,
  availableSuppliers,
}) => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const calcPosition = useCallback(() => {
    if (!buttonRef.current) return null;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 220;
    const left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left - 40));
    const top = rect.bottom + 6;
    return { top, left };
  }, []);

  const handleToggle = () => {
    if (!open) {
      const pos = calcPosition();
      if (pos) setMenuPos(pos);
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const pos = calcPosition();
      if (pos) setMenuPos(pos);
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, calcPosition]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const isFiltered = supplierFilter !== 'all';
  const selectedSupplierObj = availableSuppliers.find((s) => s.name === supplierFilter);
  const displayedLabel = selectedSupplierObj?.label || supplierFilter;

  return (
    <div className="inline-block relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center justify-center gap-1 transition-colors cursor-pointer font-semibold text-[12px] ${
          isFiltered
            ? 'text-blue-400 font-bold'
            : 'text-zinc-200 hover:text-white'
        }`}
        title="Tedarikçiye göre filtrele"
      >
        <span className="max-w-[100px] truncate">{isFiltered ? displayedLabel : 'Tedarik'}</span>
        {isFiltered ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onSelectSupplier('all');
            }}
            className="hover:text-rose-400 rounded-sm p-0.5 text-zinc-400 hover:bg-zinc-800 transition-colors"
            title="Filtreyi temizle"
          >
            <X className="h-3 w-3 stroke-[2.5]" />
          </span>
        ) : (
          <ChevronDown
            className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-150 ${
              open ? 'rotate-180 text-white' : ''
            }`}
          />
        )}
      </button>

      {open &&
        mounted &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: `${menuPos.top}px`,
              left: `${menuPos.left}px`,
              zIndex: 9999,
            }}
            className="w-56 rounded-[20px] border border-border-subtle bg-white p-2 shadow-float text-left font-normal normal-case animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-3 py-1.5 text-[11px] font-medium text-text-muted border-b border-border-subtle mb-1 flex items-center justify-between">
              <span>Tedarikçiye Göre Filtrele</span>
              {isFiltered && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectSupplier('all');
                    setOpen(false);
                  }}
                  className="text-[11px] text-accent hover:underline cursor-pointer font-medium"
                >
                  Temizle
                </button>
              )}
            </div>

            {/* Tümü Seçeneği */}
            <button
              type="button"
              onClick={() => {
                onSelectSupplier('all');
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between rounded-full px-3 py-1.5 text-[12px] transition-colors cursor-pointer ${
                supplierFilter === 'all'
                  ? 'bg-surface-accent text-accent font-medium'
                  : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
              }`}
            >
              <span>Tümü (Tüm Tedarikçiler)</span>
              {supplierFilter === 'all' && <Check className="h-3.5 w-3.5 text-accent stroke-[2.5]" />}
            </button>

            {/* Tedarikçi Listesi */}
            <div className="max-h-60 overflow-y-auto mt-1 space-y-0.5">
              {availableSuppliers.length === 0 ? (
                <div className="px-3 py-3 text-center text-xs text-text-muted">
                  Kayıtlı tedarikçi bulunamadı.
                </div>
              ) : (
                availableSuppliers.map((s) => {
                  const isSelected = supplierFilter === s.name;
                  return (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => {
                        onSelectSupplier(s.name);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 rounded-full px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-surface-accent text-accent font-medium'
                          : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                      }`}
                    >
                      <span className="truncate">{s.label}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-text-secondary">
                          {s.count}
                        </span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-accent stroke-[2.5]" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
