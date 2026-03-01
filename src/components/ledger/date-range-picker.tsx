'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ViDateInput } from '@/components/ui/vi-date-input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarDays } from 'lucide-react';
import {
  cn,
  formatDate,
  getTodayISO,
  getYesterdayISO,
  getDayBeforeYesterdayISO,
  getThisWeekStartISO,
  getLastWeekStartISO,
  getLastWeekEndISO,
  getThisMonthStartISO,
  getLastMonthStartISO,
  getLastMonthEndISO,
} from '@/lib/utils';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

interface Preset {
  key: string;
  label: string;
  getRange: () => DateRange;
}

const presets: Preset[] = [
  {
    key: 'today',
    label: 'Hôm nay',
    getRange: () => { const d = getTodayISO(); return { from: d, to: d }; },
  },
  {
    key: 'yesterday',
    label: 'Hôm qua',
    getRange: () => { const d = getYesterdayISO(); return { from: d, to: d }; },
  },
  {
    key: 'day-before',
    label: 'Hôm kia',
    getRange: () => { const d = getDayBeforeYesterdayISO(); return { from: d, to: d }; },
  },
  {
    key: 'this-week',
    label: 'Tuần này',
    getRange: () => ({ from: getThisWeekStartISO(), to: getTodayISO() }),
  },
  {
    key: 'last-week',
    label: 'Tuần trước',
    getRange: () => ({ from: getLastWeekStartISO(), to: getLastWeekEndISO() }),
  },
  {
    key: 'this-month',
    label: 'Tháng này',
    getRange: () => ({ from: getThisMonthStartISO(), to: getTodayISO() }),
  },
  {
    key: 'last-month',
    label: 'Tháng trước',
    getRange: () => ({ from: getLastMonthStartISO(), to: getLastMonthEndISO() }),
  },
];

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
  disabled?: boolean;
}

export function DateRangePicker({ value, onChange, className, disabled }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const activePreset = useMemo(() => {
    return presets.find(p => {
      const r = p.getRange();
      return r.from === value.from && r.to === value.to;
    })?.key ?? null;
  }, [value]);

  const handlePreset = (preset: Preset) => {
    onChange(preset.getRange());
    setOpen(false);
  };

  const displayLabel = useMemo(() => {
    if (activePreset) {
      return presets.find(p => p.key === activePreset)!.label;
    }
    if (value.from && value.to) {
      if (value.from === value.to) {
        return formatDate(value.from);
      }
      return `${formatDate(value.from)} – ${formatDate(value.to)}`;
    }
    return 'Chọn thời gian';
  }, [value, activePreset]);

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start text-left font-normal w-full',
            !value.from && 'text-muted-foreground',
            disabled && 'opacity-60 cursor-not-allowed',
            className
          )}
          title={disabled ? 'Bạn không có quyền xem ngày khác' : undefined}
        >
          <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{displayLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(calc(100vw-2rem),300px)]" align="start">
        <div className="flex flex-col">
          {/* Quick presets - chip style */}
          <div className="p-2.5 border-b">
            <p className="text-xs font-medium text-muted-foreground mb-2">Chọn nhanh</p>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                    activePreset === preset.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          {/* Custom range */}
          <div className="p-2.5 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Tùy chỉnh</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Từ ngày</Label>
                <ViDateInput
                  value={value.from}
                  onChange={(v) => onChange({ ...value, from: v })}
                  className="h-8 text-xs px-2"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Đến ngày</Label>
                <ViDateInput
                  value={value.to}
                  onChange={(v) => onChange({ ...value, to: v })}
                  className="h-8 text-xs px-2"
                />
              </div>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Áp dụng
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
