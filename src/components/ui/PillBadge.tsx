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
    bg: 'bg-[#E5F6EC]',
    text: 'text-[#2E8B57]',
    dot: 'bg-[#2E8B57]',
  },
  danger: {
    bg: 'bg-[#FDE7E7]',
    text: 'text-[#D14343]',
    dot: 'bg-[#D14343]',
  },
  info: {
    bg: 'bg-[#ECEBFD]',
    text: 'text-[#5856D6]',
    dot: 'bg-[#5856D6]',
  },
  warning: {
    bg: 'bg-[#FDF0E2]',
    text: 'text-[#C47A2C]',
    dot: 'bg-[#C47A2C]',
  },
  pink: {
    bg: 'bg-[#FCE7F2]',
    text: 'text-[#C2408A]',
    dot: 'bg-[#C2408A]',
  },
  neutral: {
    bg: 'bg-[#F1F1F5]',
    text: 'text-[#6B6B78]',
    dot: 'bg-[#6B6B78]',
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
