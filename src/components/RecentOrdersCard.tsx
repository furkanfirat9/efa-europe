'use client';

import React, { useMemo } from 'react';
import { Package } from 'lucide-react';
import { RecentOrder } from '@/types/analytics';
import { Panel } from '@/components/ui/Panel';
import { OrderStatus } from '@/components/OrderStatus';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';

interface RecentOrdersCardProps {
  orders: RecentOrder[];
  loading?: boolean;
}

export function RecentOrdersCard({ orders = [], loading = false }: RecentOrdersCardProps) {
  /** En yeni sipariş en üstte: listeye bakan kişinin aradığı ilk şey odur. */
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const timeA = a.inProcessAt ? new Date(a.inProcessAt).getTime() : 0;
      const timeB = b.inProcessAt ? new Date(b.inProcessAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [orders]);

  const totalRevenue = orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);

  return (
    <Panel
      title="Siparişler"
      caption={
        loading
          ? 'Yükleniyor…'
          : `${formatNumber(orders.length)} sipariş · ${formatMoney(totalRevenue)} toplam`
      }
      flush
    >
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed border-collapse">
          <thead>
            <tr className="border-b border-hairline text-2xs font-medium text-ink-subtle">
              <th className="w-[40%] px-5 py-2.5 text-left">Ürün</th>
              <th className="w-[18%] px-4 py-2.5 text-left">Sipariş</th>
              <th className="w-[18%] px-4 py-2.5 text-left">Durum</th>
              <th className="w-[10%] px-4 py-2.5 text-right">Adet</th>
              <th className="w-[14%] px-5 py-2.5 text-right">Tutar</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <tr key={index} className="border-b border-hairline last:border-b-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="skeleton h-10 w-10 shrink-0 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <div className="skeleton h-3 w-3/5" />
                        <div className="skeleton mt-2 h-2.5 w-1/4" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="skeleton h-3 w-28" />
                    <div className="skeleton mt-2 h-2.5 w-20" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="skeleton h-3 w-24" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="skeleton ml-auto h-3 w-8" />
                  </td>
                  <td className="px-5 py-3">
                    <div className="skeleton ml-auto h-3 w-14" />
                  </td>
                </tr>
              ))
            ) : sortedOrders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-16 text-center">
                  <p className="text-[13px] text-ink-muted">Bu aralıkta sipariş yok</p>
                  <p className="mt-1 text-2xs text-ink-subtle">
                    Yeni bir sipariş geldiğinde burada listelenir.
                  </p>
                </td>
              </tr>
            ) : (
              sortedOrders.map((order, index) => {
                const product = order.products?.[0];
                const extraProducts = Math.max(0, (order.products?.length || 0) - 1);
                const units =
                  order.products?.reduce((acc, item) => acc + (item.quantity || 1), 0) || 1;

                return (
                  <tr
                    key={order.postingNumber || order.orderId || index}
                    className="border-b border-hairline transition-colors last:border-b-0 hover:bg-white/2"
                  >
                    <td className="px-5 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline bg-panel-sunken">
                          {product?.primaryImage ? (
                            <img
                              src={product.primaryImage}
                              alt=""
                              className="h-full w-full object-contain p-0.5"
                              loading="lazy"
                            />
                          ) : (
                            <Package className="h-4 w-4 text-ink-faint" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p
                            className="truncate text-2xs font-medium text-ink"
                            title={product?.name}
                          >
                            {product?.name || 'Ozon ürünü'}
                            {extraProducts > 0 && (
                              <span className="ml-1.5 font-normal text-ink-subtle">
                                +{extraProducts} ürün
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 truncate text-2xs text-ink-subtle">
                            {product?.offerId || `SKU ${product?.sku ?? '—'}`}
                            {order.customerCity && ` · ${order.customerCity}`}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <p className="truncate text-2xs tabular-nums text-ink">
                        {order.postingNumber || order.orderId}
                      </p>
                      <p className="mt-0.5 text-2xs text-ink-subtle">
                        {formatDateTime(order.inProcessAt || order.shipmentDate)}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <OrderStatus status={order.status} statusName={order.statusName} />
                    </td>

                    <td className="px-4 py-3 text-right text-2xs tabular-nums text-ink-muted">
                      {formatNumber(units)}
                    </td>

                    <td className="px-5 py-3 text-right">
                      <p className="text-2xs font-semibold tabular-nums text-ink">
                        {formatMoney(order.totalPrice)}
                      </p>
                      {product?.price ? (
                        <p className="mt-0.5 text-2xs tabular-nums text-ink-subtle">
                          {formatMoney(product.price)} / adet
                        </p>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
