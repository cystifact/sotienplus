'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { BookOpen, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

const navLinks = [
  { href: '/ledger', label: 'Sổ Ghi', icon: BookOpen },
  { href: '/settings', label: 'Cài đặt', icon: Settings },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const currentUser = trpc.users.getCurrentUser.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  });

  const handleLogout = async () => {
    try {
      await fetch('/api/session/logout', { method: 'POST', credentials: 'include' });
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      toast.error('Đăng xuất thất bại');
    }
  };

  return (
    <>
      {/* Desktop header */}
      <header className="hidden md:block sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/ledger" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <BookOpen className="h-4 w-4" />
              </div>
              <span className="font-bold text-lg text-primary">Sổ Ghi Tiền</span>
            </Link>
            <nav className="flex items-center gap-1">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  <Button
                    variant={pathname.startsWith(link.href) ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      pathname.startsWith(link.href) && 'bg-primary/10 text-primary'
                    )}
                  >
                    <link.icon className="h-4 w-4 mr-2" />
                    {link.label}
                  </Button>
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {currentUser.data && (
              <span className="text-sm text-muted-foreground">
                {currentUser.data.displayName}
                {currentUser.data.role === 'admin' && (
                  <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    Admin
                  </span>
                )}
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-around h-16">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-2 text-xs',
                pathname.startsWith(link.href)
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <link.icon className="h-5 w-5" />
              {link.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="flex flex-col items-center gap-1 px-4 py-2 text-xs text-muted-foreground"
          >
            <LogOut className="h-5 w-5" />
            Thoát
          </button>
        </div>
      </nav>
    </>
  );
}
