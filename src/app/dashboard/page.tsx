import React from 'react';
import { MonthlyRevenueCard } from './_components/MonthlyRevenueCard';

export const metadata = {
  title: 'Dashboard | Ozon AI Studio',
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header: Title left, compact monthly revenue card right */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Genel mağaza özeti ve performans paneli.
          </p>
        </div>

        <div className="shrink-0">
          <MonthlyRevenueCard />
        </div>
      </div>

      <div className="rounded-[28px] bg-surface p-12 text-center shadow-xs">
        <p className="text-sm text-text-muted">
          Dashboard paneli hazırlanıyor.
        </p>
      </div>
    </div>
  );
}
