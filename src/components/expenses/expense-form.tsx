'use client';

import { useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ViDateInput } from '@/components/ui/vi-date-input';
import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { useExpenseForm } from './use-expense-form';
import { ExpenseBatchRow } from './expense-batch-row';

interface ExpenseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editRecord?: any;
  defaultDate?: string;
  canEdit: boolean;
  canDelete?: boolean;
  onDelete?: (record: any) => void;
}

const MAX_ROWS = 50;

export function ExpenseForm({
  open,
  onOpenChange,
  editRecord,
  defaultDate,
  canEdit,
  canDelete,
  onDelete,
}: ExpenseFormProps) {
  const {
    state,
    dispatch,
    expenseTypeOptions,
    totalAmount,
    validRowCount,
    isEditMode,
    isViewOnly,
    isPending,
    handleExpenseTypeChange,
    handleSubmit,
    handleClose,
  } = useExpenseForm({ editRecord, defaultDate, open, onOpenChange, canEdit });

  const handleUpdate = useCallback(
    (rowId: string, field: 'expenseTypeName' | 'amount' | 'notes', value: string | number) => {
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col w-[calc(100%-1rem)] sm:w-full rounded-lg p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-0 sm:px-6 sm:pt-6">
          <div className="flex items-center justify-between">
            <DialogTitle>
              {editRecord
                ? isViewOnly
                  ? 'Chi tiết chi phí'
                  : 'Sửa chi phí'
                : 'Thêm chi phí mới'}
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
                          {' '}BẮT BUỘC phải sửa phiếu chi KiotViet sau khi lưu!
                        </p>
                      ) : (
                        <p>
                          Chi phí này đã được nhập trong KiotViet
                          {origAmount != null ? ` (số tiền: ${formatNumber(origAmount)})` : ''}.
                          {' '}Nếu thay đổi số tiền hoặc loại chi, hãy nhớ sửa phiếu chi trong KiotViet.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Date field - fixed */}
          <div className="px-4 pt-3 pb-2 space-y-3 sm:px-6">
            <div className="space-y-1.5 max-w-[200px]">
              <Label htmlFor="date" className="text-xs">Ngày</Label>
              <ViDateInput
                id="date"
                value={state.date}
                onChange={(v) => dispatch({ type: 'SET_DATE', date: v })}
                disabled={isViewOnly}
                required
              />
            </div>
          </div>

          <Separator />

          {/* Rows - scrollable */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 sm:px-6">
            {state.rows.map((row, index) => (
              <ExpenseBatchRow
                key={row.id}
                row={row}
                index={index}
                expenseTypeOptions={expenseTypeOptions}
                showRemove={state.rows.length > 1 && !isEditMode}
                isViewOnly={isViewOnly}
                onExpenseTypeChange={handleExpenseTypeChange}
                onUpdate={handleUpdate}
                onRemove={handleRemove}
                onAcknowledgeDuplicate={handleAcknowledgeDuplicate}
                onAddRow={!isEditMode ? handleAddRow : undefined}
                canAddRow={!isEditMode && !isViewOnly && state.rows.length < MAX_ROWS}
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
                      ? `Thêm ${validRowCount} chi phí`
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
