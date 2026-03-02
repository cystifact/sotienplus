import { z } from 'zod';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { getAdminDb } from '@/lib/firebase-admin';
import { TRPCError } from '@trpc/server';
import { FieldValue } from 'firebase-admin/firestore';
import { hasPermission } from '../lib/permission-utils';

/** Get today's date in Vietnam timezone (server-side, timezone-safe) */
function getVietnamToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export const expenseRecordsRouter = router({
  list: protectedProcedure
    .use(requirePermission('expenses', 'view'))
    .input(
      z.object({
        date: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        expenseTypeId: z.string().optional(),
        limit: z.number().min(1).max(2000).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getAdminDb();
      let query: FirebaseFirestore.Query = db.collection('expense_records');

      // Server-side date filter guard: users without date_filter permission can only view today
      const canDateFilter = ctx.userData?.role === 'admin' || hasPermission(ctx.permissions, 'expenses', 'date_filter');
      if (!canDateFilter) {
        const today = getVietnamToday();
        input = { ...input, date: today, startDate: undefined, endDate: undefined };
      }

      if (input.date) {
        query = query.where('date', '==', input.date);
      } else if (input.startDate && input.endDate) {
        query = query
          .where('date', '>=', input.startDate)
          .where('date', '<=', input.endDate);
      } else if (input.startDate) {
        query = query.where('date', '>=', input.startDate);
      } else if (input.endDate) {
        query = query.where('date', '<=', input.endDate);
      }

      if (input.expenseTypeId) {
        query = query.where('expenseTypeId', '==', input.expenseTypeId);
      }

      query = query.where('isActive', '==', true);
      query = query.orderBy('date', 'desc').orderBy('createdAt', 'desc');

      if (input.limit) {
        query = query.limit(input.limit);
      }

      const snapshot = await query.get();
      const limited = snapshot.docs.slice(0, input.limit || 1000);

      const results = limited.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        orderIndex: doc.data().orderIndex ?? 0,
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
        rpaSyncAt: doc.data().rpaSyncAt?.toDate?.()?.toISOString() || null,
        rpaQueuedAt: doc.data().rpaQueuedAt?.toDate?.()?.toISOString() || null,
        rpaProcessingAt: doc.data().rpaProcessingAt?.toDate?.()?.toISOString() || null,
        deletedAt: doc.data().deletedAt?.toDate?.()?.toISOString() || null,
      }));

      // Sort by orderIndex in application code (Firestore orderBy excludes docs missing the field)
      results.sort((a, b) => {
        if (a.createdAt === b.createdAt) {
          return (a.orderIndex as number) - (b.orderIndex as number);
        }
        return 0;
      });

      return results;
    }),

  create: protectedProcedure
    .use(requirePermission('expenses', 'create'))
    .input(
      z.object({
        date: z.string().min(1).max(10),
        expenseTypeId: z.string().max(100).optional(),
        expenseTypeName: z.string().min(1).max(200),
        amount: z.number().int().positive(),
        notes: z.string().max(500).optional(),
        importedFromExcel: z.boolean().optional(),
        importSource: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const now = FieldValue.serverTimestamp();
      const isImported = input.importedFromExcel || false;

      const docRef = await db.collection('expense_records').add({
        date: input.date,
        expenseTypeId: input.expenseTypeId || null,
        expenseTypeName: input.expenseTypeName,
        amount: input.amount,
        notes: input.notes || null,
        checkActualPaid: false,
        checkKiotVietEntered: false,
        isActive: true,
        importedFromExcel: isImported,
        importSource: input.importSource || null,
        rpaStatus: !isImported ? 'pending' : null,
        rpaError: null,
        rpaSyncAt: null,
        rpaQueuedAt: !isImported ? now : null,
        rpaRetryCount: 0,
        rpaProcessingBy: null,
        rpaProcessingAt: null,
        rpaOriginalAmount: null,
        rpaOriginalExpenseTypeName: null,
        rpaNeedsKiotVietCorrection: false,
        rpaKiotVietCorrected: false,
        createdBy: ctx.userData!.id,
        createdByName: ctx.userData!.displayName,
        createdAt: now,
        orderIndex: 0,
        updatedAt: now,
        updatedBy: null,
        deletedBy: null,
        deletedAt: null,
      });

      return { id: docRef.id };
    }),

  bulkCreate: protectedProcedure
    .use(requirePermission('expenses', 'create'))
    .input(
      z.object({
        date: z.string().min(1).max(10),
        records: z.array(
          z.object({
            expenseTypeId: z.string().max(100).optional(),
            expenseTypeName: z.string().min(1).max(200),
            amount: z.number().int().positive(),
            notes: z.string().max(500).optional(),
          })
        ).min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const batch = db.batch();
      const now = FieldValue.serverTimestamp();

      const ids: string[] = [];
      for (let i = 0; i < input.records.length; i++) {
        const record = input.records[i];
        const docRef = db.collection('expense_records').doc();
        batch.set(docRef, {
          date: input.date,
          expenseTypeId: record.expenseTypeId || null,
          expenseTypeName: record.expenseTypeName,
          amount: record.amount,
          notes: record.notes || null,
          checkActualPaid: false,
          checkKiotVietEntered: false,
          isActive: true,
          importedFromExcel: false,
          importSource: null,
          rpaStatus: 'pending',
          rpaError: null,
          rpaSyncAt: null,
          rpaQueuedAt: now,
          rpaRetryCount: 0,
          rpaProcessingBy: null,
          rpaProcessingAt: null,
          rpaOriginalAmount: null,
          rpaOriginalExpenseTypeName: null,
          rpaNeedsKiotVietCorrection: false,
          rpaKiotVietCorrected: false,
          createdBy: ctx.userData!.id,
          createdByName: ctx.userData!.displayName,
          createdAt: now,
          orderIndex: i,
          updatedAt: now,
          updatedBy: null,
          deletedBy: null,
          deletedAt: null,
        });
        ids.push(docRef.id);
      }

      await batch.commit();
      return { ids };
    }),

  importFromExcel: protectedProcedure
    .use(requirePermission('expenses', 'import'))
    .input(
      z.object({
        records: z.array(
          z.object({
            date: z.string().min(1).max(10),
            expenseTypeId: z.string().max(100).optional(),
            expenseTypeName: z.string().min(1).max(200),
            amount: z.number().int().positive(),
            notes: z.string().max(500).optional(),
          })
        ).min(1).max(1000),
        importSource: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const batch = db.batch();
      const now = FieldValue.serverTimestamp();

      const ids: string[] = [];
      for (const record of input.records) {
        const docRef = db.collection('expense_records').doc();
        batch.set(docRef, {
          date: record.date,
          expenseTypeId: record.expenseTypeId || null,
          expenseTypeName: record.expenseTypeName,
          amount: record.amount,
          notes: record.notes || null,
          checkActualPaid: false,
          checkKiotVietEntered: false,
          isActive: true,
          importedFromExcel: true,
          importSource: input.importSource || null,
          rpaStatus: null, // Imported records skip RPA
          rpaError: null,
          rpaSyncAt: null,
          rpaQueuedAt: null,
          rpaRetryCount: 0,
          rpaProcessingBy: null,
          rpaProcessingAt: null,
          rpaOriginalAmount: null,
          rpaOriginalExpenseTypeName: null,
          rpaNeedsKiotVietCorrection: false,
          rpaKiotVietCorrected: false,
          createdBy: ctx.userData!.id,
          createdByName: ctx.userData!.displayName,
          createdAt: now,
          updatedAt: now,
          updatedBy: null,
          deletedBy: null,
          deletedAt: null,
        });
        ids.push(docRef.id);
      }

      await batch.commit();
      return { ids, count: ids.length };
    }),

  update: protectedProcedure
    .use(requirePermission('expenses', 'edit'))
    .input(
      z.object({
        id: z.string(),
        expenseTypeId: z.string().max(100).optional(),
        expenseTypeName: z.string().min(1).max(200).optional(),
        amount: z.number().int().positive().optional(),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const { id, ...updateData } = input;

      const doc = await db.collection('expense_records').doc(id).get();
      if (!doc.exists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi chi không tồn tại' });
      }

      const existing = doc.data();
      const firestoreUpdate: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      };

      // Detect changes for RPA correction flag
      let needsCorrection = false;
      if (updateData.expenseTypeName !== undefined && updateData.expenseTypeName !== existing?.expenseTypeName) {
        firestoreUpdate.expenseTypeName = updateData.expenseTypeName;
        if (!existing?.rpaOriginalExpenseTypeName) {
          firestoreUpdate.rpaOriginalExpenseTypeName = existing?.expenseTypeName;
        }
        needsCorrection = true;
      }
      if (updateData.amount !== undefined && updateData.amount !== existing?.amount) {
        firestoreUpdate.amount = updateData.amount;
        if (!existing?.rpaOriginalAmount) {
          firestoreUpdate.rpaOriginalAmount = existing?.amount;
        }
        needsCorrection = true;
      }

      if (updateData.expenseTypeId !== undefined) firestoreUpdate.expenseTypeId = updateData.expenseTypeId || null;
      if (updateData.notes !== undefined) firestoreUpdate.notes = updateData.notes || null;

      // Set correction flag if changes detected and RPA succeeded
      if (needsCorrection && existing?.rpaStatus === 'success') {
        firestoreUpdate.rpaNeedsKiotVietCorrection = true;
      }

      await db.collection('expense_records').doc(id).update(firestoreUpdate);
      return { success: true };
    }),

  delete: protectedProcedure
    .use(requirePermission('expenses', 'delete'))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const doc = await db.collection('expense_records').doc(input.id).get();
      const data = doc.data() ?? {};
      const updateData: Record<string, unknown> = {
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
        deletedBy: ctx.userData!.id,
        deletedAt: FieldValue.serverTimestamp(),
      };
      // Cancel RPA if still pending/processing so daemon doesn't process deleted records
      if (data.rpaStatus === 'pending' || data.rpaStatus === 'processing') {
        updateData.rpaStatus = 'cancelled';
        updateData.rpaProcessingBy = null;
        updateData.rpaProcessingAt = null;
      }
      await db.collection('expense_records').doc(input.id).update(updateData);
      return { success: true };
    }),

  toggleCheck: protectedProcedure
    .use(requirePermission('expenses', 'check'))
    .input(
      z.object({
        id: z.string(),
        field: z.enum(['checkActualPaid', 'checkKiotVietEntered']),
        value: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      await db.collection('expense_records').doc(input.id).update({
        [input.field]: input.value,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      });
      return { success: true };
    }),

  bulkCheck: protectedProcedure
    .use(requirePermission('expenses', 'bulk_check'))
    .input(
      z.object({
        date: z.string(),
        field: z.enum(['checkActualPaid', 'checkKiotVietEntered']),
        value: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const snapshot = await db.collection('expense_records')
        .where('date', '==', input.date)
        .where('isActive', '==', true)
        .get();

      const batch = db.batch();
      const now = FieldValue.serverTimestamp();

      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          [input.field]: input.value,
          updatedAt: now,
          updatedBy: ctx.userData!.id,
        });
      });

      await batch.commit();
      return { success: true, count: snapshot.size };
    }),

  dailySummary: protectedProcedure
    .use(requirePermission('expenses', 'view'))
    .input(z.object({ date: z.string() }))
    .query(async ({ input }) => {
      const db = getAdminDb();
      const snapshot = await db.collection('expense_records')
        .where('date', '==', input.date)
        .where('isActive', '==', true)
        .get();

      let totalAmount = 0;
      let paidCount = 0;
      let enteredCount = 0;
      let rpaPendingCount = 0;
      let rpaSuccessCount = 0;
      let rpaFailedCount = 0;

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        totalAmount += data.amount || 0;
        if (data.checkActualPaid) paidCount++;
        if (data.checkKiotVietEntered) enteredCount++;
        if (data.rpaStatus === 'pending' || data.rpaStatus === 'processing') rpaPendingCount++;
        if (data.rpaStatus === 'success') rpaSuccessCount++;
        if (data.rpaStatus === 'failed') rpaFailedCount++;
      });

      return {
        totalAmount,
        recordCount: snapshot.size,
        paidCount,
        enteredCount,
        rpaPendingCount,
        rpaSuccessCount,
        rpaFailedCount,
      };
    }),

  checkDuplicateBatch: protectedProcedure
    .use(requirePermission('expenses', 'create'))
    .input(
      z.object({
        date: z.string(),
        records: z.array(
          z.object({
            expenseTypeName: z.string(),
            amount: z.number(),
          })
        ),
      })
    )
    .query(async ({ input }) => {
      const db = getAdminDb();
      const snapshot = await db.collection('expense_records')
        .where('date', '==', input.date)
        .where('isActive', '==', true)
        .get();

      const existing = snapshot.docs.map((doc) => ({
        expenseTypeName: doc.data().expenseTypeName,
        amount: doc.data().amount,
      }));

      return input.records.map((record) => {
        const duplicates = existing.filter(
          (e) => e.expenseTypeName === record.expenseTypeName && e.amount === record.amount
        );
        return {
          isDuplicate: duplicates.length > 0,
          duplicateCount: duplicates.length,
        };
      });
    }),

  markForSync: protectedProcedure
    .use(requirePermission('expenses', 'rpa_sync'))
    .input(z.object({ date: z.string() }))
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      const snapshot = await db.collection('expense_records')
        .where('date', '==', input.date)
        .where('isActive', '==', true)
        .get();

      // Filter: has valid expenseTypeName + not already success/pending/processing + not imported from Excel
      const eligibleDocs = snapshot.docs.filter((doc) => {
        const data = doc.data();
        return (
          data.expenseTypeName &&
          !['success', 'pending', 'processing'].includes(data.rpaStatus) &&
          !data.importedFromExcel
        );
      });

      if (eligibleDocs.length === 0) {
        return { success: true, count: 0 };
      }

      const batch = db.batch();
      const now = FieldValue.serverTimestamp();

      eligibleDocs.forEach((doc) => {
        batch.update(doc.ref, {
          rpaStatus: 'pending',
          rpaQueuedAt: now,
          rpaError: null,
          updatedAt: now,
        });
      });

      await batch.commit();
      return { success: true, count: eligibleDocs.length };
    }),

  retryFailed: protectedProcedure
    .use(requirePermission('expenses', 'rpa_sync'))
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();

      // Batch-load docs to validate isActive
      const refs = input.ids.map(id => db.collection('expense_records').doc(id));
      const docs = await db.getAll(...refs);
      const validRefs = docs
        .filter(doc => doc.exists && doc.data()?.isActive !== false)
        .map(doc => doc.ref);

      const chunks: FirebaseFirestore.DocumentReference[][] = [];
      for (let i = 0; i < validRefs.length; i += 500) {
        chunks.push(validRefs.slice(i, i + 500));
      }

      let retried = 0;
      for (const chunk of chunks) {
        const batch = db.batch();
        const now = FieldValue.serverTimestamp();
        for (const ref of chunk) {
          batch.update(ref, {
            rpaStatus: 'pending',
            rpaQueuedAt: now,
            rpaError: null,
            rpaProcessingBy: null,
            rpaProcessingAt: null,
            updatedAt: now,
            updatedBy: ctx.userData!.id,
          });
          retried++;
        }
        await batch.commit();
      }

      return { success: true, count: retried };
    }),

  rpaClaimNext: protectedProcedure
    .use(requirePermission('expenses', 'rpa_sync'))
    .input(z.object({ date: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const result = await db.runTransaction(async (txn) => {
        const snapshot = await txn.get(
          db.collection('expense_records')
            .where('date', '==', input.date)
            .where('rpaStatus', '==', 'pending')
            .orderBy('rpaQueuedAt', 'asc')
            .limit(1)
        );

        if (snapshot.empty) return null;

        const doc = snapshot.docs[0];
        const data = doc.data();
        txn.update(doc.ref, {
          rpaStatus: 'processing',
          rpaProcessingBy: ctx.userData!.id,
          rpaProcessingAt: FieldValue.serverTimestamp(),
        });

        return {
          id: doc.id,
          expenseTypeName: data.expenseTypeName,
          amount: data.amount,
          notes: data.notes || null,
        };
      });

      return result;
    }),

  rpaComplete: protectedProcedure
    .use(requirePermission('expenses', 'rpa_sync'))
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['success', 'failed']),
        error: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      const now = FieldValue.serverTimestamp();

      const updateData: Record<string, any> = {
        rpaStatus: input.status,
        rpaSyncAt: now,
        updatedAt: now,
      };

      if (input.status === 'failed') {
        updateData.rpaError = input.error || 'Unknown error';
      } else {
        updateData.rpaError = null;
      }

      await db.collection('expense_records').doc(input.id).update(updateData);
      return { success: true };
    }),

  confirmKiotVietCorrected: protectedProcedure
    .use(requirePermission('expenses', 'rpa_sync'))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      await db.collection('expense_records').doc(input.id).update({
        rpaNeedsKiotVietCorrection: false,
        rpaKiotVietCorrected: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      });
      return { success: true };
    }),

  updateRpaStatus: protectedProcedure
    .use(requirePermission('expenses', 'rpa_sync'))
    .input(
      z.object({
        id: z.string(),
        rpaStatus: z.enum(['pending', 'processing', 'success', 'failed']).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      await db.collection('expense_records').doc(input.id).update({
        rpaStatus: input.rpaStatus,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      });
      return { success: true };
    }),
});
