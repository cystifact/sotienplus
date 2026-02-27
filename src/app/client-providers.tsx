'use client';

import React, { useEffect, useRef } from 'react';
import { Toaster } from 'sonner';
import TRPCProvider from '@/_trpc/Provider';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/lib/auth-store';
import { onAuthStateChanged } from 'firebase/auth';

function useSyncServerSession(user: any) {
  // Track whether user was ever set to non-null.
  // Only call logout when transitioning from logged-in to logged-out (actual logout),
  // NOT on initial mount when user starts as null.
  const hadUserRef = useRef(false);
  const lastSyncRef = useRef<number>(0);

  useEffect(() => {
    if (!user) {
      if (hadUserRef.current) {
        // User was logged in and now logged out — sync server session
        hadUserRef.current = false;
        fetch('/api/session/logout', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => {});
      }
      return;
    }

    hadUserRef.current = true;

    const syncSession = async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/session/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ idToken }),
        });
        if (!res.ok) {
          console.warn('[SessionSync] Failed to sync session:', res.status);
        }
        lastSyncRef.current = Date.now();
      } catch (error) {
        console.warn('[SessionSync] Error syncing session:', error);
      }
    };

    // Only sync if cookie might be expired (>12 hours since last sync)
    // The cookie itself lasts 14 days, so we don't need to sync on every page load
    const timeSinceLastSync = Date.now() - lastSyncRef.current;
    if (timeSinceLastSync > 12 * 60 * 60 * 1000 || lastSyncRef.current === 0) {
      // Fire-and-forget: don't block auth flow
      syncSession();
    }

    const syncInterval = setInterval(syncSession, 4 * 60 * 60 * 1000); // Refresh every 4 hours
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
    </AuthProvider>
  );
}
