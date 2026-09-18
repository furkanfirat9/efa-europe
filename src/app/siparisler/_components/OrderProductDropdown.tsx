'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, X } from 'lucide-react';
import { AvailableProduct } from '../useOrders';

interface OrderProductDropdownProps {
  productFilter: string;
  onSelectProduct: (offerId: string) => void;
  availableProducts: AvailableProduct[];
}

export const OrderProductDropdown: React.FC<OrderProductDropdownProps> = ({
  productFilter,
  onSelectProduct,
  availableProducts,
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
    const width = 250;
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

  const isFiltered = productFilter !== 'all';

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
        title="Ürüne göre filtrele"
      >
        <span className="max-w-[100px] truncate">{isFiltered ? productFilter : 'Ürün'}</span>
        {isFiltered ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onSelectProduct('all');
            }}
            className="hover:text-rose-400 rounded p-0.5 text-zinc-400 hover:bg-zinc-800 transition-colors"
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
            className="w-64 rounded-[20px] border border-border-subtle bg-white p-2 shadow-float text-left font-normal normal-case animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-3 py-1.5 text-[11px] font-medium text-text-muted border-b border-border-subtle mb-1 flex items-center justify-between">
              <span>Ürüne Göre Filtrele</span>
              {isFiltered && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectProduct('all');
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
                onSelectProduct('all');
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between rounded-full px-3 py-1.5 text-[12px] transition-colors cursor-pointer ${
                productFilter === 'all'
                  ? 'bg-surface-accent text-accent font-medium'
                  : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
              }`}
            >
              <span>Tümü (Tüm Ürünler)</span>
              {productFilter === 'all' && <Check className="h-3.5 w-3.5 text-accent stroke-[2.5]" />}
            </button>

            {/* Ürün Listesi */}
            <div className="max-h-60 overflow-y-auto mt-1 space-y-0.5">
              {availableProducts.length === 0 ? (
                <div className="px-3 py-3 text-center text-xs text-text-muted">
                  Kayıtlı ürün bulunamadı.
                </div>
              ) : (
                availableProducts.map((p) => {
                  const isSelected = productFilter === p.offerId;
                  return (
                    <button
                      key={p.offerId}
                      type="button"
                      onClick={() => {
                        onSelectProduct(p.offerId);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-surface-accent text-accent font-medium'
                          : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-mono font-medium text-xs truncate text-text-primary">
                          {p.offerId}
                        </div>
                        {p.title && (
                          <div className="text-[11px] text-text-muted truncate mt-0.5" title={p.title}>
                            {p.title}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-text-secondary">
                          {p.count}
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
