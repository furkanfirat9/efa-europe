'use client';

import React from 'react';

export type StatusTone = 'gain' | 'brand' | 'caution' | 'loss' | 'neutral';

const DOT: Record<StatusTone, string> = {
  gain: 'bg-gain',
  brand: 'bg-brand',
  caution: 'bg-caution',
  loss: 'bg-loss',
  neutral: 'bg-ink-faint',
};

/**
 * Konsoldaki tek durum gösterimi: renk noktası + nötr metin.
 * Renkli çerçeveli dolgu rozetler bir listede yan yana geldiğinde ekranı
 * trafik ışığına çeviriyor; nokta rengi aynı bilgiyi gürültüsüz veriyor.
 */
export function StatusDot({
  tone,
  label,
  title,
}: {
  tone: StatusTone;
  label: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-2xs text-ink-muted"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`} />
      {label}
    </span>
  );
}
