'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Download,
  CheckSquare,
  Loader2,
  BookOpen,
  Bot,
  CheckCircle2,
  Circle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Filter,
  Pencil,
  Trash2,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { ExpenseForm } from '@/components/expenses/expense-form';
import { useCurrentUserPermissions } from '@/hooks/use-current-user-permissions';
import { usePeriodLock } from '@/hooks/use-period-lock';

// Lazy load ExcelImport - only loaded when user clicks import button
const ExcelImport = dynamic(
  () => import('@/components/expenses/excel-import').then(m => ({ default: m.ExcelImport })),
  { ssr: false }
);
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import {
  cn,
  formatCurrency,
  formatNumber,
  getTodayISO,
  formatDate,
  fuzzyMatch,
} from '@/lib/utils';
import { FilterSidebar } from '@/components/expenses/filter-sidebar';
import { MobileFilterSheet } from '@/components/expenses/mobile-filter-sheet';
import type { DateRange } from '@/components/expenses/date-range-picker';
import type { PaymentFilter, ActualReceivedFilter } from '@/components/expenses/filter-sidebar';

export default function ExpensesPage() {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = getTodayISO();
    return { from: today, to: today };
  });
  const [expenseTypeSearch, setExpenseTypeSearch] = useState('');
  const [creatorSearch, setCreatorSearch] = useState('');
  const [notesSearch, setNotesSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [deleteRecord, setDeleteRecord] = useState<any>(null);
  const [rpaEditWarningRecord, setRpaEditWarningRecord] = useState<any>(null);

  const { hasPermission } = useCurrentUserPermissions();
  const canCreate = hasPermission('expenses', 'create');
  const canCheck = hasPermission('expenses', 'check');
  const canBulkCheck = hasPermission('expenses', 'bulk_check');
  const canDelete = hasPermission('expenses', 'delete');
  const canEditRecord = hasPermission('expenses', 'edit');
  const canViewTotal = hasPermission('expenses', 'view_total');
  const canExport = hasPermission('expenses', 'export');
  const canImport = hasPermission('expenses', 'import');
  const canRpaSync = hasPermission('expenses', 'rpa_sync');
  const canSyncKiotViet = hasPermission('kiotviet', 'sync');
  const canDateFilter = hasPermission('expenses', 'date_filter');

  const { isDateLocked, lockDate } = usePeriodLock();
  const isCurrentViewLocked = isDateLocked(dateRange.from);

  // Derived state
  const isSingleDay = dateRange.from === dateRange.to;

  const queryParams = useMemo(() => {
    if (isSingleDay) {
      return { date: dateRange.from };
    }
    return { startDate: dateRange.from, endDate: dateRange.to };
  }, [dateRange, isSingleDay]);

  const { data: records, isLoading, isFetching, isError, error } = trpc.expenseRecords.list.useQuery(queryParams, {
    enabled: !!dateRange.from && !!dateRange.to,
    placeholderData: (previousData) => previousData,
    refetchOnMount: true,
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      if (!data) return false;
      const hasInFlight = data.some((r: any) => r.rpaStatus === 'pending' || r.rpaStatus === 'processing');
      return hasInFlight ? 10000 : false;
    },
  });

  // Loading timeout: show retry after 10 seconds of continuous loading
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (isLoading) {
      loadingTimerRef.current = setTimeout(() => setLoadingTooLong(true), 10000);
      return () => clearTimeout(loadingTimerRef.current);
    }
    setLoadingTooLong(false);
  }, [isLoading]);

  // Client-side filter by expense type name, creator, and notes
  const filteredRecords = useMemo(() => {
    if (!records) return [];
    let result = records as any[];

    if (expenseTypeSearch.trim()) {
      result = result.filter((r: any) =>
        fuzzyMatch(r.expenseTypeName || '', expenseTypeSearch)
      );
    }

    if (creatorSearch.trim()) {
      result = result.filter((r: any) =>
        fuzzyMatch(r.createdByName || '', creatorSearch)
      );
    }

    if (notesSearch.trim()) {
      result = result.filter((r: any) =>
        fuzzyMatch(r.notes || '', notesSearch)
      );
    }

    if (paymentFilter !== 'all') {
      result = result.filter((r: any) => {
        const isPaid = r.rpaStatus === 'success' || r.checkKiotVietEntered;
        const needsCorrection = r.rpaNeedsKiotVietCorrection && !r.rpaKiotVietCorrected;
        if (paymentFilter === 'paid') return isPaid && !needsCorrection;
        if (paymentFilter === 'unpaid') return !isPaid;
        if (paymentFilter === 'needs_correction') return needsCorrection;
        if (paymentFilter === 'failed') return r.rpaStatus === 'failed';
        return true;
      });
    }

    // Sort records needing KiotViet correction to the top
    result.sort((a: any, b: any) => {
      const aNeedsCorrection = a.rpaNeedsKiotVietCorrection && !a.rpaKiotVietCorrected ? 1 : 0;
      const bNeedsCorrection = b.rpaNeedsKiotVietCorrection && !b.rpaKiotVietCorrected ? 1 : 0;
      return bNeedsCorrection - aNeedsCorrection;
    });

    return result;
  }, [records, expenseTypeSearch, creatorSearch, notesSearch, paymentFilter]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (expenseTypeSearch.trim()) count++;
    if (creatorSearch.trim()) count++;
    if (notesSearch.trim()) count++;
    if (paymentFilter !== 'all') count++;
    return count;
  }, [expenseTypeSearch, creatorSearch, notesSearch, paymentFilter]);

  const utils = trpc.useUtils();

  // Pull to refresh (mobile)
  const { pullDistance, isRefreshing, isReady, progress } = usePullToRefresh({
    onRefresh: async () => {
      await utils.expenseRecords.list.invalidate();
    },
  });

  const deleteMutation = trpc.expenseRecords.delete.useMutation({
    onSuccess: () => {
      utils.expenseRecords.list.invalidate();

      toast.success('Đã xóa bản ghi');
      setDeleteRecord(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleCheckMutation = trpc.expenseRecords.toggleCheck.useMutation({
    onSuccess: () => {
      utils.expenseRecords.list.invalidate();

    },
    onError: (err) => toast.error(err.message),
  });

  const bulkCheckMutation = trpc.expenseRecords.bulkCheck.useMutation({
    onSuccess: (data) => {
      utils.expenseRecords.list.invalidate();

      toast.success(`Đã cập nhật ${data.count} chi phí`);
    },
    onError: (err) => toast.error(err.message),
  });

  const markForSyncMutation = trpc.expenseRecords.markForSync.useMutation({
    onSuccess: (data) => {
      utils.expenseRecords.list.invalidate();
      if (data.count > 0) {
        toast.success(`Đã gửi ${data.count} chi phí thanh toán KiotViet`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const retryFailedMutation = trpc.expenseRecords.retryFailed.useMutation({
    onSuccess: (data) => {
      utils.expenseRecords.list.invalidate();
      if (data.count > 0) {
        toast.success(`Đã gửi lại ${data.count} chi phí thanh toán KiotViet`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const confirmCorrectedMutation = trpc.expenseRecords.confirmKiotVietCorrected.useMutation({
    onSuccess: () => {
      utils.expenseRecords.list.invalidate();
      toast.success('Đã xác nhận sửa KiotViet');
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRpaStatusMutation = trpc.expenseRecords.updateRpaStatus.useMutation({
    onSuccess: () => {
      utils.expenseRecords.list.invalidate();
      toast.success('Đã cập nhật trạng thái KiotViet');
    },
    onError: (err) => toast.error(err.message),
  });

  const handleEdit = (record: any) => {
    if (record.rpaStatus === 'success') {
      setRpaEditWarningRecord(record);
    } else {
      setEditRecord(record);
      setShowForm(true);
    }
  };

  const handleExportExcel = async () => {
    if (!records || records.length === 0) {
      toast.error('Không có dữ liệu để xuất');
      return;
    }

    const { utils: xlsxUtils, writeFile } = await import('xlsx');
    const data = records.map((r: any, i: number) => ({
      STT: i + 1,
      Ngày: r.date,
      'Loại chi': r.expenseTypeName,
      'Số tiền': r.amount,
      'Người tạo': r.createdByName,
      'Ghi chú': r.notes || '',
      'Đã chi': r.checkActualPaid ? '✓' : '',
      KiotViet: (r.checkKiotVietEntered || r.rpaStatus === 'success') ? '✓' : '',
    }));

    const ws = xlsxUtils.json_to_sheet(data);
    const wb = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(wb, ws, 'SoTienPlus');

    // Auto column widths
    const colWidths = Object.keys(data[0]).map((key) => ({
      wch: Math.max(
        key.length,
        ...data.map((row: any) => String(row[key]).length)
      ) + 2,
    }));
    ws['!cols'] = colWidths;

    const fileName = isSingleDay
      ? `SoTienPlus_${dateRange.from}.xlsx`
      : `SoTienPlus_${dateRange.from}_${dateRange.to}.xlsx`;
    writeFile(wb, fileName);
    toast.success('Đã xuất file Excel');
  };

  // Get unique dates from current records for range-mode bulk operations
  const uniqueDates = useMemo(() => {
    if (isSingleDay) return [dateRange.from];
    if (!records) return [];
    return [...new Set((records as any[]).map((r: any) => r.date))];
  }, [records, isSingleDay, dateRange.from]);

  const handleBulkCheck = (field: 'checkActualPaid' | 'checkKiotVietEntered') => {
    uniqueDates.forEach((date) => {
      bulkCheckMutation.mutate({ date, field, value: true });
    });
  };

  // Compute RPA stats from current records
  const rpaStats = useMemo(() => {
    if (!records) return { pending: 0, processing: 0, success: 0, failed: 0, needsCorrection: 0, failedIds: [] as string[] };
    const arr = records as any[];
    const failedIds: string[] = [];
    let pending = 0, processing = 0, success = 0, failed = 0, needsCorrection = 0;
    arr.forEach((r: any) => {
      switch (r.rpaStatus) {
        case 'pending': pending++; break;
        case 'processing': processing++; break;
        case 'success': success++; break;
        case 'failed': failed++; failedIds.push(r.id); break;
      }
      if (r.rpaNeedsKiotVietCorrection && !r.rpaKiotVietCorrected) needsCorrection++;
    });
    return { pending, processing, success, failed, needsCorrection, failedIds };
  }, [records]);

  // Client-side summary (works for both single day and range)
  const recordsSummary = useMemo(() => {
    if (!records || (records as any[]).length === 0) return null;
    const arr = records as any[];
    return {
      totalAmount: arr.reduce((sum, r) => sum + (r.amount || 0), 0),
      totalRecords: arr.length,
      checkActualCount: arr.filter((r) => r.checkActualPaid).length,
      checkKiotVietCount: arr.filter((r) => r.checkKiotVietEntered || r.rpaStatus === 'success').length,
    };
  }, [records]);

  const getRpaStatusBadge = (record: any) => {
    if (record.rpaNeedsKiotVietCorrection && !record.rpaKiotVietCorrected) {
      const origAmount = record.rpaOriginalAmount != null ? formatNumber(record.rpaOriginalAmount) : '?';
      const newAmount = formatNumber(record.amount);
      const tooltip = record.rpaOriginalAmount !== record.amount
        ? `Số tiền đã thay đổi: ${origAmount} → ${newAmount}. Cần sửa phiếu chi trong KiotViet.`
        : `Thông tin KH đã thay đổi. Cần sửa phiếu chi trong KiotViet.`;
      return (
        <Badge
          variant="outline"
          className="whitespace-nowrap text-xs text-orange-600 border-orange-400 bg-orange-50 cursor-pointer hover:bg-orange-100 hover:border-orange-500 transition-colors"
          title={tooltip + '\nClick để xác nhận đã sửa.'}
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm('Bạn đã sửa phiếu chi trên KiotViet xong chưa?\n\n' + tooltip)) {
              confirmCorrectedMutation.mutate({ id: record.id });
            }
          }}
        >
          <AlertTriangle className="w-2 h-2 mr-1" />
          KV cần sửa!
        </Badge>
      );
    }

    if (!record.rpaStatus) return null;

    const badgeMap: Record<string, { className: string; icon: React.ReactNode; label: string }> = {
      pending: {
        className: 'text-yellow-600 border-yellow-300',
        icon: <Circle className="w-2 h-2 mr-1 fill-yellow-500" />,
        label: 'Chờ TT',
      },
      processing: {
        className: 'text-blue-600 border-blue-300',
        icon: <Loader2 className="w-2 h-2 mr-1 animate-spin" />,
        label: 'Đang TT...',
      },
      success: {
        className: 'text-green-600 border-green-300',
        icon: <CheckCircle2 className="w-2 h-2 mr-1" />,
        label: 'Đã TT',
      },
      failed: {
        className: 'text-red-600 border-red-300',
        icon: <AlertCircle className="w-2 h-2 mr-1" />,
        label: 'TT lỗi',
      },
    };

    const info = badgeMap[record.rpaStatus];
    if (!info) return null;

    const badge = (
      <Badge
        variant="outline"
        className={cn('whitespace-nowrap text-xs', info.className, canRpaSync && 'cursor-pointer')}
        title={record.rpaStatus === 'failed' ? record.rpaError : undefined}
      >
        {info.icon}
        {info.label}
        {canRpaSync && <Pencil className="w-2 h-2 ml-1 opacity-50" />}
      </Badge>
    );

    if (!canRpaSync) return badge;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex"
            onClick={(e) => e.stopPropagation()}
          >
            {badge}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-[160px]">
          <DropdownMenuItem
            disabled={record.rpaStatus === 'success'}
            onClick={() => updateRpaStatusMutation.mutate({ id: record.id, rpaStatus: 'success' })}
            className="text-green-600"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
            Đã thanh toán
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={record.rpaStatus === 'pending'}
            onClick={() => updateRpaStatusMutation.mutate({ id: record.id, rpaStatus: 'pending' })}
            className="text-yellow-600"
          >
            <Circle className="w-3.5 h-3.5 mr-2 fill-yellow-500" />
            Chờ thanh toán
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={record.rpaStatus === 'failed'}
            onClick={() => updateRpaStatusMutation.mutate({ id: record.id, rpaStatus: 'failed' })}
            className="text-red-600"
          >
            <AlertCircle className="w-3.5 h-3.5 mr-2" />
            Thanh toán lỗi
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              if (window.confirm('Chuyển về chế độ tick thủ công? Trạng thái thanh toán tự động sẽ bị xóa.')) {
                updateRpaStatusMutation.mutate({ id: record.id, rpaStatus: null });
              }
            }}
            className="text-muted-foreground"
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Chuyển về tick thủ công
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="space-y-4">
      {/* Pull to refresh indicator (mobile only) */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="md:hidden flex items-center justify-center overflow-hidden transition-all"
          style={{ height: pullDistance > 0 ? pullDistance : isRefreshing ? 40 : 0 }}
        >
          <div className={cn(
            'flex items-center gap-2 text-sm text-muted-foreground',
            isReady && !isRefreshing && 'text-primary font-medium'
          )}>
            {isRefreshing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang tải...</span>
              </>
            ) : (
              <>
                <RefreshCw
                  className="h-4 w-4 transition-transform"
                  style={{ transform: `rotate(${progress * 180}deg)` }}
                />
                <span>{isReady ? 'Thả để làm mới' : 'Kéo xuống để làm mới'}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
          Sổ chi tiền
          {isCurrentViewLocked && (
            <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-xs font-normal ml-1">
              <Lock className="w-3 h-3 mr-1" />
              Đã khóa sổ
            </Badge>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {/* Mobile filter button */}
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden relative"
            onClick={() => setMobileFilterOpen(true)}
          >
            <Filter className="w-4 h-4 mr-1" />
            Lọc
            {activeFilterCount > 0 && (
              <Badge variant="destructive" className="absolute -top-1.5 -right-1.5 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          {canCreate && (
            <>
              <Button size="sm" className="hidden md:inline-flex" onClick={() => { setEditRecord(null); setShowForm(true); }} disabled={isCurrentViewLocked} title={isCurrentViewLocked ? `Đã khóa sổ đến ${lockDate}` : undefined}>
                {isCurrentViewLocked ? <Lock className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                Thêm mới
              </Button>
              {/* Mobile FAB */}
              {!isCurrentViewLocked && (
                <Button
                  size="icon"
                  className="md:hidden fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg z-50"
                  onClick={() => { setEditRecord(null); setShowForm(true); }}
                >
                  <Plus className="h-6 w-6" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main layout: sidebar + content */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-6">
        {/* Desktop filter sidebar */}
        <aside className="hidden lg:block lg:col-span-3 xl:col-span-2">
          <div className="sticky top-20">
            <FilterSidebar
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              expenseTypeSearch={expenseTypeSearch}
              onExpenseTypeSearchChange={setExpenseTypeSearch}
              creatorSearch={creatorSearch}
              onCreatorSearchChange={setCreatorSearch}
              notesSearch={notesSearch}
              onNotesSearchChange={setNotesSearch}
              paymentFilter={paymentFilter}
              onPaymentFilterChange={setPaymentFilter}
              activeFilterCount={activeFilterCount}
              datePickerDisabled={!canDateFilter}
            />
          </div>
        </aside>

        {/* Content area */}
        <div className="lg:col-span-9 xl:col-span-10 space-y-4">
          {/* Actions row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Mobile: show active date label */}
            <div className="lg:hidden text-sm font-medium text-muted-foreground">
              {isSingleDay ? formatDate(dateRange.from) : `${formatDate(dateRange.from)} – ${formatDate(dateRange.to)}`}
            </div>

            <div className="flex gap-1 ml-auto">
              {canExport && (
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <Download className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Xuất</span>
                </Button>
              )}
              {canImport && (
                <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Nhập</span>
                </Button>
              )}
              {canRpaSync && false && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    uniqueDates.forEach((date) => {
                      markForSyncMutation.mutate({ date }, {
                        onSuccess: (data) => {
                          if (data.count === 0 && uniqueDates.length === 1) {
                            toast.info('Không có chi phí cần thanh toán KiotViet');
                          }
                        },
                      });
                    });
                  }}
                  disabled={markForSyncMutation.isPending}
                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  {markForSyncMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Bot className="w-4 h-4 mr-1" />
                  )}
                  <span className="hidden sm:inline">Thanh toán KV</span>
                  <span className="sm:hidden">KV</span>
                </Button>
              )}
            </div>
          </div>

          {/* Summary Card */}
          {recordsSummary && (
            <Card>
              <CardContent className="py-3 px-4">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  {canViewTotal && (
                    <div>
                      <span className="text-muted-foreground">Tổng: </span>
                      <span className="font-bold text-lg text-primary">
                        {formatCurrency(recordsSummary.totalAmount)}
                      </span>
                    </div>
                  )}
                  <div className="text-muted-foreground">
                    {recordsSummary.totalRecords} bản ghi
                  </div>
                  {canCheck && (
                    <>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          recordsSummary.checkKiotVietCount === recordsSummary.totalRecords
                            ? 'border-green-300 text-green-600'
                            : ''
                        )}
                      >
                        KiotViet {recordsSummary.checkKiotVietCount}/{recordsSummary.totalRecords}
                      </Badge>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* RPA Status Panel */}
          {records && (records as any[]).length > 0 && (rpaStats.pending > 0 || rpaStats.processing > 0 || rpaStats.failed > 0 || rpaStats.needsCorrection > 0) && (
            <Card className="border-dashed">
              <CardContent className="py-2 px-4">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-muted-foreground font-medium">KiotViet:</span>
                  {rpaStats.pending > 0 && (
                    <span className="flex items-center gap-1 text-yellow-600">
                      <Circle className="w-2 h-2 fill-yellow-500" />
                      Chờ TT: {rpaStats.pending}
                    </span>
                  )}
                  {rpaStats.processing > 0 && (
                    <span className="flex items-center gap-1 text-blue-600">
                      <Loader2 className="w-2 h-2 animate-spin" />
                      Đang TT: {rpaStats.processing}
                    </span>
                  )}
                  {rpaStats.success > 0 && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-2 h-2" />
                      OK: {rpaStats.success}
                    </span>
                  )}
                  {rpaStats.failed > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <AlertCircle className="w-2 h-2" />
                      TT lỗi: {rpaStats.failed}
                      {canRpaSync && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-xs text-red-600 hover:text-red-700"
                          onClick={() => retryFailedMutation.mutate({ ids: rpaStats.failedIds })}
                          disabled={retryFailedMutation.isPending}
                        >
                          <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                          Thử lại
                        </Button>
                      )}
                    </span>
                  )}
                  {rpaStats.needsCorrection > 0 && (
                    <span className="flex items-center gap-1 text-orange-600">
                      <AlertTriangle className="w-2 h-2" />
                      Cần sửa KV: {rpaStats.needsCorrection}!
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Records */}
          {isFetching && !isLoading && (
            <div className="h-0.5 w-full bg-primary/20 rounded overflow-hidden mb-2">
              <div className="h-full bg-primary animate-pulse w-1/2 rounded" />
            </div>
          )}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              {loadingTooLong && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">Tải dữ liệu lâu hơn bình thường...</p>
                  <Button variant="outline" size="sm" onClick={() => {
                    utils.expenseRecords.list.invalidate();
                    setLoadingTooLong(false);
                  }}>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Thử lại
                  </Button>
                </div>
              )}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg border-red-200 bg-red-50/50">
              <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
              <h3 className="font-medium mb-2">Lỗi tải dữ liệu</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {error?.message || 'Không thể tải dữ liệu. Vui lòng thử lại.'}
              </p>
              <Button variant="outline" onClick={() => utils.expenseRecords.list.invalidate()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Thử lại
              </Button>
            </div>
          ) : filteredRecords && filteredRecords.length > 0 ? (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-emerald-50 dark:bg-emerald-950/30">
                      {!isSingleDay && (
                        <TableHead className="font-semibold">Ngày</TableHead>
                      )}
                      <TableHead className="font-semibold">Loại chi</TableHead>
                      <TableHead className="font-semibold">Ghi chú</TableHead>
                      <TableHead className="font-semibold text-right">Số tiền</TableHead>
                      <TableHead className="font-semibold">Ng. tạo</TableHead>
                      <TableHead className="font-semibold text-center w-24">KiotViet</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record: any) => (
                      <TableRow
                        key={record.id}
                        className={cn(
                          canEditRecord && !isDateLocked(record.date) && 'cursor-pointer hover:bg-accent/50',
                          record.rpaNeedsKiotVietCorrection && !record.rpaKiotVietCorrected && 'border-l-2 border-l-orange-400 bg-orange-50/50'
                        )}
                        onClick={canEditRecord && !isDateLocked(record.date) ? () => handleEdit(record) : undefined}
                      >
                        {!isSingleDay && (
                          <TableCell className="text-sm">{formatDate(record.date)}</TableCell>
                        )}
                        <TableCell>
                          <span className="font-medium text-sm">{record.expenseTypeName}</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                          {record.notes || ''}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-primary">
                          {formatNumber(record.amount)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{record.createdByName}</TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          {record.rpaStatus ? (
                            getRpaStatusBadge(record)
                          ) : (
                            <Checkbox
                              checked={record.checkKiotVietEntered}
                              disabled={!canCheck}
                              onCheckedChange={(checked) =>
                                toggleCheckMutation.mutate({
                                  id: record.id,
                                  field: 'checkKiotVietEntered',
                                  value: !!checked,
                                })
                              }
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-2">
                {filteredRecords.map((record: any) => (
                  <Card
                    key={record.id}
                    className={cn(
                      'transition-colors',
                      canEditRecord && !isDateLocked(record.date) && 'cursor-pointer hover:bg-accent/50',
                      record.rpaNeedsKiotVietCorrection && !record.rpaKiotVietCorrected && 'border-l-2 border-l-orange-400 bg-orange-50/50'
                    )}
                    onClick={canEditRecord && !isDateLocked(record.date) ? () => handleEdit(record) : undefined}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm truncate">
                              {record.expenseTypeName}
                            </span>
                            {record.rpaStatus ? getRpaStatusBadge(record) : null}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {!isSingleDay && <span>{formatDate(record.date)}</span>}
                            {record.notes && (
                              <>
                                {!isSingleDay && <span>·</span>}
                                <span className="truncate">{record.notes}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-primary tabular-nums">
                            {formatNumber(record.amount)}
                          </p>
                          <div
                            className="flex items-center gap-2 mt-1 justify-end"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {!record.rpaStatus && (
                              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Checkbox
                                  checked={record.checkKiotVietEntered}
                                  disabled={!canCheck}
                                  onCheckedChange={(checked) =>
                                    toggleCheckMutation.mutate({
                                      id: record.id,
                                      field: 'checkKiotVietEntered',
                                      value: !!checked,
                                    })
                                  }
                                  className="h-4 w-4"
                                />
                                KV
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
              <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">Chưa có bản ghi nào</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Bắt đầu ghi nhận tiền thu từ loại chi
              </p>
              {canCreate && (
                <Button onClick={() => { setEditRecord(null); setShowForm(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Thêm bản ghi đầu tiên
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      <MobileFilterSheet
        open={mobileFilterOpen}
        onOpenChange={setMobileFilterOpen}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        expenseTypeSearch={expenseTypeSearch}
        onExpenseTypeSearchChange={setExpenseTypeSearch}
        creatorSearch={creatorSearch}
        onCreatorSearchChange={setCreatorSearch}
        notesSearch={notesSearch}
        onNotesSearchChange={setNotesSearch}
        paymentFilter={paymentFilter}
        onPaymentFilterChange={setPaymentFilter}
        activeFilterCount={activeFilterCount}
        datePickerDisabled={!canDateFilter}
      />

      {/* Record Form Dialog */}
      <ExpenseForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditRecord(null);
        }}
        editRecord={editRecord}
        defaultDate={getTodayISO()}
        canEdit={canEditRecord}
        canDelete={canDelete}
        onDelete={(record) => setDeleteRecord(record)}
      />

      {/* Excel Import Dialog */}
      <ExcelImport
        open={showImport}
        onOpenChange={setShowImport}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteRecord} onOpenChange={(open) => !open && setDeleteRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {deleteRecord?.rpaStatus === 'success' && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-orange-50 border border-orange-200 text-orange-800 text-xs mb-3">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-orange-500" />
                    <p>Phiếu thanh toán đã được tạo trên KiotViet. Nếu xóa, bạn cần cập nhật/xóa phiếu chi trên web KiotViet.</p>
                  </div>
                )}
                <span>Bạn có chắc chắn muốn xóa bản ghi này? Hành động này không thể hoàn tác.</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteRecord && deleteMutation.mutate({ id: deleteRecord.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* RPA Edit Warning */}
      <AlertDialog open={!!rpaEditWarningRecord} onOpenChange={(open) => !open && setRpaEditWarningRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cảnh báo chỉnh sửa</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <div className="flex items-start gap-2 p-3 rounded-md bg-orange-50 border border-orange-200 text-orange-800 text-xs mb-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-orange-500" />
                  <p>Phiếu thanh toán đã được tạo trên KiotViet. Nếu chỉnh sửa, bạn cần cập nhật phiếu chi trên web KiotViet.</p>
                </div>
                <span>Bạn có muốn tiếp tục chỉnh sửa?</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setEditRecord(rpaEditWarningRecord);
                setShowForm(true);
                setRpaEditWarningRecord(null);
              }}
            >
              Tiếp tục chỉnh sửa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
