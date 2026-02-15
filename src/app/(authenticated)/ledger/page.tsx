'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  BookOpen,
  Bot,
  CheckCircle2,
  Circle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { RecordForm } from '@/components/cash-ledger/record-form';
import { useCurrentUserPermissions } from '@/hooks/use-current-user-permissions';
import {
  cn,
  formatCurrency,
  formatNumber,
  getTodayISO,
  getYesterdayISO,
  getDayBeforeYesterdayISO,
  formatDate,
} from '@/lib/utils';

type DateMode = 'today' | 'yesterday' | 'day-before' | 'custom' | 'range';

export default function LedgerPage() {
  const [dateMode, setDateMode] = useState<DateMode>('today');
  const [customDate, setCustomDate] = useState(getTodayISO());
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [collectorSearch, setCollectorSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { hasPermission } = useCurrentUserPermissions();
  const canCheck = hasPermission('ledger', 'check');
  const canBulkCheck = hasPermission('ledger', 'bulk_check');
  const canDelete = hasPermission('ledger', 'delete');
  const canEditRecord = hasPermission('ledger', 'edit');
  const canRpaSync = hasPermission('ledger', 'rpa_sync');
  const canSyncKiotViet = hasPermission('kiotviet', 'sync');

  // Listen for bottom nav "+" button event
  const openNewForm = useCallback(() => {
    setEditRecord(null);
    setShowForm(true);
  }, []);

  useEffect(() => {
    window.addEventListener('open-record-form', openNewForm);
    return () => window.removeEventListener('open-record-form', openNewForm);
  }, [openNewForm]);

  // Resolve the active date
  const activeDate = useMemo(() => {
    switch (dateMode) {
      case 'today':
        return getTodayISO();
      case 'yesterday':
        return getYesterdayISO();
      case 'day-before':
        return getDayBeforeYesterdayISO();
      case 'custom':
        return customDate;
      default:
        return '';
    }
  }, [dateMode, customDate]);

  // Build query params
  const queryParams = useMemo(() => {
    if (dateMode === 'range' && rangeStart && rangeEnd) {
      return { startDate: rangeStart, endDate: rangeEnd };
    }
    return { date: activeDate };
  }, [dateMode, activeDate, rangeStart, rangeEnd]);

  const { data: records, isLoading } = trpc.cashRecords.list.useQuery(queryParams, {
    enabled: dateMode === 'range' ? !!(rangeStart && rangeEnd) : !!activeDate,
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      if (!data) return false;
      const hasInFlight = data.some((r: any) => r.rpaStatus === 'pending' || r.rpaStatus === 'processing');
      return hasInFlight ? 5000 : false;
    },
  });

  const { data: summary } = trpc.cashRecords.dailySummary.useQuery(
    { date: activeDate },
    { enabled: dateMode !== 'range' && !!activeDate }
  );

  const { data: collectors } = trpc.collectors.list.useQuery();

  // Client-side filter by collector name search
  const filteredRecords = useMemo(() => {
    if (!records) return [];
    if (!collectorSearch.trim()) return records as any[];
    const search = collectorSearch.toLowerCase().trim();
    return (records as any[]).filter((r: any) =>
      r.collectorName?.toLowerCase().includes(search)
    );
  }, [records, collectorSearch]);

  const utils = trpc.useUtils();

  const deleteMutation = trpc.cashRecords.delete.useMutation({
    onSuccess: () => {
      utils.cashRecords.list.invalidate();
      utils.cashRecords.dailySummary.invalidate();
      toast.success('Đã xóa bản ghi');
      setDeleteId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleCheckMutation = trpc.cashRecords.toggleCheck.useMutation({
    onSuccess: () => {
      utils.cashRecords.list.invalidate();
      utils.cashRecords.dailySummary.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkCheckMutation = trpc.cashRecords.bulkCheck.useMutation({
    onSuccess: (data) => {
      utils.cashRecords.list.invalidate();
      utils.cashRecords.dailySummary.invalidate();
      toast.success(`Đã cập nhật ${data.updated} bản ghi`);
    },
    onError: (err) => toast.error(err.message),
  });

  const markForSyncMutation = trpc.cashRecords.markForSync.useMutation({
    onSuccess: (data) => {
      utils.cashRecords.list.invalidate();
      toast.success(`Đã đánh dấu ${data.marked} bản ghi cho RPA`);
    },
    onError: (err) => toast.error(err.message),
  });

  const retryFailedMutation = trpc.cashRecords.retryFailed.useMutation({
    onSuccess: (data) => {
      utils.cashRecords.list.invalidate();
      toast.success(`Đã gửi lại ${data.retried} bản ghi cho RPA`);
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

  const syncCustomersMutation = trpc.customers.sync.useMutation({
    onSuccess: (data) => {
      utils.customers.list.invalidate();
      toast.success(`Đã đồng bộ ${data.synced} khách hàng từ KiotViet`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleEdit = (record: any) => {
    setEditRecord(record);
    setShowForm(true);
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
      KiotViet: r.checkKiotVietEntered ? '✓' : '',
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

    const fileName = dateMode === 'range'
      ? `SoTienPlus_${rangeStart}_${rangeEnd}.xlsx`
      : `SoTienPlus_${activeDate}.xlsx`;
    writeFile(wb, fileName);
    toast.success('Đã xuất file Excel');
  };

  const handleBulkCheck = (field: 'checkActualReceived' | 'checkKiotVietEntered') => {
    if (!activeDate) return;
    bulkCheckMutation.mutate({ date: activeDate, field, value: true });
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

  const getRpaStatusBadge = (record: any) => {
    // Correction warning takes priority over RPA status
    if (record.rpaNeedsKiotVietCorrection && !record.rpaKiotVietCorrected) {
      const origAmount = record.rpaOriginalAmount != null ? formatNumber(record.rpaOriginalAmount) : '?';
      const newAmount = formatNumber(record.amount);
      const tooltip = record.rpaOriginalAmount !== record.amount
        ? `So tien da thay doi: ${origAmount} → ${newAmount}. Can sua phieu thu trong KiotViet.`
        : `Thong tin KH da thay doi. Can sua phieu thu trong KiotViet.`;
      return (
        <Badge variant="outline" className="text-xs text-orange-600 border-orange-400 bg-orange-50" title={tooltip}>
          <AlertTriangle className="w-2 h-2 mr-1" />
          KV can sua
        </Badge>
      );
    }

    if (!record.rpaStatus) return null;
    switch (record.rpaStatus) {
      case 'pending':
        return (
          <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">
            <Circle className="w-2 h-2 mr-1 fill-yellow-500" />
            RPA cho
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
            <Loader2 className="w-2 h-2 mr-1 animate-spin" />
            RPA...
          </Badge>
        );
      case 'success':
        return (
          <Badge variant="outline" className="text-xs text-green-600 border-green-300">
            <CheckCircle2 className="w-2 h-2 mr-1" />
            RPA OK
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="text-xs text-red-600 border-red-300" title={record.rpaError}>
            <AlertCircle className="w-2 h-2 mr-1" />
            RPA loi
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header — hidden on mobile since bottom nav has + button */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
          Sổ Ghi Tiền
        </h1>
        <Button size="sm" className="hidden md:inline-flex" onClick={() => { setEditRecord(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" />
          Thêm mới
        </Button>
      </div>

      {/* Date Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Button
            variant={dateMode === 'today' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateMode('today')}
          >
            Hôm nay
          </Button>
          <Button
            variant={dateMode === 'yesterday' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateMode('yesterday')}
          >
            Hôm qua
          </Button>
          <Button
            variant={dateMode === 'day-before' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateMode('day-before')}
            className="hidden sm:inline-flex"
          >
            Hôm kia
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={dateMode === 'custom' ? customDate : ''}
            onChange={(e) => {
              setCustomDate(e.target.value);
              setDateMode('custom');
            }}
            className="h-8 w-[140px] text-sm"
          />
        </div>
        {dateMode === 'range' && (
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="h-8 w-[140px] text-sm"
              placeholder="Từ"
            />
            <span className="text-muted-foreground text-sm">→</span>
            <Input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="h-8 w-[140px] text-sm"
              placeholder="Đến"
            />
          </div>
        )}
      </div>

      {/* Collector Filter + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={collectorSearch}
            onChange={(e) => setCollectorSearch(e.target.value)}
            placeholder="Lọc người nộp..."
            className="w-[150px] sm:w-[180px] h-8 text-sm pl-8"
          />
        </div>

        <div className="flex gap-1">
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
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <Download className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
          {(canBulkCheck || canRpaSync) && dateMode !== 'range' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <CheckSquare className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Tick hàng loạt</span>
                  <span className="sm:hidden">Tick</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canBulkCheck && (
                  <>
                    <DropdownMenuItem
                      onClick={() => handleBulkCheck('checkActualReceived')}
                      disabled={bulkCheckMutation.isPending}
                    >
                      Tick tất cả &quot;Thực nhận&quot;
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleBulkCheck('checkKiotVietEntered')}
                      disabled={bulkCheckMutation.isPending}
                    >
                      Tick tất cả &quot;KiotViet&quot;
                    </DropdownMenuItem>
                  </>
                )}
                {canBulkCheck && canRpaSync && <DropdownMenuSeparator />}
                {canRpaSync && (
                  <DropdownMenuItem
                    onClick={() => markForSyncMutation.mutate({ date: activeDate })}
                    disabled={markForSyncMutation.isPending}
                  >
                    <Bot className="w-4 h-4 mr-2" />
                    Đồng bộ KiotViet (RPA)
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Summary Card */}
      {summary && dateMode !== 'range' && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Tổng: </span>
                <span className="font-bold text-lg text-primary">
                  {formatCurrency(summary.totalAmount)}
                </span>
              </div>
              <div className="text-muted-foreground">
                {summary.totalRecords} bản ghi
              </div>
              {canCheck && (
                <>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      summary.checkActualCount === summary.totalRecords
                        ? 'border-green-300 text-green-600'
                        : ''
                    )}
                  >
                    Thực nhận {summary.checkActualCount}/{summary.totalRecords}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      summary.checkKiotVietCount === summary.totalRecords
                        ? 'border-green-300 text-green-600'
                        : ''
                    )}
                  >
                    KiotViet {summary.checkKiotVietCount}/{summary.totalRecords}
                  </Badge>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* RPA Status Panel */}
      {dateMode !== 'range' && records && (records as any[]).length > 0 && (rpaStats.pending > 0 || rpaStats.processing > 0 || rpaStats.failed > 0 || rpaStats.needsCorrection > 0) && (
        <Card className="border-dashed">
          <CardContent className="py-2 px-4">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-muted-foreground font-medium">RPA:</span>
              {rpaStats.pending > 0 && (
                <span className="flex items-center gap-1 text-yellow-600">
                  <Circle className="w-2 h-2 fill-yellow-500" />
                  Cho: {rpaStats.pending}
                </span>
              )}
              {rpaStats.processing > 0 && (
                <span className="flex items-center gap-1 text-blue-600">
                  <Loader2 className="w-2 h-2 animate-spin" />
                  Dang xu ly: {rpaStats.processing}
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
                  Loi: {rpaStats.failed}
                  {canRpaSync && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-xs text-red-600 hover:text-red-700"
                      onClick={() => retryFailedMutation.mutate({ ids: rpaStats.failedIds })}
                      disabled={retryFailedMutation.isPending}
                    >
                      <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                      Thu lai
                    </Button>
                  )}
                </span>
              )}
              {rpaStats.needsCorrection > 0 && (
                <span className="flex items-center gap-1 text-orange-600">
                  <AlertTriangle className="w-2 h-2" />
                  Can sua KV: {rpaStats.needsCorrection}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Records */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filteredRecords && filteredRecords.length > 0 ? (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-emerald-50 dark:bg-emerald-950/30">
                  <TableHead className="w-10 font-semibold">#</TableHead>
                  {dateMode === 'range' && (
                    <TableHead className="font-semibold">Ngày</TableHead>
                  )}
                  {canCheck && (
                    <>
                      <TableHead className="font-semibold text-center w-12" title="Thực nhận">TN</TableHead>
                      <TableHead className="font-semibold text-center w-12" title="KiotViet">KV</TableHead>
                    </>
                  )}
                  <TableHead className="font-semibold">Khách hàng</TableHead>
                  <TableHead className="font-semibold text-right">Số tiền</TableHead>
                  <TableHead className="font-semibold">Ng. tạo</TableHead>
                  <TableHead className="font-semibold">Ng. nộp</TableHead>
                  <TableHead className="font-semibold">Ghi chú</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record: any, index: number) => (
                  <TableRow
                    key={record.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => handleEdit(record)}
                  >
                    <TableCell className="text-muted-foreground text-xs">
                      {index + 1}
                    </TableCell>
                    {dateMode === 'range' && (
                      <TableCell className="text-sm">{formatDate(record.date)}</TableCell>
                    )}
                    {canCheck && (
                      <>
                        <TableCell
                          className="text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={record.checkActualReceived}
                            onCheckedChange={(checked) =>
                              toggleCheckMutation.mutate({
                                id: record.id,
                                field: 'checkActualReceived',
                                value: !!checked,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell
                          className="text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={record.checkKiotVietEntered}
                            onCheckedChange={(checked) =>
                              toggleCheckMutation.mutate({
                                id: record.id,
                                field: 'checkKiotVietEntered',
                                value: !!checked,
                              })
                            }
                          />
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{record.customerName}</span>
                        {record.customerCode && (
                          <span className="text-xs text-muted-foreground">
                            ({record.customerCode})
                          </span>
                        )}
                        {getRpaStatusBadge(record)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums text-primary">
                      {formatNumber(record.amount)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {record.createdByName}
                    </TableCell>
                    <TableCell className="text-sm">{record.collectorName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                      {record.notes || ''}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEditRecord && (
                            <DropdownMenuItem onClick={() => handleEdit(record)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Sửa
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteId(record.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Xóa
                            </DropdownMenuItem>
                          )}
                          {canRpaSync && record.rpaNeedsKiotVietCorrection && !record.rpaKiotVietCorrected && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-orange-600"
                                onClick={() => confirmCorrectedMutation.mutate({ id: record.id })}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Da sua KiotViet
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleEdit(record)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">
                          {record.customerName}
                        </span>
                        {getRpaStatusBadge(record)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                      {canCheck && (
                        <div
                          className="flex items-center gap-2 mt-1 justify-end"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Checkbox
                              checked={record.checkActualReceived}
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
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Checkbox
                              checked={record.checkKiotVietEntered}
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
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Total row for range mode */}
          {dateMode === 'range' && filteredRecords.length > 0 && (
            <Card>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    Tổng {filteredRecords.length} bản ghi:
                  </span>
                  <span className="font-bold text-lg text-primary">
                    {formatCurrency(
                      filteredRecords.reduce((sum: number, r: any) => sum + (r.amount || 0), 0)
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
          <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="font-medium mb-2">Chưa có bản ghi nào</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Bắt đầu ghi nhận tiền thu từ khách hàng
          </p>
          <Button onClick={() => { setEditRecord(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Thêm bản ghi đầu tiên
          </Button>
        </div>
      )}

      {/* Record Form Dialog */}
      <RecordForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditRecord(null);
        }}
        editRecord={editRecord}
        defaultDate={activeDate || getTodayISO()}
        canEdit={canEditRecord}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa bản ghi này? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
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
    </div>
  );
}
