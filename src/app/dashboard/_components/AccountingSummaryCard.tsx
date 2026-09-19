'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Skeleton } from '@/components/shadcn/skeleton';
import { formatTL } from '@/lib/format';
import { useEuropeAccounting } from '@/hooks/useEuropeAccounting';

/** Muhasebe sayfasının dashboard özeti: bu ayın fatura tutarı ve vergi sonrası net kâr. */
export function AccountingSummaryCard() {
  const { activeMonth, invoiceTotalTry, netProfitAfterTax, corporateTaxToPay, loading } = useEuropeAccounting();

  const rows = [
    { label: 'Vergi sonrası net kâr', value: netProfitAfterTax },
    { label: 'Kurumlar vergisi', value: corporateTaxToPay },
  ];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription>Avrupa faturası · {activeMonth.label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">
          {loading ? <Skeleton className="h-9 w-44" /> : formatTL(invoiceTotalTry, false)}
        </CardTitle>
        <CardAction>
          <Badge variant="outline">KDV %0</Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="mt-auto flex-col items-stretch gap-3 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium tabular-nums">
              {loading ? <Skeleton className="h-4 w-20" /> : formatTL(r.value, false)}
            </span>
          </div>
        ))}
        <Button asChild variant="outline" size="sm" className="mt-1 self-start">
          <Link href="/muhasebe">
            Muhasebe
            <ArrowUpRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
