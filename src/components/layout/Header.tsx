'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import {
  BookOpen,
  Settings,
  LogOut,
  MoreHorizontal,
  Users,
  UserCheck,
  RefreshCw,
  Plus,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useCurrentUserPermissions } from '@/hooks/use-current-user-permissions';

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { hasPermission, role, userData } = useCurrentUserPermissions();

  const handleLogout = async () => {
    try {
      await fetch('/api/session/logout', { method: 'POST', credentials: 'include' });
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      toast.error('Đăng xuất thất bại');
    }
  };

  const handleDrawerLink = (href: string) => {
    setDrawerOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* Desktop header — hidden on mobile */}
      <header className="hidden md:block sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container-optimized flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/ledger" className="flex items-center gap-2">
              <Image src="/icon-192x192.png" alt="SoTienPlus" width={32} height={32} />
              <span className="font-bold text-lg text-primary">SoTienPlus</span>
            </Link>
            <nav className="flex items-center gap-1">
              <Link href="/ledger">
                <Button
                  variant={pathname.startsWith('/ledger') ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(pathname.startsWith('/ledger') && 'bg-primary/10 text-primary')}
                >
                  <BookOpen className="h-4 w-4 mr-2" />
                  Sổ Ghi
                </Button>
              </Link>
              <Link href="/settings">
                <Button
                  variant={pathname.startsWith('/settings') ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(pathname.startsWith('/settings') && 'bg-primary/10 text-primary')}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Cài đặt
                </Button>
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {userData && (
              <span className="text-sm text-muted-foreground">
                {userData.displayName}
                {role !== 'staff' && (
                  <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    {role === 'admin' ? 'Admin' : 'Quản lý'}
                  </span>
                )}
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Đăng xuất">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav — hidden on desktop */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)' }}
      >
        <div className="grid grid-cols-4 h-14">
          {/* Sổ Ghi */}
          <Link
            href="/ledger"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 text-[10px]',
              pathname.startsWith('/ledger') ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <BookOpen className="h-5 w-5" />
            Sổ Ghi
          </Link>

          {/* Thêm mới — primary action */}
          <button
            onClick={() => {
              router.push('/ledger');
              // Dispatch custom event so ledger page can open form
              window.dispatchEvent(new CustomEvent('open-record-form'));
            }}
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] text-primary"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Plus className="h-5 w-5" />
            </div>
          </button>

          {/* Cài đặt */}
          <Link
            href="/settings"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 text-[10px]',
              pathname.startsWith('/settings') ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Settings className="h-5 w-5" />
            Cài đặt
          </Link>

          {/* More → opens drawer */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground"
          >
            <MoreHorizontal className="h-5 w-5" />
            Thêm
          </button>
        </div>
      </nav>

      {/* Mobile drawer — settings + user info + logout */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-[280px] p-0">
          <SheetHeader className="p-4 pb-2">
            <SheetTitle className="text-left text-base">Menu</SheetTitle>
          </SheetHeader>

          {/* User info */}
          {userData && (
            <div className="px-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{userData.displayName}</p>
                  <Badge variant={role !== 'staff' ? 'default' : 'secondary'} className="text-[10px] h-4 px-1.5">
                    {role === 'admin' ? 'Admin' : role === 'manager' ? 'Quản lý' : 'Nhân viên'}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Settings links */}
          <div className="py-2">
            <p className="px-4 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Cài đặt
            </p>
            {hasPermission('users', 'view') && (
              <button
                onClick={() => handleDrawerLink('/settings/users')}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-accent transition-colors"
              >
                <Users className="h-4 w-4 text-muted-foreground" />
                Quản lý người dùng
              </button>
            )}
            <button
              onClick={() => handleDrawerLink('/settings/collectors')}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-accent transition-colors"
            >
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              Người nộp tiền
            </button>
            {hasPermission('kiotviet', 'view') && (
              <button
                onClick={() => handleDrawerLink('/settings/kiotviet')}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-accent transition-colors"
              >
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                KiotViet
              </button>
            )}
          </div>

          <Separator />

          {/* Logout */}
          <div className="py-2">
            <button
              onClick={() => {
                setDrawerOpen(false);
                handleLogout();
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-destructive hover:bg-accent transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
