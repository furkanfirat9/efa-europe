import React from 'react';
import { MonthlyRevenueCard } from './_components/MonthlyRevenueCard';
import { AccountingSummaryCard } from './_components/AccountingSummaryCard';

export const metadata = {
  title: 'Dashboard | Ozon AI Studio',
};

/**
 * Uygulamanın özet sayfası. Her alan tek bir kartla temsil edilir
 * (ana rakam + detay sayfasına ok); ayrıntı kendi sayfasında durur.
 */
export default function DashboardPage() {
  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="pb-2">
        <h1 className="text-[32px] font-normal leading-[1.15] tracking-tight text-text-primary sm:text-[36px]">
          Genel bakış
        </h1>
        <p className="mt-1 text-[14px] text-text-secondary">
          Mağazaların, siparişlerin ve muhasebenin özeti.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <MonthlyRevenueCard />
        </div>
        <div className="xl:col-span-4">
          <AccountingSummaryCard />
        </div>
      </div>
    </div>
  );
}
