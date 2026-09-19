'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { tr as trDateFns } from 'date-fns/locale';
import { tr } from 'react-day-picker/locale';
import { CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import { Calendar } from '@/components/shadcn/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover';
import { cn } from '@/lib/utils';

/** "2026-09-18" ↔ yerel tarih (saat dilimi kayması olmadan). */
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
};
const toIso = (date: Date) => format(date, 'yyyy-MM-dd');

const START_MONTH = new Date(2024, 0);
const END_MONTH = new Date(new Date().getFullYear() + 1, 11);

/** shadcn tarih seçici: değer YYYY-MM-DD metni, boş metin "tarih yok" demektir. */
export function DateField({
  id,
  value,
  onChange,
  placeholder = 'Tarih seçin',
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? fromIso(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className={cn('w-full justify-start pr-8 font-normal', !selected && 'text-muted-foreground')}
          >
            <CalendarIcon />
            {selected ? format(selected, 'd MMMM yyyy', { locale: trDateFns }) : placeholder}
          </Button>
        </PopoverTrigger>
        {selected && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground"
            onClick={() => onChange('')}
            aria-label="Tarihi temizle"
          >
            <X />
          </Button>
        )}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={tr}
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={START_MONTH}
          endMonth={END_MONTH}
          onSelect={(date) => {
            if (date) onChange(toIso(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
