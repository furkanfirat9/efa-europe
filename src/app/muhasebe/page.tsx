import React from 'react';
import Link from 'next/link';
import { Geist } from 'next/font/google';
import { MuhasebeView } from './_components/MuhasebeView';
import { ShadcnMuhasebeView } from './_components/ShadcnMuhasebeView';

export const metadata = {
  title: 'Muhasebe | Ozon AI Studio',
};

// shadcn'in varsayılan fontu; yalnızca shadcn karşılaştırma sekmesinde kullanılır.
const geist = Geist({ subsets: ['latin', 'latin-ext'], display: 'swap' });

const VIEWS = [
  { value: 'mevcut', label: 'Mevcut tasarım' },
  { value: 'shadcn', label: 'shadcn' },
] as const;

export default async function MuhasebePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { gorunum } = await searchParams;
  const isShadcn = gorunum === 'shadcn';

  return (
    <div className={isShadcn ? `shadcn-theme flex-1 ${geist.className}` : 'flex-1'}>
      {/* Tasarım karşılaştırma sekmeleri */}
      <div className="px-4 pt-6 sm:px-6 lg:px-8">
        <nav
          aria-label="Tasarım"
          className="inline-flex items-center gap-0.5 rounded-full bg-surface-muted p-1 font-sans"
        >
          {VIEWS.map((v) => {
            const active = (v.value === 'shadcn') === isShadcn;
            return (
              <Link
                key={v.value}
                href={v.value === 'shadcn' ? '/muhasebe?gorunum=shadcn' : '/muhasebe'}
                aria-current={active ? 'page' : undefined}
                className={`h-8 rounded-full px-3.5 text-[13px] font-medium leading-8 transition-colors ${
                  active ? 'bg-ink text-ink-foreground' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {v.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {isShadcn ? <ShadcnMuhasebeView /> : <MuhasebeView />}
    </div>
  );
}
