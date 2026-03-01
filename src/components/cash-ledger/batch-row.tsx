'use client';

import React, { useRef, useMemo, useCallback, useState } from 'react';
import { X, AlertTriangle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { NumberInput } from '@/components/ui/number-input';
import { cn, formatCurrency } from '@/lib/utils';
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
  onAcknowledgeNearDuplicate: (rowId: string) => void;
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
  onAcknowledgeNearDuplicate,
}: BatchRowProps) {
  const amountRef = useRef<HTMLInputElement>(null);
  const [showNotes, setShowNotes] = useState(!!row.notes);

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
    <div className={cn(
      "rounded-lg border p-3 space-y-2",
      index % 2 === 0 ? "bg-card" : "bg-muted/30"
    )}>
      {/* Customer line with inline index, debt badge, and remove button */}
      <div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
            {selectedCustomer?.debt > 0 && (
              <Badge variant="destructive" className="text-xs py-0 px-1.5">
                Nợ: {formatCurrency(selectedCustomer.debt)}
              </Badge>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <Combobox
              options={customerOptions}
              value={row.customerId}
              onChange={handleCustomerChange}
              placeholderText="Tìm khách hàng..."
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

      {/* Amount with note toggle */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
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
        {!isViewOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 shrink-0",
              row.notes
                ? "text-primary bg-primary/10 hover:bg-primary/20"
                : "text-muted-foreground"
            )}
            onClick={() => setShowNotes((prev) => !prev)}
            title="Ghi chú"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Collapsible notes field */}
      {(showNotes || (isViewOnly && row.notes)) && (
        <Input
          value={row.notes}
          onChange={(e) => onUpdate(row.id, 'notes', e.target.value)}
          placeholder="Ghi chú"
          className="text-sm"
          disabled={isViewOnly}
        />
      )}

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

      {/* Near-duplicate warning */}
      {row.nearDuplicateWarning && !row.nearDuplicateAcknowledged && (
        <div className="flex items-start gap-2 p-2 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded text-xs">
          <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Cảnh báo: có thể nhập trùng</p>
            <p className="text-muted-foreground">Khách hàng đã có bản ghi trong ngày với số tiền gần tương tự:</p>
            {row.nearDuplicateWarning.map((d, i) => (
              <p key={i} className="text-muted-foreground">
                — {formatCurrency(d.amount)} ({d.collectorName}, bởi: {d.createdByName})
              </p>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 text-xs shrink-0"
            onClick={() => onAcknowledgeNearDuplicate(row.id)}
          >
            Vẫn thêm
          </Button>
        </div>
      )}
    </div>
  );
});
