'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { FilterSidebar } from './filter-sidebar';
import type { DateRange } from './date-range-picker';

interface MobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  collectorSearch: string;
  onCollectorSearchChange: (value: string) => void;
  customerSearch: string;
  onCustomerSearchChange: (value: string) => void;
  activeFilterCount: number;
}

export function MobileFilterSheet({
  open,
  onOpenChange,
  dateRange,
  onDateRangeChange,
  collectorSearch,
  onCollectorSearchChange,
  customerSearch,
  onCustomerSearchChange,
  activeFilterCount,
}: MobileFilterSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-xl">
        <SheetHeader className="pb-4">
          <SheetTitle>Bộ lọc</SheetTitle>
          <SheetDescription className="sr-only">
            Lọc danh sách bản ghi theo ngày, người nộp, khách hàng
          </SheetDescription>
        </SheetHeader>
        <FilterSidebar
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          collectorSearch={collectorSearch}
          onCollectorSearchChange={onCollectorSearchChange}
          customerSearch={customerSearch}
          onCustomerSearchChange={onCustomerSearchChange}
          activeFilterCount={activeFilterCount}
          asCard={false}
        />
      </SheetContent>
    </Sheet>
  );
}
