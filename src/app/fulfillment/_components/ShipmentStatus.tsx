'use client';

import React from 'react';

/**
 * Arayüz Tasarım Yönergesi (Madde 3 & Madde 6):
 * Durum renkleri seyreltilir (doygunsuz açık zemin + 1px kenarlık + okunaklı metin).
 * Yarıçap kuralı: etiketler 6px (rounded-[6px]).
 */
interface StateConfig {
  match: (state: string) => boolean;
  style: {
    backgroundColor: string;
    color: string;
    borderColor: string;
  };
  dotColor: string;
  label: string;
}

const STATES: StateConfig[] = [
  {
    match: (s) => s === 'wait',
    style: {
      backgroundColor: 'var(--warn-bg, #FAF5ED)',
      color: 'var(--warn, #8A5A1B)',
      borderColor: 'var(--warn-border, #EBDDC6)',
    },
    dotColor: 'var(--warn, #8A5A1B)',
    label: 'Koli bekleniyor',
  },
  {
    match: (s) => s === 'waiting_for_arrival',
    style: {
      backgroundColor: 'var(--accent-quiet, #EDF2F0)',
      color: 'var(--accent, #2F5D50)',
      borderColor: 'var(--border, #E6E5E1)',
    },
    dotColor: 'var(--accent, #2F5D50)',
    label: 'Amazon kargosu yolda',
  },
  {
    match: (s) => s === 'in_assembly' || s === 'inwork',
    style: {
      backgroundColor: 'var(--accent-quiet, #EDF2F0)',
      color: 'var(--accent, #2F5D50)',
      borderColor: 'var(--border, #E6E5E1)',
    },
    dotColor: 'var(--accent, #2F5D50)',
    label: 'Depoda paketleniyor',
  },
  {
    match: (s) => s === 'palletized',
    style: {
      backgroundColor: 'var(--success-bg, #F0F5F1)',
      color: 'var(--success, #2F6B3D)',
      borderColor: 'var(--success-border, #D4E3D7)',
    },
    dotColor: 'var(--success, #2F6B3D)',
    label: 'Paletlendi',
  },
  {
    match: (s) => s === 'shipped',
    style: {
      backgroundColor: 'var(--success-bg, #F0F5F1)',
      color: 'var(--success, #2F6B3D)',
      borderColor: 'var(--success-border, #D4E3D7)',
    },
    dotColor: 'var(--success, #2F6B3D)',
    label: 'Hava kargoya verildi',
  },
  {
    match: (s) => s.includes('cancel'),
    style: {
      backgroundColor: 'var(--danger-bg, #FBF0EF)',
      color: 'var(--danger, #A03028)',
      borderColor: 'var(--danger-border, #EFC9C6)',
    },
    dotColor: 'var(--danger, #A03028)',
    label: 'İptal edildi',
  },
];

export function ShipmentStatus({ state, waitReason }: { state?: string; waitReason?: string }) {
  const normalized = (state || '').toLowerCase();
  const known = STATES.find((entry) => entry.match(normalized));

  const style = known?.style ?? {
    backgroundColor: 'var(--surface-sunken, #F5F5F3)',
    color: 'var(--text-muted, #57564F)',
    borderColor: 'var(--border, #E6E5E1)',
  };
  const dotColor = known?.dotColor ?? 'var(--text-subtle, #83817A)';
  const label = known?.label ?? state ?? 'Bilinmiyor';

  return (
    <span
      title={waitReason}
      style={style}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] text-[11px] font-medium border whitespace-nowrap"
    >
      <span
        style={{ backgroundColor: dotColor }}
        className="h-1.5 w-1.5 rounded-full shrink-0"
      />
      <span>{label}</span>
    </span>
  );
}

/** Durum kodunun sevkiyat hunisindeki yeri — istatistik şeridi bunu kullanır. */
export const isCancelled = (state?: string) => (state || '').toLowerCase().includes('cancel');
export const isShipped = (state?: string) =>
  ['shipped', 'palletized'].includes((state || '').toLowerCase());
