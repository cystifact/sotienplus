'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { Header } from '@/components/layout/Header';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authChecked = useAuthStore((state) => state.authChecked);

  useEffect(() => {
    if (authChecked && !user) {
      router.replace('/login');
    }
  }, [user, authChecked, router]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-busy="true">
        <div className="animate-pulse text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {/* pb-20 on mobile for bottom nav + safe area, pb-6 on desktop */}
      <main className="container-optimized py-4 pb-20 md:pb-6">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}
