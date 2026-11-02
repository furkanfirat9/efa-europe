import React from 'react';
import { ExternalLink } from 'lucide-react';

export function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return <div className="flex size-28 shrink-0 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">Görsel yok</div>;
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className="size-28 shrink-0 rounded-md border bg-white object-contain p-1" />;
}

export function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline">
      {children} <ExternalLink className="size-3" />
    </a>
  );
}
