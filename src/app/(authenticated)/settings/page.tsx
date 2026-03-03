'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck, RefreshCw, KeyRound, Receipt, Lock } from 'lucide-react';
import { useCurrentUserPermissions } from '@/hooks/use-current-user-permissions';

const settingsLinks = [
  {
    title: 'Đổi mật khẩu',
    description: 'Thay đổi mật khẩu đăng nhập',
    href: '/settings/change-password',
    icon: KeyRound,
  },
  {
    title: 'Quản lý người dùng',
    description: 'Thêm, sửa, xóa tài khoản',
    href: '/settings/users',
    icon: Users,
    module: 'users',
    action: 'view',
  },
  {
    title: 'Người nộp tiền',
    description: 'Quản lý danh sách người nộp tiền',
    href: '/settings/collectors',
    icon: UserCheck,
    module: 'collectors',
    action: 'view',
  },
  {
    title: 'Loại chi phí',
    description: 'Quản lý danh sách loại chi',
    href: '/settings/expense-types',
    icon: Receipt,
    module: 'expenses',
    action: 'manage_types',
  },
  {
    title: 'KiotViet',
    description: 'Cài đặt đồng bộ khách hàng',
    href: '/settings/kiotviet',
    icon: RefreshCw,
    module: 'kiotviet',
    action: 'view',
  },
  {
    title: 'Khóa sổ',
    description: 'Khóa kỳ sổ, chặn chỉnh sửa bản ghi cũ',
    href: '/settings/period-lock',
    icon: Lock,
    adminOnly: true,
  },
] as const;

export default function SettingsPage() {
  const { hasPermission, hasAnyModulePermission, isAdmin } = useCurrentUserPermissions();
  const visibleLinks = settingsLinks.filter((link) => {
    if ('adminOnly' in link && link.adminOnly) return isAdmin;
    if (!('module' in link) || !link.module) return true;
    if (link.module === 'kiotviet') return hasAnyModulePermission('kiotviet');
    return hasPermission(link.module, link.action!);
  });

  return (
    <div>
      <h1 className="text-lg sm:text-2xl font-bold mb-4 sm:mb-6">Cài đặt</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visibleLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <link.icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">{link.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{link.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
