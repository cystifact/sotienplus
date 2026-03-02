import { z } from 'zod';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { getAdminDb } from '@/lib/firebase-admin';
import { TRPCError } from '@trpc/server';
import { FieldValue } from 'firebase-admin/firestore';
import { hasPermission } from '../lib/permission-utils';

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
    .use(requirePermission('ledger', 'view'))
    .input(
      z.object({
        date: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        collectorId: z.string().optional(),
        limit: z.number().min(1).max(2000).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getAdminDb();
      let query: FirebaseFirestore.Query = db.collection('cash_records');

      // Server-side date filter guard: users without date_filter permission can only view today
      const canDateFilter = ctx.userData?.role === 'admin' || hasPermission(ctx.permissions, 'ledger', 'date_filter');
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

      if (input.collectorId) {
        query = query.where('collectorId', '==', input.collectorId);
      }

      query = query.orderBy('date', 'desc').orderBy('createdAt', 'desc');

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
            const name = (d.customerName as string | null)?.toLowerCase() ?? '';
            return `${name}|${d.amount}`;
          })
      );

      // Build records, flagging server-side duplicates + intra-batch duplicates
      const seenInBatch = new Set<string>();
      const recordsWithDupCheck = input.records.map((record) => {
        const key = `${record.customerName.trim().toLowerCase()}|${record.amount}`;
        const isDuplicate = existingSet.has(key) || seenInBatch.has(key);
        seenInBatch.add(key);
        return { ...record, isDuplicate };
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
        const canEditAny = isAdmin || hasPermission(ctx.permissions, 'ledger', 'edit_any');

        // Without edit_any: restricted to own records, same day (Vietnam timezone)
        if (!canEditAny) {
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
        const newCustomerCode = updateData.customerCode !== undefined ? updateData.customerCode : data.customerCode;
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
      const data = doc.data()!;
      const updateData: Record<string, unknown> = {
        isActive: false,
        deletedAt: FieldValue.serverTimestamp(),
        deletedBy: ctx.userData!.id,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      };
      // Cancel RPA if still pending/processing so daemon doesn't process deleted records
      if (data.rpaStatus === 'pending' || data.rpaStatus === 'processing') {
        updateData.rpaStatus = 'cancelled';
        updateData.rpaProcessingBy = null;
        updateData.rpaProcessingAt = null;
      }
      await db.collection('cash_records').doc(input.id).update(updateData);
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
      const docRef = db.collection('cash_records').doc(input.id);
      const doc = await docRef.get();
      if (!doc.exists || doc.data()?.isActive === false) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi không tồn tại' });
      }
      await docRef.update({
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
    .use(requirePermission('ledger', 'view'))
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getAdminDb();
      const snapshot = await db
        .collection('cash_records')
        .where('date', '==', input.date)
        .get();

      const activeDocs = snapshot.docs.filter((doc) => doc.data().isActive !== false);

      let checkActualCount = 0;
      let checkKiotVietCount = 0;
      const total = activeDocs.length;

      const canViewTotal = ctx.userData?.role === 'admin' || hasPermission(ctx.permissions, 'ledger', 'view_total');

      let totalAmount = 0;
      activeDocs.forEach((doc) => {
        const data = doc.data();
        if (canViewTotal) totalAmount += data.amount || 0;
        if (data.checkActualReceived) checkActualCount++;
        if (data.checkKiotVietEntered) checkKiotVietCount++;
      });

      return {
        totalAmount: canViewTotal ? Math.round(totalAmount) : 0,
        totalRecords: total,
        checkActualCount,
        checkKiotVietCount,
      };
    }),

  checkDuplicate: protectedProcedure
    .use(requirePermission('ledger', 'view'))
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
    .use(requirePermission('ledger', 'view'))
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
        const nearDuplicates = existingRecords.filter(
          (r) =>
            r.customerName.toLowerCase() === entry.customerName.toLowerCase() &&
            Math.abs(r.amount - entry.amount) < 2000 &&
            r.amount !== entry.amount
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
          hasNearDuplicate: nearDuplicates.length > 0,
          nearDuplicates: nearDuplicates.map((d) => ({
            id: d.id,
            collectorName: d.collectorName,
            createdByName: d.createdByName,
            amount: d.amount,
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

      // Batch-load docs to validate isActive and shouldSkipRpa
      const refs = input.ids.map(id => db.collection('cash_records').doc(id));
      const docs = await db.getAll(...refs);
      const validRefs = docs
        .filter(doc => doc.exists && doc.data()?.isActive !== false && !shouldSkipRpa(doc.data()?.customerCode))
        .map(doc => doc.ref);

      const chunks: FirebaseFirestore.DocumentReference[][] = [];
      for (let i = 0; i < validRefs.length; i += 500) {
        chunks.push(validRefs.slice(i, i + 500));
      }

      let retried = 0;
      for (const chunk of chunks) {
        const batch = db.batch();
        for (const ref of chunk) {
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

      return { success: true, count: retried };
    }),

  rpaClaimNext: protectedProcedure
    .use(requirePermission('ledger', 'rpa_sync'))
    .input(z.object({ date: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();

      // Use a transaction to atomically claim the next pending record
      const result = await db.runTransaction(async (txn) => {
        const snapshot = await txn.get(
          db.collection('cash_records')
            .where('date', '==', input.date)
            .where('rpaStatus', '==', 'pending')
            .orderBy('rpaQueuedAt', 'asc')
            .limit(1)
        );

        if (snapshot.empty) return null;

        const doc = snapshot.docs[0];
        const data = doc.data();

        if (data.isActive === false || shouldSkipRpa(data.customerCode)) {
          return null;
        }

        txn.update(doc.ref, {
          rpaStatus: 'processing',
          rpaProcessingBy: ctx.userData!.id,
          rpaProcessingAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: ctx.userData!.id,
        });

        return {
          id: doc.id,
          customerName: data.customerName,
          customerCode: data.customerCode,
          amount: data.amount,
          date: data.date,
        };
      });

      return result;
    }),

  rpaComplete: protectedProcedure
    .use(requirePermission('ledger', 'rpa_sync'))
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['success', 'failed']),
        error: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const docRef = db.collection('cash_records').doc(input.id);
      const doc = await docRef.get();

      if (!doc.exists || doc.data()?.isActive === false) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi không tồn tại' });
      }

      const data = doc.data()!;
      const updateData: Record<string, any> = {
        rpaStatus: input.status,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      };

      if (input.status === 'success') {
        updateData.rpaSyncAt = FieldValue.serverTimestamp();
        updateData.rpaOriginalAmount = data.amount;
        updateData.rpaOriginalCustomerName = data.customerName;
        updateData.rpaError = null;
      } else {
        updateData.rpaError = input.error || 'Lỗi không xác định';
        updateData.rpaRetryCount = (data.rpaRetryCount || 0) + 1;
      }

      await docRef.update(updateData);
      return { success: true };
    }),

  confirmKiotVietCorrected: protectedProcedure
    .use(requirePermission('ledger', 'rpa_sync'))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const docRef = db.collection('cash_records').doc(input.id);
      const doc = await docRef.get();
      if (!doc.exists || doc.data()?.isActive === false) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi không tồn tại' });
      }
      await docRef.update({
        rpaNeedsKiotVietCorrection: false,
        rpaKiotVietCorrected: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      });
      return { success: true };
    }),

  updateRpaStatus: protectedProcedure
    .use(requirePermission('ledger', 'rpa_sync'))
    .input(
      z.object({
        id: z.string(),
        rpaStatus: z.enum(['pending', 'processing', 'success', 'failed']).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const docRef = db.collection('cash_records').doc(input.id);
      const doc = await docRef.get();
      if (!doc.exists || doc.data()?.isActive === false) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi không tồn tại' });
      }

      const updateData: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      };

      if (input.rpaStatus === null) {
        // Clear RPA status entirely - revert to manual checkbox mode
        updateData.rpaStatus = FieldValue.delete();
        updateData.rpaError = FieldValue.delete();
        updateData.rpaSyncAt = FieldValue.delete();
        updateData.rpaQueuedAt = FieldValue.delete();
        updateData.rpaProcessingBy = FieldValue.delete();
        updateData.rpaProcessingAt = FieldValue.delete();
        updateData.rpaRetryCount = FieldValue.delete();
        updateData.rpaOriginalAmount = FieldValue.delete();
        updateData.rpaOriginalCustomerName = FieldValue.delete();
        updateData.rpaNeedsKiotVietCorrection = FieldValue.delete();
        updateData.rpaKiotVietCorrected = FieldValue.delete();
      } else {
        updateData.rpaStatus = input.rpaStatus;
        if (input.rpaStatus === 'success') {
          updateData.rpaError = FieldValue.delete();
          updateData.rpaNeedsKiotVietCorrection = false;
        }
      }

      await docRef.update(updateData);
      return { success: true };
    }),
});
