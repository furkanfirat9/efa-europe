import React from 'react';
import { MonthlyRevenueCard } from './_components/MonthlyRevenueCard';
import { EuropeAccountingPanel } from './_components/EuropeAccountingPanel';

export const metadata = {
  title: 'Dashboard | Ozon AI Studio',
};

export default function DashboardPage() {
  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header: Title left, compact monthly revenue card right */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Avrupa mağazası muhasebe ve resmi fatura yönetim masası.
          </p>
        </div>

        <div className="shrink-0">
          <MonthlyRevenueCard />
        </div>
      </div>

      {/* Avrupa Mağazası Muhasebe & TCMB Fatura Paneli */}
      <EuropeAccountingPanel />
    </div>
  );
}
