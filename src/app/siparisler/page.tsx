'use client';

import React, { Suspense } from 'react';
import {
  Package,
  AlertCircle,
  X,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronDown,
  Check,
} from 'lucide-react';
import { useOrders } from './useOrders';
import { OrderKpiCards } from './_components/OrderKpiCards';
import { OrderTableRow } from './_components/OrderTableRow';
import { OrderStatusDropdown } from './_components/OrderStatusDropdown';
import { OrderProductDropdown } from './_components/OrderProductDropdown';
import { OrderSupplierDropdown } from './_components/OrderSupplierDropdown';
import { OrderDetailDrawer } from './_components/OrderDetailDrawer';
import { PillBadge } from '@/components/ui/PillBadge';
import { AVAILABLE_YEARS } from './types';

function SiparislerContent() {
  const {
    orders,
    allOrdersCount,
    stats,
    totalBuyCost,
    selectedYear,
    setSelectedYear,
    selectedMonth,
    setSelectedMonth,
    availableMonths,
    loading,
    syncing,
    error,
    setError,
    successToast,
    setSuccessToast,
    statusFilter,
    setStatusFilter,
    productFilter,
    setProductFilter,
    supplierFilter,
    setSupplierFilter,
    sortField,
    sortDirection,
    toggleDateSort,
    toggleSaleSort,
    toggleBuySort,
    availableProducts,
    availableSuppliers,
    selectedOrder,
    detailModalOpen,
    setDetailModalOpen,
    detailNotes,
    setDetailNotes,
    savingDetail,
    searchTerm,
    setSearchTerm,
    handleInlineUpdate,
    handleOpenDetail,
    handleSaveDetailNotes,
  } = useOrders();

  return (
    <div className="min-h-screen bg-bg-page text-text-primary">
      {/* 1. ÜST BAR / BAŞLIK (STICKY) */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur-md">
        <div className="flex w-full items-center justify-between px-5 h-16 sm:h-18 lg:px-8">
          {/* Sol: AI Orb, Sayfa Başlığı ve Yıl/Ay Seçici */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {/* Signature AI Orb */}
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-accent to-[#A5A6F6] p-0.5 shadow-xs">
              <div className="h-full w-full rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center">
                <Package className="h-4 w-4 text-white" />
              </div>
            </div>

            <h1 className="text-xl sm:text-2xl font-normal tracking-tight text-text-primary whitespace-nowrap">
              Siparişler
            </h1>

            {/* Yıl ve Ay Seçici (Pill Group) */}
            <div className="inline-flex items-center rounded-full bg-white border border-border-subtle p-1 shadow-hairline shrink-0">
              {/* Yıl Seçici */}
              <div className="relative inline-flex items-center pl-3 pr-2">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="appearance-none cursor-pointer bg-transparent pr-5 py-1 text-xs font-medium text-text-primary focus:outline-none"
                >
                  {AVAILABLE_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-text-muted" />
              </div>

              <div className="h-3.5 w-px bg-border-subtle" />

              {/* Ay Seçici */}
              <div className="relative inline-flex items-center pl-2.5 pr-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="appearance-none cursor-pointer bg-transparent pr-5 py-1 text-xs font-medium text-text-primary focus:outline-none"
                >
                  {availableMonths.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-text-muted" />
              </div>
            </div>
          </div>

          {/* Sağ: Arama ve Senkronizasyon Durumu */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Tabloda ara…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-36 sm:w-56 rounded-full border border-border-subtle bg-white pl-8 pr-7 text-xs text-text-primary placeholder:text-text-muted shadow-hairline focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 text-text-muted hover:text-text-primary p-0.5 rounded-full hover:bg-surface-muted transition-colors cursor-pointer"
                  title="Aramayı temizle"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {syncing && (
              <PillBadge tone="info" dot className="animate-pulse shadow-xs">
                Güncelleniyor…
              </PillBadge>
            )}
          </div>
        </div>
      </header>

      {/* 2. ANA İÇERİK ALANI */}
      <main className="w-full space-y-5 px-5 py-6 sm:pb-16 lg:px-8">
        {/* HATA BİLDİRİMİ */}
        {error && (
          <div className="flex items-center justify-between rounded-[20px] border border-[#FDE7E7] bg-[#FDE7E7]/60 px-4 py-3 text-xs text-[#D14343] shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#D14343]" />
              <span className="font-medium">{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-[#D14343]/70 hover:text-[#D14343] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* BENTO KPI KARTLARI */}
        <OrderKpiCards
          stats={stats}
          ordersCount={allOrdersCount || orders.length}
          activeFilter={statusFilter}
          onSelectFilter={setStatusFilter}
          totalBuyCost={totalBuyCost}
        />

        {/* ANA SİPARİŞ TABLOSU KARTI */}
        <div className="rounded-[28px] border border-slate-100 bg-white shadow-hairline p-2.5 sm:p-3.5">
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
            <table className="w-full text-center text-sm border-collapse table-fixed min-w-[1250px]">
              <colgroup>
                {/* 1. # */}
                <col className="w-[45px]" style={{ width: '45px' }} />
                {/* 2. SİPARİŞ TARİHİ */}
                <col style={{ width: 'calc((100% - 275px) / 10)' }} />
                {/* 3. GÖNDERİ NO (155px: Kırpılma/truncate olmadan tam sığar) */}
                <col className="w-[155px]" style={{ width: '155px' }} />
                {/* 4. GÖRSEL */}
                <col style={{ width: 'calc((100% - 275px) / 10)' }} />
                {/* 5. ÜRÜN */}
                <col style={{ width: 'calc((100% - 275px) / 10)' }} />
                {/* 6. ALIŞ ₺ */}
                <col style={{ width: 'calc((100% - 275px) / 10)' }} />
                {/* 7. SATIŞ ₺ */}
                <col style={{ width: 'calc((100% - 275px) / 10)' }} />
                {/* 8. KART */}
                <col style={{ width: 'calc((100% - 275px) / 10)' }} />
                {/* 9. TEDARİK */}
                <col style={{ width: 'calc((100% - 275px) / 10)' }} />
                {/* 10. SİPARİŞ NO */}
                <col style={{ width: 'calc((100% - 275px) / 10)' }} />
                {/* 11. BELGE */}
                <col style={{ width: 'calc((100% - 275px) / 10)' }} />
                {/* 12. DURUM */}
                <col style={{ width: 'calc((100% - 275px) / 10)' }} />
                {/* 13. İŞLEMLER (75px: Köşe sıkışmasını önleyen rahat genişlik ve sağ pay) */}
                <col className="w-[75px]" style={{ width: '75px' }} />
              </colgroup>
              {/* Tablo Başlığı: Koyu ve Net Referans Başlık Satırı */}
              <thead>
                <tr className="bg-[#111215] text-zinc-200 text-[12px] font-semibold tracking-wide border-b border-zinc-800 select-none">
                  <th className="py-3.5 px-2 text-center align-middle text-zinc-400 font-semibold w-[45px]">
                    <div className="flex items-center justify-center">#</div>
                  </th>
                  <th className="py-3.5 px-3 text-center align-middle whitespace-nowrap">
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        onClick={toggleDateSort}
                        className="inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-zinc-200 hover:text-white font-semibold group"
                        title="Sipariş tarihine göre sırala (Eskiden yeniye / Yeniden eskiye)"
                      >
                        <span>SİPARİŞ TARİHİ</span>
                        {sortField === 'date' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-white stroke-[2.5]" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-white stroke-[2.5]" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-zinc-400 group-hover:text-white" />
                        )}
                      </button>
                    </div>
                  </th>
                  <th className="py-3.5 px-2 text-center align-middle whitespace-nowrap font-semibold text-zinc-200 w-[160px]">
                    <div className="flex items-center justify-center">GÖNDERİ NO</div>
                  </th>
                  <th className="py-3.5 px-2 text-center align-middle font-semibold text-zinc-200">
                    <div className="flex items-center justify-center">GÖRSEL</div>
                  </th>
                  <th className="py-3.5 px-3 text-center align-middle whitespace-nowrap relative font-semibold text-zinc-200">
                    <div className="flex items-center justify-center">
                      <OrderProductDropdown
                        productFilter={productFilter}
                        onSelectProduct={setProductFilter}
                        availableProducts={availableProducts}
                      />
                    </div>
                  </th>
                  <th className="py-3.5 px-3 text-center align-middle whitespace-nowrap">
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        onClick={toggleBuySort}
                        className="inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-zinc-200 hover:text-white font-semibold group"
                        title="Alış tutarına göre sırala (Yüksek / Düşük)"
                      >
                        <span>ALIŞ ₺</span>
                        {sortField === 'buyPrice' ? (
                          sortDirection === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 text-white stroke-[2.5]" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5 text-white stroke-[2.5]" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-zinc-400 group-hover:text-white" />
                        )}
                      </button>
                    </div>
                  </th>
                  <th className="py-3.5 px-3 text-center align-middle whitespace-nowrap">
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        onClick={toggleSaleSort}
                        className="inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-zinc-200 hover:text-white font-semibold group"
                        title="Satış tutarına göre sırala (Yüksek / Düşük)"
                      >
                        <span>SATIŞ ₺</span>
                        {sortField === 'salePrice' ? (
                          sortDirection === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 text-white stroke-[2.5]" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5 text-white stroke-[2.5]" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-zinc-400 group-hover:text-white" />
                        )}
                      </button>
                    </div>
                  </th>
                  <th className="py-3.5 px-3 text-center align-middle whitespace-nowrap font-semibold text-zinc-200">
                    <div className="flex items-center justify-center">KART</div>
                  </th>
                  <th className="py-3.5 px-3 text-center align-middle whitespace-nowrap relative font-semibold text-zinc-200">
                    <div className="flex items-center justify-center">
                      <OrderSupplierDropdown
                        supplierFilter={supplierFilter}
                        onSelectSupplier={setSupplierFilter}
                        availableSuppliers={availableSuppliers}
                      />
                    </div>
                  </th>
                  <th className="py-3.5 px-3 text-center align-middle whitespace-nowrap font-semibold text-zinc-200">
                    <div className="flex items-center justify-center">SİPARİŞ NO</div>
                  </th>
                  <th className="py-3.5 px-3 text-center align-middle whitespace-nowrap font-semibold text-zinc-200">
                    <div className="flex items-center justify-center">BELGE</div>
                  </th>
                  <th className="py-3.5 px-3 text-center align-middle whitespace-nowrap relative font-semibold text-zinc-200">
                    <div className="flex items-center justify-center">
                      <OrderStatusDropdown
                        statusFilter={statusFilter}
                        onSelectStatus={setStatusFilter}
                      />
                    </div>
                  </th>
                  <th className="py-3.5 px-2 pr-4 text-center align-middle font-semibold text-zinc-200 text-xs w-[75px]">
                    <div className="flex items-center justify-center">İŞLEMLER</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 bg-white">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={13} className="py-5 px-4 text-center text-text-muted">
                        <div className="h-4 bg-surface-muted rounded-full w-full max-w-2xl mx-auto" />
                      </td>
                    </tr>
                  ))
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-14 text-center text-text-muted">
                      <Package className="mx-auto h-9 w-9 text-text-muted/60 mb-2.5" />
                      <span className="text-sm font-medium">Avrupa mağazanızda henüz sipariş bulunamadı.</span>
                    </td>
                  </tr>
                ) : (
                  orders.map((order, idx) => (
                    <OrderTableRow
                      key={order.postingNumber || order.id}
                      order={order}
                      idx={idx}
                      onUpdate={handleInlineUpdate}
                      onOpenDetail={handleOpenDetail}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* SİPARİŞ DETAY YAN PANELİ (SLIDE-OVER DRAWER) */}
      <OrderDetailDrawer
        order={selectedOrder}
        open={detailModalOpen}
        notes={detailNotes}
        onNotesChange={setDetailNotes}
        saving={savingDetail}
        onSave={handleSaveDetailNotes}
        onClose={() => setDetailModalOpen(false)}
      />

      {/* SAĞ ÜST YÜZEN BİLDİRİM TOAST'I */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 rounded-full border border-border-subtle bg-white px-4 py-2.5 text-xs text-text-primary shadow-float animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E5F6EC] text-[#2E8B57]">
            <Check className="h-3 w-3 stroke-[2.5]" />
          </div>
          <span className="font-medium text-text-primary">{successToast}</span>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="ml-1 text-text-muted hover:text-text-primary cursor-pointer transition-colors"
            title="Kapat"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function SiparislerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg-page flex items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      }
    >
      <SiparislerContent />
    </Suspense>
  );
}
