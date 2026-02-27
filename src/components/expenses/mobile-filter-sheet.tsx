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
  notesSearch: string;
  onNotesSearchChange: (value: string) => void;
  paymentFilter: PaymentFilter;
  onPaymentFilterChange: (value: PaymentFilter) => void;
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
  notesSearch,
  onNotesSearchChange,
  paymentFilter,
  onPaymentFilterChange,
  activeFilterCount,
  datePickerDisabled,
}: MobileFilterSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl pb-safe">
        <SheetHeader className="pb-4">
          <SheetTitle>Bộ lọc</SheetTitle>
          <SheetDescription className="sr-only">
            Lọc danh sách chi phí theo ngày, loại chi, trạng thái thanh toán
          </SheetDescription>
        </SheetHeader>
        <div className="pb-40">
          <FilterSidebar
            dateRange={dateRange}
            onDateRangeChange={onDateRangeChange}
            expenseTypeSearch={expenseTypeSearch}
            onExpenseTypeSearchChange={onExpenseTypeSearchChange}
            notesSearch={notesSearch}
            onNotesSearchChange={onNotesSearchChange}
            paymentFilter={paymentFilter}
            onPaymentFilterChange={onPaymentFilterChange}
            activeFilterCount={activeFilterCount}
            asCard={false}
            datePickerDisabled={datePickerDisabled}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
