'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

/** Koyu konsol dilini kullanan sayfalar; geri kalanı beyaz/açık içerik alanında açılır. */
const CONSOLE_ROUTES = ['/fiyat-endeksi'];

export default function AppLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // /analitik tam ekran, bağımsız ve sidebarsız açılır
  if (pathname === '/analitik') {
    return <main className="w-full min-h-screen bg-canvas">{children}</main>;
  }

  const isConsole = CONSOLE_ROUTES.includes(pathname);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {/* min-w-0: geniş bir tablo flex öğesini şişirip sayfayı yatay
          kaydırmaya zorlamasın (varsayılan min-width: auto bunu yapıyor). */}
      <div className={`flex min-w-0 flex-1 flex-col ${isConsole ? 'bg-canvas' : 'bg-bg-page'}`}>
        {children}
      </div>
    </div>
  );
}
