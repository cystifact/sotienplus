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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PlusCircle, Search, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUserPermissions } from '@/hooks/use-current-user-permissions';

interface CollectorData {
  id: string;
  name?: string;
  phone?: string;
  isActive?: boolean;
}

export default function CollectorsSettingsPage() {
  const { hasPermission, isLoading } = useCurrentUserPermissions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!hasPermission('collectors', 'view')) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Bạn không có quyền truy cập trang này.
      </div>
    );
  }

  return <CollectorsContent />;
}

function CollectorsContent() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCollector, setEditingCollector] = useState<CollectorData | null>(null);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);

  const [formData, setFormData] = useState({ name: '', phone: '' });

  const utils = trpc.useUtils();
  const { data: collectors, isLoading } = trpc.collectors.listAll.useQuery();

  const createMutation = trpc.collectors.create.useMutation({
    onSuccess: () => {
      utils.collectors.listAll.invalidate();
      utils.collectors.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success('Thêm người nộp tiền thành công');
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.collectors.update.useMutation({
    onSuccess: () => {
      utils.collectors.listAll.invalidate();
      utils.collectors.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success('Cập nhật thành công');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.collectors.delete.useMutation({
    onSuccess: () => {
      utils.collectors.listAll.invalidate();
      utils.collectors.list.invalidate();
      setDisableDialogOpen(false);
      setDialogOpen(false);
      resetForm();
      toast.success('Đã vô hiệu hóa');
    },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = () => {
    setFormData({ name: '', phone: '' });
    setEditingCollector(null);
  };

  const handleRowClick = (collector: CollectorData) => {
    setEditingCollector(collector);
    setFormData({
      name: collector.name || '',
      phone: collector.phone || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCollector) {
      updateMutation.mutate({
        id: editingCollector.id,
        name: formData.name,
        phone: formData.phone || undefined,
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        phone: formData.phone || undefined,
      });
    }
  };

  const handleToggleStatus = () => {
    if (!editingCollector) return;
    if (editingCollector.isActive) {
      setDisableDialogOpen(true);
    } else {
      updateMutation.mutate({ id: editingCollector.id, isActive: true });
    }
  };

  const handleConfirmDisable = () => {
    if (!editingCollector) return;
    deleteMutation.mutate({ id: editingCollector.id });
  };

  const filteredCollectors = (collectors as CollectorData[] | undefined)?.filter(
    (c) => !search || c.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-2xl font-bold">Người nộp tiền</h1>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <PlusCircle className="w-4 h-4 mr-1" />
              Thêm mới
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md w-[calc(100%-2rem)] sm:w-full rounded-lg">
            <DialogHeader>
              <DialogTitle>
                {editingCollector ? 'Chi tiết người nộp tiền' : 'Thêm người nộp tiền'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Tên</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Số điện thoại</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Tùy chọn"
                />
              </div>

              {editingCollector && (
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Trạng thái</p>
                    <p className="text-xs text-muted-foreground">
                      {editingCollector.isActive ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}
                    </p>
                  </div>
                  <Badge variant={editingCollector.isActive ? 'default' : 'destructive'}>
                    {editingCollector.isActive ? 'Hoạt động' : 'Vô hiệu'}
                  </Badge>
                </div>
              )}

              <div className={editingCollector ? 'flex justify-between pt-2' : 'flex justify-end gap-2 pt-2'}>
                {editingCollector && (
                  <Button
                    type="button"
                    variant={editingCollector.isActive ? 'destructive' : 'default'}
                    onClick={handleToggleStatus}
                    disabled={updateMutation.isPending || deleteMutation.isPending}
                  >
                    {editingCollector.isActive ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    {editingCollector ? 'Đóng' : 'Hủy'}
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {editingCollector ? 'Cập nhật' : 'Thêm'}
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
          placeholder="Tìm theo tên..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filteredCollectors && filteredCollectors.length > 0 ? (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/10">
                  <TableHead className="font-semibold">Tên</TableHead>
                  <TableHead className="font-semibold">Số điện thoại</TableHead>
                  <TableHead className="font-semibold text-center">Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCollectors.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => handleRowClick(c)}
                  >
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm">{c.phone || '-'}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="secondary"
                        className={c.isActive
                          ? 'text-xs bg-green-100 text-green-700'
                          : 'text-xs bg-gray-100 text-gray-700'
                        }
                      >
                        {c.isActive ? 'Hoạt động' : 'Vô hiệu'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-2">
            {filteredCollectors.map((c) => (
              <Card
                key={c.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleRowClick(c)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      {c.phone && (
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      )}
                    </div>
                    <Badge
                      variant="secondary"
                      className={c.isActive
                        ? 'text-xs bg-green-100 text-green-700'
                        : 'text-xs bg-gray-100 text-gray-700'
                      }
                    >
                      {c.isActive ? 'OK' : 'Off'}
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
            {search ? 'Không tìm thấy kết quả' : 'Chưa có người nộp tiền nào'}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vô hiệu hóa người nộp tiền</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn vô hiệu hóa{' '}
              <strong>{editingCollector?.name}</strong>?
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
