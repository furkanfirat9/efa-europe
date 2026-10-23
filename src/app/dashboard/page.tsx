import React from 'react';
import { DashboardView } from './_components/DashboardView';

export const metadata = {
  title: 'Dashboard | EFA Europe',
};

/**
 * Uygulamanın özet sayfası, Amazon satıcı paneli düzeninde (src/app/dashboard/_components/DashboardView.tsx).
 * Ana rakamlar ve bağlantılar burada; ayrıntı kendi sayfasında durur.
 */
export default function DashboardPage() {
  return (
    <div className="flex-1 space-y-6 bg-background p-4 pt-6 text-foreground md:p-8">
      <h1 className="sr-only">Genel bakış</h1>
      <DashboardView />
    </div>
  );
}
