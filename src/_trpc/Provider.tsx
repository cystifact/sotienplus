'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { auth } from '@/lib/firebase';
import type { User } from 'firebase/auth';

export default function TRPCProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User | null;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 2,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 1,
          },
        },
      })
  );

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
          async headers() {
            // Read auth.currentUser directly to always get the latest auth state,
            // regardless of React render timing or closure staleness
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
