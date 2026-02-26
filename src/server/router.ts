import { router } from './trpc';
import { usersRouter } from './routers/users';
import { collectorsRouter } from './routers/collectors';
import { customersRouter } from './routers/customers';
import { cashRecordsRouter } from './routers/cashRecords';
import { expenseTypesRouter } from './routers/expenseTypes';
import { expenseRecordsRouter } from './routers/expenseRecords';

export const appRouter = router({
  users: usersRouter,
  collectors: collectorsRouter,
  customers: customersRouter,
  cashRecords: cashRecordsRouter,
  expenseTypes: expenseTypesRouter,
  expenseRecords: expenseRecordsRouter,
});

export type AppRouter = typeof appRouter;
