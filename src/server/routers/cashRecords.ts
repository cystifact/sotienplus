import { z } from 'zod';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { getAdminDb } from '@/lib/firebase-admin';
import { TRPCError } from '@trpc/server';
import { FieldValue } from 'firebase-admin/firestore';

// Customer codes that should skip RPA (e.g. internal/transfer accounts)
const RPA_SKIP_CODE_PREFIXES = ['XB'];

function shouldSkipRpa(customerCode?: string | null): boolean {
  if (!customerCode) return true;
  const upper = customerCode.toUpperCase();
  return RPA_SKIP_CODE_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

/** Get today's date in Vietnam timezone (server-side, timezone-safe) */
function getVietnamToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export const cashRecordsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        date: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        collectorId: z.string().optional(),
        limit: z.number().min(1).max(2000).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = getAdminDb();
      let query: FirebaseFirestore.Query = db.collection('cash_records');

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

      if (input.collectorId) {
        query = query.where('collectorId', '==', input.collectorId);
      }

      query = query.orderBy('date', 'desc').orderBy('createdAt', 'asc');

      const snapshot = await query.get();
      // Filter in application code — Firestore != excludes docs missing the field
      const activeDocs = snapshot.docs.filter((doc) => doc.data().isActive !== false);
      const limited = activeDocs.slice(0, input.limit || 1000);

      return limited.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
        rpaSyncAt: doc.data().rpaSyncAt?.toDate?.()?.toISOString() || null,
        rpaQueuedAt: doc.data().rpaQueuedAt?.toDate?.()?.toISOString() || null,
        rpaProcessingAt: doc.data().rpaProcessingAt?.toDate?.()?.toISOString() || null,
      }));
    }),

  create: protectedProcedure
    .use(requirePermission('ledger', 'create'))
    .input(
      z.object({
        date: z.string().min(1).max(10),
        customerId: z.string().max(100).optional(),
        customerName: z.string().min(1).max(200),
        customerCode: z.string().max(50).optional(),
        amount: z.number().int().positive(),
        collectorId: z.string().min(1).max(100),
        collectorName: z.string().min(1).max(100),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const now = FieldValue.serverTimestamp();

      const docRef = await db.collection('cash_records').add({
        date: input.date,
        customerId: input.customerId || null,
        customerName: input.customerName,
        customerCode: input.customerCode || null,
        amount: input.amount,
        collectorId: input.collectorId,
        collectorName: input.collectorName,
        notes: input.notes || null,
        checkActualReceived: false,
        checkKiotVietEntered: false,
        isActive: true,
        rpaStatus: !shouldSkipRpa(input.customerCode) ? 'pending' : null,
        rpaError: null,
        rpaSyncAt: null,
        rpaQueuedAt: !shouldSkipRpa(input.customerCode) ? now : null,
        rpaRetryCount: 0,
        rpaProcessingBy: null,
        rpaProcessingAt: null,
        rpaOriginalAmount: null,
        rpaOriginalCustomerName: null,
        rpaNeedsKiotVietCorrection: false,
        rpaKiotVietCorrected: false,
        createdBy: ctx.userData!.id,
        createdByName: ctx.userData!.displayName,
        createdAt: now,
        updatedAt: now,
        updatedBy: null,
      });

      return { id: docRef.id };
    }),

  bulkCreate: protectedProcedure
    .use(requirePermission('ledger', 'create'))
    .input(
      z.object({
        date: z.string().min(1).max(10),
        collectorId: z.string().min(1).max(100),
        collectorName: z.string().min(1).max(100),
        records: z.array(
          z.object({
            customerId: z.string().max(100).optional(),
            customerName: z.string().min(1).max(200),
            customerCode: z.string().max(50).optional(),
            amount: z.number().int().positive(),
            notes: z.string().max(500).optional(),
          })
        ).min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const now = FieldValue.serverTimestamp();

      // Server-side duplicate check within a transaction for atomicity
      const createdIds: string[] = [];
      const existingSnapshot = await db
        .collection('cash_records')
        .where('date', '==', input.date)
        .select('customerName', 'amount', 'isActive')
        .get();

      const existingSet = new Set(
        existingSnapshot.docs
          .filter((doc) => doc.data().isActive !== false)
          .map((doc) => {
            const d = doc.data();
            return `${(d.customerName as string).toLowerCase()}|${d.amount}`;
          })
      );

      // Build records, flagging server-side duplicates
      const recordsWithDupCheck = input.records.map((record) => {
        const key = `${record.customerName.trim().toLowerCase()}|${record.amount}`;
        return { ...record, isDuplicate: existingSet.has(key) };
      });

      const chunks: typeof input.records[] = [];
      for (let i = 0; i < input.records.length; i += 500) {
        chunks.push(input.records.slice(i, i + 500));
      }

      for (const chunk of chunks) {
        const batch = db.batch();
        for (const record of chunk) {
          const docRef = db.collection('cash_records').doc();
          batch.set(docRef, {
            date: input.date,
            customerId: record.customerId || null,
            customerName: record.customerName,
            customerCode: record.customerCode || null,
            amount: record.amount,
            collectorId: input.collectorId,
            collectorName: input.collectorName,
            notes: record.notes || null,
            checkActualReceived: false,
            checkKiotVietEntered: false,
            isActive: true,
            rpaStatus: !shouldSkipRpa(record.customerCode) ? 'pending' : null,
            rpaError: null,
            rpaSyncAt: null,
            rpaQueuedAt: !shouldSkipRpa(record.customerCode) ? now : null,
            rpaRetryCount: 0,
            rpaProcessingBy: null,
            rpaProcessingAt: null,
            rpaOriginalAmount: null,
            rpaOriginalCustomerName: null,
            rpaNeedsKiotVietCorrection: false,
            rpaKiotVietCorrected: false,
            createdBy: ctx.userData!.id,
            createdByName: ctx.userData!.displayName,
            createdAt: now,
            updatedAt: now,
            updatedBy: null,
          });
          createdIds.push(docRef.id);
        }
        await batch.commit();
      }

      return {
        ids: createdIds,
        count: createdIds.length,
        duplicatesDetected: recordsWithDupCheck.filter((r) => r.isDuplicate).length,
      };
    }),

  update: protectedProcedure
    .use(requirePermission('ledger', 'edit'))
    .input(
      z.object({
        id: z.string(),
        date: z.string().max(10).optional(),
        customerId: z.string().max(100).optional(),
        customerName: z.string().max(200).optional(),
        customerCode: z.string().max(50).optional(),
        amount: z.number().int().positive().optional(),
        collectorId: z.string().max(100).optional(),
        collectorName: z.string().max(100).optional(),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const { id, ...updateData } = input;

      // Use a transaction to prevent race conditions with RPA state
      await db.runTransaction(async (txn) => {
        const docRef = db.collection('cash_records').doc(id);
        const doc = await txn.get(docRef);

        if (!doc.exists) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi không tồn tại' });
        }

        const data = doc.data()!;

        if (data.isActive === false) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi đã bị xóa' });
        }

        const isAdmin = ctx.userData!.role === 'admin';

        // Non-admin: restricted to own records, same day (Vietnam timezone)
        if (!isAdmin) {
          if (data.createdBy !== ctx.userData!.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn chỉ được sửa bản ghi của mình' });
          }
          const todayISO = getVietnamToday();
          if (data.date !== todayISO) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Chỉ được sửa bản ghi trong ngày' });
          }
        }

        const firestoreUpdate: Record<string, any> = {
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: ctx.userData!.id,
        };
        if (updateData.date !== undefined) firestoreUpdate.date = updateData.date;
        if (updateData.customerId !== undefined) firestoreUpdate.customerId = updateData.customerId || null;
        if (updateData.customerName !== undefined) firestoreUpdate.customerName = updateData.customerName;
        if (updateData.customerCode !== undefined) firestoreUpdate.customerCode = updateData.customerCode || null;
        if (updateData.amount !== undefined) firestoreUpdate.amount = updateData.amount;
        if (updateData.collectorId !== undefined) firestoreUpdate.collectorId = updateData.collectorId;
        if (updateData.collectorName !== undefined) firestoreUpdate.collectorName = updateData.collectorName;
        if (updateData.notes !== undefined) firestoreUpdate.notes = updateData.notes || null;

        // Detect changes on records already synced to KiotViet
        if (data.rpaStatus === 'success') {
          const amountChanged = updateData.amount !== undefined
            && updateData.amount !== data.rpaOriginalAmount;
          const customerChanged = updateData.customerName !== undefined
            && updateData.customerName !== data.rpaOriginalCustomerName;

          if (amountChanged || customerChanged) {
            firestoreUpdate.rpaNeedsKiotVietCorrection = true;
            firestoreUpdate.rpaKiotVietCorrected = false;
          }
        }

        // Auto-queue for RPA when record gains a customerCode and hasn't been processed yet
        const newCustomerCode = updateData.customerCode || data.customerCode;
        const needsRpaQueue = !shouldSkipRpa(newCustomerCode)
          && (!data.rpaStatus || data.rpaStatus === 'failed');
        if (needsRpaQueue) {
          firestoreUpdate.rpaStatus = 'pending';
          firestoreUpdate.rpaQueuedAt = FieldValue.serverTimestamp();
          firestoreUpdate.rpaError = null;
          firestoreUpdate.rpaRetryCount = (data.rpaRetryCount || 0);
          firestoreUpdate.rpaProcessingBy = null;
          firestoreUpdate.rpaProcessingAt = null;
        }

        txn.update(docRef, firestoreUpdate);
      });

      return { success: true };
    }),

  delete: protectedProcedure
    .use(requirePermission('ledger', 'delete'))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const doc = await db.collection('cash_records').doc(input.id).get();
      if (!doc.exists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi không tồn tại' });
      }
      // Soft delete: mark as inactive instead of removing
      await db.collection('cash_records').doc(input.id).update({
        isActive: false,
        deletedAt: FieldValue.serverTimestamp(),
        deletedBy: ctx.userData!.id,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      });
      return { success: true };
    }),

  toggleCheck: protectedProcedure
    .use(requirePermission('ledger', 'check'))
    .input(
      z.object({
        id: z.string(),
        field: z.enum(['checkActualReceived', 'checkKiotVietEntered']),
        value: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      await db.collection('cash_records').doc(input.id).update({
        [input.field]: input.value,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      });
      return { success: true };
    }),

  bulkCheck: protectedProcedure
    .use(requirePermission('ledger', 'bulk_check'))
    .input(
      z.object({
        date: z.string(),
        field: z.enum(['checkActualReceived', 'checkKiotVietEntered']),
        value: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const snapshot = await db
        .collection('cash_records')
        .where('date', '==', input.date)
        .where(input.field, '==', !input.value)
        .get();

      // Filter in application code for isActive compatibility
      const activeDocs = snapshot.docs.filter((doc) => doc.data().isActive !== false);
      if (activeDocs.length === 0) return { updated: 0 };

      const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
      for (let i = 0; i < activeDocs.length; i += 500) {
        chunks.push(activeDocs.slice(i, i + 500));
      }

      let updated = 0;
      for (const chunk of chunks) {
        const batch = db.batch();
        for (const doc of chunk) {
          batch.update(doc.ref, {
            [input.field]: input.value,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: ctx.userData!.id,
          });
          updated++;
        }
        await batch.commit();
      }

      return { updated };
    }),

  dailySummary: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ input }) => {
      const db = getAdminDb();
      const snapshot = await db
        .collection('cash_records')
        .where('date', '==', input.date)
        .get();

      const activeDocs = snapshot.docs.filter((doc) => doc.data().isActive !== false);

      let totalAmount = 0;
      let checkActualCount = 0;
      let checkKiotVietCount = 0;
      const total = activeDocs.length;

      activeDocs.forEach((doc) => {
        const data = doc.data();
        totalAmount += data.amount || 0;
        if (data.checkActualReceived) checkActualCount++;
        if (data.checkKiotVietEntered) checkKiotVietCount++;
      });

      return {
        totalAmount: Math.round(totalAmount),
        totalRecords: total,
        checkActualCount,
        checkKiotVietCount,
      };
    }),

  checkDuplicate: protectedProcedure
    .input(
      z.object({
        date: z.string(),
        customerName: z.string().max(200),
        amount: z.number(),
        excludeId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = getAdminDb();
      const query = db
        .collection('cash_records')
        .where('date', '==', input.date)
        .where('customerName', '==', input.customerName)
        .where('amount', '==', input.amount);

      const snapshot = await query.get();
      const duplicates = snapshot.docs
        .filter((doc) => doc.id !== input.excludeId && doc.data().isActive !== false)
        .map((doc) => ({
          id: doc.id,
          collectorName: doc.data().collectorName,
          createdByName: doc.data().createdByName,
        }));

      return { hasDuplicate: duplicates.length > 0, duplicates };
    }),

  checkDuplicateBatch: protectedProcedure
    .input(
      z.object({
        date: z.string(),
        entries: z.array(
          z.object({
            customerName: z.string().max(200),
            amount: z.number(),
          })
        ).min(1).max(100),
      })
    )
    .query(async ({ input }) => {
      const db = getAdminDb();
      const snapshot = await db
        .collection('cash_records')
        .where('date', '==', input.date)
        .get();

      const existingRecords = snapshot.docs
        .filter((doc) => doc.data().isActive !== false)
        .map((doc) => ({
        id: doc.id,
        customerName: doc.data().customerName as string,
        amount: doc.data().amount as number,
        collectorName: doc.data().collectorName as string,
        createdByName: doc.data().createdByName as string,
      }));

      const results = input.entries.map((entry) => {
        const duplicates = existingRecords.filter(
          (r) => r.customerName === entry.customerName && r.amount === entry.amount
        );
        return {
          customerName: entry.customerName,
          amount: entry.amount,
          hasDuplicate: duplicates.length > 0,
          duplicates: duplicates.map((d) => ({
            id: d.id,
            collectorName: d.collectorName,
            createdByName: d.createdByName,
          })),
        };
      });

      return { results };
    }),

  markForSync: protectedProcedure
    .use(requirePermission('ledger', 'rpa_sync'))
    .input(z.object({ date: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const snapshot = await db
        .collection('cash_records')
        .where('date', '==', input.date)
        .get();

      // Filter: active + has valid customerCode + not already success/pending/processing
      const eligibleDocs = snapshot.docs.filter((doc) => {
        const d = doc.data();
        if (d.isActive === false) return false;
        if (shouldSkipRpa(d.customerCode)) return false;
        return d.rpaStatus !== 'pending' && d.rpaStatus !== 'processing' && d.rpaStatus !== 'success';
      });

      if (eligibleDocs.length === 0) return { marked: 0 };

      const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
      for (let i = 0; i < eligibleDocs.length; i += 500) {
        chunks.push(eligibleDocs.slice(i, i + 500));
      }

      let marked = 0;
      for (const chunk of chunks) {
        const batch = db.batch();
        for (const doc of chunk) {
          batch.update(doc.ref, {
            rpaStatus: 'pending',
            rpaQueuedAt: FieldValue.serverTimestamp(),
            rpaRetryCount: 0,
            rpaError: null,
            rpaProcessingBy: null,
            rpaProcessingAt: null,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: ctx.userData!.id,
          });
          marked++;
        }
        await batch.commit();
      }

      return { marked };
    }),

  retryFailed: protectedProcedure
    .use(requirePermission('ledger', 'rpa_sync'))
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const chunks: string[][] = [];
      for (let i = 0; i < input.ids.length; i += 500) {
        chunks.push(input.ids.slice(i, i + 500));
      }

      let retried = 0;
      for (const chunk of chunks) {
        const batch = db.batch();
        for (const id of chunk) {
          const ref = db.collection('cash_records').doc(id);
          batch.update(ref, {
            rpaStatus: 'pending',
            rpaError: null,
            rpaQueuedAt: FieldValue.serverTimestamp(),
            rpaProcessingBy: null,
            rpaProcessingAt: null,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: ctx.userData!.id,
          });
          retried++;
        }
        await batch.commit();
      }

      return { retried };
    }),

  confirmKiotVietCorrected: protectedProcedure
    .use(requirePermission('ledger', 'rpa_sync'))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      await db.collection('cash_records').doc(input.id).update({
        rpaNeedsKiotVietCorrection: false,
        rpaKiotVietCorrected: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      });
      return { success: true };
    }),
});
