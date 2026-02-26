'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          {/* Quick presets */}
          <div className="border-b sm:border-b-0 sm:border-r p-2 space-y-0.5 sm:w-[120px] shrink-0">
            <p className="text-xs font-medium text-muted-foreground mb-1 px-2">Chọn nhanh</p>
            {presets.map((preset) => (
              <Button
                key={preset.key}
                variant={activePreset === preset.key ? 'secondary' : 'ghost'}
                size="sm"
                className={cn(
                  'w-full justify-start text-xs h-7 px-2',
                  activePreset === preset.key && 'bg-primary/10 text-primary font-medium'
                )}
                onClick={() => handlePreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {/* Custom range */}
          <div className="p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Tùy chỉnh</p>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Từ ngày</Label>
                <Input
                  type="date"
                  value={value.from}
                  onChange={(e) => onChange({ ...value, from: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Đến ngày</Label>
                <Input
                  type="date"
                  value={value.to}
                  onChange={(e) => onChange({ ...value, to: e.target.value })}
                  className="h-8 text-sm"
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
