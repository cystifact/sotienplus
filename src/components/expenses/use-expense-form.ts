'use client';

import { useReducer, useMemo, useCallback, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { getTodayISO } from '@/lib/utils';

// --- Types ---

export interface ExpenseBatchRow {
  id: string;
  expenseTypeId: string;
  expenseTypeName: string;
  amount: number;
  notes: string;
  errors: Record<string, string>;
  duplicateWarning: { id: string; createdByName: string }[] | null;
  duplicateAcknowledged: boolean;
}

interface FormState {
  date: string;
  rows: ExpenseBatchRow[];
}

type FormAction =
  | { type: 'SET_DATE'; date: string }
  | { type: 'ADD_ROW' }
  | { type: 'REMOVE_ROW'; rowId: string }
  | { type: 'UPDATE_ROW'; rowId: string; field: 'expenseTypeName' | 'amount' | 'notes'; value: string | number }
  | { type: 'SET_EXPENSE_TYPE'; rowId: string; expenseTypeId: string; expenseTypeName: string }
  | { type: 'SET_ROW_ERRORS'; errors: { rowId: string; errors: Record<string, string> }[] }
  | { type: 'SET_ROW_DUPLICATE'; rowId: string; duplicates: { id: string; createdByName: string }[] }
  | { type: 'ACKNOWLEDGE_DUPLICATE'; rowId: string }
  | { type: 'CLEAR_DUPLICATES' }
  | { type: 'RESET'; defaultDate: string }
  | { type: 'LOAD_EDIT'; record: any; defaultDate: string };

// --- Helpers ---

let rowCounter = 0;
function createEmptyRow(): ExpenseBatchRow {
  return {
    id: `row-${++rowCounter}-${Date.now()}`,
    expenseTypeId: '',
    expenseTypeName: '',
    amount: 0,
    notes: '',
    errors: {},
    duplicateWarning: null,
    duplicateAcknowledged: false,
  };
}

function createInitialState(defaultDate: string): FormState {
  return {
    date: defaultDate || getTodayISO(),
    rows: [createEmptyRow()],
  };
}

// --- Reducer ---

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_DATE':
      return { ...state, date: action.date };

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

    case 'SET_EXPENSE_TYPE':
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.rowId
            ? {
                ...r,
                expenseTypeId: action.expenseTypeId,
                expenseTypeName: action.expenseTypeName,
                errors: { ...r.errors, expenseType: '' },
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

    case 'CLEAR_DUPLICATES':
      return {
        ...state,
        rows: state.rows.map((r) => ({
          ...r,
          duplicateWarning: null,
          duplicateAcknowledged: false,
        })),
      };

    case 'RESET':
      return createInitialState(action.defaultDate);

    case 'LOAD_EDIT':
      return {
        date: action.record.date || action.defaultDate || getTodayISO(),
        rows: [
          {
            id: 'edit-row',
            expenseTypeId: action.record.expenseTypeId || '',
            expenseTypeName: action.record.expenseTypeName || '',
            amount: action.record.amount || 0,
            notes: action.record.notes || '',
            errors: {},
            duplicateWarning: null,
            duplicateAcknowledged: false,
          },
        ],
      };

    default:
      return state;
  }
}

// --- Hook ---

interface UseExpenseFormOptions {
  editRecord: any | null;
  defaultDate?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
}

export function useExpenseForm({
  editRecord,
  defaultDate,
  open,
  onOpenChange,
  canEdit,
}: UseExpenseFormOptions) {
  const effectiveDefault = defaultDate || getTodayISO();
  const [state, dispatch] = useReducer(formReducer, effectiveDefault, createInitialState);

  const isEditMode = !!editRecord;
  const isViewOnly = isEditMode && !canEdit;

  const utils = trpc.useUtils();
  const { data: expenseTypes } = trpc.expenseTypes.list.useQuery();

  const bulkCreateMutation = trpc.expenseRecords.bulkCreate.useMutation({
    onSuccess: (data) => {
      utils.expenseRecords.list.invalidate();
      utils.expenseRecords.dailySummary.invalidate();
      toast.success(`Đã thêm ${data.ids.length} bản ghi thành công`);
      handleClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.expenseRecords.update.useMutation({
    onSuccess: () => {
      utils.expenseRecords.list.invalidate();
      utils.expenseRecords.dailySummary.invalidate();
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

  const expenseTypeOptions = useMemo(() => {
    if (!expenseTypes) return [];
    return (expenseTypes as any[]).map((t: any) => ({
      label: t.name,
      value: t.id,
    }));
  }, [expenseTypes]);

  const totalAmount = useMemo(
    () => state.rows.reduce((sum, r) => sum + (r.amount || 0), 0),
    [state.rows]
  );

  const validRowCount = useMemo(
    () => state.rows.filter((r) => r.expenseTypeName.trim() && r.amount > 0).length,
    [state.rows]
  );

  const handleExpenseTypeChange = useCallback(
    (rowId: string, expenseTypeId: string) => {
      if (expenseTypeId && expenseTypes) {
        const type = (expenseTypes as any[]).find((t: any) => t.id === expenseTypeId);
        if (type) {
          dispatch({
            type: 'SET_EXPENSE_TYPE',
            rowId,
            expenseTypeId,
            expenseTypeName: type.name,
          });
          return;
        }
      }
      dispatch({
        type: 'SET_EXPENSE_TYPE',
        rowId,
        expenseTypeId: '',
        expenseTypeName: '',
      });
    },
    [expenseTypes]
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
    dispatch({ type: 'RESET', defaultDate: effectiveDefault });
  }, [onOpenChange, effectiveDefault]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (isEditMode) {
        // Edit mode: validate single row
        const row = state.rows[0];
        if (!row.expenseTypeName.trim()) {
          dispatch({
            type: 'SET_ROW_ERRORS',
            errors: [{ rowId: row.id, errors: { expenseType: 'Vui lòng chọn hoặc nhập loại chi' } }],
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
          expenseTypeId: row.expenseTypeId || undefined,
          expenseTypeName: row.expenseTypeName.trim(),
          amount: row.amount,
          notes: row.notes.trim() || undefined,
        });
        return;
      }

      // Batch create mode: filter non-empty rows
      const nonEmptyRows = state.rows.filter(
        (r) => r.expenseTypeName.trim() || r.amount > 0
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
        if (!row.expenseTypeName.trim()) {
          errors.expenseType = 'Vui lòng chọn loại chi';
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

      // Check duplicates (only for rows not yet acknowledged)
      const rowsToCheck = nonEmptyRows.filter(
        (r) => !r.duplicateAcknowledged
      );

      if (rowsToCheck.length > 0) {
        try {
          const dupResult = await utils.expenseRecords.checkDuplicateBatch.fetch({
            date: state.date,
            records: rowsToCheck.map((r) => ({
              expenseTypeName: r.expenseTypeName.trim(),
              amount: r.amount,
            })),
          });

          let hasDuplicates = false;
          dupResult.forEach((result, index) => {
            if (result.isDuplicate) {
              hasDuplicates = true;
              dispatch({
                type: 'SET_ROW_DUPLICATE',
                rowId: rowsToCheck[index].id,
                duplicates: [{ id: 'duplicate', createdByName: `${result.duplicateCount} bản ghi trùng` }],
              });
            }
          });

          if (hasDuplicates) {
            return;
          }
        } catch {
          // If duplicate check fails, proceed anyway
        }
      }

      // Also check for duplicates within the batch itself
      const seen = new Map<string, string>();
      for (const row of nonEmptyRows) {
        const key = `${row.expenseTypeName.trim().toLowerCase()}|${row.amount}`;
        if (seen.has(key) && !row.duplicateAcknowledged) {
          dispatch({
            type: 'SET_ROW_DUPLICATE',
            rowId: row.id,
            duplicates: [{ id: 'in-batch', createdByName: 'Trong cùng đợt nhập' }],
          });
          return;
        }
        seen.set(key, row.id);
      }

      // Submit
      bulkCreateMutation.mutate({
        date: state.date,
        records: nonEmptyRows.map((r) => ({
          expenseTypeId: r.expenseTypeId || undefined,
          expenseTypeName: r.expenseTypeName.trim(),
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
    expenseTypes,
    expenseTypeOptions,
    totalAmount,
    validRowCount,
    isEditMode,
    isViewOnly,
    isPending,
    handleExpenseTypeChange,
    handleSubmit,
    handleClose,
  };
}
