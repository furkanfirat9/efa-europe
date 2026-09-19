'use client';

import React from 'react';
import { FileText } from 'lucide-react';
import type { EuropeAccounting } from '@/hooks/useEuropeAccounting';

export function InvoiceDetailsCard({ data }: { data: EuropeAccounting }) {
  const { activeMonth, tcmbDate } = data;

  const rows: { label: string; value: string; caption: string }[] = [
    { label: 'Fatura türü', value: 'İstisna faturası', caption: 'e-Arşiv / e-Fatura' },
    { label: 'İstisna kodu', value: '351 · Transit ticaret', caption: 'KDV Md. 1 ve 6' },
    { label: 'KDV', value: '₺0,00 · %0', caption: 'Beyannamesiz teslimat' },
    { label: 'Alıcı', value: 'Yurt dışı', caption: 'Ozon Avrupa' },
    {
      label: 'Kur',
      value: 'TCMB döviz alış',
      caption: activeMonth.isCurrent
        ? `Bugünün kuru${tcmbDate ? ` · ${tcmbDate}` : ''}`
        : `Ay sonu kapanış · ${tcmbDate || activeMonth.invoiceDate}`,
    },
    { label: 'Fatura tarihi', value: activeMonth.invoiceDate, caption: 'Dönem sonu' },
  ];

  return (
    <section className="flex h-full flex-col gap-6 rounded-card bg-surface p-6 shadow-hairline md:p-7">
      <div>
        <h2 className="text-[20px] font-normal tracking-tight text-text-primary md:text-[22px]">
          Fatura bilgileri
        </h2>
        <p className="mt-1 text-[13px] text-text-secondary">{activeMonth.label} · muhasebeciye iletilecek alanlar</p>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-inner bg-surface-muted px-4 py-3">
            <dt className="text-[12px] text-text-muted">{r.label}</dt>
            <dd className="mt-1 text-[14px] font-medium text-text-primary tabular-nums">{r.value}</dd>
            <dd className="text-[12px] text-text-secondary">{r.caption}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex items-start gap-3 rounded-inner bg-surface-accent p-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-accent">
          <FileText className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <p className="text-[13px] leading-relaxed text-text-secondary">
          Türkiye gümrük bölgesine girmeden yurt dışından alınıp yurt dışına teslim edilen mallar
          KDV’den istisnadır (351 istisna kodu).
        </p>
      </div>
    </section>
  );
}
