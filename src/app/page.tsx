'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

export default function HomePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authChecked = useAuthStore((state) => state.authChecked);

  useEffect(() => {
    if (!authChecked) return;
    if (user) {
      router.replace('/ledger');
    } else {
      router.replace('/login');
    }
  }, [user, authChecked, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Đang tải...</div>
    </div>
  );
}
