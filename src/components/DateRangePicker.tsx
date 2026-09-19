'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface DateRangePickerProps {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  onChange: (startDate: string, endDate: string, presetName?: string) => void;
}

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

const DAY_NAMES = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

const PRESETS = [
  { key: 'today', label: 'Bugün' },
  { key: 'yesterday', label: 'Dün' },
  { key: '7d', label: 'Son 7 gün' },
  { key: '30d', label: 'Son 30 gün' },
] as const;

type PresetKey = (typeof PRESETS)[number]['key'];

export default function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date(startDate || Date.now()));
  const [selectedStart, setSelectedStart] = useState<string>(startDate);
  const [selectedEnd, setSelectedEnd] = useState<string>(endDate);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Props senkronizasyonu
  useEffect(() => {
    setSelectedStart(startDate);
    setSelectedEnd(endDate);
  }, [startDate, endDate]);

  const formatDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTodayStr = () => formatDateStr(new Date());

  const getDaysAgoStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return formatDateStr(d);
  };

  // Takvim günlerini hesapla
  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({ dateStr: formatDateStr(d), dayNum: prevMonthLastDay - i, isCurrentMonth: false });
    }

    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ dateStr: formatDateStr(d), dayNum: i, isCurrentMonth: true });
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ dateStr: formatDateStr(d), dayNum: i, isCurrentMonth: false });
    }

    return days;
  }, [viewMonth]);

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));

  // Tarih tıklama mantığı (aralık seçimi)
  const handleDateClick = (dateStr: string) => {
    if (!selectedStart || (selectedStart && selectedEnd)) {
      setSelectedStart(dateStr);
      setSelectedEnd('');
      setHoverDate(null);
      return;
    }

    if (dateStr < selectedStart) {
      setSelectedEnd(selectedStart);
      setSelectedStart(dateStr);
    } else {
      setSelectedEnd(dateStr);
    }
  };

  const presetRange = (preset: PresetKey): [string, string] => {
    const today = getTodayStr();
    if (preset === 'today') return [today, today];
    if (preset === 'yesterday') return [getDaysAgoStr(1), getDaysAgoStr(1)];
    if (preset === '7d') return [getDaysAgoStr(6), today];
    return [getDaysAgoStr(29), today];
  };

  const applyPreset = (preset: PresetKey) => {
    const [start, end] = presetRange(preset);
    setSelectedStart(start);
    setSelectedEnd(end);
    onChange(start, end, PRESETS.find((p) => p.key === preset)?.label);
    setIsOpen(false);
  };

  const handleApply = () => {
    if (!selectedStart) return;
    onChange(selectedStart, selectedEnd || selectedStart);
    setIsOpen(false);
  };

  /** Etkin aralık bir hazır seçime denk geliyorsa adıyla gösterilir. */
  const activePreset = useMemo(
    () => PRESETS.find((p) => {
      const [start, end] = presetRange(p.key);
      return startDate === start && endDate === end;
    })?.key,
    [startDate, endDate]
  );

  const buttonLabel = useMemo(() => {
    if (activePreset) return PRESETS.find((p) => p.key === activePreset)!.label;

    const asLabel = (value: string) => {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
    };

    if (startDate === endDate) return asLabel(startDate);
    return `${asLabel(startDate)} – ${asLabel(endDate)}`;
  }, [startDate, endDate, activePreset]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`inline-flex h-8 cursor-pointer select-none items-center gap-2 rounded-lg border px-2.5 text-2xs font-medium transition-colors ${
          isOpen
            ? 'border-hairline-strong bg-panel-raised text-ink'
            : 'border-hairline bg-panel-sunken text-ink-muted hover:border-hairline-strong hover:text-ink'
        }`}
      >
        <CalendarIcon className="h-3.5 w-3.5 text-ink-subtle" />
        <span className="tabular-nums">{buttonLabel}</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Tarih aralığı"
          className="absolute right-0 top-full z-50 mt-1.5 w-[300px] select-none rounded-panel border border-hairline-strong bg-panel p-3 shadow-[0_20px_48px_-16px_rgba(0,0,0,0.75)]"
        >
          <div className="flex flex-wrap gap-1 pb-3">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset.key)}
                className={`cursor-pointer rounded-md px-2 py-1 text-2xs font-medium transition-colors ${
                  activePreset === preset.key
                    ? 'bg-brand-soft text-brand'
                    : 'text-ink-muted hover:bg-white/5 hover:text-ink'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-hairline pt-3">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Önceki ay"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-white/5 hover:text-ink"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-2xs font-medium text-ink">
              {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Sonraki ay"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-white/5 hover:text-ink"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 text-center">
            {DAY_NAMES.map((day) => (
              <span key={day} className="py-1.5 text-2xs text-ink-faint">
                {day}
              </span>
            ))}
          </div>

          <div
            className="grid grid-cols-7 gap-y-0.5 text-center"
            onMouseLeave={() => setHoverDate(null)}
          >
            {calendarDays.map((day, index) => {
              const isStart = day.dateStr === selectedStart;
              const isEnd = day.dateStr === selectedEnd;
              const isEdge = isStart || isEnd;

              const rangeEnd = selectedEnd || (hoverDate && hoverDate > selectedStart ? hoverDate : '');
              const inRange =
                !!selectedStart && !!rangeEnd && day.dateStr > selectedStart && day.dateStr < rangeEnd;

              const isToday = day.dateStr === getTodayStr();

              let tone = day.isCurrentMonth ? 'text-ink-muted' : 'text-ink-faint';
              if (inRange) tone = 'bg-brand-soft text-ink';
              if (isEdge) tone = 'bg-brand text-white font-semibold';

              return (
                <button
                  key={`${day.dateStr}-${index}`}
                  type="button"
                  onClick={() => handleDateClick(day.dateStr)}
                  onMouseEnter={() => setHoverDate(day.dateStr)}
                  className={`relative flex h-8 cursor-pointer items-center justify-center text-2xs tabular-nums transition-colors ${tone} ${
                    isEdge ? 'rounded-md' : inRange ? '' : 'rounded-md hover:bg-white/5'
                  }`}
                >
                  {day.dayNum}
                  {isToday && !isEdge && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-brand" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
            <span className="text-2xs tabular-nums text-ink-subtle">
              {selectedStart
                ? selectedEnd && selectedEnd !== selectedStart
                  ? `${selectedStart} – ${selectedEnd}`
                  : selectedStart
                : 'Tarih seçin'}
            </span>

            <button
              type="button"
              onClick={handleApply}
              disabled={!selectedStart}
              className="cursor-pointer rounded-md bg-brand px-2.5 py-1 text-2xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
            >
              Uygula
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
