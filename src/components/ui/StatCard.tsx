'use client';

import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  badge?: React.ReactNode;
  cutoutHref?: string;
  onCutoutClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  badge,
  cutoutHref,
  onCutoutClick,
  className = '',
}) => {
  const hasCutout = Boolean(cutoutHref || onCutoutClick);

  return (
    <div
      className={`relative rounded-[28px] bg-surface p-5 md:p-6 shadow-hairline border border-border-subtle/50 transition-all ${className}`}
    >
      {/* 5.1 Inverted cutout corner */}
      {hasCutout && (
        <div className="absolute top-0 right-0 z-10 p-1.5 bg-[var(--bg-page)] rounded-bl-[20px]">
          <button
            type="button"
            onClick={onCutoutClick}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-text-secondary hover:bg-surface-accent hover:text-accent shadow-hairline transition-colors cursor-pointer"
            title="Detay"
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Label and Badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-text-muted">{label}</span>
        {badge && <div>{badge}</div>}
      </div>

      {/* Main Stat Value */}
      <div className="mt-2 text-[28px] md:text-[32px] font-medium tracking-tight text-text-primary tabular-nums leading-none">
        {value}
      </div>

      {/* Sub Value */}
      {subValue && (
        <div className="mt-1.5 text-[13px] text-text-secondary tabular-nums">
          {subValue}
        </div>
      )}
    </div>
  );
};
