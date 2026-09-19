'use client';

import React, { useState } from 'react';
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
  ChevronDown,
  LayoutDashboard,
  Receipt,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  external?: boolean;
  alias?: string;
}

const PRIMARY_NAV: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Muhasebe', href: '/muhasebe', icon: Receipt },
  { name: 'Kâr hesaplama', href: '/kar-hesaplama', icon: Calculator },
  { name: 'Siparişler', href: '/siparisler', icon: Package },
  { name: 'Fulfillment', href: '/fulfillment', icon: Truck },
  { name: 'Fiyat endeksi', href: '/fiyat-endeksi', icon: LineChart },
];

const PRODUCT_UPLOAD_SUBITEMS: NavItem[] = [
  { name: 'Tekli ürün yükle', href: '/urun-yukle', icon: PackagePlus },
  { name: 'Toplu yükleme', href: '/toplu-yukle', icon: Layers },
  { name: 'Amazon avcısı', href: '/amazon-aktar', icon: Sparkles },
  { name: 'Kategori ağacı', href: '/kategori-agaci', icon: FolderTree },
];

const SECONDARY_NAV: NavItem[] = [
  { name: 'Canlı analitik', href: '/analitik', icon: TrendingUp, external: true },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isProductUploadActive = PRODUCT_UPLOAD_SUBITEMS.some(
    (sub) => pathname === sub.href || (sub.alias && pathname === sub.alias)
  );

  const [isOpen, setIsOpen] = useState<boolean>(false);

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
        {/* Üst Menü Elemanları */}
        {PRIMARY_NAV.map((item) => {
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
                  ? 'bg-white/8 font-medium text-white'
                  : 'text-zinc-400 hover:bg-white/4 hover:text-zinc-200'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-accent" />
              )}

              <span className="flex min-w-0 items-center gap-2.5">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'
                  }`}
                />
                <span className="hidden truncate lg:inline">{item.name}</span>
              </span>

              {item.external && (
                <ArrowUpRight className="hidden h-3 w-3 shrink-0 text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100 lg:block" />
              )}
            </Link>
          );
        })}

        {/* Ürün Yükleme Grubu (Tekil, Toplu, Kategori Ağacı) */}
        <div className="pt-0.5">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            title="Ürün Yükleme"
            className={`group relative flex w-full items-center justify-center rounded-lg py-2 text-[13px] transition-colors lg:justify-between lg:gap-3 lg:pl-3 lg:pr-2.5 ${
              isProductUploadActive
                ? 'font-medium text-white bg-white/4'
                : 'text-zinc-400 hover:bg-white/4 hover:text-zinc-200'
            }`}
          >
            {isProductUploadActive && !isOpen && (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-accent" />
            )}

            <span className="flex min-w-0 items-center gap-2.5">
              <PackagePlus
                className={`h-4 w-4 shrink-0 ${
                  isProductUploadActive ? 'text-accent' : 'text-zinc-500 group-hover:text-zinc-300'
                }`}
              />
              <span className="hidden truncate lg:inline">Ürün Yükleme</span>
            </span>

            <ChevronDown
              className={`hidden h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200 lg:block ${
                isOpen ? 'rotate-180 text-zinc-300' : ''
              }`}
            />
          </button>

          {/* Alt Başlıklar */}
          {isOpen && (
            <div className="mt-0.5 space-y-0.5 lg:pl-3">
              {PRODUCT_UPLOAD_SUBITEMS.map((sub) => {
                const SubIcon = sub.icon;
                const isSubActive = pathname === sub.href || (sub.alias && pathname === sub.alias);

                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    title={sub.name}
                    aria-current={isSubActive ? 'page' : undefined}
                    className={`group relative flex items-center justify-center rounded-lg py-1.5 text-[12px] transition-colors lg:justify-start lg:gap-2.5 lg:pl-3 lg:pr-2.5 ${
                      isSubActive
                        ? 'bg-white/8 font-medium text-white'
                        : 'text-zinc-400 hover:bg-white/4 hover:text-zinc-200'
                    }`}
                  >
                    {isSubActive && (
                      <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent" />
                    )}

                    <SubIcon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isSubActive ? 'text-accent' : 'text-zinc-500 group-hover:text-zinc-300'
                      }`}
                    />
                    <span className="hidden truncate lg:inline">{sub.name}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Alt Menü Elemanları (Kâr Hesaplama vb.) */}
        {SECONDARY_NAV.map((item) => {
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
                  ? 'bg-white/8 font-medium text-white'
                  : 'text-zinc-400 hover:bg-white/4 hover:text-zinc-200'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-accent" />
              )}

              <span className="flex min-w-0 items-center gap-2.5">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'
                  }`}
                />
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
