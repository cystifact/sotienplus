'use client';

import React, { useEffect } from 'react';
import { Toaster } from 'sonner';
import TRPCProvider from '@/_trpc/Provider';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/lib/auth-store';
import { onAuthStateChanged } from 'firebase/auth';

function useSyncServerSession(user: any) {
  useEffect(() => {
    if (!user) {
      fetch('/api/session/logout', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});
      return;
    }

    const syncSession = async () => {
      try {
        const idToken = await user.getIdToken();
        await fetch('/api/session/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ idToken }),
        });
      } catch (error) {
        console.warn('[SessionSync] Error syncing session:', error);
      }
    };

    syncSession();

    const syncInterval = setInterval(syncSession, 12 * 60 * 60 * 1000);
    return () => clearInterval(syncInterval);
  }, [user]);
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setUser(user);
      },
      (error) => {
        console.error('[AuthProvider] Auth state error:', error);
        setUser(null);
      }
    );
    return () => unsubscribe();
  }, [setUser]);

  useSyncServerSession(user);

  return <>{children}</>;
}

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuthStore((state) => state.user);

  return (
    <AuthProvider>
      <TRPCProvider user={user}>
        {children}
      </TRPCProvider>
      <Toaster
        toastOptions={{
          classNames: {
            success: 'success-toast',
            error: 'error-toast',
          },
        }}
        theme="light"
        richColors={false}
      />
      <style jsx global>{`
        .success-toast {
          background-color: #f0fdf4 !important;
          border: 1px solid #bbf7d0 !important;
          color: #14532d !important;
        }
        .error-toast {
          background-color: #fef2f2 !important;
          border: 1px solid #fecaca !important;
          color: #991b1b !important;
        }
      `}</style>
    </AuthProvider>
  );
}
