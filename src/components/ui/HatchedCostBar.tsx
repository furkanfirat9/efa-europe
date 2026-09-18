'use client';

import React, { useState } from 'react';

export interface CostSegment {
  key: string;
  label: string;
  amount: number;
  percentage: number;
  color: string;
  patternId: string;
}

interface HatchedCostBarProps {
  sellPrice: number;
  currencySymbol: string;
  segments: CostSegment[];
}

export const HatchedCostBar: React.FC<HatchedCostBarProps> = ({
  sellPrice,
  currencySymbol,
  segments,
}) => {
  const [hoveredSegment, setHoveredSegment] = useState<CostSegment | null>(null);

  const activeSegments = segments.filter((s) => s.percentage > 0);

  return (
    <div className="relative space-y-3">
      {/* Popover / Snapshot Floating Indicator (Section 5.3) */}
      {hoveredSegment && (
        <div
          className="absolute -top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-[20px] bg-white px-3.5 py-1.5 shadow-float text-[12px] font-medium text-text-primary border border-border-subtle animate-in fade-in zoom-in-95 duration-150"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: hoveredSegment.color }}
          />
          <span className="text-text-secondary">{hoveredSegment.label}:</span>
          <span className="font-semibold tabular-nums text-text-primary">
            {currencySymbol}
            {hoveredSegment.amount.toFixed(2)} (%{hoveredSegment.percentage.toFixed(1)})
          </span>
        </div>
      )}

      {/* SVG Hatched Stripe Bar */}
      <div className="relative h-6 w-full overflow-hidden rounded-full bg-surface-muted p-0.5 border border-border-subtle">
        <svg className="h-full w-full rounded-full" preserveAspectRatio="none">
          <defs>
            {activeSegments.map((s) => (
              <pattern
                key={s.patternId}
                id={s.patternId}
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                {/* Arka plan hafif renk */}
                <rect width="8" height="8" fill={s.color} fillOpacity="0.18" />
                {/* 45 derece ince çizgiler */}
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke={s.color}
                  strokeWidth="2.5"
                />
              </pattern>
            ))}
          </defs>

          {/* Segment Çubukları */}
          {(() => {
            let currentX = 0;
            return activeSegments.map((s) => {
              const widthPct = Math.max(0, Math.min(100, s.percentage));
              const xPos = currentX;
              currentX += widthPct;

              return (
                <rect
                  key={s.key}
                  x={`${xPos}%`}
                  y="0"
                  width={`${widthPct}%`}
                  height="100%"
                  fill={`url(#${s.patternId})`}
                  stroke={s.color}
                  strokeWidth="0.5"
                  className="cursor-pointer transition-opacity hover:opacity-85"
                  onMouseEnter={() => setHoveredSegment(s)}
                  onMouseLeave={() => setHoveredSegment(null)}
                />
              );
            });
          })()}
        </svg>
      </div>

      {/* Lejant (Pill Dot Legend) */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            onMouseEnter={() => setHoveredSegment(s)}
            onMouseLeave={() => setHoveredSegment(null)}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-text-secondary hover:bg-surface-muted transition-colors cursor-pointer"
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-[12px]">{s.label}</span>
            <span className="font-semibold tabular-nums text-text-primary text-[11px]">
              %{s.percentage.toFixed(0)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
