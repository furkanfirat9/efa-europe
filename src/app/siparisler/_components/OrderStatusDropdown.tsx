'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { STATUS_FILTER_OPTIONS } from '../types';

interface OrderStatusDropdownProps {
  statusFilter: string;
  onSelectStatus: (status: string) => void;
}

export const OrderStatusDropdown: React.FC<OrderStatusDropdownProps> = ({
  statusFilter,
  onSelectStatus,
}) => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Butonun ekrandaki anlık koordinatını hesapla
  const calcPosition = useCallback(() => {
    if (!buttonRef.current) return null;
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.max(10, rect.right - 192); // 192px = w-48
    const top = rect.bottom + 6;
    return { top, left };
  }, []);

  // Açma / Kapama: Konumu açılmadan önce anlık hesaplayarak (0,0) geçişini önler
  const handleToggle = () => {
    if (!open) {
      const pos = calcPosition();
      if (pos) {
        setMenuPos(pos);
      }
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  // Açıkken pencere boyutu değişirse veya sayfa kaydırılırsa konumu senkron tut
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

  // Dışarı tıklandığında menüyü kapat
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

  const activeOption = STATUS_FILTER_OPTIONS.find((o) => o.key === statusFilter);

  return (
    <div className="inline-block relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center justify-center gap-1 transition-colors cursor-pointer font-semibold text-[12px] ${
          statusFilter !== 'all'
            ? 'text-blue-400 font-bold'
            : 'text-zinc-200 hover:text-white'
        }`}
        title="Duruma göre filtrele"
      >
        <span>{statusFilter === 'all' ? 'Durum' : activeOption?.label || 'Durum'}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-150 ${
            open ? 'rotate-180 text-white' : ''
          }`}
        />
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
            className="w-48 rounded-[20px] border border-border-subtle bg-white p-2 shadow-float text-left font-normal normal-case origin-top-right animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-3 py-1.5 text-[11px] font-medium text-text-muted border-b border-border-subtle mb-1.5">
              Duruma Göre Filtrele
            </div>
            <div className="space-y-0.5">
              {STATUS_FILTER_OPTIONS.map((opt) => {
                const isSelected = statusFilter === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      onSelectStatus(opt.key);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between rounded-full px-3 py-1.5 text-[12px] transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-surface-accent text-iris font-medium'
                        : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${opt.dotColor}`} />
                      <span>{opt.fullLabel}</span>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-iris stroke-[2.5]" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
