'use client';

import React, { useRef, useState, useCallback } from 'react';
import { X, AlertTriangle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { NumberInput } from '@/components/ui/number-input';
import { cn } from '@/lib/utils';
import type { ExpenseBatchRow as ExpenseBatchRowState } from './use-expense-form';

interface ComboboxOption {
  label: string;
  value: string;
}

interface ExpenseBatchRowProps {
  row: ExpenseBatchRowState;
  index: number;
  expenseTypeOptions: ComboboxOption[];
  showRemove: boolean;
  isViewOnly: boolean;
  onExpenseTypeChange: (rowId: string, expenseTypeId: string) => void;
  onUpdate: (rowId: string, field: 'expenseTypeName' | 'amount' | 'notes', value: string | number) => void;
  onRemove: (rowId: string) => void;
  onAcknowledgeDuplicate: (rowId: string) => void;
  onAddRow?: () => void;
  canAddRow?: boolean;
}

export const ExpenseBatchRow = React.memo(function ExpenseBatchRow({
  row,
  index,
  expenseTypeOptions,
  showRemove,
  isViewOnly,
  onExpenseTypeChange,
  onUpdate,
  onRemove,
  onAcknowledgeDuplicate,
  onAddRow,
  canAddRow,
}: ExpenseBatchRowProps) {
  const amountRef = useRef<HTMLInputElement>(null);
  const [showNotes, setShowNotes] = useState(true);

  const handleExpenseTypeChange = useCallback(
    (id: string) => {
      onExpenseTypeChange(row.id, id);
      if (id) {
        // Focus amount input after selecting expense type
        setTimeout(() => amountRef.current?.focus(), 50);
      }
    },
    [row.id, onExpenseTypeChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !isViewOnly && canAddRow && onAddRow) {
        e.preventDefault();
        onAddRow();
      }
    },
    [isViewOnly, canAddRow, onAddRow]
  );

  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-2",
      index % 2 === 0 ? "bg-card" : "bg-muted/30"
    )}>
      {/* Expense type line with inline index and remove button */}
      <div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <Combobox
              options={expenseTypeOptions}
              value={row.expenseTypeId}
              onChange={handleExpenseTypeChange}
              placeholderText="Chọn loại chi..."
              disabled={isViewOnly}
            />
          </div>
          {showRemove && !isViewOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onRemove(row.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {row.errors.expenseType && (
          <p className="text-xs text-destructive mt-1">{row.errors.expenseType}</p>
        )}
      </div>

      {/* Amount and Notes in one row */}
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <NumberInput
              ref={amountRef}
              value={row.amount}
              onChange={(v) => onUpdate(row.id, 'amount', v)}
              placeholder="Số tiền"
              min={0}
              disabled={isViewOnly}
              onKeyDown={handleKeyDown}
            />
          </div>
          {(showNotes || isViewOnly) && (
            <div className="flex-1 min-w-0">
              <Input
                value={row.notes}
                onChange={(e) => onUpdate(row.id, 'notes', e.target.value)}
                placeholder="Ghi chú"
                className="text-sm"
                disabled={isViewOnly}
                onKeyDown={handleKeyDown}
              />
            </div>
          )}
        </div>
        {row.errors.amount && (
          <p className="text-xs text-destructive">{row.errors.amount}</p>
        )}
      </div>

      {/* Duplicate warning */}
      {row.duplicateWarning && !row.duplicateAcknowledged && (
        <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
          <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Phát hiện bản ghi trùng</p>
            {row.duplicateWarning.map((d, i) => (
              <p key={i} className="text-muted-foreground">
                — {d.createdByName}
              </p>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 text-xs shrink-0"
            onClick={() => onAcknowledgeDuplicate(row.id)}
          >
            Vẫn thêm
          </Button>
        </div>
      )}
    </div>
  );
});
