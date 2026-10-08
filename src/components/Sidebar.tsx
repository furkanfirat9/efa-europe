'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  FileStack,
  LogOut,
  ScanSearch,
  SearchCheck,
  FilePlus2,
  MonitorSmartphone,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/shadcn/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu';

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
  { name: 'Belgeler', href: '/belgeler', icon: FileStack },
  { name: 'Fatura oluştur', href: '/fatura', icon: FilePlus2 },
  { name: 'Kâr hesaplama', href: '/kar-hesaplama', icon: Calculator },
  { name: 'Siparişler', href: '/siparisler', icon: Package },
  { name: 'Fulfillment', href: '/fulfillment', icon: Truck },
  { name: 'Fiyat endeksi', href: '/fiyat-endeksi', icon: LineChart },
  { name: 'Fiyat önerisi', href: '/fiyat-onerisi', icon: TrendingUp },
];

const PRODUCT_UPLOAD_SUBITEMS: NavItem[] = [
  { name: 'Tekli ürün yükle', href: '/urun-yukle', icon: PackagePlus },
  { name: 'Toplu yükleme', href: '/toplu-yukle', icon: Layers },
  { name: 'Amazon avcısı', href: '/amazon-aktar', icon: Sparkles },
  { name: 'Kategori ağacı', href: '/kategori-agaci', icon: FolderTree },
  { name: 'ASIN kontrol', href: '/asin-kontrol', icon: ScanSearch },
  { name: 'Ceneo kontrol', href: '/ceneo-kontrol', icon: SearchCheck },
];

const SECONDARY_NAV: NavItem[] = [
  { name: 'Canlı analitik', href: '/analitik', icon: TrendingUp, external: true },
];

const COLLAPSED_KEY = 'sidebar-collapsed';

/** Menü etiketleri: kapanırken hemen solar, açılırken genişlik biraz yol alınca belirir. */
const LABEL =
  'whitespace-nowrap opacity-0 transition-opacity duration-150 sb-wide:opacity-100 sb-wide:delay-100 sb-wide:duration-200';

export default function Sidebar() {
  const pathname = usePathname();

  const isProductUploadActive = PRODUCT_UPLOAD_SUBITEMS.some(
    (sub) => pathname === sub.href || (sub.alias && pathname === sub.alias)
  );

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [collapsed, setCollapsed] = useState(false);
  // İlk açılışta kayıtlı durum uygulanırken animasyon oynamasın; yalnızca kullanıcı tıklayınca kaysın.
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {}
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, prev ? '0' : '1');
      } catch {}
      return !prev;
    });
  };

  return (
    <aside
      data-sidebar={collapsed ? 'collapsed' : 'expanded'}
      data-sidebar-static={animate ? undefined : ''}
      className="sticky top-0 flex h-screen w-14 shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-hairline bg-canvas transition-[width] duration-300 ease-in-out sb-wide:w-60"
    >
      {/* İkonlar iki durumda da aynı yerde durur (dar menüde ortada); yalnızca genişlik kayar,
          etiketler solar. Taşan etiketleri aside'ın overflow-x-hidden'ı kırpar. */}
      <div className="flex h-16 items-center gap-2.5 border-b border-hairline px-3 transition-[padding] duration-300 ease-in-out sb-wide:pl-5">
        {/* Kapalıyken logonun üzerine gelince açma ikonu belirir; tıklayınca menü genişler. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          tabIndex={collapsed ? 0 : -1}
          title={collapsed ? 'Menüyü aç' : undefined}
          aria-label="Menüyü aç"
          className="group/logo relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-iris text-white pointer-events-none sb-narrow:pointer-events-auto"
        >
          <ShoppingBag className="h-4 w-4 transition-opacity sb-narrow:group-hover/logo:opacity-0" />
          <PanelLeftOpen className="absolute h-4 w-4 opacity-0 transition-opacity sb-narrow:group-hover/logo:opacity-100" />
        </button>
        <div className={`min-w-0 flex-1 ${LABEL}`}>
          <span className="block text-[13px] font-semibold tracking-[-0.01em] text-white">
            EFA Europe
          </span>
          <span className="block text-2xs leading-tight text-zinc-400">Yönetim paneli</span>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Menüyü kapat"
          aria-label="Menüyü kapat"
          tabIndex={collapsed ? -1 : 0}
          className="invisible flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 opacity-0 transition-[color,background-color,opacity,visibility] duration-200 hover:bg-white/8 hover:text-zinc-200 sb-wide:visible sb-wide:opacity-100"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 p-2 transition-[padding] duration-300 ease-in-out sb-wide:p-3">
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
              className={`group relative flex items-center justify-between gap-3 rounded-lg py-2 pl-3 pr-2.5 text-[13px] transition-colors ${
                isActive
                  ? 'bg-white/8 font-medium text-white'
                  : 'text-zinc-400 hover:bg-white/4 hover:text-zinc-200'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-iris" />
              )}

              <span className="flex min-w-0 items-center gap-2.5">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'
                  }`}
                />
                <span className={LABEL}>{item.name}</span>
              </span>

              {item.external && (
                <ArrowUpRight className="hidden h-3 w-3 shrink-0 text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100 sb-wide:block" />
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
            className={`group relative flex w-full items-center justify-between gap-3 rounded-lg py-2 pl-3 pr-2.5 text-[13px] transition-colors ${
              isProductUploadActive
                ? 'font-medium text-white bg-white/4'
                : 'text-zinc-400 hover:bg-white/4 hover:text-zinc-200'
            }`}
          >
            {isProductUploadActive && !isOpen && (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-iris" />
            )}

            <span className="flex min-w-0 items-center gap-2.5">
              <PackagePlus
                className={`h-4 w-4 shrink-0 ${
                  isProductUploadActive ? 'text-iris' : 'text-zinc-500 group-hover:text-zinc-300'
                }`}
              />
              <span className={LABEL}>Ürün Yükleme</span>
            </span>

            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-zinc-500 opacity-0 transition-[transform,opacity] duration-200 sb-wide:opacity-100 ${
                isOpen ? 'rotate-180 text-zinc-300' : ''
              }`}
            />
          </button>

          {/* Alt Başlıklar */}
          {isOpen && (
            <div className="mt-0.5 space-y-0.5 transition-[padding] duration-300 ease-in-out sb-wide:pl-3">
              {PRODUCT_UPLOAD_SUBITEMS.map((sub) => {
                const SubIcon = sub.icon;
                const isSubActive = pathname === sub.href || (sub.alias && pathname === sub.alias);

                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    title={sub.name}
                    aria-current={isSubActive ? 'page' : undefined}
                    className={`group relative flex items-center gap-2.5 rounded-lg py-1.5 pl-3 pr-2.5 text-[12px] transition-colors ${
                      isSubActive
                        ? 'bg-white/8 font-medium text-white'
                        : 'text-zinc-400 hover:bg-white/4 hover:text-zinc-200'
                    }`}
                  >
                    {isSubActive && (
                      <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r-full bg-iris" />
                    )}

                    <SubIcon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isSubActive ? 'text-iris' : 'text-zinc-500 group-hover:text-zinc-300'
                      }`}
                    />
                    <span className={LABEL}>{sub.name}</span>
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
              className={`group relative flex items-center justify-between gap-3 rounded-lg py-2 pl-3 pr-2.5 text-[13px] transition-colors ${
                isActive
                  ? 'bg-white/8 font-medium text-white'
                  : 'text-zinc-400 hover:bg-white/4 hover:text-zinc-200'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-iris" />
              )}

              <span className="flex min-w-0 items-center gap-2.5">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'
                  }`}
                />
                <span className={LABEL}>{item.name}</span>
              </span>

              {item.external && (
                <ArrowUpRight className="hidden h-3 w-3 shrink-0 text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100 sb-wide:block" />
              )}
            </Link>
          );
        })}
      </nav>

      <SidebarAccount />
    </aside>
  );
}

/** Oturumdaki kullanıcı ve çıkış butonu. */
function SidebarAccount() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.success) setUsername(data.username);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const [confirmAll, setConfirmAll] = useState(false);

  /** all: true → bütün cihazlardaki oturumlar ve tanıdık tarayıcılar kapanır. */
  const logout = async (all = false) => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all }),
      });
      router.replace('/login');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center border-t border-hairline px-3 py-2 transition-[padding] duration-300 ease-in-out sb-wide:py-2.5">
      {/* flex-1 + min-w-0: dar menüde genişliği sıfıra iner, çıkış butonu ortada kalır. */}
      <span className={`flex min-w-0 flex-1 flex-col ${LABEL}`}>
        <span className="truncate pr-2 text-[13px] text-zinc-300">{username ?? '—'}</span>
        <span className="pr-2 text-2xs leading-tight text-zinc-500">Oturum açık</span>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            title="Çıkış yap"
            aria-label="Çıkış seçenekleri"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-52">
          <DropdownMenuItem onSelect={() => logout()}>
            <LogOut />
            Çıkış yap
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmAll(true)}>
            <MonitorSmartphone />
            Tüm cihazlardan çık
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tüm cihazlardan çıkılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu cihaz dahil açık olan bütün oturumların kapanacak. Tanıdık tarayıcılar da unutulur; her cihazda
              yeniden giriş yapman gerekir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => logout(true)}>
              Tüm cihazlardan çık
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
