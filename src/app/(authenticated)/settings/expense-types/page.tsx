'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PlusCircle, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUserPermissions } from '@/hooks/use-current-user-permissions';

interface ExpenseTypeData {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export default function ExpenseTypesSettingsPage() {
  const { hasPermission, isLoading } = useCurrentUserPermissions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!hasPermission('expenses', 'manage_types')) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Bạn không có quyền truy cập trang này.
      </div>
    );
  }

  return <ExpenseTypesContent />;
}

function ExpenseTypesContent() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ExpenseTypeData | null>(null);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);

  const [formData, setFormData] = useState({ name: '' });

  const utils = trpc.useUtils();
  const { data: expenseTypes, isLoading } = trpc.expenseTypes.list.useQuery() as {
    data: ExpenseTypeData[] | undefined;
    isLoading: boolean;
  };

  const createMutation = trpc.expenseTypes.create.useMutation({
    onSuccess: () => {
      utils.expenseTypes.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success('Thêm loại chi thành công');
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.expenseTypes.update.useMutation({
    onSuccess: () => {
      utils.expenseTypes.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success('Cập nhật thành công');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.expenseTypes.delete.useMutation({
    onSuccess: () => {
      utils.expenseTypes.list.invalidate();
      setDisableDialogOpen(false);
      setDialogOpen(false);
      resetForm();
      toast.success('Đã vô hiệu hóa');
    },
    onError: (err) => toast.error(err.message),
  });

  const reorderMutation = trpc.expenseTypes.reorder.useMutation({
    onSuccess: () => {
      utils.expenseTypes.list.invalidate();
      toast.success('Đã cập nhật thứ tự');
    },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = () => {
    setFormData({ name: '' });
    setEditingType(null);
  };

  const handleRowClick = (type: ExpenseTypeData) => {
    setEditingType(type);
    setFormData({
      name: type.name || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingType) {
      updateMutation.mutate({
        id: editingType.id,
        name: formData.name,
      });
    } else {
      createMutation.mutate({
        name: formData.name,
      });
    }
  };

  const handleToggleStatus = () => {
    if (!editingType) return;
    if (editingType.isActive) {
      setDisableDialogOpen(true);
    } else {
      updateMutation.mutate({ id: editingType.id, name: editingType.name! });
    }
  };

  const handleConfirmDisable = () => {
    if (!editingType) return;
    deleteMutation.mutate({ id: editingType.id });
  };

  const handleMoveUp = (type: ExpenseTypeData, index: number) => {
    if (index === 0 || !expenseTypes) return;
    const prev = expenseTypes[index - 1];
    reorderMutation.mutate({
      updates: [
        { id: type.id, sortOrder: prev.sortOrder! },
        { id: prev.id, sortOrder: type.sortOrder! },
      ],
    });
  };

  const handleMoveDown = (type: ExpenseTypeData, index: number) => {
    if (!expenseTypes || index === expenseTypes.length - 1) return;
    const next = expenseTypes[index + 1];
    reorderMutation.mutate({
      updates: [
        { id: type.id, sortOrder: next.sortOrder! },
        { id: next.id, sortOrder: type.sortOrder! },
      ],
    });
  };

  const filteredTypes = (expenseTypes as ExpenseTypeData[] | undefined)?.filter(
    (t) => !search || t.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-2xl font-bold">Loại chi</h1>
        <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <PlusCircle className="w-4 h-4 mr-1" />
          Thêm mới
        </Button>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogContent className="max-w-md w-[calc(100%-2rem)] sm:w-full rounded-lg">
            <DialogHeader>
              <DialogTitle>
                {editingType ? 'Chi tiết loại chi' : 'Thêm loại chi'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Tên loại chi</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ví dụ: Chi phí văn phòng"
                  required
                />
              </div>

              {editingType && (
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Trạng thái</p>
                    <p className="text-xs text-muted-foreground">
                      {editingType.isActive ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}
                    </p>
                  </div>
                  <Badge variant={editingType.isActive ? 'default' : 'destructive'}>
                    {editingType.isActive ? 'Hoạt động' : 'Vô hiệu'}
                  </Badge>
                </div>
              )}

              <div className={editingType ? 'flex justify-between pt-2' : 'flex justify-end gap-2 pt-2'}>
                {editingType && (
                  <Button
                    type="button"
                    variant={editingType.isActive ? 'destructive' : 'default'}
                    onClick={handleToggleStatus}
                    disabled={updateMutation.isPending || deleteMutation.isPending}
                  >
                    {editingType.isActive ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    {editingType ? 'Đóng' : 'Hủy'}
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {editingType ? 'Cập nhật' : 'Thêm'}
                  </Button>
                </div>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Tìm loại chi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filteredTypes && filteredTypes.length > 0 ? (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/10">
                  <TableHead className="font-semibold w-24">Thứ tự</TableHead>
                  <TableHead className="font-semibold">Tên loại chi</TableHead>
                  <TableHead className="font-semibold text-center w-24">Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTypes.map((t, index) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => handleRowClick(t)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          disabled={index === 0}
                          onClick={(e) => { e.stopPropagation(); handleMoveUp(t, index); }}
                        >
                          <ChevronUp className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          disabled={index === filteredTypes.length - 1}
                          onClick={(e) => { e.stopPropagation(); handleMoveDown(t, index); }}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="secondary"
                        className={t.isActive
                          ? 'text-xs bg-green-100 text-green-700'
                          : 'text-xs bg-gray-100 text-gray-700'
                        }
                      >
                        {t.isActive ? 'Hoạt động' : 'Vô hiệu'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-2">
            {filteredTypes.map((t, index) => (
              <Card
                key={t.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleRowClick(t)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="flex flex-col">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0"
                          disabled={index === 0}
                          onClick={(e) => { e.stopPropagation(); handleMoveUp(t, index); }}
                        >
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0"
                          disabled={index === filteredTypes.length - 1}
                          onClick={(e) => { e.stopPropagation(); handleMoveDown(t, index); }}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="font-medium text-sm truncate">{t.name}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={t.isActive
                        ? 'text-xs bg-green-100 text-green-700'
                        : 'text-xs bg-gray-100 text-gray-700'
                      }
                    >
                      {t.isActive ? 'OK' : 'Off'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {search ? 'Không tìm thấy kết quả' : 'Chưa có loại chi nào'}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vô hiệu hóa loại chi</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn vô hiệu hóa{' '}
              <strong>{editingType?.name}</strong>?
              <br /><br />
              Lưu ý: Các bản ghi chi hiện có sẽ vẫn giữ nguyên tên loại chi này.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDisable}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Vô hiệu hóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
