'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  PackagePlus,
  Package,
  Layers,
  FolderTree,
  ShoppingBag,
  Calculator,
  TrendingUp,
  ArrowUpRight,
  Truck,
  Sparkles,
  LineChart,
} from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Canlı analitik', href: '/analitik', icon: TrendingUp, external: true },
  { name: 'Siparişler', href: '/siparisler', icon: Package },
  { name: 'Fulfillment', href: '/fulfillment', icon: Truck },
  { name: 'Amazon avcısı', href: '/amazon-aktar', icon: Sparkles },
  { name: 'Fiyat endeksi', href: '/fiyat-endeksi', icon: LineChart },
  { name: 'Tekli ürün yükle', href: '/', icon: PackagePlus, alias: '/urun-yukle' },
  { name: 'Toplu yükleme', href: '/toplu-yukle', icon: Layers },
  { name: 'Kâr hesaplama', href: '/kar-hesaplama', icon: Calculator },
  { name: 'Kategori ağacı', href: '/kategori-agaci', icon: FolderTree },
];

/**
 * lg altında etiketler düşer ve menü 56px'lik bir ikon rayına iner: sabit
 * 240px genişlik telefonda içerik alanını ekranın dışına itiyordu.
 */
export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex min-h-screen w-14 shrink-0 flex-col border-r border-hairline bg-canvas lg:w-60">
      <div className="flex h-16 items-center justify-center border-b border-hairline lg:justify-start lg:gap-2.5 lg:px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
          <ShoppingBag className="h-4 w-4" />
        </div>
        <div className="hidden min-w-0 lg:block">
          <span className="block text-[13px] font-semibold tracking-[-0.01em] text-white">
            Ozon AI
          </span>
          <span className="block text-2xs leading-tight text-zinc-400">Yönetim paneli</span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 p-2 lg:p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname === item.alias;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.name}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex items-center justify-center rounded-lg py-2 text-[13px] transition-colors lg:justify-between lg:gap-3 lg:pl-3 lg:pr-2.5 ${
                isActive
                  ? 'bg-white/[0.08] font-medium text-white shadow-xs'
                  : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
              }`}
            >
              {/* Etkin sayfanın tek işareti: sol kenardaki 2px marka çubuğu. */}
              {isActive && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-accent" />
              )}

              <span className="flex min-w-0 items-center gap-2.5">
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                <span className="hidden truncate lg:inline">{item.name}</span>
              </span>

              {item.external && (
                <ArrowUpRight className="hidden h-3 w-3 shrink-0 text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100 lg:block" />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
