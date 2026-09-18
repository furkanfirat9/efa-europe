'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  ArrowRight,
  Layers,
  Check,
  Globe,
  TrendingUp,
  ShieldCheck,
  SlidersHorizontal,
  ChevronDown,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { AmazonProductItem } from '@/lib/amazon/types';

const POPULAR_BRANDS = [
  { name: 'Philips', icon: '⚡', category: 'kitchen' },
  { name: 'Tefal', icon: '🍳', category: 'kitchen' },
  { name: 'Bosch', icon: '⚙️', category: 'kitchen' },
  { name: 'Braun', icon: '🪒', category: 'personal_care' },
  { name: 'WMF', icon: '✨', category: 'kitchen' },
  { name: "De'Longhi", icon: '☕', category: 'kitchen' },
];

const TARGET_CATEGORIES = [
  { id: 'all', name: '🌟 Tüm Kategoriler (Mutfak, Kişisel Bakım, Anne & Bebek - Hepsi Karışık)' },
  { id: 'kitchen', name: '🍳 Mutfak, Sofra & Ev Aletleri (Airfryer, Kahve, Süpürge, Çatal-Bıçak, Tencere)' },
  { id: 'personal_care', name: '🪒 Kişisel Bakım & Güzellik (Sonicare, Tıraş, Epilatör, Saç Şekillendirici)' },
  { id: 'baby', name: '🍼 Anne & Bebek (Avent Biberon, Göğüs Pompası, Sterilizatör)' },
];

export default function AmazonHunterPage() {
  const router = useRouter();

  // Form State
  const [selectedBrand, setSelectedBrand] = useState('Philips');
  const [customKeyword, setCustomKeyword] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [maxPages, setMaxPages] = useState<number>(1);
  const [maxItems, setMaxItems] = useState<number>(5); // Varsayılan 5 ürün canlı test
  const [maxPriceEur, setMaxPriceEur] = useState<number>(550);
  const [hideExistingOzon, setHideExistingOzon] = useState<boolean>(true); // Mükerrer Ozon koruması
  const [customUrl, setCustomUrl] = useState('');

  // Execution State
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [products, setProducts] = useState<AmazonProductItem[]>([]);

  // Selection & Stats
  const selectedCount = products.filter((p) => p.selected).length;
  const totalBuyEur = products
    .filter((p) => p.selected)
    .reduce((acc, curr) => acc + (curr.buyPriceNum || 0), 0);
  const totalOzonEur = products
    .filter((p) => p.selected)
    .reduce((acc, curr) => acc + curr.ozonPrice, 0);

  // Amazon Tarayıcıyı Çalıştır
  const handleStartCrawl = async () => {
    setIsScanning(true);
    setScanError(null);

    try {
      const response = await fetch('/api/amazon/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: customKeyword.trim() || selectedBrand,
          category: selectedCategory,
          maxPages,
          maxItems,
          maxPriceEur,
          hideExistingOzon,
          customUrl: customUrl.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Tarama sırasında bir hata oluştu.');
      }

      setProducts(data.items || []);
    } catch (err: any) {
      setScanError(err.message || 'Amazon sunucularına bağlanırken hata oluştu.');
    } finally {
      setIsScanning(false);
    }
  };

  // Tümünü Seç / Kaldır
  const toggleSelectAll = (select: boolean) => {
    setProducts((prev) => prev.map((p) => ({ ...p, selected: select })));
  };

  // Tekil Seçim
  const toggleSelectItem = (asin: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.asin === asin ? { ...p, selected: !p.selected } : p))
    );
  };

  // Fiyat Düzenleme
  const updatePrice = (asin: string, newPrice: number) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.asin === asin
          ? {
              ...p,
              ozonPrice: newPrice,
              ozonOldPrice: Math.round(newPrice * 1.2),
            }
          : p
      )
    );
  };

  // Transfer ve Galeri Toplama Durumu
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferProgress, setTransferProgress] = useState<{ current: number; total: number } | null>(null);

  // Seçilen Ürünleri Toplu Yükleme Sayfasına Aktar (Tüm Galeri Görselleriyle Birlikte)
  const handleSendToBulkUpload = async () => {
    const selectedItems = products.filter((p) => p.selected);
    if (selectedItems.length === 0) return;

    setIsTransferring(true);
    setTransferProgress({ current: 0, total: selectedItems.length });

    try {
      // Her ASIN için 6-10 adet yüksek çözünürlüklü galeri görselini çek
      const itemsWithGalleries = await Promise.all(
        selectedItems.map(async (item, idx) => {
          let gallery = item.galleryImages || [];
          if (gallery.length <= 1 && item.asin) {
            try {
              const res = await fetch('/api/amazon/gallery', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asin: item.asin, fallbackImage: item.imageUrl }),
              });
              const data = await res.json();
              if (data.success && Array.isArray(data.images) && data.images.length > 0) {
                gallery = data.images;
              }
            } catch (err) {
              console.warn(`Gallery fetch failed for ${item.asin}:`, err);
            }
          }

          setTransferProgress((prev) => ({
            current: (prev?.current || 0) + 1,
            total: selectedItems.length,
          }));

          return {
            modelNo: String(item.modelCode || item.asin || `${item.brand || 'SKU'}-${idx + 1}`).trim().slice(0, 45),
            brand: item.brand,
            title: item.title,
            asin: item.asin,
            price: item.ozonPrice.toString(),
            oldPrice: item.ozonOldPrice.toString(),
            image: gallery[0] || item.imageUrl,
            galleryImages: gallery.length > 0 ? gallery : [item.imageUrl],
          };
        })
      );

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('AMAZON_TRANSFER_ITEMS', JSON.stringify(itemsWithGalleries));
        router.push('/toplu-yukle?source=amazon');
      }
    } catch (err: any) {
      console.error('Transfer error:', err);
    } finally {
      setIsTransferring(false);
      setTransferProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Üst Başlık Barı */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shadow-sm">
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    Amazon Otonom Ürün Avcısı
                    <span className="text-xs font-semibold px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      Canlı Keşif & Ozon Aktarımı
                    </span>
                  </h1>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Amazon.de üzerindeki stoklu marka ürünlerini reklamsız tara, 3x tam sayı fiyatla Ozon formatına aktar.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/toplu-yukle"
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
              >
                <Layers className="w-4 h-4 text-blue-600" />
                Toplu Yükleme Masası
              </Link>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Güvenlik & Kural Rozetleri */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Sadece Amazon.de Satıcılı</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">3. taraf pazar yeri satıcıları ve 2. el ürünler elenir.</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 mt-0.5">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">3.45 Katı (3x + %15) Tam Sayı</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Ozon USD kur farkı tamponuyla virgülsüz tam sayı hesaplanır.</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600 mt-0.5">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Anti-Sponsorlu Reklam</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Cosori, Ninja vb. yabancı reklamlar %100 temizlenir.</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600 mt-0.5">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Cybinka (PL) Oturumu</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Depo konumuna göre anlık stok ve net alış maliyeti.</p>
            </div>
          </div>
        </div>

        {/* Ana Arama ve Tarama Kontrol Kartı */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                1. Popüler Marka Seçimi
              </label>
              <span className="text-xs text-slate-400">Tek tıkla hazır filtre</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {POPULAR_BRANDS.map((b) => (
                <button
                  key={b.name}
                  onClick={() => {
                    setSelectedBrand(b.name);
                    setCustomKeyword('');
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all relative ${
                    selectedBrand === b.name && !customKeyword
                      ? 'border-blue-600 bg-blue-50/70 text-blue-900 shadow-sm ring-1 ring-blue-500'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="text-xl mb-1">{b.icon}</div>
                  <div className="font-bold text-sm">{b.name}</div>
                  {selectedBrand === b.name && !customKeyword && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-blue-600" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            {/* Özel Arama */}
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Özel Marka / Model / Kelime
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Örn: Philips LatteGo veya Tefal Ingenio"
                  value={customKeyword}
                  onChange={(e) => setCustomKeyword(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Hedef Kategori */}
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Hedef Kategori Alanı
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors cursor-pointer"
              >
                {TARGET_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sayfa ve Tavan Fiyat */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                  Ürün Adedi Limiti
                </label>
                <select
                  value={maxItems}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setMaxItems(val);
                    setMaxPages(val <= 24 ? 1 : Math.ceil(val / 24));
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors cursor-pointer font-medium"
                >
                  <option value={5}>🎯 5 Ürün (Canlı Test Sınırı)</option>
                  <option value={10}>10 Ürün</option>
                  <option value={24}>1 Sayfa (~24 Ürün)</option>
                  <option value={48}>2 Sayfa (~48 Ürün)</option>
                  <option value={72}>3 Sayfa (~72 Ürün)</option>
                  <option value={96}>4 Sayfa (~96 Ürün)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                  Max Alış (€)
                </label>
                <input
                  type="number"
                  value={maxPriceEur}
                  onChange={(e) => setMaxPriceEur(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* İleri Düzey URL Alanı */}
          <div className="pt-1">
            <details className="text-xs text-slate-500 cursor-pointer">
              <summary className="hover:text-slate-800 transition-colors font-medium">
                🔗 İleri Düzey: Doğrudan Amazon Arama Linki (URL) Yapıştırmak İstiyorum
              </summary>
              <div className="mt-2.5">
                <input
                  type="text"
                  placeholder="https://www.amazon.de/s?k=philips..."
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>
            </details>
          </div>

          {/* Çalıştır ve Mükerrer Filtresi */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 transition-colors">
              <input
                type="checkbox"
                checked={hideExistingOzon}
                onChange={(e) => setHideExistingOzon(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Ozon'da Yüklü Olanları Otomatik Ayıkla (Mükerrer Koruması)</span>
            </label>

            <button
              onClick={handleStartCrawl}
              disabled={isScanning}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2.5 text-sm"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Amazon Taranıyor...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Amazon Fırsatlarını Canlı Tara
                </>
              )}
            </button>
          </div>

          {scanError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}
        </div>

        {/* Sonuç Tablosu */}
        {products.length > 0 && (
          <div className="space-y-4">
            {/* İstatistik ve Aksiyon Çubuğu */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block uppercase">Bulunan Ürün</span>
                  <span className="text-lg font-bold text-slate-900">{products.length} Adet</span>
                </div>
                <div className="border-l border-slate-200 pl-4 sm:pl-6">
                  <span className="text-[11px] font-semibold text-slate-500 block uppercase">Seçilen</span>
                  <span className="text-lg font-bold text-blue-600">{selectedCount} Adet</span>
                </div>
                <div className="border-l border-slate-200 pl-4 sm:pl-6">
                  <span className="text-[11px] font-semibold text-slate-500 block uppercase">Toplam Alış (€)</span>
                  <span className="text-lg font-bold text-slate-700">{totalBuyEur.toFixed(2)} €</span>
                </div>
                <div className="border-l border-slate-200 pl-4 sm:pl-6">
                  <span className="text-[11px] font-semibold text-slate-500 block uppercase">Tahmini Ozon Satış (3x)</span>
                  <span className="text-lg font-bold text-emerald-600">{totalOzonEur} €</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => toggleSelectAll(selectedCount !== products.length)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-sm"
                >
                  {selectedCount === products.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                </button>

                <button
                  onClick={handleSendToBulkUpload}
                  disabled={selectedCount === 0 || isTransferring}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {isTransferring ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Galeri Görselleri Toplanıyor ({transferProgress?.current || 0}/{transferProgress?.total || selectedCount})...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      Seçilen {selectedCount} Ürünü (Galeriyle) Ozon Masasına Aktar
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Excel Tarzı Tablo */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      <th className="p-3.5 w-10 text-center">#</th>
                      <th className="p-3.5 w-16">Görsel</th>
                      <th className="p-3.5 w-32">ASIN</th>
                      <th className="p-3.5 w-32">Model No</th>
                      <th className="p-3.5">Ürün Başlığı (Amazon.de)</th>
                      <th className="p-3.5 w-28">Amazon Alış</th>
                      <th className="p-3.5 w-32">Ozon Satış (3x)</th>
                      <th className="p-3.5 w-28">Eski Liste</th>
                      <th className="p-3.5 w-20 text-center">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {products.map((item) => (
                      <tr
                        key={item.asin}
                        className={`hover:bg-slate-50 transition-colors ${
                          item.selected ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <td className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={!!item.selected}
                            onChange={() => toggleSelectItem(item.asin)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3.5">
                          <a
                            href={item.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block relative group w-12 h-12 bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm"
                          >
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-full object-contain p-0.5 group-hover:scale-110 transition-transform"
                            />
                            <span className="absolute bottom-0 right-0 bg-emerald-600 text-[9px] text-white px-1 font-bold rounded-tl">
                              200
                            </span>
                          </a>
                        </td>
                        <td className="p-3.5 font-mono font-semibold text-slate-800">
                          <a
                            href={`https://www.amazon.de/dp/${item.asin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 flex items-center gap-1 group"
                          >
                            {item.asin}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </td>
                        <td className="p-3.5 font-semibold text-slate-900">{item.modelCode}</td>
                        <td className="p-3.5 max-w-md font-medium text-slate-800 truncate" title={item.title}>
                          {item.title}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-600">{item.buyPriceStr}</td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1 w-24 shadow-sm focus-within:border-blue-500">
                            <input
                              type="number"
                              value={item.ozonPrice}
                              onChange={(e) => updatePrice(item.asin, Number(e.target.value))}
                              className="w-full bg-transparent text-emerald-600 font-bold focus:outline-none text-right"
                            />
                            <span className="text-[10px] text-slate-400 font-bold">€</span>
                          </div>
                        </td>
                        <td className="p-3.5 font-mono text-slate-400 line-through">
                          {item.ozonOldPrice} €
                        </td>
                        <td className="p-3.5 text-center">
                          {item.isAlreadyInOzon ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"
                              title={item.ozonDuplicateReason || "Ozon'da zaten mevcut"}
                            >
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Ozon'da Yüklü
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <Check className="w-2.5 h-2.5" />
                              Yeni Ürün
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
