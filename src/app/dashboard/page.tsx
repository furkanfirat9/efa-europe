import React from 'react';
import { MonthlyRevenueCard } from './_components/MonthlyRevenueCard';
import { AccountingSummaryCard } from './_components/AccountingSummaryCard';

export const metadata = {
  title: 'Dashboard | Ozon AI Studio',
};

/**
 * Uygulamanın özet sayfası. Her alan tek bir kartla temsil edilir
 * (ana rakam + detay sayfasına bağlantı); ayrıntı kendi sayfasında durur.
 */
export default function DashboardPage() {
  return (
    <div className="flex-1 space-y-4 bg-background p-4 pt-6 text-foreground md:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Genel bakış</h1>
        <p className="text-muted-foreground">Mağazaların, siparişlerin ve muhasebenin özeti.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MonthlyRevenueCard />
        <AccountingSummaryCard />
      </div>
    </div>
  );
}
