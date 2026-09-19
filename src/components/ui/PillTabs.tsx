'use client';

import React from 'react';

interface PillTabsProps<T extends string> {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * Beyaz pill zemin üzerinde segment seçici; aktif öğe siyah pill.
 * Dar ekranda taşarsa sayfayı değil kendini yatay kaydırır.
 */
export function PillTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: PillTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-surface p-1 shadow-hairline scrollbar-none ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`h-8 shrink-0 cursor-pointer rounded-full px-3.5 text-[13px] font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/30 ${
              active
                ? 'bg-ink text-ink-foreground'
                : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
