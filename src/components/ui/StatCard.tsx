'use client';

import React from 'react';
import Link from 'next/link';
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

const CUTOUT_BUTTON =
  'flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-secondary transition-colors hover:bg-ink hover:text-ink-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30';

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
  const icon = <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />;

  return (
    <div className={`relative rounded-card bg-surface p-5 md:p-6 shadow-hairline ${className}`}>
      {/* 5.1 Inverted cutout corner */}
      {hasCutout && (
        <div className="card-cutout">
          {cutoutHref ? (
            <Link href={cutoutHref} onClick={onCutoutClick} className={CUTOUT_BUTTON} aria-label={`${label} detayı`}>
              {icon}
            </Link>
          ) : (
            <button type="button" onClick={onCutoutClick} className={CUTOUT_BUTTON} aria-label={`${label} detayı`}>
              {icon}
            </button>
          )}
        </div>
      )}

      {/* Label and Badge */}
      <div className={`flex min-h-[24px] items-center justify-between gap-2 ${hasCutout ? 'pr-12' : ''}`}>
        <span className="text-[12px] font-medium text-text-muted">{label}</span>
        {badge && <div>{badge}</div>}
      </div>

      {/* Main Stat Value */}
      <div className="mt-3 text-[28px] md:text-[32px] font-medium tracking-tight text-text-primary tabular-nums leading-none">
        {value}
      </div>

      {/* Sub Value */}
      {subValue && (
        <div className="mt-2 text-[13px] text-text-secondary tabular-nums">
          {subValue}
        </div>
      )}
    </div>
  );
};
