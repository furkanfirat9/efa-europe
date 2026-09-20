'use client';

import React from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Skeleton } from '@/components/shadcn/skeleton';
import { formatTL } from '@/lib/format';
import { categoryTotals, type DocumentItem } from '../utils';

export function DocumentKpiCards({
  documents,
  pendingCount,
  loading,
}: {
  documents: DocumentItem[];
  pendingCount: number;
  loading: boolean;
}) {
  // Çok kalemli belgelerde (Ozon UPD'si) toplam, kalem kategorilerine dağıtılır.
  const totals = categoryTotals(documents);
  const sumOf = (prefix: string) =>
    totals.filter((t) => t.key === prefix || t.key.startsWith(`${prefix}.`)).reduce((acc, t) => acc + t.total, 0);
  const grandTotal = totals.reduce((acc, t) => acc + t.total, 0);
  const goodsTotal = sumOf('tedarik');
  const ozonTotal = sumOf('ozon');

  const cards = [
    { label: 'Toplam gider', value: formatTL(grandTotal), note: `${documents.length} belge` },
    {
      label: 'Mal alımı',
      value: formatTL(goodsTotal),
      note: `${documents.filter((d) => d.category === 'tedarik.mal').length} fatura`,
    },
    { label: 'Ozon giderleri', value: formatTL(ozonTotal), note: 'komisyon, lojistik, abonelik' },
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
