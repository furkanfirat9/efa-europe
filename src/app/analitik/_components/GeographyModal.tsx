'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Globe,
  MapPin,
  Package,
  Search,
  TrendingUp,
  X,
  Layers,
  Building2,
  SlidersHorizontal,
} from 'lucide-react';
import { RecentOrder } from '@/types/analytics';
import {
  aggregateOrdersByGeography,
  DistrictStat,
  FlatCityRanking,
  SubjectStat,
  CityStat,
} from '@/data/russiaGeography';
import { OrderStatus } from '@/components/OrderStatus';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';
import styles from '@/styles/console.module.css';

interface GeographyModalProps {
  open: boolean;
  onClose: () => void;
  orders: RecentOrder[];
  dateRange: { from: string; to: string };
  loading?: boolean;
}

type ViewTab = 'hierarchy' | 'top_cities';
type SortMode = 'orders' | 'revenue';

export function GeographyModal({
  open,
  onClose,
  orders = [],
  dateRange,
  loading = false,
}: GeographyModalProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>('hierarchy');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortMode, setSortMode] = useState<SortMode>('orders');
  const [expandedDistricts, setExpandedDistricts] = useState<Set<string>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());

  // ESC ile kapatma & body scroll kilidi
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // Siparişleri hiyerarşik yapıya dönüştür
  const geoData = useMemo(() => {
    return aggregateOrdersByGeography(orders);
  }, [orders]);

  // İlk açılışta en çok sipariş alan ilk 2 federal bölgeyi otomatik açık getirelim
  useEffect(() => {
    if (open && geoData.districts.length > 0 && expandedDistricts.size === 0) {
      const initial = new Set<string>();
      geoData.districts.slice(0, 2).forEach((d) => initial.add(d.districtId));
      setExpandedDistricts(initial);
    }
  }, [open, geoData.districts]);

  // Arama filtresi
  const query = searchQuery.trim().toLowerCase();

  const filteredDistricts = useMemo(() => {
    let list = geoData.districts;

    if (query) {
      list = list
        .map((d) => {
          const matchDistrict =
            d.districtNameTr.toLowerCase().includes(query) ||
            d.districtNameRu.toLowerCase().includes(query);

          const matchedSubjects = d.subjects
            .map((s) => {
              const matchSubject =
                s.subjectNameTr.toLowerCase().includes(query) ||
                s.subjectNameRu.toLowerCase().includes(query);

              const matchedCities = s.cities.filter((c) =>
                c.cityName.toLowerCase().includes(query)
              );

              if (matchSubject || matchDistrict) return s;
              if (matchedCities.length > 0) return { ...s, cities: matchedCities };
              return null;
            })
            .filter(Boolean) as SubjectStat[];

          if (matchDistrict) return d;
          if (matchedSubjects.length > 0) return { ...d, subjects: matchedSubjects };
          return null;
        })
        .filter(Boolean) as DistrictStat[];
    }

    // Sıralama
    return [...list].sort((a, b) =>
      sortMode === 'revenue'
        ? b.revenue - a.revenue || b.orderCount - a.orderCount
        : b.orderCount - a.orderCount || b.revenue - a.revenue
    );
  }, [geoData.districts, query, sortMode]);

  // Arama yapıldığında eşleşenleri otomatik genişlet
  useEffect(() => {
    if (query) {
      const allD = new Set<string>();
      const allS = new Set<string>();
      filteredDistricts.forEach((d) => {
        allD.add(d.districtId);
        d.subjects.forEach((s) => allS.add(`${d.districtId}__${s.subjectId}`));
      });
      setExpandedDistricts(allD);
      setExpandedSubjects(allS);
    }
  }, [query, filteredDistricts]);

  const filteredCities = useMemo(() => {
    let list = geoData.flatCities;
    if (query) {
      list = list.filter(
        (c) =>
          c.cityName.toLowerCase().includes(query) ||
          c.subjectNameTr.toLowerCase().includes(query) ||
          c.districtNameTr.toLowerCase().includes(query)
      );
    }
    return [...list].sort((a, b) =>
      sortMode === 'revenue'
        ? b.revenue - a.revenue || b.orderCount - a.orderCount
        : b.orderCount - a.orderCount || b.revenue - a.revenue
    );
  }, [geoData.flatCities, query, sortMode]);

  const toggleDistrict = (id: string) => {
    setExpandedDistricts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSubject = (key: string) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCity = (key: string) => {
    setExpandedCities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Sipariş Coğrafyası & Bölge Dağılımı"
      onClick={onClose}
    >
      <div
        className={`${styles.dialog} max-w-5xl`}
        onClick={(event) => event.stopPropagation()}
      >
        {/* MODAL BAŞLIĞI */}
        <header className="flex items-center justify-between gap-4 border-b border-hairline px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-panel-sunken text-brand">
              <Globe className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                Sipariş Coğrafyası &amp; Bölge Dağılımı
              </h2>
              <p className="mt-0.5 text-2xs text-ink-subtle">
                {dateRange.from} – {dateRange.to} · {formatNumber(geoData.totalOrders)} sipariş ·{' '}
                {formatMoney(geoData.totalRevenue)} toplam ciro
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-white/[0.05] hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* ÖZET KPI ŞERİDİ */}
        <div className="grid grid-cols-2 border-b border-hairline bg-panel-sunken/40 sm:grid-cols-4">
          <div className="border-r border-hairline p-3.5 px-5">
            <div className="text-2xs font-medium text-ink-subtle">Toplam Sipariş</div>
            <div className="mt-1 text-[20px] font-semibold tracking-[-0.02em] tabular-nums text-ink">
              {formatNumber(geoData.totalOrders)}
            </div>
            <div className="mt-0.5 text-2xs text-ink-faint">
              {formatNumber(geoData.locatedOrdersCount)} konumlu sipariş
            </div>
          </div>

          <div className="border-r border-hairline p-3.5 px-5 sm:border-r">
            <div className="text-2xs font-medium text-ink-subtle">Toplam Ciro</div>
            <div className="mt-1 text-[20px] font-semibold tracking-[-0.02em] tabular-nums text-gain">
              {formatMoney(geoData.totalRevenue)}
            </div>
            <div className="mt-0.5 text-2xs text-ink-faint">
              {geoData.totalOrders > 0
                ? `Ort. ${formatMoney(Math.round(geoData.totalRevenue / geoData.totalOrders))}`
                : '—'}
            </div>
          </div>

          <div className="border-r border-hairline p-3.5 px-5">
            <div className="text-2xs font-medium text-ink-subtle">Lider Federal Bölge</div>
            <div className="mt-1 truncate text-[14px] font-semibold tracking-[-0.01em] text-brand" title={geoData.topDistrict?.districtNameTr}>
              {geoData.topDistrict ? geoData.topDistrict.districtNameTr : '—'}
            </div>
            <div className="mt-0.5 text-2xs text-ink-faint">
              {geoData.topDistrict
                ? `${formatNumber(geoData.topDistrict.orderCount)} sipariş (%${geoData.topDistrict.sharePercent})`
                : '—'}
            </div>
          </div>

          <div className="p-3.5 px-5">
            <div className="text-2xs font-medium text-ink-subtle">Lider Şehir / Merkez</div>
            <div className="mt-1 truncate text-[14px] font-semibold tracking-[-0.01em] text-ink" title={geoData.topCity?.cityName}>
              {geoData.topCity ? geoData.topCity.cityName : '—'}
            </div>
            <div className="mt-0.5 text-2xs text-ink-faint">
              {geoData.topCity
                ? `${formatNumber(geoData.topCity.orderCount)} sipariş · ${formatMoney(geoData.topCity.revenue)}`
                : '—'}
            </div>
          </div>
        </div>

        {/* FİLTRE & GÖRÜNÜM KONTROLLERİ */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-3">
          {/* Sekmeler */}
          <div className="flex items-center rounded-lg border border-hairline bg-panel-sunken p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('hierarchy')}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-2xs font-medium transition-colors ${
                activeTab === 'hierarchy'
                  ? 'bg-panel-raised text-ink shadow-sm'
                  : 'text-ink-subtle hover:text-ink'
              }`}
            >
              <Layers className="h-3.5 w-3.5 text-brand" />
              Hiyerarşik Ağaç (Bölge &gt; Eyalet &gt; Şehir)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('top_cities')}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-2xs font-medium transition-colors ${
                activeTab === 'top_cities'
                  ? 'bg-panel-raised text-ink shadow-sm'
                  : 'text-ink-subtle hover:text-ink'
              }`}
            >
              <Building2 className="h-3.5 w-3.5 text-caution" />
              Şehir Sıralaması ({geoData.uniqueCitiesCount} Şehir)
            </button>
          </div>

          {/* Arama & Sıralama */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Bölge, eyalet veya şehir ara…"
                className="h-8 w-56 rounded-lg border border-hairline bg-panel-sunken pl-8 pr-3 text-2xs text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-hairline-strong"
              />
            </div>

            <div className="flex items-center rounded-lg border border-hairline bg-panel-sunken p-0.5 text-2xs">
              <button
                type="button"
                onClick={() => setSortMode('orders')}
                className={`cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors ${
                  sortMode === 'orders'
                    ? 'bg-panel-raised text-ink'
                    : 'text-ink-subtle hover:text-ink'
                }`}
                title="Sipariş Adedine Göre Sırala"
              >
                Sipariş
              </button>
              <button
                type="button"
                onClick={() => setSortMode('revenue')}
                className={`cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors ${
                  sortMode === 'revenue'
                    ? 'bg-panel-raised text-ink'
                    : 'text-ink-subtle hover:text-ink'
                }`}
                title="Ciroya Göre Sırala"
              >
                Ciro
              </button>
            </div>
          </div>
        </div>

        {/* MODAL İÇERİK ALANI */}
        <div className="scroll-thin max-h-[60vh] min-h-[360px] overflow-y-auto p-6">
          {geoData.totalOrders === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
              <Globe className="h-8 w-8 text-ink-faint" />
              <p className="text-[13px] font-medium text-ink-muted">Sipariş verisi bulunamadı</p>
              <p className="text-2xs text-ink-subtle">
                Seçili tarih aralığında kaydedilmiş herhangi bir sipariş bulunmuyor.
              </p>
            </div>
          ) : activeTab === 'hierarchy' ? (
            /* HİYERARŞİK AĞAÇ GÖRÜNÜMÜ */
            filteredDistricts.length === 0 ? (
              <div className="py-12 text-center text-2xs text-ink-subtle">
                &quot;{searchQuery}&quot; aramasına uygun bölge veya şehir bulunamadı.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDistricts.map((district) => {
                  const isDistExpanded = expandedDistricts.has(district.districtId);
                  const distShare = district.sharePercent;

                  return (
                    <div
                      key={district.districtId}
                      className="overflow-hidden rounded-xl border border-hairline bg-panel transition-colors"
                    >
                      {/* 1. SEVİYE: FEDERAL BÖLGE BAŞLIĞI */}
                      <button
                        type="button"
                        onClick={() => toggleDistrict(district.districtId)}
                        className="flex w-full cursor-pointer items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-white/[0.02]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: district.districtBadgeColor }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-ink">
                                {district.districtNameTr}
                              </span>
                              <span className="text-2xs text-ink-subtle">
                                ({district.districtNameRu})
                              </span>
                            </div>
                            <p className="mt-0.5 text-2xs text-ink-subtle">
                              {district.subjects.length} Eyalet/Federe Birim ·{' '}
                              {district.subjects.reduce((acc, s) => acc + s.cities.length, 0)} Şehir
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-4">
                          <div className="text-right">
                            <div className="text-2xs font-semibold tabular-nums text-ink">
                              {formatNumber(district.orderCount)} sipariş
                              <span className="ml-1.5 font-normal text-brand">
                                (%{distShare})
                              </span>
                            </div>
                            <div className="mt-0.5 text-2xs tabular-nums text-gain">
                              {formatMoney(district.revenue)}
                            </div>
                            {/* İnce renkli dolgu çubuğu */}
                            <div className="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-white/[0.05]">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max(4, distShare)}%`,
                                  backgroundColor: district.districtBadgeColor,
                                }}
                              />
                            </div>
                          </div>

                          <div className="text-ink-subtle">
                            {isDistExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </div>
                        </div>
                      </button>

                      {/* 2. SEVİYE: EYALETLER / FEDERE BİRİMLER LİSTESİ */}
                      {isDistExpanded && (
                        <div className="border-t border-hairline bg-panel-sunken/60 px-4 py-3">
                          <div className="space-y-2.5">
                            {district.subjects.map((subject) => {
                              const sKey = `${district.districtId}__${subject.subjectId}`;
                              const isSubExpanded = expandedSubjects.has(sKey);
                              const subShare =
                                district.orderCount > 0
                                  ? Number(
                                      ((subject.orderCount / district.orderCount) * 100).toFixed(1)
                                    )
                                  : 0;

                              return (
                                <div
                                  key={subject.subjectId}
                                  className="overflow-hidden rounded-lg border border-hairline/80 bg-panel/80"
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleSubject(sKey)}
                                    className="flex w-full cursor-pointer items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-white/[0.02]"
                                  >
                                    <div className="flex min-w-0 items-center gap-2.5">
                                      <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="truncate text-2xs font-medium text-ink">
                                            {subject.subjectNameTr}
                                          </span>
                                          <span className="truncate text-2xs text-ink-faint">
                                            · {subject.subjectNameRu}
                                          </span>
                                        </div>
                                        <p className="mt-0.5 text-2xs text-ink-subtle">
                                          {subject.cities.length} Şehir / İlçe
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-3">
                                      <div className="text-right">
                                        <div className="text-2xs font-medium tabular-nums text-ink">
                                          {formatNumber(subject.orderCount)} sipariş
                                          <span className="ml-1 text-ink-subtle">
                                            (bölgenin %{subShare}&apos;si)
                                          </span>
                                        </div>
                                        <div className="text-2xs tabular-nums text-gain">
                                          {formatMoney(subject.revenue)}
                                        </div>
                                      </div>

                                      <div className="text-ink-subtle">
                                        {isSubExpanded ? (
                                          <ChevronDown className="h-3.5 w-3.5" />
                                        ) : (
                                          <ChevronRight className="h-3.5 w-3.5" />
                                        )}
                                      </div>
                                    </div>
                                  </button>

                                  {/* 3. SEVİYE: ŞEHİRLER & SİPARİŞ LİSTESİ */}
                                  {isSubExpanded && (
                                    <div className="border-t border-hairline/60 bg-panel-raised/40 p-3">
                                      <div className="space-y-2">
                                        {subject.cities.map((city) => {
                                          const cKey = `${sKey}__${city.cityName}`;
                                          const isCityExpanded = expandedCities.has(cKey);

                                          return (
                                            <div
                                              key={city.cityName}
                                              className="rounded-md border border-hairline/60 bg-panel-sunken/70"
                                            >
                                              <button
                                                type="button"
                                                onClick={() => toggleCity(cKey)}
                                                className="flex w-full cursor-pointer items-center justify-between gap-3 p-2.5 text-left transition-colors hover:bg-white/[0.03]"
                                              >
                                                <div className="flex min-w-0 items-center gap-2">
                                                  <Building2 className="h-3 w-3 shrink-0 text-ink-faint" />
                                                  <span className="truncate text-2xs font-semibold text-ink">
                                                    {city.cityName}
                                                  </span>
                                                </div>

                                                <div className="flex shrink-0 items-center gap-3">
                                                  <div className="text-right">
                                                    <span className="text-2xs font-medium tabular-nums text-ink">
                                                      {formatNumber(city.orderCount)} sipariş
                                                    </span>
                                                    <span className="mx-1.5 text-ink-faint">·</span>
                                                    <span className="text-2xs tabular-nums text-gain">
                                                      {formatMoney(city.revenue)}
                                                    </span>
                                                  </div>

                                                  <div className="text-ink-subtle">
                                                    {isCityExpanded ? (
                                                      <ChevronDown className="h-3 w-3" />
                                                    ) : (
                                                      <ChevronRight className="h-3 w-3" />
                                                    )}
                                                  </div>
                                                </div>
                                              </button>

                                              {/* 4. SEVİYE: ŞEHRE AİT SİPARİŞLER */}
                                              {isCityExpanded && (
                                                <ul className="divide-y divide-hairline border-t border-hairline/60 bg-black/20">
                                                  {city.orders.map((order, idx) => {
                                                    const product = order.products?.[0];
                                                    const extra = Math.max(
                                                      0,
                                                      (order.products?.length || 0) - 1
                                                    );

                                                    return (
                                                      <li
                                                        key={order.postingNumber || idx}
                                                        className="flex items-center justify-between gap-3 p-2.5 px-3 transition-colors hover:bg-white/[0.02]"
                                                      >
                                                        <div className="flex min-w-0 items-center gap-2.5">
                                                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-hairline bg-panel-sunken">
                                                            {product?.primaryImage ? (
                                                              <img
                                                                src={product.primaryImage}
                                                                alt=""
                                                                className="h-full w-full object-contain p-0.5"
                                                                loading="lazy"
                                                              />
                                                            ) : (
                                                              <Package className="h-3.5 w-3.5 text-ink-faint" />
                                                            )}
                                                          </div>

                                                          <div className="min-w-0">
                                                            <p
                                                              className="truncate text-2xs font-medium text-ink"
                                                              title={product?.name}
                                                            >
                                                              {product?.name || 'Ozon Ürünü'}
                                                              {extra > 0 && (
                                                                <span className="ml-1 text-ink-subtle">
                                                                  +{extra}
                                                                </span>
                                                              )}
                                                            </p>
                                                            <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-subtle">
                                                              <span>
                                                                {product?.offerId ||
                                                                  order.postingNumber}
                                                              </span>
                                                              <span>·</span>
                                                              <span>
                                                                {order.inProcessAt
                                                                  ? order.inProcessAt.slice(0, 10)
                                                                  : ''}
                                                              </span>
                                                            </p>
                                                          </div>
                                                        </div>

                                                        <div className="flex shrink-0 items-center gap-3">
                                                          <OrderStatus
                                                            status={order.status}
                                                            statusName={order.statusName}
                                                          />
                                                          <span className="text-2xs font-semibold tabular-nums text-gain">
                                                            {formatMoney(order.totalPrice)}
                                                          </span>
                                                        </div>
                                                      </li>
                                                    );
                                                  })}
                                                </ul>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* TÜM ŞEHİRLER SIRALAMASI (TOP CITIES) */
            <div>
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-hairline text-left text-2xs font-medium text-ink-subtle">
                    <th className="w-12 py-2.5 pl-3">#</th>
                    <th className="w-[30%] py-2.5">Şehir</th>
                    <th className="w-[25%] py-2.5">Eyalet / Federe Birim</th>
                    <th className="w-[20%] py-2.5">Federal Bölge</th>
                    <th className="w-[15%] py-2.5 text-right pr-3">Sipariş &amp; Ciro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filteredCities.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-2xs text-ink-subtle">
                        Eşleşen şehir bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredCities.map((city, index) => {
                      const cKey = `flat__${city.cityName}__${index}`;
                      const isExpanded = expandedCities.has(cKey);

                      return (
                        <React.Fragment key={cKey}>
                          <tr
                            onClick={() => toggleCity(cKey)}
                            className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                          >
                            <td className="py-3 pl-3 text-2xs tabular-nums text-ink-faint">
                              {index + 1}
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                                <span className="font-semibold text-2xs text-ink">
                                  {city.cityName}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 text-2xs text-ink-muted truncate">
                              {city.subjectNameTr}
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: city.districtBadgeColor }}
                                />
                                <span className="truncate text-2xs text-ink-subtle">
                                  {city.districtNameTr}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 pr-3 text-right">
                              <div className="text-2xs font-semibold tabular-nums text-ink">
                                {formatNumber(city.orderCount)} sipariş
                                <span className="ml-1 text-ink-subtle font-normal">
                                  (%{city.sharePercent})
                                </span>
                              </div>
                              <div className="mt-0.5 text-2xs tabular-nums text-gain">
                                {formatMoney(city.revenue)}
                              </div>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={5} className="bg-panel-sunken/90 p-3 pl-8">
                                <div className="space-y-1.5">
                                  <div className="text-2xs font-medium text-ink-subtle">
                                    {city.cityName} İçin Siparişler ({city.orders.length}):
                                  </div>
                                  <ul className="divide-y divide-hairline rounded border border-hairline bg-panel">
                                    {city.orders.map((o, oIdx) => {
                                      const prod = o.products?.[0];
                                      return (
                                        <li
                                          key={o.postingNumber || oIdx}
                                          className="flex items-center justify-between gap-3 p-2 text-2xs"
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <Package className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                                            <span className="truncate text-ink" title={prod?.name}>
                                              {prod?.name || o.postingNumber}
                                            </span>
                                            <span className="text-ink-faint">
                                              ({prod?.offerId || 'SKU'})
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-3 shrink-0">
                                            <OrderStatus status={o.status} statusName={o.statusName} />
                                            <span className="font-semibold tabular-nums text-gain">
                                              {formatMoney(o.totalPrice)}
                                            </span>
                                          </div>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* MODAL ALT BİLGİLENDİRME */}
        <footer className="flex items-center justify-between border-t border-hairline bg-panel px-6 py-3 text-2xs text-ink-subtle">
          <div className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
            <span>Rusya Federasyonu resmi 8 Federal Bölgesi ve bağlı 85+ Federe Birimi baz alınmıştır.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-hairline px-3 py-1 text-2xs font-medium text-ink transition-colors hover:bg-white/[0.05]"
          >
            Kapat
          </button>
        </footer>
      </div>
    </div>
  );
}
