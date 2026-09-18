'use client';

import React from 'react';
import { StatusDot, StatusTone } from '@/components/ui/StatusDot';

const TONE_BY_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  awaiting_packaging: { tone: 'caution', label: 'Paketleme bekliyor' },
  awaiting_registration: { tone: 'brand', label: 'Sevkiyat bekliyor' },
  awaiting_deliver: { tone: 'brand', label: 'Sevkiyat bekliyor' },
  driver_pickup: { tone: 'brand', label: 'Kargoda' },
  delivering: { tone: 'brand', label: 'Kargoda' },
  delivered: { tone: 'gain', label: 'Teslim edildi' },
  cancelled: { tone: 'loss', label: 'İptal edildi' },
};

/** Ozon sipariş durumunu konsolun ortak durum gösterimine çevirir. */
export function OrderStatus({ status, statusName }: { status: string; statusName?: string }) {
  const known = TONE_BY_STATUS[status];
  return (
    <StatusDot
      tone={known?.tone ?? 'neutral'}
      label={statusName || known?.label || status || 'İşleniyor'}
    />
  );
}
