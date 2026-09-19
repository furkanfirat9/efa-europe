'use client';

import React from 'react';

export type BadgeTone = 'success' | 'danger' | 'info' | 'warning' | 'pink' | 'neutral';

interface PillBadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, { bg: string; text: string; dot: string }> = {
  success: {
    bg: 'bg-status-success-bg',
    text: 'text-status-success-text',
    dot: 'bg-status-success-text',
  },
  danger: {
    bg: 'bg-status-danger-bg',
    text: 'text-status-danger-text',
    dot: 'bg-status-danger-text',
  },
  info: {
    bg: 'bg-status-info-bg',
    text: 'text-status-info-text',
    dot: 'bg-status-info-text',
  },
  warning: {
    bg: 'bg-status-warning-bg',
    text: 'text-status-warning-text',
    dot: 'bg-status-warning-text',
  },
  pink: {
    bg: 'bg-status-pink-bg',
    text: 'text-status-pink-text',
    dot: 'bg-status-pink-text',
  },
  neutral: {
    bg: 'bg-status-neutral-bg',
    text: 'text-status-neutral-text',
    dot: 'bg-status-neutral-text',
  },
};

export const PillBadge: React.FC<PillBadgeProps> = ({
  tone = 'neutral',
  dot = false,
  children,
  className = '',
}) => {
  const current = TONE_CLASSES[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none whitespace-nowrap ${current.bg} ${current.text} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${current.dot}`} />}
      {children}
    </span>
  );
};
