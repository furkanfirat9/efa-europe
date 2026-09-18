'use client';

import React from 'react';
import { PillBadge, BadgeTone } from '@/components/ui/PillBadge';

interface OrderStatusBadgeProps {
  status: string;
  statusName?: string;
  className?: string;
}

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = React.memo(
  function OrderStatusBadge({ status, statusName, className = '' }) {
    const isAwaiting = ['awaiting_deliver', 'awaiting_packaging', 'awaiting_registration'].includes(
      status
    );
    const isDelivering = ['delivering', 'driver_pickup'].includes(status);
    const isDelivered = status === 'delivered';
    const isCancelled = status === 'cancelled';

    const label =
      statusName ||
      (isAwaiting
        ? 'Sevkiyat Bekliyor'
        : isDelivered
        ? 'Teslim Edildi'
        : isDelivering
        ? 'Kargoda'
        : isCancelled
        ? 'İptal'
        : status);

    let badgeClass = 'bg-slate-100 text-slate-600 border-slate-200/50';
    if (isAwaiting) badgeClass = 'bg-amber-50 text-amber-600 border-amber-100/50';
    else if (isDelivered) badgeClass = 'bg-emerald-50 text-emerald-600 border-emerald-100/50';
    else if (isDelivering) badgeClass = 'bg-blue-50 text-blue-600 border-blue-100/50';
    else if (isCancelled) badgeClass = 'bg-rose-50 text-rose-600 border-rose-100/50';

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border ${badgeClass} ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
        <span>{label}</span>
      </span>
    );
  }
);
