'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Lock, LockOpen, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUserPermissions } from '@/hooks/use-current-user-permissions';
import { ViDateInput } from '@/components/ui/vi-date-input';
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

function formatViDate(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function getVietnamToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export default function PeriodLockPage() {
  const { isAdmin, isLoading: permLoading } = useCurrentUserPermissions();

  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Bạn không có quyền truy cập trang này.
      </div>
    );
  }

  return <PeriodLockContent />;
}

function PeriodLockContent() {
  const [selectedDate, setSelectedDate] = useState('');
  const [confirmAction, setConfirmAction] = useState<'lock' | 'unlock' | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.settings.getPeriodLock.useQuery();

  const setLockMutation = trpc.settings.setPeriodLock.useMutation({
    onSuccess: () => {
      utils.settings.getPeriodLock.invalidate();
      setConfirmAction(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmAction(null);
    },
  });

  const currentLockDate = data?.lockDate ?? null;
  const today = getVietnamToday();
  const isFutureDate = selectedDate > today;

  const handleLock = () => {
    if (!selectedDate) {
      toast.error('Vui lòng chọn ngày khóa sổ');
      return;
    }
    setConfirmAction('lock');
  };

  const handleUnlock = () => {
    setConfirmAction('unlock');
  };

  const confirmLock = () => {
    setLockMutation.mutate(
      { lockDate: selectedDate },
      {
        onSuccess: () => {
          toast.success(`Đã khóa sổ đến ngày ${formatViDate(selectedDate)}`);
          setSelectedDate('');
        },
      }
    );
  };

  const confirmUnlock = () => {
    setLockMutation.mutate(
      { lockDate: null },
      {
        onSuccess: () => {
          toast.success('Đã mở khóa tất cả kỳ');
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg sm:text-2xl font-bold mb-4 sm:mb-6">Khóa sổ</h1>

      <div className="space-y-4 max-w-lg">
        {/* Current status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Trạng thái hiện tại</CardTitle>
          </CardHeader>
          <CardContent>
            {currentLockDate ? (
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-orange-500" />
                <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-sm py-1 px-3">
                  Đã khóa sổ đến ngày {formatViDate(currentLockDate)}
                </Badge>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <LockOpen className="h-5 w-5 text-green-500" />
                <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-sm py-1 px-3">
                  Chưa khóa sổ
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Set lock date */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Đặt ngày khóa sổ</CardTitle>
            <CardDescription>
              Tất cả bản ghi có ngày &le; ngày khóa sẽ không thể thêm/sửa/xóa bởi nhân viên và quản lý. Chỉ admin mới có thể thao tác.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lock-date">Ngày khóa sổ</Label>
              <ViDateInput
                id="lock-date"
                value={selectedDate}
                onChange={setSelectedDate}
                className="max-w-xs"
              />
            </div>

            {isFutureDate && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Ngày này ở tương lai. Điều này sẽ chặn tạo/sửa bản ghi cho cả ngày hôm nay.</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleLock}
                disabled={!selectedDate || setLockMutation.isPending}
              >
                <Lock className="h-4 w-4 mr-2" />
                {currentLockDate ? 'Cập nhật ngày khóa' : 'Khóa sổ'}
              </Button>

              {currentLockDate && (
                <Button
                  variant="outline"
                  onClick={handleUnlock}
                  disabled={setLockMutation.isPending}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <LockOpen className="h-4 w-4 mr-2" />
                  Mở khóa tất cả
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation dialogs */}
      <AlertDialog open={confirmAction === 'lock'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận khóa sổ</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn khóa sổ đến ngày <strong>{selectedDate ? formatViDate(selectedDate) : ''}</strong>?
              Nhân viên và quản lý sẽ không thể thêm, sửa, hoặc xóa bản ghi trong kỳ này.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLock} disabled={setLockMutation.isPending}>
              Xác nhận khóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === 'unlock'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận mở khóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn mở khóa tất cả kỳ? Nhân viên và quản lý sẽ có thể thao tác trên mọi bản ghi (theo quyền của họ).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnlock} disabled={setLockMutation.isPending} className="bg-red-600 hover:bg-red-700">
              Xác nhận mở khóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
