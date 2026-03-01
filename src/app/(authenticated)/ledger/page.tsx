'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { RecordForm } from '@/components/cash-ledger/record-form';
import { useCurrentUserPermissions } from '@/hooks/use-current-user-permissions';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import {
  cn,
  formatCurrency,
  formatNumber,
  getTodayISO,
  formatDate,
  fuzzyMatch,
} from '@/lib/utils';
import { FilterSidebar } from '@/components/ledger/filter-sidebar';
import { MobileFilterSheet } from '@/components/ledger/mobile-filter-sheet';
import type { DateRange } from '@/components/ledger/date-range-picker';
import type { PaymentFilter, ActualReceivedFilter } from '@/components/ledger/filter-sidebar';

export default function LedgerPage() {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = getTodayISO();
    return { from: today, to: today };
  });
  const [collectorSearch, setCollectorSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [notesSearch, setNotesSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [actualReceivedFilter, setActualReceivedFilter] = useState<ActualReceivedFilter>('all');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [deleteRecord, setDeleteRecord] = useState<any>(null);
  const [rpaEditWarningRecord, setRpaEditWarningRecord] = useState<any>(null);

  const { hasPermission } = useCurrentUserPermissions();
  const canCreate = hasPermission('ledger', 'create');
  const canCheck = hasPermission('ledger', 'check');
  const canBulkCheck = hasPermission('ledger', 'bulk_check');
  const canDelete = hasPermission('ledger', 'delete');
  const canEditRecord = hasPermission('ledger', 'edit');
  const canViewTotal = hasPermission('ledger', 'view_total');
  const canExport = hasPermission('ledger', 'export');
  const canRpaSync = hasPermission('ledger', 'rpa_sync');
  const canSyncKiotViet = hasPermission('kiotviet', 'sync');
  const canDateFilter = hasPermission('ledger', 'date_filter');

  // Derived state
  const isSingleDay = dateRange.from === dateRange.to;

  const queryParams = useMemo(() => {
    if (isSingleDay) {
      return { date: dateRange.from };
    }
    return { startDate: dateRange.from, endDate: dateRange.to };
  }, [dateRange, isSingleDay]);

  const { data: records, isLoading, isFetching, isError, error } = trpc.cashRecords.list.useQuery(queryParams, {
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

  // Client-side filter by collector + customer name + notes
  const filteredRecords = useMemo(() => {
    if (!records) return [];
    let result = records as any[];

    if (collectorSearch.trim()) {
      result = result.filter((r: any) =>
        fuzzyMatch(r.collectorName || '', collectorSearch)
      );
    }

    if (customerSearch.trim()) {
      result = result.filter((r: any) => {
        const searchTarget = [r.customerName, r.customerCode].filter(Boolean).join(' ');
        return fuzzyMatch(searchTarget, customerSearch);
      });
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
        return true;
      });
    }

    if (actualReceivedFilter !== 'all') {
      result = result.filter((r: any) => {
        if (actualReceivedFilter === 'received') return !!r.checkActualReceived;
        if (actualReceivedFilter === 'not_received') return !r.checkActualReceived;
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
  }, [records, collectorSearch, customerSearch, notesSearch, paymentFilter, actualReceivedFilter]);

  // Tìm các record có thể trùng: cùng ngày, cùng khách hàng, chênh số tiền ≤ 2000
  const nearDuplicateIds = useMemo(() => {
    const ids = new Set<string>();
    if (!records || (records as any[]).length === 0) return ids;

    const groups = new Map<string, any[]>();
    for (const record of records as any[]) {
      const key = `${record.date}|${(record.customerName as string).toLowerCase().trim()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(record);
    }

    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (Math.abs(group[i].amount - group[j].amount) <= 2000) {
            ids.add(group[i].id);
            ids.add(group[j].id);
          }
        }
      }
    }

    return ids;
  }, [records]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (collectorSearch.trim()) count++;
    if (customerSearch.trim()) count++;
    if (notesSearch.trim()) count++;
    if (paymentFilter !== 'all') count++;
    if (actualReceivedFilter !== 'all') count++;
    return count;
  }, [collectorSearch, customerSearch, notesSearch, paymentFilter, actualReceivedFilter]);

  const utils = trpc.useUtils();

  // Pull to refresh (mobile)
  const { pullDistance, isRefreshing, isReady, progress } = usePullToRefresh({
    onRefresh: async () => {
      await utils.cashRecords.list.invalidate();
    },
  });

  const deleteMutation = trpc.cashRecords.delete.useMutation({
    onSuccess: () => {
      utils.cashRecords.list.invalidate();

      toast.success('Đã xóa bản ghi');
      setDeleteRecord(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleCheckMutation = trpc.cashRecords.toggleCheck.useMutation({
    onSuccess: () => {
      utils.cashRecords.list.invalidate();

    },
    onError: (err) => toast.error(err.message),
  });

  const bulkCheckMutation = trpc.cashRecords.bulkCheck.useMutation({
    onSuccess: (data) => {
      utils.cashRecords.list.invalidate();

      toast.success(`Đã cập nhật ${data.updated} bản ghi`);
    },
    onError: (err) => toast.error(err.message),
  });

  const markForSyncMutation = trpc.cashRecords.markForSync.useMutation({
    onSuccess: (data) => {
      utils.cashRecords.list.invalidate();
      if (data.marked > 0) {
        toast.success(`Đã gửi ${data.marked} bản ghi thanh toán KiotViet`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const retryFailedMutation = trpc.cashRecords.retryFailed.useMutation({
    onSuccess: (data) => {
      utils.cashRecords.list.invalidate();
      if (data.count > 0) {
        toast.success(`Đã gửi lại ${data.count} bản ghi thanh toán KiotViet`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const confirmCorrectedMutation = trpc.cashRecords.confirmKiotVietCorrected.useMutation({
    onSuccess: () => {
      utils.cashRecords.list.invalidate();
      toast.success('Đã xác nhận sửa KiotViet');
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRpaStatusMutation = trpc.cashRecords.updateRpaStatus.useMutation({
    onSuccess: () => {
      utils.cashRecords.list.invalidate();
      toast.success('Đã cập nhật trạng thái KiotViet');
    },
    onError: (err) => toast.error(err.message),
  });

  const syncCustomersMutation = trpc.customers.sync.useMutation({
    onSuccess: (data) => {
      utils.customers.list.invalidate();
      toast.success(`Đã đồng bộ ${data.synced} khách hàng từ KiotViet`);
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
      'Mã KH': r.customerCode || '',
      'Tên KH': r.customerName,
      'Số tiền': r.amount,
      'Người nộp': r.collectorName,
      'Người tạo': r.createdByName,
      'Ghi chú': r.notes || '',
      'Thực nhận': r.checkActualReceived ? '✓' : '',
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

  const handleBulkCheck = (field: 'checkActualReceived' | 'checkKiotVietEntered') => {
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
      checkActualCount: arr.filter((r) => r.checkActualReceived).length,
      checkKiotVietCount: arr.filter((r) => r.checkKiotVietEntered || r.rpaStatus === 'success').length,
    };
  }, [records]);

  const getRpaStatusBadge = (record: any) => {
    if (record.rpaNeedsKiotVietCorrection && !record.rpaKiotVietCorrected) {
      const origAmount = record.rpaOriginalAmount != null ? formatNumber(record.rpaOriginalAmount) : '?';
      const newAmount = formatNumber(record.amount);
      const tooltip = record.rpaOriginalAmount !== record.amount
        ? `Số tiền đã thay đổi: ${origAmount} → ${newAmount}. Cần sửa phiếu thu trong KiotViet.`
        : `Thông tin KH đã thay đổi. Cần sửa phiếu thu trong KiotViet.`;
      return (
        <Badge
          variant="outline"
          className="whitespace-nowrap text-xs text-orange-600 border-orange-400 bg-orange-50 cursor-pointer hover:bg-orange-100 hover:border-orange-500 transition-colors"
          title={tooltip + '\nClick để xác nhận đã sửa.'}
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm('Bạn đã sửa phiếu thu trên KiotViet xong chưa?\n\n' + tooltip)) {
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
          Sổ thu tiền
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
              <Button size="sm" className="hidden md:inline-flex" onClick={() => { setEditRecord(null); setShowForm(true); }}>
                <Plus className="w-4 h-4 mr-1" />
                Thêm mới
              </Button>
              {/* Mobile FAB */}
              <Button
                size="icon"
                className="md:hidden fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg z-50"
                onClick={() => { setEditRecord(null); setShowForm(true); }}
              >
                <Plus className="h-6 w-6" />
              </Button>
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
              collectorSearch={collectorSearch}
              onCollectorSearchChange={setCollectorSearch}
              customerSearch={customerSearch}
              onCustomerSearchChange={setCustomerSearch}
              notesSearch={notesSearch}
              onNotesSearchChange={setNotesSearch}
              paymentFilter={paymentFilter}
              onPaymentFilterChange={setPaymentFilter}
              actualReceivedFilter={actualReceivedFilter}
              onActualReceivedFilterChange={setActualReceivedFilter}
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
              {canSyncKiotViet && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncCustomersMutation.mutate()}
                  disabled={syncCustomersMutation.isPending}
                >
                  {syncCustomersMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-1" />
                  )}
                  <span className="hidden sm:inline">Đồng bộ công nợ</span>
                  <span className="sm:hidden">Sync</span>
                </Button>
              )}
              {canExport && (
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <Download className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Excel</span>
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
                          if (data.marked === 0 && uniqueDates.length === 1) {
                            toast.info('Không có bản ghi cần thanh toán KiotViet');
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
              {canBulkCheck && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkCheck('checkActualReceived')}
                  disabled={bulkCheckMutation.isPending}
                >
                  <CheckSquare className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Tick tất cả &quot;Thực nhận&quot;</span>
                  <span className="sm:hidden">Tick TN</span>
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
                          recordsSummary.checkActualCount === recordsSummary.totalRecords
                            ? 'border-green-300 text-green-600'
                            : ''
                        )}
                      >
                        Thực nhận {recordsSummary.checkActualCount}/{recordsSummary.totalRecords}
                      </Badge>
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
                    utils.cashRecords.list.invalidate();
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
              <Button variant="outline" onClick={() => utils.cashRecords.list.invalidate()}>
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
                      <TableHead className="font-semibold">Khách hàng</TableHead>
                      <TableHead className="font-semibold text-right">Số tiền</TableHead>
                      <TableHead className="font-semibold">Ng. nộp</TableHead>
                      <TableHead className="font-semibold">Ng. tạo</TableHead>
                      <TableHead className="font-semibold text-center w-24">KiotViet</TableHead>
                      <TableHead className="font-semibold text-center w-12" title="Thực nhận">TN</TableHead>
                      <TableHead className="font-semibold">Ghi chú</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record: any) => (
                      <TableRow
                        key={record.id}
                        className={cn(
                          canEditRecord && 'cursor-pointer hover:bg-accent/50',
                          record.rpaNeedsKiotVietCorrection && !record.rpaKiotVietCorrected && 'border-l-2 border-l-orange-400 bg-orange-50/50'
                        )}
                        onClick={canEditRecord ? () => handleEdit(record) : undefined}
                      >
                        {!isSingleDay && (
                          <TableCell className="text-sm">{formatDate(record.date)}</TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {nearDuplicateIds.has(record.id) && (
                              <span title="Cảnh báo: có thể nhập trùng — cùng khách hàng, số tiền gần tương tự trong ngày">
                                <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                              </span>
                            )}
                            <span className="font-medium text-sm">{record.customerName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-primary">
                          {formatNumber(record.amount)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{record.collectorName}</TableCell>
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
                        <TableCell
                          className="text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={record.checkActualReceived}
                            disabled={!canCheck}
                            onCheckedChange={(checked) =>
                              toggleCheckMutation.mutate({
                                id: record.id,
                                field: 'checkActualReceived',
                                value: !!checked,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                          {record.notes || ''}
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
                      canEditRecord && 'cursor-pointer hover:bg-accent/50',
                      record.rpaNeedsKiotVietCorrection && !record.rpaKiotVietCorrected && 'border-l-2 border-l-orange-400 bg-orange-50/50'
                    )}
                    onClick={canEditRecord ? () => handleEdit(record) : undefined}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {nearDuplicateIds.has(record.id) && (
                              <span title="Cảnh báo: có thể nhập trùng">
                                <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                              </span>
                            )}
                            <span className="font-medium text-sm truncate">
                              {record.customerName}
                            </span>
                            {record.rpaStatus ? getRpaStatusBadge(record) : null}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {!isSingleDay && <span>{formatDate(record.date)} ·</span>}
                            <span>{record.collectorName}</span>
                            {record.notes && (
                              <>
                                <span>·</span>
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
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Checkbox
                                checked={record.checkActualReceived}
                                disabled={!canCheck}
                                onCheckedChange={(checked) =>
                                  toggleCheckMutation.mutate({
                                    id: record.id,
                                    field: 'checkActualReceived',
                                    value: !!checked,
                                  })
                                }
                                className="h-4 w-4"
                              />
                              TN
                            </label>
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
                Bắt đầu ghi nhận tiền thu từ khách hàng
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
        collectorSearch={collectorSearch}
        onCollectorSearchChange={setCollectorSearch}
        customerSearch={customerSearch}
        onCustomerSearchChange={setCustomerSearch}
        notesSearch={notesSearch}
        onNotesSearchChange={setNotesSearch}
        paymentFilter={paymentFilter}
        onPaymentFilterChange={setPaymentFilter}
        actualReceivedFilter={actualReceivedFilter}
        onActualReceivedFilterChange={setActualReceivedFilter}
        activeFilterCount={activeFilterCount}
        datePickerDisabled={!canDateFilter}
      />

      {/* Record Form Dialog */}
      <RecordForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditRecord(null);
        }}
        editRecord={editRecord}
        defaultDate={dateRange.from || getTodayISO()}
        canEdit={canEditRecord}
        canDelete={canDelete}
        onDelete={(record) => setDeleteRecord(record)}
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
                    <p>Phiếu thanh toán đã được tạo trên KiotViet. Nếu xóa, bạn cần cập nhật/xóa phiếu thu trên web KiotViet.</p>
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
                  <p>Phiếu thanh toán đã được tạo trên KiotViet. Nếu chỉnh sửa, bạn cần cập nhật phiếu thu trên web KiotViet.</p>
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
