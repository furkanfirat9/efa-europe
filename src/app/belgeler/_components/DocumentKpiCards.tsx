'use client';

import React from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Skeleton } from '@/components/shadcn/skeleton';
import { formatTL } from '@/lib/format';
import type { DocumentItem } from '../utils';

export function DocumentKpiCards({
  documents,
  pendingCount,
  loading,
}: {
  documents: DocumentItem[];
  pendingCount: number;
  loading: boolean;
}) {
  const sum = (items: DocumentItem[]) => items.reduce((acc, d) => acc + (d.totalTry ?? 0), 0);
  const goods = documents.filter((d) => d.category === 'tedarik.mal');
  const services = documents.filter((d) => d.category !== 'tedarik.mal');

  const cards = [
    { label: 'Toplam gider', value: formatTL(sum(documents)), note: `${documents.length} belge` },
    { label: 'Mal alımı', value: formatTL(sum(goods)), note: `${goods.length} fatura` },
    { label: 'Hizmet ve üyelik', value: formatTL(sum(services)), note: `${services.length} belge` },
    { label: 'Onay bekleyen', value: String(pendingCount), note: 'Tüm aylar' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {loading ? <Skeleton className="h-8 w-28" /> : card.value}
            </CardTitle>
            <CardDescription className="text-xs">{loading ? <Skeleton className="h-4 w-16" /> : card.note}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
