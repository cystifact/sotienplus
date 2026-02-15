import { router } from './trpc';
import { usersRouter } from './routers/users';
import { collectorsRouter } from './routers/collectors';
import { customersRouter } from './routers/customers';
import { cashRecordsRouter } from './routers/cashRecords';

export const appRouter = router({
  users: usersRouter,
  collectors: collectorsRouter,
  customers: customersRouter,
  cashRecords: cashRecordsRouter,
});

export type AppRouter = typeof appRouter;
