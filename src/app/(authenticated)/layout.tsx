'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { Header } from '@/components/layout/Header';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authChecked = useAuthStore((state) => state.authChecked);
  const sessionHint = useAuthStore((state) => state.sessionHint);

  useEffect(() => {
    if (authChecked && !user) {
      router.replace('/login');
    }
  }, [user, authChecked, router]);

  if (!authChecked && !sessionHint) {
    return (
      <div className="min-h-screen bg-background">
        {/* Skeleton header */}
        <header className="sticky top-0 z-40 border-b bg-background h-14">
          <div className="container-optimized flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="h-8 w-8 rounded bg-muted animate-pulse" />
              <div className="h-5 w-32 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-9 w-24 rounded bg-muted animate-pulse" />
          </div>
        </header>
        {/* Skeleton content */}
        <main className="container-optimized py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-48 rounded bg-muted animate-pulse" />
              <div className="h-10 w-32 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-12 w-full rounded-lg bg-muted animate-pulse" />
            <div className="h-96 rounded-lg bg-muted animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  if (authChecked && !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <InstallPrompt />
      {/* pb-20 on mobile for bottom nav + safe area, pb-6 on desktop */}
      <main className="container-optimized py-4 pb-20 md:pb-6">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}
