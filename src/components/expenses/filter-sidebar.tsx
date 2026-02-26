'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { DateRangePicker, type DateRange } from './date-range-picker';
import { cn } from '@/lib/utils';

export type PaymentFilter = 'all' | 'paid' | 'unpaid' | 'needs_correction';
export type ActualReceivedFilter = 'all' | 'received' | 'not_received';

interface FilterSidebarProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  expenseTypeSearch: string;
  onExpenseTypeSearchChange: (value: string) => void;
  paymentFilter: PaymentFilter;
  onPaymentFilterChange: (value: PaymentFilter) => void;
  actualReceivedFilter: ActualReceivedFilter;
  onActualReceivedFilterChange: (value: ActualReceivedFilter) => void;
  activeFilterCount: number;
  asCard?: boolean;
  className?: string;
  datePickerDisabled?: boolean;
}

const PAYMENT_OPTIONS: { value: PaymentFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'paid', label: 'Đã TT' },
  { value: 'unpaid', label: 'Chưa TT' },
  { value: 'needs_correction', label: 'KV cần sửa' },
];

const ACTUAL_RECEIVED_OPTIONS: { value: ActualReceivedFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'received', label: 'Đã chi' },
  { value: 'not_received', label: 'Chưa chi' },
];

export function FilterSidebar({
  dateRange,
  onDateRangeChange,
  expenseTypeSearch,
  onExpenseTypeSearchChange,
  paymentFilter,
  onPaymentFilterChange,
  actualReceivedFilter,
  onActualReceivedFilterChange,
  activeFilterCount,
  asCard = true,
  className,
  datePickerDisabled,
}: FilterSidebarProps) {
  const content = (
    <div className={cn('space-y-4', className)}>
      {/* Date Range */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Khoảng thời gian</Label>
        <DateRangePicker value={dateRange} onChange={onDateRangeChange} disabled={datePickerDisabled} />
      </div>

      {/* Expense Type Search */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Loại chi</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <DebouncedInput
            value={expenseTypeSearch}
            onChange={onExpenseTypeSearchChange}
            placeholder="Tìm loại chi..."
            className="pl-8 h-9 text-sm"
          />
          {expenseTypeSearch && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full w-8 hover:bg-transparent"
              onClick={() => onExpenseTypeSearchChange('')}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Payment Filter */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Thanh toán KiotViet</Label>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onPaymentFilterChange(opt.value)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                paymentFilter === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actual Received Filter */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Thực chi</Label>
        <div className="flex flex-wrap gap-1.5">
          {ACTUAL_RECEIVED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onActualReceivedFilterChange(opt.value)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                actualReceivedFilter === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active filter indicator */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-xs">
            {activeFilterCount} bộ lọc
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => {
              onExpenseTypeSearchChange('');
              onPaymentFilterChange('all');
              onActualReceivedFilterChange('all');
            }}
          >
            Xóa bộ lọc
          </Button>
        </div>
      )}
    </div>
  );

  if (!asCard) return content;

  return (
    <Card>
      <CardContent className="p-4">
        {content}
      </CardContent>
    </Card>
  );
}
