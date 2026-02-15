'use client';

import React, { useRef, useMemo, useCallback } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { NumberInput } from '@/components/ui/number-input';
import { formatCurrency } from '@/lib/utils';
import type { BatchRow as BatchRowState } from './use-record-form';

interface ComboboxOption {
  label: string;
  value: string;
  searchText?: string;
}

interface BatchRowProps {
  row: BatchRowState;
  index: number;
  customerOptions: ComboboxOption[];
  customers: any[] | undefined;
  showRemove: boolean;
  isViewOnly: boolean;
  onCustomerChange: (rowId: string, customerId: string) => void;
  onUpdate: (rowId: string, field: 'customerName' | 'amount' | 'notes', value: string | number) => void;
  onRemove: (rowId: string) => void;
  onAcknowledgeDuplicate: (rowId: string) => void;
}

export const BatchRow = React.memo(function BatchRow({
  row,
  index,
  customerOptions,
  customers,
  showRemove,
  isViewOnly,
  onCustomerChange,
  onUpdate,
  onRemove,
  onAcknowledgeDuplicate,
}: BatchRowProps) {
  const amountRef = useRef<HTMLInputElement>(null);

  const selectedCustomer = useMemo(() => {
    if (!row.customerId || !customers) return null;
    return (customers as any[]).find((c: any) => c.id === row.customerId);
  }, [row.customerId, customers]);

  const handleCustomerChange = useCallback(
    (id: string) => {
      onCustomerChange(row.id, id);
      if (id) {
        // Focus amount input after selecting a customer
        setTimeout(() => amountRef.current?.focus(), 50);
      }
    },
    [row.id, onCustomerChange]
  );

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      {/* Row header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
          {selectedCustomer?.debt > 0 && (
            <Badge variant="destructive" className="text-xs">
              Nợ: {formatCurrency(selectedCustomer.debt)}
            </Badge>
          )}
        </div>
        {showRemove && !isViewOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onRemove(row.id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Customer */}
      <div>
        <Combobox
          options={customerOptions}
          value={row.customerId}
          onChange={handleCustomerChange}
          placeholderText="Tìm khách hàng..."
          disabled={isViewOnly}
        />
        {!row.customerId && (
          <Input
            value={row.customerName}
            onChange={(e) => onUpdate(row.id, 'customerName', e.target.value)}
            placeholder="Hoặc nhập tên KH"
            className="text-sm mt-1.5"
            disabled={isViewOnly}
          />
        )}
        {row.errors.customer && (
          <p className="text-xs text-destructive mt-1">{row.errors.customer}</p>
        )}
      </div>

      {/* Amount + Notes on same row */}
      <div className="flex gap-2">
        <div className="flex-1">
          <NumberInput
            ref={amountRef}
            value={row.amount}
            onChange={(v) => onUpdate(row.id, 'amount', v)}
            placeholder="Số tiền"
            min={0}
            disabled={isViewOnly}
          />
          {row.errors.amount && (
            <p className="text-xs text-destructive mt-1">{row.errors.amount}</p>
          )}
        </div>
        <div className="flex-1">
          <Input
            value={row.notes}
            onChange={(e) => onUpdate(row.id, 'notes', e.target.value)}
            placeholder="Ghi chú"
            className="text-sm"
            disabled={isViewOnly}
          />
        </div>
      </div>

      {/* Duplicate warning */}
      {row.duplicateWarning && !row.duplicateAcknowledged && (
        <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
          <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Phát hiện bản ghi trùng</p>
            {row.duplicateWarning.map((d, i) => (
              <p key={i} className="text-muted-foreground">
                — {d.collectorName}, bởi: {d.createdByName}
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
