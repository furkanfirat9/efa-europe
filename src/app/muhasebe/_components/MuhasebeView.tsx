'use client';

import React from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DollarSign, FileText, Package, Receipt, RefreshCw, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useEuropeAccounting } from '@/hooks/useEuropeAccounting';
import { formatTL, formatUSD } from '@/lib/format';
import { Button } from '@/components/shadcn/button';
import { Badge } from '@/components/shadcn/badge';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Separator } from '@/components/shadcn/separator';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/table';

const compactTL = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

function Loading({ className = 'h-7 w-28' }: { className?: string }) {
  return <Skeleton className={`inline-block align-middle ${className}`} />;
}

export function MuhasebeView() {
  const d = useEuropeAccounting();

  const chartData = [
    { name: 'Hasılat', value: d.invoiceTotalTry, color: 'var(--chart-2)' },
    { name: 'Giderler', value: d.totalExpenses, color: 'var(--chart-1)' },
    { name: 'Ticari kâr', value: d.commercialProfit, color: 'var(--chart-3)' },
    { name: 'Vergi', value: d.corporateTaxToPay, color: 'var(--chart-5)' },
    { name: 'Net kâr', value: d.netProfitAfterTax, color: 'var(--chart-4)' },
  ];

  const taxRows = [
    { item: 'Fatura tutarı', note: 'Brüt hasılat', rate: '—', amount: d.invoiceTotalTry },
    { item: 'Toplam giderler', note: "Belgeler'deki onaylı faturalar", rate: '—', amount: -d.totalExpenses },
    { item: 'Net ticari kâr', note: 'Hasılat − giderler', rate: '—', amount: d.commercialProfit },
    { item: 'Kazanç istisnası', note: 'KVK 10/1-i', rate: '%95', amount: -d.exemptAmount95 },
    { item: 'Vergi matrahı', note: 'Vergilendirilen kısım', rate: '%5', amount: d.taxableBase5 },
    { item: 'Kurumlar vergisi', note: 'Matrah üzerinden', rate: '%25', amount: -d.corporateTaxToPay },
  ];

  const invoiceRows = [
    { label: 'Fatura türü', value: 'İstisna faturası', badge: 'e-Arşiv' },
    { label: 'İstisna kodu', value: '351 · Transit ticaret' },
    { label: 'KDV', value: '₺0,00 (%0)', badge: 'Muaf' },
    { label: 'Alıcı', value: 'Yurt dışı · Ozon Avrupa' },
    {
      label: 'TCMB döviz alış',
      value: d.rateLoading ? '…' : `${d.tcmbUsdRate.toFixed(4)} ₺`,
      badge: d.activeMonth.isCurrent ? 'Canlı' : 'Kapanış',
    },
    { label: 'Fatura tarihi', value: d.activeMonth.invoiceDate },
  ];

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      {/* Başlık */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Muhasebe</h1>
          <p className="text-muted-foreground">
            Avrupa mağazası · {d.activeMonth.label} istisna faturası ve kurumlar vergisi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={d.selectedMonthKey} onValueChange={d.setSelectedMonthKey}>
            <SelectTrigger className="w-[160px]" aria-label="Dönem">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {d.monthOptions.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={async () => {
              await d.fetchData();
              toast.success(`${d.activeMonth.label} verileri yenilendi`);
            }}
            disabled={d.loading}
            aria-label="Yenile"
          >
            <RefreshCw className={d.loading ? 'animate-spin' : ''} />
          </Button>
          <Button asChild>
            <Link href="/belgeler">Belgeler</Link>
          </Button>
        </div>
      </div>

      {/* Özet kartları */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardDescription className="font-medium text-foreground">Kesilecek fatura</CardDescription>
            <Receipt className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {d.ordersLoading || d.rateLoading ? <Loading /> : formatTL(d.invoiceTotalTry, true)}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatUSD(d.totalRevenueUsd)} × {d.tcmbUsdRate.toFixed(4)} ₺
            </p>
          </CardContent>
        </Card>

        <Card className="gap-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardDescription className="font-medium text-foreground">Döviz hasılatı</CardDescription>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {d.ordersLoading ? <Loading /> : formatUSD(d.totalRevenueUsd)}
            </div>
            <p className="text-xs text-muted-foreground">{d.totalOrdersCount} sipariş · Avrupa teslimatları</p>
          </CardContent>
        </Card>

        {/* Gider, Belgeler sayfasındaki onaylı faturalardan gelir; onay bekleyenler toplama girmez. */}
        <Card className="gap-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardDescription className="font-medium text-foreground">Toplam gider</CardDescription>
            <Package className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold tabular-nums">
              {d.expensesLoading ? <Loading /> : formatTL(d.expenses.total, true)}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {d.expenses.documentCount} belge · mal alımı {formatTL(d.expenses.goods, true)} · Ozon{' '}
              {formatTL(d.expenses.ozon, true)}
            </p>
            {!d.expensesLoading && d.expenses.pendingCount > 0 && (
              <Link href="/belgeler" className="block text-xs font-medium underline-offset-4 hover:underline">
                {d.expenses.pendingCount} belge onay bekliyor, toplama girmedi
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className="gap-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardDescription className="font-medium text-foreground">Vergi sonrası net kâr</CardDescription>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {d.loading ? <Loading /> : formatTL(d.netProfitAfterTax, true)}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              Kurumlar vergisi {formatTL(d.corporateTaxToPay, true)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grafik + fatura bilgileri */}
      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Hasılattan net kâra</CardTitle>
            <CardDescription>{d.activeMonth.label} · TL</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={10} fontSize={12} stroke="var(--muted-foreground)" />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    width={56}
                    stroke="var(--muted-foreground)"
                    tickFormatter={(v: number) => `₺${compactTL.format(v)}`}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--muted)' }}
                    formatter={(v) => [formatTL(Number(v), true), 'Tutar']}
                    contentStyle={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                      boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)',
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Fatura bilgileri</CardTitle>
            <CardDescription>Muhasebeciye iletilecek alanlar</CardDescription>
            <CardAction>
              <Badge variant="secondary">Transit ticaret</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invoiceRows.map((r, i) => (
                <React.Fragment key={r.label}>
                  {i > 0 && <Separator />}
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="flex items-center gap-2 text-right font-medium tabular-nums">
                      {r.value}
                      {r.badge && <Badge variant="outline">{r.badge}</Badge>}
                    </span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </CardContent>
          <CardFooter className="mt-auto">
            <div className="flex gap-3 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
              <FileText className="mt-0.5 size-4 shrink-0" />
              Türkiye gümrük bölgesine girmeden alınıp yurt dışına teslim edilen mallar KDV’den istisnadır.
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Vergi tablosu */}
      <Card>
        <CardHeader>
          <CardTitle>Kurumlar vergisi hesabı</CardTitle>
          <CardDescription>7582 sayılı kanun kapsamında %95 kazanç istisnası · efektif vergi %1,25</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kalem</TableHead>
                <TableHead>Açıklama</TableHead>
                <TableHead className="text-right">Oran</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {taxRows.map((r) => (
                <TableRow key={r.item}>
                  <TableCell className="font-medium">{r.item}</TableCell>
                  <TableCell className="text-muted-foreground">{r.note}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.rate}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.amount < 0 ? 'text-muted-foreground' : ''}`}>
                    {d.loading ? <Loading className="h-4 w-20" /> : (r.amount < 0 ? '−' : '') + formatTL(Math.abs(r.amount), true)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Vergi sonrası net kâr</TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.loading ? <Loading className="h-4 w-20" /> : formatTL(d.netProfitAfterTax, true)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
