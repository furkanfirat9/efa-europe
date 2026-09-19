'use client';

import React from 'react';
import { Badge } from '@/components/shadcn/badge';
import { cn } from '@/lib/utils';

interface OrderStatusBadgeProps {
  status: string;
  statusName?: string;
  className?: string;
}

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = React.memo(
  function OrderStatusBadge({ status, statusName, className }) {
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

    const dot = isAwaiting
      ? 'bg-amber-500'
      : isDelivered
      ? 'bg-emerald-500'
      : isDelivering
      ? 'bg-blue-500'
      : isCancelled
      ? 'bg-rose-500'
      : 'bg-muted-foreground';

    return (
      <Badge variant="outline" className={cn('gap-1.5 text-muted-foreground', className)}>
        <span className={cn('size-1.5 rounded-full', dot)} />
        {label}
      </Badge>
    );
  }
);
