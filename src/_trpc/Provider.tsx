'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import React, { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
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

  const trpcClient = useMemo(() => {
    return trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          maxURLLength: 2000,
          async headers() {
            if (user) {
              try {
                const token = await user.getIdToken();
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
  }, [user]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
