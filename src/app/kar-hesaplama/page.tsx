'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  RotateCcw,
  Sparkles,
  Scale,
  CreditCard,
  Truck,
  Box,
  Percent,
  TrendingUp,
  Wallet,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { calculateOzonProfit } from '@/lib/calculator/profitCalculator';
import { formatTL, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/shadcn/button';
import { Badge } from '@/components/shadcn/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { Switch } from '@/components/shadcn/switch';
import { Separator } from '@/components/shadcn/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableRow,
} from '@/components/shadcn/table';

type Currency = 'EUR' | 'USD';
type ShippingMode = 'weight' | 'custom';

interface ProfitScenario {
  name: string;
  category: string;
  buyPrice: number;
  weightG: number;
  commissionRate: number;
  currency: Currency;
  isSplitting?: boolean;
}

const SAMPLE_SCENARIOS: ProfitScenario[] = [
  {
    name: 'Philips OneBlade Pro Tıraş Makinesi',
    category: 'Kişisel Bakım',
    buyPrice: 42,
    weightG: 450,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'Philips Sonicare 5300 Diş Fırçası',
    category: 'Ağız & Diş Bakımı',
    buyPrice: 65,
    weightG: 680,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'Philips Buhar Kazanlı Ütü PerfectCare',
    category: 'Ütü & Buhar',
    buyPrice: 145,
    weightG: 4200,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'WMF Gourmet Karıştırma Kasesi 4 Parça',
    category: 'Sofra & Mutfak',
    buyPrice: 38,
    weightG: 1350,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'Philips Airfryer XXL 5000 Serisi',
    category: 'Mutfak & Pişirme',
    buyPrice: 125,
    weightG: 6800,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'Braun Series 9 Pro Tıraş Makinesi',
    category: 'Kişisel Bakım',
    buyPrice: 210,
    weightG: 1250,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'Oral-B iO Series 8 Şarjlı Diş Fırçası',
    category: 'Ağız & Diş Bakımı',
    buyPrice: 130,
    weightG: 920,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'WMF Kult X Çubuk Blender Seti',
    category: 'Gıda Hazırlama',
    buyPrice: 48,
    weightG: 1950,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'Philips Lumea IPL Epilasyon Cihazı',
    category: 'Kişisel Bakım',
    buyPrice: 265,
    weightG: 1900,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'Tefal OptiGrill Elite Temaslı Izgara',
    category: 'Mutfak & Pişirme',
    buyPrice: 155,
    weightG: 5800,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'DeLonghi Dedica Espresso Makinesi',
    category: 'Kahve & İçecek',
    buyPrice: 165,
    weightG: 4800,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'Braun Silk-épil 9 Flex Epilatör',
    category: 'Kişisel Bakım',
    buyPrice: 115,
    weightG: 850,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'WMF Profi Resist Tava 28cm',
    category: 'Mutfak & Pişirme',
    buyPrice: 62,
    weightG: 1750,
    commissionRate: 5,
    currency: 'EUR',
  },
  {
    name: 'Philips Saç Düzleştirici Series 7000',
    category: 'Kişisel Bakım',
    buyPrice: 52,
    weightG: 720,
    commissionRate: 5,
    currency: 'EUR',
  },
];

export default function KarHesaplamaPage() {
  // Para Birimi Seçeneği (EUR / USD - Varsayılan EUR)
  const [currency, setCurrency] = useState<Currency>('EUR');

  // Kargo Hesaplama Modu (Ağırlık / Doğrudan Tutar - Varsayılan Ağırlık)
  const [shippingMode, setShippingMode] = useState<ShippingMode>('weight');

  // Girdi State'leri
  const [buyPrice, setBuyPrice] = useState<string>('50');
  const [sellPrice, setSellPrice] = useState<string>('150');
  const [weightG, setWeightG] = useState<string>('1200');
  const [customShipping, setCustomShipping] = useState<string>('15');
  const [commissionRate, setCommissionRate] = useState<string>('5');

  // Son Yüklenen Örnek Senaryo Bilgisi
  const [sampleIndex, setSampleIndex] = useState<number>(-1);
  const [sampleProductName, setSampleProductName] = useState<string | null>(null);

  // TCMB Kur State'leri
  const [eurRate, setEurRate] = useState<string>('38.45');
  const [usdRate, setUsdRate] = useState<string>('36.00');
  const [rateLoading, setRateLoading] = useState<boolean>(false);

  // Fulfillment Seçenekleri
  const [isIntegrated, setIsIntegrated] = useState<boolean>(true);
  const [isSplitting, setIsSplitting] = useState<boolean>(false);

  // Aktif Hesaplama Kuru
  const activeRate = useMemo(() => {
    const parsed = parseFloat(currency === 'EUR' ? eurRate : usdRate);
    return Number.isNaN(parsed) || parsed <= 0 ? (currency === 'EUR' ? 38.45 : 36.0) : parsed;
  }, [currency, eurRate, usdRate]);

  // Para Birimi Sembolü ve Formatlayıcı
  const currencySymbol = currency === 'USD' ? '$' : '€';

  const formatCurr = (val?: number | null, fraction = true): string => {
    const n = Number(val) || 0;
    const formatted = fraction
      ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
      : new Intl.NumberFormat('tr-TR').format(Math.round(n));
    return `${currencySymbol}${formatted}`;
  };

  // TCMB Canlı Kuru Çek
  // Açılıştaki otomatik çekim sessizdir; başarı bildirimi yalnızca elle yenilemede çıkar
  const fetchTcmbRate = async (silent = false) => {
    setRateLoading(true);
    try {
      const res = await fetch('/api/exchange-rate');
      const data = await res.json();
      if (data.success) {
        if (data.eurBuying) setEurRate(data.eurBuying.toFixed(4));
        if (data.usdBuying) setUsdRate(data.usdBuying.toFixed(4));
        if (!silent) toast.success('TCMB döviz kurları güncellendi');
      } else {
        toast.error('Kurlar alınamadı');
      }
    } catch (err) {
      console.error('TCMB kurları çekilemedi:', err);
      toast.error('TCMB kurları çekilirken hata oluştu');
    } finally {
      setRateLoading(false);
    }
  };

  useEffect(() => {
    fetchTcmbRate(true);
  }, []);

  // Form Sıfırlama
  const handleReset = () => {
    setCurrency('EUR');
    setShippingMode('weight');
    setBuyPrice('');
    setSellPrice('');
    setWeightG('');
    setCustomShipping('');
    setCommissionRate('5');
    setIsIntegrated(true);
    setIsSplitting(false);
    setSampleProductName(null);
    toast.success('Hesaplama formu sıfırlandı');
  };

  // Mantıklı Rastgele Örnek Değerleri Doldur
  const handleLoadSample = () => {
    let nextIndex = Math.floor(Math.random() * SAMPLE_SCENARIOS.length);
    if (nextIndex === sampleIndex) {
      nextIndex = (nextIndex + 1) % SAMPLE_SCENARIOS.length;
    }
    setSampleIndex(nextIndex);
    const item = SAMPLE_SCENARIOS[nextIndex];

    const priceVariance = Math.floor(Math.random() * 8) - 3;
    const finalBuyPrice = Math.max(15, item.buyPrice + priceVariance);

    const multiplier = 2.65 + Math.random() * 0.5;
    const finalSellPrice = Math.round(finalBuyPrice * multiplier);

    const weightVariance = (Math.floor(Math.random() * 5) - 2) * 20;
    const finalWeight = Math.max(200, item.weightG + weightVariance);

    setCurrency(item.currency);
    setShippingMode('weight');
    setBuyPrice(finalBuyPrice.toString());
    setSellPrice(finalSellPrice.toString());
    setWeightG(finalWeight.toString());
    setCustomShipping('15');
    setCommissionRate(item.commissionRate.toString());
    setIsIntegrated(true);
    setIsSplitting(item.isSplitting || false);
    setSampleProductName(`${item.name} · ${item.category}`);
    toast.success(`Örnek ürün yüklendi: ${item.name}`);
  };

  // Saf Hesaplama Motoru
  const calc = useMemo(() => {
    return calculateOzonProfit({
      buyPrice: parseFloat(buyPrice) || 0,
      sellPrice: parseFloat(sellPrice) || 0,
      weightG: parseFloat(weightG) || 0,
      customShippingCost: shippingMode === 'custom' ? parseFloat(customShipping) || 0 : undefined,
      commissionRate: parseFloat(commissionRate) || 0,
      eurTryRate: activeRate,
      isIntegrated,
      isSplitting,
    });
  }, [buyPrice, sellPrice, weightG, customShipping, shippingMode, commissionRate, activeRate, isIntegrated, isSplitting]);

  // Maliyet Dağılım Oranları
  const distribution = useMemo(() => {
    const sp = calc.sellPrice > 0 ? calc.sellPrice : 1;
    const buy = Math.max(0, Math.min(100, (calc.buyPrice / sp) * 100));
    const platform = Math.max(0, Math.min(100, (calc.totalPlatformFees / sp) * 100));
    const logistics = Math.max(
      0,
      Math.min(100, ((calc.shipping.totalShipping + calc.fulfillment.totalFulfillment) / sp) * 100)
    );
    const profit = Math.max(0, Math.min(100, (calc.netProfit / sp) * 100));
    return { buy, platform, logistics, profit };
  }, [calc]);

  return (
    <div className="flex-1 space-y-6 bg-background p-4 pt-6 text-foreground md:p-8">
      {/* 1. SAYFA BAŞLIĞI & CANLI KURLAR */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-bold tracking-tight">Kâr & Maliyet Analizi</h1>
            <Badge variant="outline" className="gap-1.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Canlı Motor
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Ozon komisyonu, acentelik, lojistik ve fulfillment hakediş simülatörü
          </p>
        </div>

        {/* Canlı TCMB Kurları ve Yenileme Butonu */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-xs">
            <span>1€ =</span>
            <span className="font-semibold tabular-nums text-foreground">{eurRate} ₺</span>
            <span className="text-border">|</span>
            <span>1$ =</span>
            <span className="font-semibold tabular-nums text-foreground">{usdRate} ₺</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTcmbRate()}
            disabled={rateLoading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', rateLoading && 'animate-spin')} />
            <span>Kurları Yenile</span>
          </Button>
        </div>
      </div>

      {/* 2. ANA DÜZEN (Grid 12 Sütun) */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        {/* ========================================================================= */}
        {/* SOL SÜTUN: GİRDİ PARAMETRELERİ (5 Kolon)                                  */}
        {/* ========================================================================= */}
        <div className="space-y-6 xl:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle>Hesaplama Parametreleri</CardTitle>
              <CardDescription>
                Alış, satış, paket ağırlığı ve kategori komisyonu
              </CardDescription>
              <CardAction className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadSample}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>Örnek</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="h-8 gap-1.5 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Sıfırla</span>
                </Button>
              </CardAction>
            </CardHeader>

            <CardContent className="space-y-4">
              {sampleProductName && (
                <div className="flex items-center justify-between rounded-md border bg-muted/50 p-2.5 text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-medium truncate">{sampleProductName}</span>
                  </div>
                  <Badge variant="secondary" className="text-[11px] shrink-0">
                    Örnek Ürün
                  </Badge>
                </div>
              )}

              {/* Para Birimi & Kur Satırı */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Para Birimi</Label>
                  <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-1">
                    <Button
                      type="button"
                      variant={currency === 'EUR' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCurrency('EUR')}
                      className="h-7 text-xs"
                    >
                      EUR (€)
                    </Button>
                    <Button
                      type="button"
                      variant={currency === 'USD' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCurrency('USD')}
                      className="h-7 text-xs"
                    >
                      USD ($)
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="exchange-rate" className="text-xs">
                    TCMB Kuru (1{currencySymbol} = ₺)
                  </Label>
                  <Input
                    id="exchange-rate"
                    type="number"
                    step="any"
                    min="1"
                    value={currency === 'EUR' ? eurRate : usdRate}
                    onChange={(e) => {
                      if (currency === 'EUR') setEurRate(e.target.value);
                      else setUsdRate(e.target.value);
                    }}
                    placeholder={currency === 'EUR' ? '38.45' : '36.00'}
                    className="font-medium tabular-nums h-9"
                  />
                </div>
              </div>

              <Separator />

              {/* 1. Alış Fiyatı */}
              <div className="space-y-1.5">
                <Label htmlFor="buy-price" className="text-xs">
                  Alış Fiyatı ({currencySymbol})
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {currencySymbol}
                  </span>
                  <Input
                    id="buy-price"
                    type="number"
                    step="any"
                    min="0"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    placeholder="0.00"
                    className="pl-7 font-semibold tabular-nums"
                  />
                </div>
              </div>

              {/* 2. Satış Fiyatı */}
              <div className="space-y-1.5">
                <Label htmlFor="sell-price" className="text-xs">
                  Ozon Satış Fiyatı ({currencySymbol})
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">
                    {currencySymbol}
                  </span>
                  <Input
                    id="sell-price"
                    type="number"
                    step="any"
                    min="0"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    placeholder="0.00"
                    className="pl-7 font-semibold tabular-nums"
                  />
                </div>
              </div>

              {/* 3. Kargo Hesaplama Modu ve Girdisi */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="shipping-input" className="text-xs">
                    {shippingMode === 'weight'
                      ? 'Paketli Ürün Ağırlığı (Gram)'
                      : `Kargo Ücreti (${currencySymbol})`}
                  </Label>
                  <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setShippingMode('weight')}
                      className={cn(
                        'rounded px-2 py-0.5 text-[11px] font-medium transition-all',
                        shippingMode === 'weight'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Ağırlık (g)
                    </button>
                    <button
                      type="button"
                      onClick={() => setShippingMode('custom')}
                      className={cn(
                        'rounded px-2 py-0.5 text-[11px] font-medium transition-all',
                        shippingMode === 'custom'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Sabit ({currencySymbol})
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {shippingMode === 'weight' ? (
                      <Scale className="h-3.5 w-3.5" />
                    ) : (
                      <span className="text-sm">{currencySymbol}</span>
                    )}
                  </span>
                  <Input
                    id="shipping-input"
                    type="number"
                    step="any"
                    min="0"
                    value={shippingMode === 'weight' ? weightG : customShipping}
                    onChange={(e) => {
                      if (shippingMode === 'weight') setWeightG(e.target.value);
                      else setCustomShipping(e.target.value);
                    }}
                    placeholder={shippingMode === 'weight' ? '1200' : '15.00'}
                    className="pl-8 pr-12 font-semibold tabular-nums"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {shippingMode === 'weight' ? 'gram' : currencySymbol}
                  </span>
                </div>
              </div>

              {/* 4. Ozon Kategori Komisyonu */}
              <div className="space-y-1.5">
                <Label htmlFor="commission-rate" className="text-xs">
                  Ozon Kategori Komisyonu (%)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Percent className="h-3.5 w-3.5" />
                  </span>
                  <Input
                    id="commission-rate"
                    type="number"
                    step="any"
                    min="0"
                    max="100"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    placeholder="5"
                    className="pl-8 pr-8 font-semibold tabular-nums"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
                    %
                  </span>
                </div>
              </div>

              <Separator />

              {/* 5. Depo & Lojistik Seçenekleri */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold">Depo & Lojistik Seçenekleri</Label>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {/* Entegrasyonlu Depo */}
                  <div className="flex items-start justify-between rounded-lg border p-3 bg-card shadow-xs">
                    <div className="space-y-0.5 pr-2">
                      <Label
                        htmlFor="integrated-warehouse"
                        className="text-xs font-medium cursor-pointer"
                      >
                        Entegrasyonlu Depo
                      </Label>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        İndirimli kabul (€0.40) ve sevkiyat
                      </p>
                    </div>
                    <Switch
                      id="integrated-warehouse"
                      checked={isIntegrated}
                      onCheckedChange={setIsIntegrated}
                      className="mt-0.5"
                    />
                  </div>

                  {/* Bölmeli Paket Kabulü */}
                  <div className="flex items-start justify-between rounded-lg border p-3 bg-card shadow-xs">
                    <div className="space-y-0.5 pr-2">
                      <Label
                        htmlFor="split-package"
                        className="text-xs font-medium cursor-pointer"
                      >
                        Bölmeli Paket Kabulü
                      </Label>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        1 koliden 2+ farklı siparişi ayrıştırma
                      </p>
                    </div>
                    <Switch
                      id="split-package"
                      checked={isSplitting}
                      onCheckedChange={setIsSplitting}
                      className="mt-0.5"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ========================================================================= */}
        {/* SAĞ SÜTUN: ANALİZ, SONUÇLAR VE KIRILIMLAR (7 Kolon)                       */}
        {/* ========================================================================= */}
        <div className="space-y-6 xl:col-span-7">
          {/* A. 4 KPI KARTI */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {/* 1. Net Kâr */}
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardDescription className="flex items-center justify-between text-xs">
                  <span>Net Kâr</span>
                  <Badge
                    variant={calc.netProfit >= 0 ? 'default' : 'destructive'}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {calc.netProfit >= 0 ? 'Kârda' : 'Zarar'}
                  </Badge>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div
                  className={cn(
                    'text-2xl font-bold tracking-tight',
                    calc.netProfit < 0 && 'text-destructive'
                  )}
                >
                  {formatCurr(calc.netProfit)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{formatTL(calc.netProfitTry)}</p>
              </CardContent>
            </Card>

            {/* 2. Kâr Marjı */}
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardDescription className="flex items-center justify-between text-xs">
                  <span>Kâr Marjı</span>
                  <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold tracking-tight">
                  {formatPercent(calc.profitMargin, 1)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Net Kâr / Satış</p>
              </CardContent>
            </Card>

            {/* 3. ROI (Yatırım Getirisi) */}
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardDescription className="flex items-center justify-between text-xs">
                  <span>ROI</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold tracking-tight">
                  {formatPercent(calc.roi, 1)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Net Kâr / Alış</p>
              </CardContent>
            </Card>

            {/* 4. Ozon Hakedişi */}
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardDescription className="flex items-center justify-between text-xs">
                  <span>Hakediş</span>
                  <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold tracking-tight">
                  {formatCurr(calc.payoutEur)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{formatTL(calc.payoutTry)}</p>
              </CardContent>
            </Card>
          </div>

          {/* B. MALİYET VE GELİR DAĞILIMI */}
          <Card>
            <CardHeader>
              <CardTitle>Maliyet & Kesinti Dağılımı</CardTitle>
              <CardDescription>
                Tüm gider kalemleri, platform kesintileri ve net hakediş dökümü
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Oransal Dağılım Çubuğu */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Satış Fiyatı Dağılım Oranı</span>
                  <span className="font-semibold text-foreground">{formatCurr(calc.sellPrice)}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted flex">
                  <div
                    style={{ width: `${distribution.buy}%` }}
                    className="h-full bg-chart-2 transition-all"
                    title={`Ürün Alış: %${distribution.buy.toFixed(1)}`}
                  />
                  <div
                    style={{ width: `${distribution.platform}%` }}
                    className="h-full bg-chart-3 transition-all"
                    title={`Platform Kesintileri: %${distribution.platform.toFixed(1)}`}
                  />
                  <div
                    style={{ width: `${distribution.logistics}%` }}
                    className="h-full bg-chart-4 transition-all"
                    title={`Lojistik & Depo: %${distribution.logistics.toFixed(1)}`}
                  />
                  <div
                    style={{ width: `${distribution.profit}%` }}
                    className="h-full bg-primary transition-all"
                    title={`Net Kâr: %${distribution.profit.toFixed(1)}`}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-chart-2" />
                    <span>Ürün Alış (%{distribution.buy.toFixed(0)})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-chart-3" />
                    <span>Ozon & Finans (%{distribution.platform.toFixed(0)})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-chart-4" />
                    <span>Lojistik & Depo (%{distribution.logistics.toFixed(0)})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <span className="font-medium text-foreground">
                      Net Kâr (%{distribution.profit.toFixed(0)})
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Giderler ve Gelirler Tablosu (2 Kolon Grid) */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Sol Taraf: Giderler & Kesintiler */}
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center justify-between border-b px-4 py-2.5 bg-muted/40">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                      <span className="text-xs font-semibold">Giderler & Kesintiler</span>
                    </div>
                    <Badge variant="destructive" className="text-[11px]">
                      -{formatCurr(calc.totalCost)}
                    </Badge>
                  </div>

                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-xs py-2.5">Ürün Alış Maliyeti</TableCell>
                        <TableCell className="text-right text-xs py-2.5 font-medium tabular-nums text-destructive">
                          -{formatCurr(calc.buyPrice)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-xs py-2.5">Ozon Satış Komisyonu</TableCell>
                        <TableCell className="text-right text-xs py-2.5 font-medium tabular-nums text-destructive">
                          -{formatCurr(calc.commissionAmount)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-xs py-2.5">Ozon Acentelik Bedeli</TableCell>
                        <TableCell className="text-right text-xs py-2.5 font-medium tabular-nums text-destructive">
                          -{formatCurr(calc.agencyFee)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-xs py-2.5">Aracı Banka Kesintisi (%1)</TableCell>
                        <TableCell className="text-right text-xs py-2.5 font-medium tabular-nums text-destructive">
                          -{formatCurr(calc.bankFee)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-xs py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Truck className="h-3 w-3 text-muted-foreground" />
                            <span>Uluslararası Kargo</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs py-2.5 font-medium tabular-nums text-destructive">
                          -{formatCurr(calc.shipping.totalShipping)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-xs py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Box className="h-3 w-3 text-muted-foreground" />
                            <span>Depo & Fulfillment</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs py-2.5 font-medium tabular-nums text-destructive">
                          {calc.fulfillment.totalFulfillment > 0
                            ? `-${formatCurr(calc.fulfillment.totalFulfillment)}`
                            : 'Dahil Değil'}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-muted/30">
                        <TableCell className="text-xs font-semibold py-3">Toplam Giderler</TableCell>
                        <TableCell className="text-right text-xs font-bold py-3 tabular-nums text-destructive">
                          -{formatCurr(calc.totalCost)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* Sağ Taraf: Gelirler & Net Sonuç */}
                <div className="rounded-lg border bg-card flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b px-4 py-2.5 bg-muted/40">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <span className="text-xs font-semibold">Gelirler & Hakediş</span>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        Satış: {formatCurr(calc.sellPrice)}
                      </Badge>
                    </div>

                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell className="text-xs py-2.5">
                            <div className="flex items-center gap-1.5">
                              <CreditCard className="h-3 w-3 text-muted-foreground" />
                              <span>Ozon Satış Fiyatı</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs py-2.5 font-semibold tabular-nums text-foreground">
                            {formatCurr(calc.sellPrice)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-xs py-2.5">Satış Tutarı (₺ Karşılığı)</TableCell>
                          <TableCell className="text-right text-xs py-2.5 font-medium tabular-nums text-muted-foreground">
                            {formatTL(calc.sellPriceTry)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-xs py-2.5">
                            <div className="flex items-center gap-1.5">
                              <Wallet className="h-3 w-3 text-muted-foreground" />
                              <span>Ozon Hakediş Tutarı</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs py-2.5 font-semibold tabular-nums text-foreground">
                            {formatCurr(calc.payoutEur)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-xs py-2.5">Hakediş (₺ Karşılığı)</TableCell>
                          <TableCell className="text-right text-xs py-2.5 font-medium tabular-nums text-muted-foreground">
                            {formatTL(calc.payoutTry)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-xs py-2.5">Alış Maliyeti (₺)</TableCell>
                          <TableCell className="text-right text-xs py-2.5 font-medium tabular-nums text-muted-foreground">
                            {formatTL(calc.buyPriceTry)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <div className="border-t p-4 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp
                          className={cn(
                            'h-4 w-4',
                            calc.netProfit >= 0 ? 'text-primary' : 'text-destructive'
                          )}
                        />
                        <span className="text-sm font-semibold">Tahmini Net Kâr</span>
                      </div>
                      <div className="text-right">
                        <span
                          className={cn(
                            'text-lg font-bold tabular-nums',
                            calc.netProfit >= 0 ? 'text-primary' : 'text-destructive'
                          )}
                        >
                          {formatCurr(calc.netProfit)}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {formatTL(calc.netProfitTry)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
