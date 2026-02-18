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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, Search, Shield, User as UserIcon, ArrowUpDown, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUserPermissions } from '@/hooks/use-current-user-permissions';
import { UserPermissionsGrid } from '@/components/UserPermissionsGrid';
import type { Permission, UserRole } from '@/lib/permissions-config';
import { cn } from '@/lib/utils';

const EMPTY_PERMISSIONS: Permission[] = [];

interface UserData {
  id: string;
  email?: string;
  username?: string;
  displayName?: string;
  role?: UserRole;
  isActive?: boolean;
  permissions?: Permission[];
}

export default function UsersSettingsPage() {
  const { hasPermission, isLoading } = useCurrentUserPermissions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!hasPermission('users', 'view')) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Bạn không có quyền truy cập trang này.
      </div>
    );
  }

  return <UsersContent />;
}

function UsersContent() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'password' | 'permissions'>('info');
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<'displayName' | 'role' | 'isActive'>('displayName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    displayName: '',
    role: 'staff' as UserRole,
  });
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const { isAdmin } = useCurrentUserPermissions();

  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.users.list.useQuery();

  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success('Tạo người dùng thành công');
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success('Cập nhật thành công');
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePasswordMutation = trpc.users.updatePassword.useMutation({
    onSuccess: () => {
      setNewPassword('');
      setActiveTab('info');
      toast.success('Đổi mật khẩu thành công');
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePermissionsMutation = trpc.users.updatePermissions.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      toast.success('Cập nhật phân quyền thành công');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      setDisableDialogOpen(false);
      setDialogOpen(false);
      resetForm();
      toast.success('Đã vô hiệu hóa');
    },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = () => {
    setFormData({ username: '', email: '', password: '', displayName: '', role: 'staff' });
    setEditingUser(null);
    setActiveTab('info');
    setNewPassword('');
    setShowPassword(false);
    setShowNewPassword(false);
  };

  const handleRowClick = (user: UserData) => {
    setEditingUser(user);
    setFormData({
      username: user.username || '',
      email: user.email || '',
      password: '',
      displayName: user.displayName || '',
      role: (user.role as UserRole) || 'staff',
    });
    setActiveTab('info');
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      updateMutation.mutate({
        id: editingUser.id,
        displayName: formData.displayName,
        role: formData.role,
      });
    } else {
      if (!formData.password) {
        toast.error('Vui lòng nhập mật khẩu');
        return;
      }
      if (formData.role === 'admin' && !formData.email) {
        toast.error('Admin cần có email');
        return;
      }
      if (formData.role !== 'admin' && !formData.username) {
        toast.error('Vui lòng nhập username');
        return;
      }
      createMutation.mutate({
        username: formData.role !== 'admin' ? formData.username : undefined,
        email: formData.role === 'admin' ? formData.email : undefined,
        password: formData.password,
        displayName: formData.displayName,
        role: formData.role,
      });
    }
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !newPassword) return;
    updatePasswordMutation.mutate({ id: editingUser.id, password: newPassword });
  };

  const handleToggleStatus = () => {
    if (!editingUser) return;
    if (editingUser.isActive) {
      setDisableDialogOpen(true);
    } else {
      updateMutation.mutate({ id: editingUser.id, isActive: true });
    }
  };

  const handleConfirmDisable = () => {
    if (!editingUser) return;
    deleteMutation.mutate({ id: editingUser.id });
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin': return 'Admin';
      case 'manager': return 'Quản lý';
      default: return 'Nhân viên';
    }
  };

  const getRoleShortLabel = (role?: string) => {
    switch (role) {
      case 'admin': return 'Admin';
      case 'manager': return 'QL';
      default: return 'NV';
    }
  };

  const filteredAndSortedUsers = (users as UserData[] | undefined)
    ?.filter(
      (user) =>
        !search ||
        user.displayName?.toLowerCase().includes(search.toLowerCase()) ||
        user.username?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortField === 'isActive') {
        aVal = a.isActive ? 1 : 0;
        bVal = b.isActive ? 1 : 0;
      } else if (sortField === 'role') {
        const roleOrder: Record<string, number> = { admin: 3, manager: 2, staff: 1 };
        aVal = roleOrder[a.role || 'staff'] || 0;
        bVal = roleOrder[b.role || 'staff'] || 0;
      } else {
        aVal = (a.displayName || '').toLowerCase();
        bVal = (b.displayName || '').toLowerCase();
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

  // Whether the current user can edit other users (admin only)
  const canEditUsers = isAdmin;
  // Whether to show the permissions tab for the editing user
  const showPermissionsTab = isAdmin && editingUser && editingUser.role !== 'admin';
  const tabCount = showPermissionsTab ? 3 : 2;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-2xl font-bold">Quản lý người dùng</h1>
        {canEditUsers && (
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
            <DialogContent className="max-w-md w-[calc(100%-2rem)] sm:w-full rounded-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingUser ? 'Chi tiết người dùng' : 'Thêm người dùng'}
                </DialogTitle>
              </DialogHeader>

              {editingUser ? (
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                  <TabsList className={cn('grid w-full', tabCount === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
                    <TabsTrigger value="info">Thông tin</TabsTrigger>
                    <TabsTrigger value="password">Mật khẩu</TabsTrigger>
                    {showPermissionsTab && (
                      <TabsTrigger value="permissions">Phân quyền</TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="info" className="space-y-4 mt-4">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Username</Label>
                        <Input value={editingUser.username || ''} disabled className="bg-muted" />
                        <p className="text-xs text-muted-foreground">Không thể thay đổi</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="displayName">Tên hiển thị</Label>
                        <Input
                          id="displayName"
                          value={formData.displayName}
                          onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                          required
                          disabled={!canEditUsers}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Vai trò</Label>
                        <Select
                          value={formData.role}
                          onValueChange={(v) => setFormData({ ...formData, role: v as UserRole })}
                          disabled={!canEditUsers}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4" /> Admin
                              </div>
                            </SelectItem>
                            <SelectItem value="manager">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4" /> Quản lý
                              </div>
                            </SelectItem>
                            <SelectItem value="staff">
                              <div className="flex items-center gap-2">
                                <UserIcon className="w-4 h-4" /> Nhân viên
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="text-sm font-medium">Trạng thái</p>
                          <p className="text-xs text-muted-foreground">
                            {editingUser.isActive ? 'Đang hoạt động' : 'Đã bị vô hiệu hóa'}
                          </p>
                        </div>
                        <Badge variant={editingUser.isActive ? 'default' : 'destructive'}>
                          {editingUser.isActive ? 'Hoạt động' : 'Vô hiệu'}
                        </Badge>
                      </div>

                      {canEditUsers ? (
                        <div className="flex justify-between pt-4">
                          <Button
                            type="button"
                            variant={editingUser.isActive ? 'destructive' : 'default'}
                            onClick={handleToggleStatus}
                            disabled={updateMutation.isPending || deleteMutation.isPending}
                          >
                            {editingUser.isActive ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
                          </Button>
                          <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                              Đóng
                            </Button>
                            <Button type="submit" disabled={updateMutation.isPending}>
                              Cập nhật
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-end pt-4">
                          <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                            Đóng
                          </Button>
                        </div>
                      )}
                    </form>
                  </TabsContent>

                  <TabsContent value="password" className="space-y-4 mt-4">
                    <form onSubmit={handlePasswordChange} className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Đổi mật khẩu cho: <strong>{editingUser.displayName}</strong>
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="newPassword">Mật khẩu mới</Label>
                        <div className="relative">
                          <Input
                            id="newPassword"
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            className={cn('pr-10', newPassword && newPassword.length < 8 && 'border-red-500')}
                          />
                          <button
                            type="button"
                            tabIndex={-1}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                          >
                            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {newPassword && newPassword.length < 8 ? (
                          <p className="text-xs text-red-500">Mật khẩu phải có ít nhất 8 ký tự ({newPassword.length}/8)</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Tối thiểu 8 ký tự</p>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setActiveTab('info')}>
                          Quay lại
                        </Button>
                        <Button type="submit" disabled={updatePasswordMutation.isPending || !newPassword || newPassword.length < 8}>
                          Đổi mật khẩu
                        </Button>
                      </div>
                    </form>
                  </TabsContent>

                  {showPermissionsTab && (
                    <TabsContent value="permissions" className="space-y-4 mt-4">
                      <UserPermissionsGrid
                        role={(editingUser.role as UserRole) || 'staff'}
                        currentPermissions={editingUser.permissions ?? EMPTY_PERMISSIONS}
                        onChange={(perms) => {
                          if (!editingUser) return;
                          updatePermissionsMutation.mutate({
                            id: editingUser.id,
                            permissions: perms,
                          });
                        }}
                      />
                    </TabsContent>
                  )}
                </Tabs>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Vai trò</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(v) => setFormData({ ...formData, role: v as UserRole })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" /> Admin
                          </div>
                        </SelectItem>
                        <SelectItem value="manager">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4" /> Quản lý
                          </div>
                        </SelectItem>
                        <SelectItem value="staff">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4" /> Nhân viên
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.role === 'admin' ? (
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="admin@gmail.com"
                        required
                      />
                      <p className="text-xs text-muted-foreground">Admin đăng nhập bằng email</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        type="text"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        placeholder="Nhập username để đăng nhập"
                        required
                      />
                      <p className="text-xs text-muted-foreground">Đăng nhập bằng username</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Tên hiển thị</Label>
                    <Input
                      id="displayName"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Mật khẩu</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        className={cn('pr-10', formData.password && formData.password.length < 8 && 'border-red-500')}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {formData.password && formData.password.length < 8 ? (
                      <p className="text-xs text-red-500">Mật khẩu phải có ít nhất 8 ký tự ({formData.password.length}/8)</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Tối thiểu 8 ký tự</p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Hủy
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || formData.password.length < 8}>
                      Thêm
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        )}

        {/* View-only dialog for non-admin users */}
        {!canEditUsers && (
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogContent className="max-w-md w-[calc(100%-2rem)] sm:w-full rounded-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Chi tiết người dùng</DialogTitle>
              </DialogHeader>
              {editingUser && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input value={editingUser.username || ''} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Tên hiển thị</Label>
                    <Input value={editingUser.displayName || ''} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Vai trò</Label>
                    <Input value={getRoleLabel(editingUser.role)} disabled className="bg-muted" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Trạng thái</p>
                    </div>
                    <Badge variant={editingUser.isActive ? 'default' : 'destructive'}>
                      {editingUser.isActive ? 'Hoạt động' : 'Vô hiệu'}
                    </Badge>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Đóng
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Tìm theo tên hoặc username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filteredAndSortedUsers && filteredAndSortedUsers.length > 0 ? (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/10">
                  <TableHead className="font-semibold cursor-pointer" onClick={() => handleSort('displayName')}>
                    <div className="flex items-center gap-1">
                      Tên hiển thị <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold">Username</TableHead>
                  <TableHead className="font-semibold text-center cursor-pointer" onClick={() => handleSort('role')}>
                    <div className="flex items-center justify-center gap-1">
                      Vai trò <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold text-center cursor-pointer" onClick={() => handleSort('isActive')}>
                    <div className="flex items-center justify-center gap-1">
                      Trạng thái <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedUsers.map((user) => (
                  <TableRow
                    key={user.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => handleRowClick(user)}
                  >
                    <TableCell className="font-medium">{user.displayName}</TableCell>
                    <TableCell className="text-sm">{user.username}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={user.role !== 'staff' ? 'default' : 'secondary'} className="text-xs">
                        {user.role === 'admin' ? (
                          <><Shield className="w-3 h-3 mr-1" />Admin</>
                        ) : user.role === 'manager' ? (
                          <><ShieldCheck className="w-3 h-3 mr-1" />Quản lý</>
                        ) : (
                          <><UserIcon className="w-3 h-3 mr-1" />Nhân viên</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="secondary"
                        className={user.isActive
                          ? 'text-xs bg-green-100 text-green-700'
                          : 'text-xs bg-gray-100 text-gray-700'
                        }
                      >
                        {user.isActive ? 'Hoạt động' : 'Vô hiệu'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-2">
            {filteredAndSortedUsers.map((user) => (
              <Card
                key={user.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleRowClick(user)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{user.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.username}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge variant={user.role !== 'staff' ? 'default' : 'secondary'} className="text-xs">
                        {getRoleShortLabel(user.role)}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={user.isActive
                          ? 'text-xs bg-green-100 text-green-700'
                          : 'text-xs bg-gray-100 text-gray-700'
                        }
                      >
                        {user.isActive ? 'OK' : 'Off'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {search ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có người dùng nào'}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vô hiệu hóa người dùng</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn vô hiệu hóa{' '}
              <strong>{editingUser?.displayName}</strong>? Họ sẽ không thể đăng nhập.
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
