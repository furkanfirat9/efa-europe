'use client';

import React, { Suspense, useMemo } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { useOrders, type SortField } from './useOrders';
import { OrderKpiCards } from './_components/OrderKpiCards';
import { OrdersDataTable } from './_components/OrdersDataTable';
import { OrderDetailDrawer } from './_components/OrderDetailDrawer';
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

  const onToggleSort = useMemo<Record<SortField, () => void>>(
    () => ({ date: toggleDateSort, salePrice: toggleSaleSort, buyPrice: toggleBuySort }),
    [toggleDateSort, toggleSaleSort, toggleBuySort]
  );

  return (
    <div className="flex-1 space-y-4 bg-background p-4 pt-6 text-foreground md:p-8">
      {/* Başlık */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Siparişler</h1>
          <p className="text-muted-foreground">Avrupa mağazası siparişleri, alış maliyetleri ve tedarik takibi.</p>
        </div>
        <div className="flex items-center gap-2">
          {syncing && (
            <Badge variant="outline" className="gap-1.5">
              <Loader2 className="animate-spin" />
              Ozon ile eşitleniyor
            </Badge>
          )}
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-24" aria-label="Yıl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-32" aria-label="Ay">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="relative pr-12">
          <AlertCircle />
          <AlertTitle>Bir sorun oluştu</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 size-7"
            onClick={() => setError(null)}
            aria-label="Uyarıyı kapat"
          >
            <X />
          </Button>
        </Alert>
      )}

      <OrderKpiCards
        stats={stats}
        ordersCount={allOrdersCount || orders.length}
        activeFilter={statusFilter}
        onSelectFilter={setStatusFilter}
        totalBuyCost={totalBuyCost}
      />

      <OrdersDataTable
        orders={orders}
        loading={loading}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        productFilter={productFilter}
        onProductChange={setProductFilter}
        supplierFilter={supplierFilter}
        onSupplierChange={setSupplierFilter}
        availableProducts={availableProducts}
        availableSuppliers={availableSuppliers}
        sortField={sortField}
        sortDirection={sortDirection}
        onToggleSort={onToggleSort}
        resetKey={`${selectedYear}-${selectedMonth}`}
        onUpdate={handleInlineUpdate}
        onOpenDetail={handleOpenDetail}
      />

      <OrderDetailDrawer
        order={selectedOrder}
        open={detailModalOpen}
        notes={detailNotes}
        onNotesChange={setDetailNotes}
        saving={savingDetail}
        onSave={handleSaveDetailNotes}
        onClose={() => setDetailModalOpen(false)}
      />
    </div>
  );
}

export default function SiparislerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-background">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SiparislerContent />
    </Suspense>
  );
}
