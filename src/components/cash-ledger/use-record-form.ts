'use client';

import { useReducer, useMemo, useCallback, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { getTodayISO } from '@/lib/utils';

// --- Types ---

export interface BatchRow {
  id: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  amount: number;
  notes: string;
  errors: Record<string, string>;
  duplicateWarning: { id: string; collectorName: string; createdByName: string }[] | null;
  duplicateAcknowledged: boolean;
  nearDuplicateWarning: { id: string; collectorName: string; createdByName: string; amount: number }[] | null;
  nearDuplicateAcknowledged: boolean;
}

interface FormState {
  date: string;
  collectorId: string;
  collectorName: string;
  rows: BatchRow[];
}

type FormAction =
  | { type: 'SET_DATE'; date: string }
  | { type: 'SET_COLLECTOR'; collectorId: string; collectorName: string }
  | { type: 'ADD_ROW' }
  | { type: 'REMOVE_ROW'; rowId: string }
  | { type: 'UPDATE_ROW'; rowId: string; field: 'customerName' | 'amount' | 'notes'; value: string | number }
  | { type: 'SET_CUSTOMER'; rowId: string; customerId: string; customerName: string; customerCode: string }
  | { type: 'SET_ROW_ERRORS'; errors: { rowId: string; errors: Record<string, string> }[] }
  | { type: 'SET_ROW_DUPLICATE'; rowId: string; duplicates: { id: string; collectorName: string; createdByName: string }[] }
  | { type: 'ACKNOWLEDGE_DUPLICATE'; rowId: string }
  | { type: 'SET_ROW_NEAR_DUPLICATE'; rowId: string; nearDuplicates: { id: string; collectorName: string; createdByName: string; amount: number }[] }
  | { type: 'ACKNOWLEDGE_NEAR_DUPLICATE'; rowId: string }
  | { type: 'CLEAR_DUPLICATES' }
  | { type: 'RESET'; defaultDate: string }
  | { type: 'LOAD_EDIT'; record: any; defaultDate: string };

// --- Helpers ---

let rowCounter = 0;
function createEmptyRow(): BatchRow {
  return {
    id: `row-${++rowCounter}-${Date.now()}`,
    customerId: '',
    customerName: '',
    customerCode: '',
    amount: 0,
    notes: '',
    errors: {},
    duplicateWarning: null,
    duplicateAcknowledged: false,
    nearDuplicateWarning: null,
    nearDuplicateAcknowledged: false,
  };
}

function createInitialState(defaultDate: string): FormState {
  return {
    date: defaultDate || getTodayISO(),
    collectorId: '',
    collectorName: '',
    rows: [createEmptyRow()],
  };
}

// --- Reducer ---

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_DATE':
      return { ...state, date: action.date };

    case 'SET_COLLECTOR':
      return { ...state, collectorId: action.collectorId, collectorName: action.collectorName };

    case 'ADD_ROW':
      return { ...state, rows: [...state.rows, createEmptyRow()] };

    case 'REMOVE_ROW':
      if (state.rows.length <= 1) return state;
      return { ...state, rows: state.rows.filter((r) => r.id !== action.rowId) };

    case 'UPDATE_ROW':
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.rowId
            ? {
                ...r,
                [action.field]: action.value,
                errors: { ...r.errors, [action.field]: '' },
              }
            : r
        ),
      };

    case 'SET_CUSTOMER':
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.rowId
            ? {
                ...r,
                customerId: action.customerId,
                customerName: action.customerName,
                customerCode: action.customerCode,
                errors: { ...r.errors, customer: '' },
              }
            : r
        ),
      };

    case 'SET_ROW_ERRORS':
      return {
        ...state,
        rows: state.rows.map((r) => {
          const match = action.errors.find((e) => e.rowId === r.id);
          return match ? { ...r, errors: match.errors } : r;
        }),
      };

    case 'SET_ROW_DUPLICATE':
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.rowId
            ? { ...r, duplicateWarning: action.duplicates, duplicateAcknowledged: false }
            : r
        ),
      };

    case 'ACKNOWLEDGE_DUPLICATE':
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.rowId ? { ...r, duplicateAcknowledged: true } : r
        ),
      };

    case 'SET_ROW_NEAR_DUPLICATE':
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.rowId
            ? { ...r, nearDuplicateWarning: action.nearDuplicates, nearDuplicateAcknowledged: false }
            : r
        ),
      };

    case 'ACKNOWLEDGE_NEAR_DUPLICATE':
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.rowId ? { ...r, nearDuplicateAcknowledged: true } : r
        ),
      };

    case 'CLEAR_DUPLICATES':
      return {
        ...state,
        rows: state.rows.map((r) => ({
          ...r,
          duplicateWarning: null,
          duplicateAcknowledged: false,
          nearDuplicateWarning: null,
          nearDuplicateAcknowledged: false,
        })),
      };

    case 'RESET':
      return createInitialState(action.defaultDate);

    case 'LOAD_EDIT':
      return {
        date: action.record.date || action.defaultDate || getTodayISO(),
        collectorId: action.record.collectorId || '',
        collectorName: action.record.collectorName || '',
        rows: [
          {
            id: 'edit-row',
            customerId: action.record.customerId || '',
            customerName: action.record.customerName || '',
            customerCode: action.record.customerCode || '',
            amount: action.record.amount || 0,
            notes: action.record.notes || '',
            errors: {},
            duplicateWarning: null,
            duplicateAcknowledged: false,
            nearDuplicateWarning: null,
            nearDuplicateAcknowledged: false,
          },
        ],
      };

    default:
      return state;
  }
}

// --- Hook ---

interface UseRecordFormOptions {
  editRecord: any | null;
  defaultDate?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
}

export function useRecordForm({
  editRecord,
  defaultDate,
  open,
  onOpenChange,
  canEdit,
}: UseRecordFormOptions) {
  const effectiveDefault = defaultDate || getTodayISO();
  const [state, dispatch] = useReducer(formReducer, effectiveDefault, createInitialState);

  const isEditMode = !!editRecord;
  const isViewOnly = isEditMode && !canEdit;

  const utils = trpc.useUtils();
  const { data: customers } = trpc.customers.list.useQuery(undefined, {
    enabled: open,
    staleTime: 10 * 60 * 1000, // 10 min — KH list ít thay đổi
  });
  const { data: collectors } = trpc.collectors.list.useQuery(undefined, {
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });

  const bulkCreateMutation = trpc.cashRecords.bulkCreate.useMutation({
    onSuccess: (data) => {
      utils.cashRecords.list.invalidate();
      utils.cashRecords.dailySummary.invalidate();
      toast.success(`Đã thêm ${data.count} bản ghi thành công`);
      handleClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.cashRecords.update.useMutation({
    onSuccess: () => {
      utils.cashRecords.list.invalidate();
      utils.cashRecords.dailySummary.invalidate();
      toast.success('Cập nhật thành công');
      handleClose();
    },
    onError: (err) => toast.error(err.message),
  });

  // Populate form when editing or reset when creating
  useEffect(() => {
    if (!open) return;
    if (editRecord) {
      dispatch({ type: 'LOAD_EDIT', record: editRecord, defaultDate: effectiveDefault });
    } else {
      dispatch({ type: 'RESET', defaultDate: effectiveDefault });
    }
  }, [editRecord, open, effectiveDefault]);

  // Update date if defaultDate changes (create mode only)
  useEffect(() => {
    if (!editRecord && defaultDate) {
      dispatch({ type: 'SET_DATE', date: defaultDate });
    }
  }, [defaultDate, editRecord]);

  const customerOptions = useMemo(() => {
    if (!customers) return [];
    return (customers as any[]).map((c: any) => ({
      label: c.name,
      value: c.id,
      searchText: `${c.code || ''} ${c.phone || ''}`,
    }));
  }, [customers]);

  const collectorOptions = useMemo(() => {
    if (!collectors) return [];
    return (collectors as any[]).map((c: any) => ({
      label: c.name,
      value: c.id,
    }));
  }, [collectors]);

  const totalAmount = useMemo(
    () => state.rows.reduce((sum, r) => sum + (r.amount || 0), 0),
    [state.rows]
  );

  const validRowCount = useMemo(
    () => state.rows.filter((r) => r.customerName.trim() && r.amount > 0).length,
    [state.rows]
  );

  const handleCustomerChange = useCallback(
    (rowId: string, customerId: string) => {
      if (customerId && customers) {
        const customer = (customers as any[]).find((c: any) => c.id === customerId);
        if (customer) {
          // Auto-move old manually-typed name to notes when selecting KiotViet customer in edit mode
          if (isEditMode) {
            const row = state.rows.find((r) => r.id === rowId);
            if (row && !row.customerId && row.customerName.trim()) {
              const oldName = row.customerName.trim();
              const newNotes = row.notes.trim()
                ? `${oldName} · ${row.notes.trim()}`
                : oldName;
              dispatch({ type: 'UPDATE_ROW', rowId, field: 'notes', value: newNotes });
            }
          }
          dispatch({
            type: 'SET_CUSTOMER',
            rowId,
            customerId,
            customerName: customer.name,
            customerCode: customer.code || '',
          });
          return;
        }
      }
      dispatch({
        type: 'SET_CUSTOMER',
        rowId,
        customerId: '',
        customerName: '',
        customerCode: '',
      });
    },
    [customers, isEditMode, state.rows]
  );

  const handleCollectorChange = useCallback(
    (collectorId: string) => {
      if (collectorId && collectors) {
        const collector = (collectors as any[]).find((c: any) => c.id === collectorId);
        if (collector) {
          dispatch({ type: 'SET_COLLECTOR', collectorId, collectorName: collector.name });
          return;
        }
      }
      dispatch({ type: 'SET_COLLECTOR', collectorId: '', collectorName: '' });
    },
    [collectors]
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
    dispatch({ type: 'RESET', defaultDate: effectiveDefault });
  }, [onOpenChange, effectiveDefault]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validate shared fields
      if (!state.collectorId) {
        toast.error('Vui lòng chọn người nộp');
        return;
      }

      if (isEditMode) {
        // Edit mode: validate single row
        const row = state.rows[0];
        if (!row.customerName.trim()) {
          dispatch({
            type: 'SET_ROW_ERRORS',
            errors: [{ rowId: row.id, errors: { customer: 'Vui lòng chọn hoặc nhập tên khách hàng' } }],
          });
          return;
        }
        if (!row.amount || row.amount <= 0) {
          dispatch({
            type: 'SET_ROW_ERRORS',
            errors: [{ rowId: row.id, errors: { amount: 'Vui lòng nhập số tiền' } }],
          });
          return;
        }

        updateMutation.mutate({
          id: editRecord.id,
          date: state.date,
          customerId: row.customerId || undefined,
          customerName: row.customerName.trim(),
          customerCode: row.customerCode || undefined,
          amount: row.amount,
          collectorId: state.collectorId,
          collectorName: state.collectorName,
          notes: row.notes.trim() || undefined,
        });
        return;
      }

      // Batch create mode: filter non-empty rows
      const nonEmptyRows = state.rows.filter(
        (r) => r.customerName.trim() || r.amount > 0
      );

      if (nonEmptyRows.length === 0) {
        toast.error('Vui lòng nhập ít nhất 1 bản ghi');
        return;
      }

      // Validate each non-empty row
      let hasErrors = false;
      const errorUpdates: { rowId: string; errors: Record<string, string> }[] = [];

      for (const row of nonEmptyRows) {
        const errors: Record<string, string> = {};
        if (!row.customerName.trim()) {
          errors.customer = 'Vui lòng chọn hoặc nhập tên KH';
          hasErrors = true;
        }
        if (!row.amount || row.amount <= 0) {
          errors.amount = 'Vui lòng nhập số tiền';
          hasErrors = true;
        }
        if (Object.keys(errors).length > 0) {
          errorUpdates.push({ rowId: row.id, errors });
        }
      }

      if (hasErrors) {
        dispatch({ type: 'SET_ROW_ERRORS', errors: errorUpdates });
        return;
      }

      // Check duplicates (only for rows not yet fully acknowledged)
      const rowsToCheck = nonEmptyRows.filter(
        (r) => !r.duplicateAcknowledged || !r.nearDuplicateAcknowledged
      );

      if (rowsToCheck.length > 0) {
        try {
          const dupResult = await utils.cashRecords.checkDuplicateBatch.fetch({
            date: state.date,
            entries: rowsToCheck.map((r) => ({
              customerName: r.customerName.trim(),
              amount: r.amount,
            })),
          });

          let hasDuplicates = false;
          let hasNearDuplicates = false;
          dupResult.results.forEach((result, index) => {
            const row = rowsToCheck[index];
            if (result.hasDuplicate && !row.duplicateAcknowledged) {
              hasDuplicates = true;
              dispatch({
                type: 'SET_ROW_DUPLICATE',
                rowId: row.id,
                duplicates: result.duplicates,
              });
            }
            if (result.hasNearDuplicate && !row.nearDuplicateAcknowledged) {
              hasNearDuplicates = true;
              dispatch({
                type: 'SET_ROW_NEAR_DUPLICATE',
                rowId: row.id,
                nearDuplicates: result.nearDuplicates,
              });
            }
          });

          if (hasDuplicates || hasNearDuplicates) {
            return;
          }
        } catch {
          // If duplicate check fails, proceed anyway
        }
      }

      // Also check for duplicates within the batch itself
      const seen = new Map<string, string>();
      for (const row of nonEmptyRows) {
        const key = `${row.customerName.trim().toLowerCase()}|${row.amount}`;
        if (seen.has(key) && !row.duplicateAcknowledged) {
          dispatch({
            type: 'SET_ROW_DUPLICATE',
            rowId: row.id,
            duplicates: [{ id: 'in-batch', collectorName: state.collectorName, createdByName: 'Trong cùng đợt nhập' }],
          });
          return;
        }
        seen.set(key, row.id);
      }

      // Submit
      bulkCreateMutation.mutate({
        date: state.date,
        collectorId: state.collectorId,
        collectorName: state.collectorName,
        records: nonEmptyRows.map((r) => ({
          customerId: r.customerId || undefined,
          customerName: r.customerName.trim(),
          customerCode: r.customerCode || undefined,
          amount: r.amount,
          notes: r.notes.trim() || undefined,
        })),
      });
    },
    [state, isEditMode, editRecord, bulkCreateMutation, updateMutation, utils]
  );

  const isPending = bulkCreateMutation.isPending || updateMutation.isPending;

  return {
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
  };
}
