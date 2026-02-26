'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { FilterSidebar, type PaymentFilter, type ActualReceivedFilter } from './filter-sidebar';
import type { DateRange } from './date-range-picker';

interface MobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  expenseTypeSearch: string;
  onExpenseTypeSearchChange: (value: string) => void;
  paymentFilter: PaymentFilter;
  onPaymentFilterChange: (value: PaymentFilter) => void;
  actualReceivedFilter: ActualReceivedFilter;
  onActualReceivedFilterChange: (value: ActualReceivedFilter) => void;
  activeFilterCount: number;
  datePickerDisabled?: boolean;
}

export function MobileFilterSheet({
  open,
  onOpenChange,
  dateRange,
  onDateRangeChange,
  expenseTypeSearch,
  onExpenseTypeSearchChange,
  paymentFilter,
  onPaymentFilterChange,
  actualReceivedFilter,
  onActualReceivedFilterChange,
  activeFilterCount,
  datePickerDisabled,
}: MobileFilterSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-xl">
        <SheetHeader className="pb-4">
          <SheetTitle>Bộ lọc</SheetTitle>
          <SheetDescription className="sr-only">
            Lọc danh sách chi phí theo ngày, loại chi, trạng thái thanh toán
          </SheetDescription>
        </SheetHeader>
        <FilterSidebar
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          expenseTypeSearch={expenseTypeSearch}
          onExpenseTypeSearchChange={onExpenseTypeSearchChange}
          paymentFilter={paymentFilter}
          onPaymentFilterChange={onPaymentFilterChange}
          actualReceivedFilter={actualReceivedFilter}
          onActualReceivedFilterChange={onActualReceivedFilterChange}
          activeFilterCount={activeFilterCount}
          asCard={false}
          datePickerDisabled={datePickerDisabled}
        />
      </SheetContent>
    </Sheet>
  );
}
