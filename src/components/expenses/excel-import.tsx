'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Upload, Loader2, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface ExcelImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export function ExcelImport({ open, onOpenChange }: ExcelImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  const utils = trpc.useUtils();

  const importMutation = trpc.expenseRecords.importFromExcel.useMutation({
    onSuccess: (result) => {
      utils.expenseRecords.list.invalidate();
      toast.success(`Đã nhập thành công ${result.count} chi phí`);
      handleClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setValidationErrors([]);
    }
  };

  const handleValidateAndImport = async () => {
    if (!file) return;

    setIsValidating(true);
    setValidationErrors([]);

    try {
      // Parse Excel file
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

      if (jsonData.length === 0) {
        setValidationErrors([{ row: 0, field: 'file', message: 'File Excel không có dữ liệu' }]);
        setIsValidating(false);
        return;
      }

      // Validate structure
      const requiredColumns = ['Ngày', 'Loại chi', 'Số tiền'];
      const firstRow = jsonData[0];
      const missingColumns = requiredColumns.filter(col => !(col in firstRow));

      if (missingColumns.length > 0) {
        setValidationErrors([{
          row: 0,
          field: 'structure',
          message: `Thiếu cột: ${missingColumns.join(', ')}`
        }]);
        setIsValidating(false);
        return;
      }

      // Validate each row
      const errors: ValidationError[] = [];
      const validRecords: any[] = [];

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rowNumber = i + 2; // Excel row (header is row 1, data starts at row 2)

        // Validate date
        if (!row['Ngày']) {
          errors.push({ row: rowNumber, field: 'Ngày', message: 'Ngày không được để trống' });
          continue;
        }

        // Parse date (support DD/MM/YYYY or YYYY-MM-DD)
        let dateStr = String(row['Ngày']).trim();
        if (dateStr.includes('/')) {
          const [day, month, year] = dateStr.split('/');
          dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        // Validate expenseTypeName
        if (!row['Loại chi']) {
          errors.push({ row: rowNumber, field: 'Loại chi', message: 'Loại chi không được để trống' });
          continue;
        }

        // Validate amount
        const amount = Number(row['Số tiền']);
        if (isNaN(amount) || amount <= 0) {
          errors.push({ row: rowNumber, field: 'Số tiền', message: 'Số tiền phải là số dương' });
          continue;
        }

        validRecords.push({
          date: dateStr,
          expenseTypeName: String(row['Loại chi']).trim(),
          amount: Math.round(amount),
          notes: row['Ghi chú'] ? String(row['Ghi chú']).trim() : undefined,
        });
      }

      if (errors.length > 0) {
        setValidationErrors(errors);
        setIsValidating(false);
        return;
      }

      // All valid, proceed with import
      importMutation.mutate({
        records: validRecords,
        importSource: file.name,
      });
    } catch (error) {
      toast.error('Lỗi đọc file Excel');
      console.error('Excel parse error:', error);
    } finally {
      setIsValidating(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setValidationErrors([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nhập chi phí từ Excel</DialogTitle>
          <DialogDescription>
            Tải lên file Excel chứa danh sách chi phí. File phải có các cột: Ngày, Loại chi, Số tiền (Ghi chú tùy chọn).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File upload */}
          <div className="space-y-2">
            <label
              htmlFor="excel-file"
              className="flex items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                {file ? (
                  <>
                    <FileSpreadsheet className="w-8 h-8 text-green-600" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs">Click để chọn file khác</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8" />
                    <span className="text-sm font-medium">Click để chọn file Excel</span>
                    <span className="text-xs">(.xlsx, .xls)</span>
                  </>
                )}
              </div>
              <input
                id="excel-file"
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>
          </div>

          {/* Template hint */}
          {!file && !validationErrors.length && (
            <Alert>
              <AlertDescription className="text-xs">
                <strong>Định dạng file Excel:</strong>
                <ul className="mt-1 ml-4 list-disc space-y-0.5">
                  <li>Cột A: Ngày (DD/MM/YYYY hoặc YYYY-MM-DD)</li>
                  <li>Cột B: Loại chi (tên loại chi phải khớp chính xác với danh sách)</li>
                  <li>Cột C: Số tiền (số nguyên, VND)</li>
                  <li>Cột D: Ghi chú (tùy chọn)</li>
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="font-semibold">
                    Tìm thấy {validationErrors.length} lỗi trong file:
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 text-xs">
                    {validationErrors.slice(0, 20).map((err, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          Dòng {err.row}
                        </Badge>
                        <span>
                          <strong>{err.field}:</strong> {err.message}
                        </span>
                      </div>
                    ))}
                    {validationErrors.length > 20 && (
                      <div className="text-muted-foreground">
                        ... và {validationErrors.length - 20} lỗi khác
                      </div>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importMutation.isPending || isValidating}>
            Hủy
          </Button>
          <Button
            onClick={handleValidateAndImport}
            disabled={!file || importMutation.isPending || isValidating}
          >
            {importMutation.isPending || isValidating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isValidating ? 'Đang kiểm tra...' : 'Đang nhập...'}
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Nhập dữ liệu
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
