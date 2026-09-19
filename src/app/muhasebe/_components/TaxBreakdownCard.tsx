'use client';

import React from 'react';
import { PillBadge } from '@/components/ui/PillBadge';
import { formatTL } from '@/lib/format';
import type { EuropeAccounting } from '@/hooks/useEuropeAccounting';

interface Step {
  key: string;
  label: string;
  caption: string;
  amount: number;
  sign?: '−';
  hatch: string;
  valueClass?: string;
}

export function TaxBreakdownCard({ data }: { data: EuropeAccounting }) {
  const {
    invoiceTotalTry,
    totalExpenses,
    commercialProfit,
    exemptAmount95,
    taxableBase5,
    corporateTaxToPay,
    netProfitAfterTax,
    otherExpensesInput,
    handleOtherExpensesChange,
    loading,
  } = data;

  const steps: Step[] = [
    { key: 'revenue', label: 'Fatura tutarı', caption: 'Brüt hasılat', amount: invoiceTotalTry, hatch: 'var(--accent)' },
    { key: 'expenses', label: 'Toplam giderler', caption: 'Alış maliyeti + diğer masraflar', amount: totalExpenses, sign: '−', hatch: 'var(--status-warning-text)' },
    { key: 'profit', label: 'Net ticari kâr', caption: 'Hasılat − giderler', amount: commercialProfit, hatch: 'var(--accent)' },
    { key: 'exempt', label: '%95 kazanç istisnası', caption: 'Vergiden muaf · KVK 10/1-i', amount: exemptAmount95, sign: '−', hatch: 'var(--status-success-text)', valueClass: 'text-status-success-text' },
    { key: 'base', label: 'Vergi matrahı', caption: 'Kârın %5’i', amount: taxableBase5, hatch: 'var(--text-muted)' },
    { key: 'tax', label: 'Kurumlar vergisi', caption: 'Matrahın %25’i', amount: corporateTaxToPay, sign: '−', hatch: 'var(--status-danger-text)', valueClass: 'text-status-danger-text' },
  ];

  const scale = invoiceTotalTry > 0 ? invoiceTotalTry : Math.max(...steps.map((s) => s.amount), 1);

  return (
    <section className="flex h-full flex-col gap-6 rounded-card bg-surface p-6 shadow-hairline md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-normal tracking-tight text-text-primary md:text-[22px]">
            Kurumlar vergisi & net kâr
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            7582 sayılı kanun · kârın yalnızca %1,25’i vergilenir
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <PillBadge tone="success">%95 istisna</PillBadge>
          <PillBadge tone="info">%1,25 efektif</PillBadge>
        </div>
      </div>

      {/* Hasılattan net kâra adım adım; çubuklar fatura tutarına oranlı */}
      <ul className="space-y-1">
        {steps.map((s) => {
          const pct = s.amount > 0 ? Math.max((s.amount / scale) * 100, 1.5) : 0;
          return (
            <li
              key={s.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 rounded-inner px-3 py-2.5 transition-colors hover:bg-surface-muted sm:grid-cols-[180px_minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-text-primary">{s.label}</p>
                <p className="truncate text-[12px] text-text-muted">{s.caption}</p>
              </div>
              <div className="order-last col-span-2 h-2 rounded-full bg-surface-muted sm:order-0 sm:col-span-1">
                <div
                  className="hatch h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%`, ['--hatch' as string]: s.hatch }}
                />
              </div>
              <p className={`text-right text-[14px] font-medium tabular-nums ${s.valueClass ?? 'text-text-primary'}`}>
                {loading ? (
                  <span className="skeleton-soft inline-block h-4 w-20 align-middle" />
                ) : (
                  <>
                    {s.sign && <span className="mr-0.5">{s.sign}</span>}
                    {formatTL(s.amount, true)}
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Diğer masraflar */}
        <label className="flex flex-col justify-between gap-3 rounded-inner bg-surface-muted p-4">
          <span>
            <span className="block text-[13px] font-medium text-text-primary">Diğer masraflar</span>
            <span className="block text-[12px] text-text-muted">Kargo, komisyon, reklam · bu ay için saklanır</span>
          </span>
          <span className="relative flex items-center">
            <span className="pointer-events-none absolute left-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-[13px] font-medium text-text-muted">
              ₺
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={otherExpensesInput}
              onChange={(e) => handleOtherExpensesChange(e.target.value)}
              placeholder="0,00"
              aria-label="Diğer masraflar (TL)"
              className="h-10 w-full rounded-full bg-surface pl-10 pr-4 text-[14px] font-medium text-text-primary tabular-nums placeholder:text-text-muted focus:outline-hidden focus:ring-2 focus:ring-accent/30"
            />
          </span>
        </label>

        {/* Sonuç */}
        <div className="relative overflow-hidden rounded-inner bg-surface-accent p-4">
          <div
            aria-hidden
            className="hatch pointer-events-none absolute inset-0 opacity-40 mask-[linear-gradient(to_left,black,transparent_70%)]"
          />
          <p className="relative text-[13px] font-medium text-text-primary">Cebinizde kalan net kâr</p>
          <p className="relative text-[12px] text-text-secondary">Vergi sonrası</p>
          <p className="relative mt-3 text-[32px] font-light leading-none tracking-[-0.03em] text-text-primary tabular-nums">
            {loading ? <span className="skeleton-soft inline-block h-8 w-40 align-middle" /> : formatTL(netProfitAfterTax, true)}
          </p>
        </div>
      </div>

      <p className="text-[12px] text-text-muted">
        Komisyon ve reklam giderleri ileride Ozon Finans API’den otomatik aktarılacak.
      </p>
    </section>
  );
}
