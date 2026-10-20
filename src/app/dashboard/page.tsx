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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Genel bakış</h1>
        <p className="text-muted-foreground">Mağazaların, siparişlerin ve muhasebenin özeti.</p>
      </div>
      <DashboardView />
    </div>
  );
}
