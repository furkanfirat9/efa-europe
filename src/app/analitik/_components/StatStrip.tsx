'use client';

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { AnalyticsSummary } from '@/types/analytics';
import { formatDecimal, formatMoney, formatNumber, formatPercent, rate } from '@/lib/format';
import styles from '@/styles/console.module.css';

interface StatStripProps {
  summary: AnalyticsSummary | null;
  loading: boolean;
  /** Kategori sırası hücresi ürün tablosunu açar. */
  onOpenRanking: () => void;
}

interface Stat {
  label: string;
  value: string;
  hint: string;
  /** Yalnızca parasal sonuç vurgulanır; geri kalan her şey nötr kalır. */
  emphasis?: boolean;
  onClick?: () => void;
}

/**
 * Metrikler ayrı ayrı kartlar değil: tek bir çerçeve içinde hairline ile
 * ayrılmış hücreler. Gözün soldan sağa tek bir satır olarak okuması,
 * kartların birbirinden bağımsız yüzmesinden daha hızlı.
 */
export function StatStrip({ summary, loading, onOpenRanking }: StatStripProps) {
  const revenue = summary?.revenue ?? 0;
  const orders = summary?.orderedUnits ?? 0;
  const toCart = summary?.hitsToCart ?? 0;
  const pdp = summary?.hitsViewPdp ?? 0;
  const views = summary?.hitsViewTotal ?? 0;
  const sessions = summary?.sessionView ?? 0;

  const aov = orders > 0 ? revenue / orders : 0;
  const cartToOrder = rate(orders, toCart);
  const viewsPerSession = sessions > 0 ? views / sessions : 0;
  const position = summary?.avgPositionCategory ?? 0;

  const stats: Stat[] = [
    {
      label: 'Ciro',
      value: formatMoney(revenue),
      hint: orders > 0 ? `Ortalama sipariş ${formatMoney(aov)}` : 'Henüz satış yok',
      emphasis: true,
    },
    {
      label: 'Sipariş',
      value: formatNumber(orders),
      hint: cartToOrder === null ? 'Sepet verisi yok' : `Sepetten ${formatPercent(cartToOrder)} dönüşüm`,
    },
    {
      label: 'Sepete ekleme',
      value: formatNumber(toCart),
      hint: `Genel dönüşüm ${formatPercent(summary?.convToCart)}`,
    },
    {
      label: 'Ürün ziyareti',
      value: formatNumber(pdp),
      hint: `Sayfadan sepete ${formatPercent(summary?.convToCartPdp)}`,
    },
    {
      label: 'Gösterim',
      value: formatNumber(views),
      hint: `Aramadan tıklama ${formatPercent(summary?.ctrPdp)}`,
    },
    {
      label: 'Tekil oturum',
      value: formatNumber(sessions),
      hint:
        viewsPerSession > 0
          ? `Oturum başına ${formatDecimal(viewsPerSession)} gösterim`
          : 'Ziyaretçi oluşmadı',
    },
    {
      label: 'Kategori sırası',
      value: position > 0 ? `#${formatNumber(position)}` : '—',
      hint: position > 0 ? 'Ürün bazında gör' : 'Sıra bilgisi yok',
      onClick: position > 0 ? onOpenRanking : undefined,
    },
  ];

  return (
    <div className={styles.hairlineRow}>
      {stats.map((stat) => {
        const clickable = Boolean(stat.onClick);

        const body = (
          <>
            <div className="text-2xs font-medium text-ink-muted">{stat.label}</div>

            {loading ? (
              <>
                <div className="skeleton mt-2.5 h-6 w-24" />
                <div className="skeleton mt-2.5 h-3 w-32" />
              </>
            ) : (
              <>
                <div
                  className={`mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${
                    stat.emphasis ? 'text-gain' : 'text-ink'
                  }`}
                >
                  {stat.value}
                </div>
                <div
                  className={`mt-2 flex items-center gap-1 truncate text-2xs ${
                    clickable ? 'text-ink-muted' : 'text-ink-subtle'
                  }`}
                >
                  <span className="truncate">{stat.hint}</span>
                  {clickable && (
                    <ArrowUpRight className="h-3 w-3 shrink-0 text-ink-faint transition-colors group-hover:text-ink-muted" />
                  )}
                </div>
              </>
            )}
          </>
        );

        if (!clickable) {
          return (
            <div key={stat.label} className={styles.hairlineCell}>
              {body}
            </div>
          );
        }

        return (
          <button
            key={stat.label}
            type="button"
            onClick={stat.onClick}
            className={`${styles.hairlineCell} group cursor-pointer text-left`}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
