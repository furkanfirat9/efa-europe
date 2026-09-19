'use client';

import type * as React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * shadcn/ui bildirim kutusu. Uygulamanın kökünde, `.shadcn-theme` kapsamının
 * dışında durduğu için renkler shadcn varsayılanlarıyla yedeklenir.
 * Kullanım: `import { toast } from 'sonner'; toast.success('Kaydedildi')`.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover, oklch(1 0 0))',
          '--normal-text': 'var(--popover-foreground, oklch(0.145 0 0))',
          '--normal-border': 'var(--border, oklch(0.922 0 0))',
          '--border-radius': 'var(--radius, 0.625rem)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
