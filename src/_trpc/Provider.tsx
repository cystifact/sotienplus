'use client';

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { httpBatchLink, TRPCClientError } from '@trpc/client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/lib/auth-store';
import type { User } from 'firebase/auth';

export default function TRPCProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User | null;
}) {
  const clearSessionHint = useAuthStore((state) => state.clearSessionHint);
  const clearSessionHintRef = useRef(clearSessionHint);
  clearSessionHintRef.current = clearSessionHint;

  const [queryClient] = useState(() => {
    const handleUnauthorized = (error: unknown) => {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === 'UNAUTHORIZED'
      ) {
        clearSessionHintRef.current();
        window.location.href = '/login';
      }
    };

    return new QueryClient({
      queryCache: new QueryCache({ onError: handleUnauthorized }),
      mutationCache: new MutationCache({ onError: handleUnauthorized }),
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          gcTime: 10 * 60 * 1000,
          retry: (failureCount, error) => {
            if (
              error instanceof TRPCClientError &&
              error.data?.code === 'UNAUTHORIZED'
            ) {
              return false;
            }
            return failureCount < 2;
          },
          refetchOnWindowFocus: false,
        },
        mutations: {
          retry: 1,
        },
      },
    });
  });

  // Clear cached queries on logout or user switch
  const prevUidRef = useRef<string | undefined>(user?.uid);
  useEffect(() => {
    const prevUid = prevUidRef.current;
    const currentUid = user?.uid;

    if (prevUid !== currentUid) {
      // User changed (logout, login, or switch): clear entire cache
      queryClient.clear();
    }

    prevUidRef.current = currentUid;
  }, [user?.uid, queryClient]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trpcClient = useMemo(() => {
    return trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          maxURLLength: 2000,
          fetch(url, options) {
            return fetch(url, { ...options, credentials: 'include' });
          },
          async headers() {
            // HTTP-only cookies aren't accessible via document.cookie
            // Always try Bearer token if user exists, let server prefer cookie if available
            const currentUser = auth.currentUser;
            if (currentUser) {
              try {
                const token = await currentUser.getIdToken();
                return { Authorization: `Bearer ${token}` };
              } catch {
                return {};
              }
            }
            return {};
          },
        }),
      ],
    });
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
