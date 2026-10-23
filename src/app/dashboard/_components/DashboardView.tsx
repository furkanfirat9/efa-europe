'use client';

import React from 'react';
import { formatClock } from '@/lib/format';
import { ActionsList } from './ActionsList';
import { SalesChart } from './SalesChart';
import { Snapshot } from './Snapshot';
import { TopSellersTable } from './TopSellersTable';
import type { MarketData, PayoutData, PulseData } from './shared';
import { useDashboardData } from './useDashboardData';
import { useProfitData } from './useProfitData';

/**
 * Amazon satıcı paneli düzeni: kart yok, tek yüzey ve ince çizgiler.
 *
 *   Genel durum        altı ana rakam tek şeritte; tıklanan rakamın ayrıntısı altında açılır
 *   Yapılacaklar       solda düz liste
 *   Satışlar           sağda tek grafik (Sipariş / Ciro / Kâr, 7 / 30 gün) + en çok satanlar tablosu
 *
 * Şerit ve grafik aynı okumaları paylaşır; her uç bir kez çağrılır.
 * "Pazar ve tedarik" şeridi 2026-10-23'te kaldırıldı: satış hunisi Avrupa'nın günlük 50 isteklik
 * Ozon analitik kotasını bitiriyordu (huni /analitik'te), tarama durumu Fiyat önerisi sayfasında.
 */
export function DashboardView() {
  const pulse = useDashboardData<PulseData>('/api/dashboard/siparisler');
  const profit = useProfitData();
  // Fiyat endeksi 3 saatte bir, tarama günde bir kaydediliyor; bakiye gün içinde değişmiyor
  const market = useDashboardData<MarketData>('/api/dashboard/pazar', { intervalMs: 15 * 60 * 1000 });
  const payout = useDashboardData<PayoutData>('/api/dashboard/odeme', { intervalMs: 30 * 60 * 1000 });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Genel durum</h2>
          {pulse.data && <span className="text-xs text-muted-foreground">{formatClock(pulse.data.asOf)} itibarıyla · Europe</span>}
        </div>
        <Snapshot pulse={pulse} profit={profit} market={market} payout={payout} />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <ActionsList />
        <div className="min-w-0 space-y-8">
          <SalesChart pulse={pulse.data} profit={profit.data} />
          <TopSellersTable />
        </div>
      </div>
    </div>
  );
}
