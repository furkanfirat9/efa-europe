'use client';

import React from 'react';

interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  cutoutAction?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  actions,
  cutoutAction,
  className = '',
  children,
}) => {
  return (
    <div
      className={`relative rounded-[28px] bg-surface p-5 md:p-6 shadow-hairline transition-all ${className}`}
    >
      {/* İsteğe bağlı Cutout Köşe Aksiyonu (Inverted Cutout Corner) */}
      {cutoutAction && (
        <div className="absolute top-0 right-0 z-10 flex items-center justify-center rounded-bl-[24px] bg-[var(--bg-page)] p-2">
          {cutoutAction}
        </div>
      )}

      {/* Başlık ve Açıklama */}
      {(title || subtitle || actions) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-[20px] font-normal tracking-tight text-text-primary md:text-[22px]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-[13px] text-text-secondary">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}

      {children}
    </div>
  );
};
