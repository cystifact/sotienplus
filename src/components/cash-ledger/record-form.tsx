'use client';

import { useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { useRecordForm } from './use-record-form';
import { BatchRow } from './batch-row';

interface RecordFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editRecord?: any;
  defaultDate?: string;
  canEdit: boolean;
  canDelete?: boolean;
  onDelete?: (record: any) => void;
}

const MAX_ROWS = 50;

export function RecordForm({
  open,
  onOpenChange,
  editRecord,
  defaultDate,
  canEdit,
  canDelete,
  onDelete,
}: RecordFormProps) {
  const {
    state,
    dispatch,
    customers,
    customerOptions,
    collectorOptions,
    totalAmount,
    validRowCount,
    isEditMode,
    isViewOnly,
    isPending,
    handleCustomerChange,
    handleCollectorChange,
    handleSubmit,
    handleClose,
  } = useRecordForm({ editRecord, defaultDate, open, onOpenChange, canEdit });

  const handleUpdate = useCallback(
    (rowId: string, field: 'customerName' | 'amount' | 'notes', value: string | number) => {
      dispatch({ type: 'UPDATE_ROW', rowId, field, value });
    },
    [dispatch]
  );

  const handleRemove = useCallback(
    (rowId: string) => {
      dispatch({ type: 'REMOVE_ROW', rowId });
    },
    [dispatch]
  );

  const handleAcknowledgeDuplicate = useCallback(
    (rowId: string) => {
      dispatch({ type: 'ACKNOWLEDGE_DUPLICATE', rowId });
    },
    [dispatch]
  );

  const handleAddRow = useCallback(() => {
    dispatch({ type: 'ADD_ROW' });
  }, [dispatch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col w-[calc(100%-1rem)] sm:w-full rounded-lg p-0">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-0 sm:px-6 sm:pt-6">
          <div className="flex items-center justify-between">
            <DialogTitle>
              {editRecord
                ? isViewOnly
                  ? 'Chi tiết bản ghi'
                  : 'Sửa bản ghi'
                : 'Thêm bản ghi mới'}
            </DialogTitle>
            {!isEditMode && validRowCount > 0 && (
              <Badge variant="secondary" className="text-xs font-normal mr-6">
                {validRowCount} dòng · {formatCurrency(totalAmount)}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {/* KiotViet sync warning */}
          {editRecord?.rpaStatus === 'success' && isEditMode && !isViewOnly && (
            <div className="mx-4 mt-3 sm:mx-6">
              {(() => {
                const currentAmount = state.rows[0]?.amount;
                const origAmount = editRecord.rpaOriginalAmount;
                const amountChanged = currentAmount != null && origAmount != null && currentAmount !== origAmount;
                const isRed = amountChanged;
                return (
                  <div className={`flex items-start gap-2 p-3 rounded-md text-xs ${isRed ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-yellow-50 border border-yellow-200 text-yellow-700'}`}>
                    <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isRed ? 'text-red-500' : 'text-yellow-500'}`} />
                    <div>
                      {isRed ? (
                        <p>
                          <strong>Số tiền sẽ thay đổi: {formatNumber(origAmount)} → {formatNumber(currentAmount)}.</strong>
                          {' '}BẮT BUỘC phải sửa phiếu thu KiotViet sau khi lưu!
                        </p>
                      ) : (
                        <p>
                          Bản ghi này đã được thanh toán trong KiotViet
                          {origAmount != null ? ` (số tiền: ${formatNumber(origAmount)})` : ''}.
                          {' '}Nếu thay đổi số tiền hoặc khách hàng, hãy nhớ sửa phiếu thu trong KiotViet.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Shared fields - fixed */}
          <div className="px-4 pt-3 pb-2 space-y-3 sm:px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Date */}
              <div className="space-y-1.5 min-w-0">
                <Label htmlFor="date" className="text-xs">Ngày</Label>
                <Input
                  id="date"
                  type="date"
                  value={state.date}
                  onChange={(e) => dispatch({ type: 'SET_DATE', date: e.target.value })}
                  disabled={isViewOnly}
                  required
                  autoFocus={false}
                  readOnly
                  onFocus={(e) => {
                    // Remove readonly on focus to allow date picker
                    e.currentTarget.readOnly = false;
                  }}
                  onBlur={(e) => {
                    // Re-add readonly after blur to prevent auto-focus calendar
                    setTimeout(() => {
                      e.currentTarget.readOnly = true;
                    }, 100);
                  }}
                />
              </div>

              {/* Collector */}
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs">Người nộp</Label>
                <Combobox
                  options={collectorOptions}
                  value={state.collectorId}
                  onChange={handleCollectorChange}
                  placeholderText="Tìm người nộp..."
                  disabled={isViewOnly}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Rows - scrollable */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 sm:px-6">
            {state.rows.map((row, index) => (
              <BatchRow
                key={row.id}
                row={row}
                index={index}
                customerOptions={customerOptions}
                customers={customers}
                showRemove={state.rows.length > 1 && !isEditMode}
                isViewOnly={isViewOnly}
                onCustomerChange={handleCustomerChange}
                onUpdate={handleUpdate}
                onRemove={handleRemove}
                onAcknowledgeDuplicate={handleAcknowledgeDuplicate}
              />
            ))}

            {/* Add row button */}
            {!isEditMode && !isViewOnly && state.rows.length < MAX_ROWS && (
              <Button
                type="button"
                variant="secondary"
                className="w-full h-11 text-sm border border-dashed border-primary/30"
                onClick={handleAddRow}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Thêm dòng
              </Button>
            )}
          </div>

          {/* Footer - fixed */}
          <div className="border-t px-4 py-3 sm:px-6">
            <div className="flex gap-2">
              {isEditMode && canDelete && onDelete && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    onDelete(editRecord);
                    onOpenChange(false);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Xóa
                </Button>
              )}
              <div className="flex-1" />
              {!isViewOnly && (
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditMode
                    ? 'Cập nhật'
                    : validRowCount > 0
                      ? `Thêm ${validRowCount} bản ghi`
                      : 'Thêm mới'}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
              >
                {isViewOnly ? 'Đóng' : 'Hủy'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
