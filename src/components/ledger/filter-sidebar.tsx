'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { DateRangePicker, type DateRange } from './date-range-picker';
import { cn } from '@/lib/utils';

interface FilterSidebarProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  collectorSearch: string;
  onCollectorSearchChange: (value: string) => void;
  customerSearch: string;
  onCustomerSearchChange: (value: string) => void;
  activeFilterCount: number;
  asCard?: boolean;
  className?: string;
}

export function FilterSidebar({
  dateRange,
  onDateRangeChange,
  collectorSearch,
  onCollectorSearchChange,
  customerSearch,
  onCustomerSearchChange,
  activeFilterCount,
  asCard = true,
  className,
}: FilterSidebarProps) {
  const content = (
    <div className={cn('space-y-4', className)}>
      {/* Date Range */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Khoảng thời gian</Label>
        <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
      </div>

      {/* Collector Search */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Người nộp</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <DebouncedInput
            value={collectorSearch}
            onChange={onCollectorSearchChange}
            placeholder="Tìm người nộp..."
            className="pl-8 h-9 text-sm"
          />
          {collectorSearch && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full w-8 hover:bg-transparent"
              onClick={() => onCollectorSearchChange('')}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Customer Search */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Khách hàng</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <DebouncedInput
            value={customerSearch}
            onChange={onCustomerSearchChange}
            placeholder="Tìm tên KH hoặc mã KH..."
            className="pl-8 h-9 text-sm"
          />
          {customerSearch && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full w-8 hover:bg-transparent"
              onClick={() => onCustomerSearchChange('')}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
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
              onCollectorSearchChange('');
              onCustomerSearchChange('');
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
