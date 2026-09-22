'use client';

import React, { useRef, useState } from 'react';
import { AlertCircle, FileUp, Loader2, X } from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import { cn } from '@/lib/utils';
import type { UploadItem } from '../useDocuments';
import { DOC_ACCEPT } from '../utils';

export function UploadDropzone({
  uploads,
  onFiles,
  onDismiss,
  accept = DOC_ACCEPT,
  hint = 'PDF veya görsel, dosya başına en fazla 4 MB. Bilgiler otomatik okunur, onayınızdan sonra kaydedilir.',
}: {
  uploads: UploadItem[];
  onFiles: (files: File[]) => void;
  onDismiss: (key: string) => void;
  accept?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50',
          dragging && 'border-primary bg-muted/50'
        )}
      >
        <FileUp className="size-6 text-muted-foreground" />
        <div className="text-sm font-medium">Faturaları sürükleyip bırakın ya da seçin</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className="space-y-1.5">
          {uploads.map((u) => (
            <li
              key={u.key}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
                u.state === 'error' && 'border-destructive/40 text-destructive'
              )}
            >
              {u.state === 'error' ? (
                <AlertCircle className="size-4 shrink-0" />
              ) : (
                <Loader2 className={cn('size-4 shrink-0 text-muted-foreground', u.state === 'reading' && 'animate-spin')} />
              )}
              <span className="truncate font-medium">{u.name}</span>
              <span className={cn('ml-auto shrink-0 text-xs', u.state !== 'error' && 'text-muted-foreground')}>
                {u.state === 'waiting' ? 'Sırada' : u.state === 'reading' ? 'Okunuyor…' : u.error}
              </span>
              {u.state === 'error' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  onClick={() => onDismiss(u.key)}
                  aria-label="Hatayı kapat"
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
