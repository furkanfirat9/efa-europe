'use client';

import React, { useMemo, useState } from 'react';
import { DayMetric, HourlyOrderMetric } from '@/types/analytics';
import { Panel, SegmentedControl } from '@/components/ui/Panel';
import { AreaChart } from './AreaChart';
import {
  formatCompact,
  formatDayLabel,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
} from '@/lib/format';

type MetricKey = 'revenue' | 'orders' | 'pdp' | 'views';

interface TrendPanelProps {
  days: DayMetric[];
  hourlyOrders: HourlyOrderMetric[];
  loading: boolean;
}

interface MetricConfig {
  label: string;
  color: string;
  format: (value: number) => string;
  formatAxis: (value: number) => string;
}

const METRICS: Record<MetricKey, MetricConfig> = {
  revenue: {
    label: 'Ciro',
    color: '#35C07E',
    format: formatMoney,
    formatAxis: formatMoneyCompact,
  },
  orders: {
    label: 'Sipariş',
    color: '#35C07E',
    format: formatNumber,
    formatAxis: formatCompact,
  },
  pdp: {
    label: 'Ürün ziyareti',
    color: '#4C8DFF',
    format: formatNumber,
    formatAxis: formatCompact,
  },
  views: {
    label: 'Gösterim',
    color: '#4C8DFF',
    format: formatNumber,
    formatAxis: formatCompact,
  },
};

interface Row {
  label: string;
  revenue: number;
  orders: number;
  pdp: number;
  views: number;
}

/**
 * Dört metriği aynı eksene bindirmek yerine sekmeyle değiştirir; ölçekleri
 * birbirinden çok uzak olduğu için (gösterim on binler, sipariş onlar)
 * üst üste çizim okunmaz hale gelir.
 */
export function TrendPanel({ days, hourlyOrders, loading }: TrendPanelProps) {
  /** null: kullanıcı henüz sekme seçmedi, veriye göre otomatik karar verilir. */
  const [chosenMetric, setChosenMetric] = useState<MetricKey | null>(null);

  const sortedDays = useMemo(
    () => [...(days || [])].sort((a, b) => a.date.localeCompare(b.date)),
    [days]
  );

  /** Tek günlük aralıkta günlük kırılım anlamsız; saatlik sipariş akışı gösterilir. */
  const isHourly = sortedDays.length <= 1;

  const rows: Row[] = useMemo(() => {
    if (isHourly) {
      return (hourlyOrders || []).map((hour) => ({
        label: hour.hour,
        revenue: Math.round(hour.revenue || 0),
        orders: hour.orders || 0,
        pdp: 0,
        views: 0,
      }));
    }

    return sortedDays.map((day) => ({
      label: formatDayLabel(day.date),
      revenue: Math.round(day.revenue || 0),
      orders: day.orderedUnits || 0,
      pdp: day.hitsViewPdp || 0,
      views: day.hitsViewTotal || 0,
    }));
  }, [isHourly, hourlyOrders, sortedDays]);

  /** Saatlik akışta trafik metriklerinin karşılığı yok; sekme de gösterilmez. */
  const available: MetricKey[] = useMemo(
    () => (isHourly ? ['revenue', 'orders'] : ['revenue', 'orders', 'pdp', 'views']),
    [isHourly]
  );

  /**
   * Satış olmayan bir aralıkta grafiği boş "Ciro" sekmesinde açmak, elde
   * veri varken sayfayı ölü gösteriyor; ilk dolu metriğe düşülür.
   */
  const fallbackMetric = useMemo(
    () => available.find((key) => rows.some((row) => row[key] > 0)) ?? 'revenue',
    [available, rows]
  );

  const metricKey =
    chosenMetric && available.includes(chosenMetric) ? chosenMetric : fallbackMetric;
  const metric = METRICS[metricKey];

  const points = useMemo(
    () => rows.map((row) => ({ label: row.label, value: row[metricKey] })),
    [rows, metricKey]
  );

  const total = useMemo(() => points.reduce((sum, p) => sum + p.value, 0), [points]);
  const hasSignal = points.some((point) => point.value > 0);

  return (
    <Panel
      title={isHourly ? 'Gün içi akış' : 'Performans trendi'}
      caption={
        loading
          ? 'Yükleniyor…'
          : hasSignal
            ? `${metric.label} · toplam ${metric.format(total)}`
            : 'Seçili aralık'
      }
      className="h-full"
      bodyClassName="flex flex-col"
      actions={
        <SegmentedControl
          options={available.map((key) => ({ value: key, label: METRICS[key].label }))}
          value={metricKey}
          onChange={setChosenMetric}
        />
      }
    >
      {loading ? (
        <div className="skeleton min-h-[248px] w-full flex-1 rounded-lg" />
      ) : !hasSignal ? (
        <div className="flex min-h-[248px] flex-1 flex-col items-center justify-center gap-1.5 text-center">
          <p className="text-[13px] text-ink-muted">
            {isHourly ? 'Bu gün için henüz sipariş yok' : 'Bu aralıkta veri oluşmadı'}
          </p>
          <p className="text-2xs text-ink-subtle">
            {isHourly
              ? 'Saatlik akış, ilk sipariş geldiğinde dolmaya başlar.'
              : 'Daha geniş bir tarih aralığı seçmeyi deneyin.'}
          </p>
        </div>
      ) : (
        <AreaChart
          points={points}
          color={metric.color}
          formatAxis={metric.formatAxis}
          formatValue={metric.format}
          renderMeta={(index) =>
            metricKey !== 'orders' && rows[index]?.orders > 0 ? (
              <div className="mt-1 text-2xs tabular-nums text-ink-subtle">
                {formatNumber(rows[index].orders)} sipariş
              </div>
            ) : null
          }
        />
      )}
    </Panel>
  );
}
