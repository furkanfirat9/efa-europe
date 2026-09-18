'use client';

import React from 'react';

interface PanelProps {
  title: string;
  /** Başlığın altındaki tek satırlık bağlam. */
  caption?: string;
  /** Başlık satırının sağına yerleşen kontroller (sekme, buton, rozet). */
  actions?: React.ReactNode;
  /** Başlık alanına tıklandığında tetiklenecek fonksiyon */
  onHeaderClick?: () => void;
  /** Gövdenin kendi iç boşluğunu yönettiği durumlar için (harita, tablo). */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Konsoldaki tüm bölümlerin ortak çerçevesi: tek bir hairline kenarlık,
 * gölge yok, sabit başlık yüksekliği. Panellerin aynı ritimde durması
 * sayfanın tek elden çıkmış görünmesini sağlayan asıl şey.
 */
export function Panel({
  title,
  caption,
  actions,
  onHeaderClick,
  flush = false,
  className = '',
  bodyClassName = '',
  children,
}: PanelProps) {
  return (
    <section
      className={`flex flex-col rounded-panel border border-hairline bg-panel ${className}`}
    >
      <header
        onClick={onHeaderClick}
        className={`flex min-h-[52px] items-center justify-between gap-4 border-b border-hairline px-5 py-3 ${
          onHeaderClick ? 'cursor-pointer transition-colors hover:bg-white/[0.02]' : ''
        }`}
      >
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h2>
          {caption && (
            <p className="mt-0.5 truncate text-2xs text-ink-subtle">{caption}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>

      {/* min-w-0: geniş bir tablo veya grafik flex öğesini şişirip sayfayı
          yatay kaydırmaya zorlamasın. */}
      <div className={`min-h-0 min-w-0 flex-1 ${flush ? '' : 'p-5'} ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}

/** Panel başlıklarında ve tablo üstlerinde kullanılan segment kontrolü. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'md' ? 'px-3 py-1.5' : 'px-2.5 py-1';

  return (
    <div className="inline-flex rounded-lg border border-hairline bg-panel-sunken p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`${pad} cursor-pointer rounded-[6px] text-2xs font-medium transition-colors ${
              active
                ? 'bg-panel-raised text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                : 'text-ink-subtle hover:text-ink-muted'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
