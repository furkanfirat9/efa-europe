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
  Coins,
  ShieldCheck,
} from 'lucide-react';
import { calculateOzonProfit } from '@/lib/calculator/profitCalculator';
import { Card } from '@/components/ui/Card';
import { PillButton } from '@/components/ui/PillButton';
import { PillInput } from '@/components/ui/PillInput';
import { PillBadge } from '@/components/ui/PillBadge';
import { StatCard } from '@/components/ui/StatCard';
import { formatTL, formatPercent } from '@/lib/format';

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
    return Number.isNaN(parsed) || parsed <= 0 ? (currency === 'EUR' ? 38.45 : 36.00) : parsed;
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
  const fetchTcmbRate = async () => {
    setRateLoading(true);
    try {
      const res = await fetch('/api/exchange-rate');
      const data = await res.json();
      if (data.success) {
        if (data.eurBuying) setEurRate(data.eurBuying.toFixed(4));
        if (data.usdBuying) setUsdRate(data.usdBuying.toFixed(4));
      }
    } catch (err) {
      console.error('TCMB kurları çekilemedi:', err);
    } finally {
      setRateLoading(false);
    }
  };

  useEffect(() => {
    fetchTcmbRate();
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
  };

  // Mantıklı Rastgele Örnek Değerleri Doldur
  const handleLoadSample = () => {
    let nextIndex = Math.floor(Math.random() * SAMPLE_SCENARIOS.length);
    if (nextIndex === sampleIndex) {
      nextIndex = (nextIndex + 1) % SAMPLE_SCENARIOS.length;
    }
    setSampleIndex(nextIndex);
    const item = SAMPLE_SCENARIOS[nextIndex];

    // Doğal fiyat varyasyonu (-3 ile +4 arası)
    const priceVariance = Math.floor(Math.random() * 8) - 3;
    const finalBuyPrice = Math.max(15, item.buyPrice + priceVariance);

    // Ozon arbitraj satış çarpanı (~2.65x ile ~3.15x arası, tam sayı)
    const multiplier = 2.65 + Math.random() * 0.5;
    const finalSellPrice = Math.round(finalBuyPrice * multiplier);

    // Gramaj varyasyonu
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

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-text-primary p-5 sm:p-7 md:p-8 lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6 md:space-y-8">
        
        {/* ========================================================================= */}
        {/* 1. SAYFA BAŞLIĞI & AKILLI ORB (Section 3 & 5.4)                           */}
        {/* ========================================================================= */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {/* 5.4 AI Gradient Orb */}
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#6C72E6] via-[#D9DBFA] to-[#C2408A] opacity-70 blur-md animate-pulse" />
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-hairline backdrop-blur-xs">
                <Coins className="h-5 w-5 text-accent stroke-[1.75]" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[28px] md:text-[34px] font-normal tracking-tight text-text-primary leading-tight">
                  Kâr & Maliyet Analizi
                </h1>
                <PillBadge tone="info" dot>
                  Canlı Motor
                </PillBadge>
              </div>
              <p className="mt-0.5 text-[14px] text-text-secondary">
                Ozon komisyonu, acentelik, lojistik ve fulfillment hakediş simülatörü
              </p>
            </div>
          </div>

          {/* Sağ Aksiyonlar: Canlı Döviz Kuru Hapları */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-white px-3.5 py-1.5 shadow-hairline text-[12px] font-medium text-text-secondary">
              <span className="flex h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span>1€ =</span>
              <span className="font-semibold tabular-nums text-text-primary">{eurRate} ₺</span>
              <span className="text-border-subtle">|</span>
              <span>1$ =</span>
              <span className="font-semibold tabular-nums text-text-primary">{usdRate} ₺</span>
            </div>

            <PillButton
              variant="secondary"
              onClick={fetchTcmbRate}
              disabled={rateLoading}
              icon={<RefreshCw className={`h-3.5 w-3.5 ${rateLoading ? 'animate-spin' : ''}`} />}
              title="TCMB kurlarını yenile"
            >
              <span className="hidden sm:inline">Kurları Yenile</span>
            </PillButton>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. ASİMETRİK BENTO GRID (12 Sütunlu Bento Yerleşimi)                       */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">

          {/* ----------------------------------------------------------------------- */}
          {/* SOL SÜTUN: GİRDİ PARAMETRELERİ (5 Kolon)                                */}
          {/* ----------------------------------------------------------------------- */}
          <div className="lg:col-span-5 space-y-6">
            <Card
              title="Hesaplama Parametreleri"
              subtitle="Alış, satış, paket ağırlığı ve kategori komisyonu"
              actions={
                <div className="flex items-center gap-1.5">
                  <PillButton
                    variant="ghost"
                    onClick={handleLoadSample}
                    icon={<Sparkles className="h-3.5 w-3.5 text-accent" />}
                    title="Örnek veriler yükle"
                  >
                    Örnek
                  </PillButton>
                  <PillButton
                    variant="ghost"
                    onClick={handleReset}
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                    title="Formu temizle"
                  >
                    Sıfırla
                  </PillButton>
                </div>
              }
            >
              <div className="space-y-4">
                {sampleProductName && (
                  <div className="flex items-center justify-between rounded-xl bg-accent-soft/30 border border-accent/20 px-3.5 py-2 text-xs text-text-primary">
                    <div className="flex items-center gap-2 truncate">
                      <Sparkles className="h-3.5 w-3.5 text-accent shrink-0" />
                      <span className="font-medium truncate">{sampleProductName}</span>
                    </div>
                    <span className="text-[11px] text-text-muted shrink-0">Örnek Ürün</span>
                  </div>
                )}
                
                {/* 1. Alış Fiyatı */}
                <PillInput
                  label="Alış Fiyatı"
                  type="number"
                  step="any"
                  min="0"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  placeholder="0.00"
                  prefixIcon={<span>{currencySymbol}</span>}
                  className="font-semibold tabular-nums"
                />

                {/* 2. Satış Fiyatı */}
                <PillInput
                  label="Ozon Satış Fiyatı"
                  type="number"
                  step="any"
                  min="0"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  placeholder="0.00"
                  prefixIcon={<span className="text-[#2E8B57] font-semibold">{currencySymbol}</span>}
                  className="font-semibold tabular-nums text-[#2E8B57]"
                />

                {/* 3. Kargo Hesaplama Modu (Ağırlık vs Sabit Tutar) */}
                <PillInput
                  label={shippingMode === 'weight' ? 'Paketli Ürün Ağırlığı' : 'Kargo Ücreti'}
                  type="number"
                  step="any"
                  min="0"
                  value={shippingMode === 'weight' ? weightG : customShipping}
                  onChange={(e) => {
                    if (shippingMode === 'weight') setWeightG(e.target.value);
                    else setCustomShipping(e.target.value);
                  }}
                  placeholder={shippingMode === 'weight' ? '1200' : '15.00'}
                  prefixIcon={
                    shippingMode === 'weight' ? (
                      <Scale className="h-3.5 w-3.5 text-text-muted" />
                    ) : (
                      <span>{currencySymbol}</span>
                    )
                  }
                  suffix={shippingMode === 'weight' ? 'gram' : currencySymbol}
                  className="font-semibold tabular-nums"
                  action={
                    <div className="inline-flex rounded-full bg-surface-muted p-0.5 border border-border-subtle">
                      <button
                        type="button"
                        onClick={() => setShippingMode('weight')}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                          shippingMode === 'weight'
                            ? 'bg-neutral-900 text-white shadow-xs'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        Ağırlık (g)
                      </button>
                      <button
                        type="button"
                        onClick={() => setShippingMode('custom')}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                          shippingMode === 'custom'
                            ? 'bg-neutral-900 text-white shadow-xs'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        Tutar ({currencySymbol})
                      </button>
                    </div>
                  }
                />

                {/* 4. Ozon Kategori Komisyonu */}
                <PillInput
                  label="Ozon Kategori Komisyonu"
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  placeholder="5"
                  prefixIcon={<Percent className="h-3.5 w-3.5 text-text-muted" />}
                  suffix="%"
                  className="font-semibold tabular-nums"
                />

                {/* 5. Döviz Kuru Seçimi */}
                <PillInput
                  label="Hesaplama Kuru (TCMB)"
                  type="number"
                  step="any"
                  min="1"
                  value={currency === 'EUR' ? eurRate : usdRate}
                  onChange={(e) => {
                    if (currency === 'EUR') setEurRate(e.target.value);
                    else setUsdRate(e.target.value);
                  }}
                  placeholder={currency === 'EUR' ? '38.45' : '36.00'}
                  prefixIcon={<span>1{currencySymbol} =</span>}
                  suffix="₺"
                  className="font-semibold tabular-nums"
                  action={
                    <div className="inline-flex rounded-full bg-surface-muted p-0.5 border border-border-subtle">
                      <button
                        type="button"
                        onClick={() => setCurrency('EUR')}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                          currency === 'EUR'
                            ? 'bg-neutral-900 text-white shadow-xs'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        EUR (€)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrency('USD')}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                          currency === 'USD'
                            ? 'bg-neutral-900 text-white shadow-xs'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        USD ($)
                      </button>
                    </div>
                  }
                />

                {/* 6. Fulfillment ve Depo Seçenekleri */}
                <div className="space-y-2 pt-2">
                  <span className="text-[13px] font-medium text-text-secondary block">
                    Depo & Lojistik Seçenekleri
                  </span>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {/* Entegrasyonlu Depo */}
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 border transition-all ${
                        isIntegrated
                          ? 'border-accent/40 bg-surface-accent shadow-xs'
                          : 'border-border-subtle bg-surface-muted hover:border-border-subtle/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isIntegrated}
                        onChange={(e) => setIsIntegrated(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded-full accent-accent cursor-pointer"
                      />
                      <div className="min-w-0">
                        <span className="block text-[13px] font-medium text-text-primary">
                          Entegrasyonlu Depo
                        </span>
                        <span className="block text-[11px] leading-tight text-text-muted mt-0.5">
                          İndirimli kabul (€0.40) ve sevkiyat tarifesi
                        </span>
                      </div>
                    </label>

                    {/* Bölmeli Paket Kabulü */}
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 border transition-all ${
                        isSplitting
                          ? 'border-accent/40 bg-surface-accent shadow-xs'
                          : 'border-border-subtle bg-surface-muted hover:border-border-subtle/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSplitting}
                        onChange={(e) => setIsSplitting(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded-full accent-accent cursor-pointer"
                      />
                      <div className="min-w-0">
                        <span className="block text-[13px] font-medium text-text-primary">
                          Bölmeli Paket Kabulü
                        </span>
                        <span className="block text-[11px] leading-tight text-text-muted mt-0.5">
                          1 koliden 2+ farklı siparişi ayrıştırma
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

              </div>
            </Card>
          </div>

          {/* ----------------------------------------------------------------------- */}
          {/* SAĞ SÜTUN: ANALİZ, SONUÇLAR VE KIRILIMLAR (7 Kolon)                     */}
          {/* ----------------------------------------------------------------------- */}
          <div className="lg:col-span-7 space-y-6">

            {/* A. Üst Bento KPI Kartları (4 StatCard) */}
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
              
              {/* 1. Net Kâr Kartı (Cutout Corner) */}
              <StatCard
                label="Net Kâr"
                value={formatCurr(calc.netProfit)}
                subValue={formatTL(calc.netProfitTry)}
                badge={
                  <PillBadge tone={calc.netProfit >= 0 ? 'success' : 'danger'} dot>
                    {calc.netProfit >= 0 ? 'Kârda' : 'Zarar'}
                  </PillBadge>
                }
              />

              {/* 2. Kâr Marjı */}
              <StatCard
                label="Kâr Marjı"
                value={formatPercent(calc.profitMargin, 1)}
                subValue="Net Kâr / Satış"
                badge={
                  <PillBadge tone={calc.profitMargin >= 0 ? 'success' : 'danger'}>
                    Marj
                  </PillBadge>
                }
              />

              {/* 3. ROI (Yatırım Getirisi) */}
              <StatCard
                label="ROI (Getiri)"
                value={formatPercent(calc.roi, 1)}
                subValue="Net Kâr / Alış"
                badge={
                  <PillBadge tone={calc.roi >= 0 ? 'info' : 'danger'}>
                    Verim
                  </PillBadge>
                }
              />

              {/* 4. Net Hakediş (Ozon'dan Bankaya Geçecek Tutar) */}
              <StatCard
                label="Net Hakediş"
                value={formatCurr(calc.payoutEur)}
                subValue={formatTL(calc.payoutTry)}
                badge={
                  <PillBadge tone="info" dot>
                    Banka
                  </PillBadge>
                }
              />

            </div>

            {/* B. Maliyet ve Kesinti Dağılımı (Ortadan Çizgili: Sol Gider, Sağ Gelir & Kâr) */}
            <Card
              title="Maliyet & Kesinti Dağılımı"
              subtitle="Sol tarafta tüm giderler ve kesintiler, sağ tarafta satış geliri ve net kâr"
            >
              <div className="overflow-hidden rounded-[18px] border border-border-subtle bg-white">
                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border-subtle">
                  
                  {/* ================================================================= */}
                  {/* SOL SÜTUN: GİDERLER & KESİNTİLER                                   */}
                  {/* ================================================================= */}
                  <div className="flex flex-col justify-between">
                    <div>
                      {/* Sütun Başlığı */}
                      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-muted px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#D14343]" />
                          <span className="text-[12px] font-medium text-text-primary">Giderler & Kesintiler</span>
                        </div>
                        <PillBadge tone="danger">
                          Toplam: -{formatCurr(calc.totalCost)}
                        </PillBadge>
                      </div>

                      {/* Gider Kalemleri */}
                      <div className="divide-y divide-border-subtle text-[13px]">
                        {/* Kalem 1: Ürün Alış Maliyeti */}
                        <div className="flex items-center justify-between px-4 py-3 hover:bg-surface-muted transition-colors">
                          <span className="text-text-primary">Ürün Alış Maliyeti</span>
                          <div className="text-right tabular-nums">
                            <span className="font-medium text-[#D14343]">
                              - {formatCurr(calc.buyPrice)}
                            </span>
                          </div>
                        </div>

                        {/* Kalem 2: Ozon Satış Komisyonu */}
                        <div className="flex items-center justify-between px-4 py-3 hover:bg-surface-muted transition-colors">
                          <span className="text-text-primary">Ozon Komisyonu</span>
                          <div className="text-right tabular-nums">
                            <span className="font-medium text-[#D14343]">
                              - {formatCurr(calc.commissionAmount)}
                            </span>
                          </div>
                        </div>

                        {/* Kalem 3: Ozon Acentelik Bedeli */}
                        <div className="flex items-center justify-between px-4 py-3 hover:bg-surface-muted transition-colors">
                          <span className="text-text-primary">Acentelik Bedeli</span>
                          <div className="text-right tabular-nums">
                            <span className="font-medium text-[#D14343]">
                              - {formatCurr(calc.agencyFee)}
                            </span>
                          </div>
                        </div>

                        {/* Kalem 4: Aracı Banka Kesintisi */}
                        <div className="flex items-center justify-between px-4 py-3 hover:bg-surface-muted transition-colors">
                          <span className="text-text-primary">Aracı Banka Kesintisi</span>
                          <div className="text-right tabular-nums">
                            <span className="font-medium text-[#D14343]">
                              - {formatCurr(calc.bankFee)}
                            </span>
                          </div>
                        </div>

                        {/* Kalem 5: Uluslararası Kargo */}
                        <div className="flex items-center justify-between px-4 py-3 hover:bg-surface-muted transition-colors">
                          <div className="flex items-center gap-1.5 text-text-primary">
                            <Truck className="h-3.5 w-3.5 text-text-muted" />
                            <span>Uluslararası Kargo</span>
                          </div>
                          <div className="text-right tabular-nums">
                            <span className="font-medium text-[#D14343]">
                              - {formatCurr(calc.shipping.totalShipping)}
                            </span>
                          </div>
                        </div>

                        {/* Kalem 6: Fulfillment & Depo */}
                        <div className="flex items-center justify-between px-4 py-3 hover:bg-surface-muted transition-colors">
                          <div className="flex items-center gap-1.5 text-text-primary">
                            <Box className="h-3.5 w-3.5 text-text-muted" />
                            <span>Depo & Fulfillment</span>
                          </div>
                          <div className="text-right tabular-nums">
                            {calc.fulfillment.totalFulfillment > 0 ? (
                              <span className="font-medium text-[#D14343]">
                                - {formatCurr(calc.fulfillment.totalFulfillment)}
                              </span>
                            ) : (
                              <span className="text-text-muted">Dahil Değil</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sol Alt: Toplam Gider Dip Satırı */}
                    <div className="flex items-center justify-between border-t border-border-subtle bg-surface-muted/60 px-4 py-3.5 font-medium">
                      <span className="text-[13px] text-text-primary">Toplam Gider & Kesintiler</span>
                      <div className="text-right tabular-nums">
                        <span className="text-[14px] font-semibold text-[#D14343]">
                          - {formatCurr(calc.totalCost)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ================================================================= */}
                  {/* SAĞ SÜTUN: GELİRLER & NET KÂR                                     */}
                  {/* ================================================================= */}
                  <div className="flex flex-col justify-between">
                    <div>
                      {/* Sütun Başlığı */}
                      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-muted px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#2E8B57]" />
                          <span className="text-[12px] font-medium text-text-primary">Gelirler</span>
                        </div>
                        <PillBadge tone="success">
                          Satış: {formatCurr(calc.sellPrice)}
                        </PillBadge>
                      </div>

                      {/* Gelir Kalemleri */}
                      <div className="divide-y divide-border-subtle text-[13px]">
                        {/* Satış Fiyatı */}
                        <div className="flex items-center justify-between px-4 py-3 bg-surface-accent/30 font-medium">
                          <div className="flex items-center gap-2 text-text-primary">
                            <CreditCard className="h-4 w-4 text-[#2E8B57]" />
                            <span>Ozon Satış Fiyatı</span>
                          </div>
                          <div className="text-right tabular-nums">
                            <span className="font-semibold text-[#2E8B57]">
                              {formatCurr(calc.sellPrice)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sağ Alt: Tahmini Net Kâr Dip Satırı */}
                    <div
                      className={`flex items-center justify-between border-t border-border-subtle px-4 py-3.5 font-medium ${
                        calc.netProfit >= 0 ? 'bg-[#E5F6EC]/40' : 'bg-[#FDE7E7]/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp
                          className={`h-4 w-4 ${
                            calc.netProfit >= 0 ? 'text-[#2E8B57]' : 'text-[#D14343]'
                          }`}
                        />
                        <span className="text-[13px] font-semibold text-text-primary">
                          Tahmini Net Kâr
                        </span>
                      </div>
                      <div className="text-right tabular-nums">
                        <span
                          className={`text-[15px] font-bold ${
                            calc.netProfit >= 0 ? 'text-[#2E8B57]' : 'text-[#D14343]'
                          }`}
                        >
                          {formatCurr(calc.netProfit)}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </Card>

          </div>

        </div>
      </div>
    </div>
  );
}
