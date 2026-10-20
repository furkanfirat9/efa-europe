'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, ChevronRight, Circle } from 'lucide-react';
import { Badge } from '@/components/shadcn/badge';
import { Skeleton } from '@/components/shadcn/skeleton';
import type { DashboardTodo } from '@/lib/dashboard/todos';
import { cn } from '@/lib/utils';
import { SectionHeading } from './shared';
import { useDashboardData } from './useDashboardData';

/** Amazon'daki "Actions" listesi gibi: bekleyen işlerin sayısı, her satır ilgili sayfayı açar. */
export function ActionsList() {
  const { data, error } = useDashboardData<{ items: DashboardTodo[] }>('/api/dashboard/yapilacaklar', { intervalMs: 2 * 60 * 1000 });
  const items = data?.items ?? [];
  const open = items.filter((t) => t.count > 0).length;

  return (
    <section className="space-y-1">
      <SectionHeading
        title="Yapılacaklar"
        aside={
          data && (
            <Badge variant="outline" className="font-normal">
              <span className={cn('size-1.5 rounded-full', open ? 'bg-orange-500' : 'bg-emerald-500')} />
              {open ? `${open} iş` : 'Hepsi tamam'}
            </Badge>
          )
        }
      />
      {error && !data ? (
        <p className="py-2 text-sm text-muted-foreground">{error}</p>
      ) : !data ? (
        [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="my-2 h-8" />)
      ) : (
        <div className="divide-y">
          {items.map((t) => {
            const Icon = t.count === 0 ? CheckCircle2 : t.urgent ? AlertCircle : Circle;
            return (
              <Link
                key={t.key}
                href={t.href}
                className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60"
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0',
                    t.count === 0 ? 'text-muted-foreground/50' : t.urgent ? 'text-orange-600' : 'text-muted-foreground'
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className={cn('text-sm', t.count === 0 && 'text-muted-foreground')}>{t.label}</div>
                  {t.count > 0 && t.note && <div className="truncate text-xs text-muted-foreground">{t.note}</div>}
                </div>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    t.count === 0 ? 'text-muted-foreground/60' : t.urgent ? 'text-orange-600' : 'text-foreground'
                  )}
                >
                  {t.count}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
