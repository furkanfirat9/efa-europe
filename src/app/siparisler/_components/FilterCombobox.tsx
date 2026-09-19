'use client';

import React, { useState } from 'react';
import { Check, PlusCircle } from 'lucide-react';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/shadcn/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover';
import { Separator } from '@/components/shadcn/separator';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
  /** Seçeneğin altında gösterilen ikinci satır (örn. ürün adı). */
  description?: string;
  count?: number;
  dotClassName?: string;
}

/**
 * shadcn veri tablosu örneğindeki "faceted filter"ın tek seçimli hâli.
 * `all` değeri filtre yok demektir.
 */
export function FilterCombobox({
  title,
  value,
  onChange,
  options,
  searchable = true,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value !== 'all' ? options.find((o) => o.value === value) : undefined;

  const select = (next: string) => {
    onChange(next === value ? 'all' : next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircle />
          {title}
          {selected && (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <Badge variant="secondary" className="max-w-40 rounded-sm px-1 font-normal">
                <span className="truncate">{selected.label}</span>
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          {searchable && <CommandInput placeholder={`${title} ara…`} />}
          <CommandList>
            <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.description ?? ''} ${option.value}`}
                    onSelect={() => select(option.value)}
                  >
                    <div
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-full border',
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input [&_svg]:invisible'
                      )}
                    >
                      <Check className="size-3" />
                    </div>
                    {option.dotClassName && <span className={cn('size-2 shrink-0 rounded-full', option.dotClassName)} />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{option.label}</div>
                      {option.description && (
                        <div className="truncate text-xs text-muted-foreground">{option.description}</div>
                      )}
                    </div>
                    {option.count !== undefined && (
                      <span className="ml-auto font-mono text-xs text-muted-foreground">{option.count}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => select('all')} className="justify-center text-center">
                    Filtreyi temizle
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
