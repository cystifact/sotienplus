import { z } from 'zod';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { getAdminDb } from '@/lib/firebase-admin';
import { TRPCError } from '@trpc/server';
import { FieldValue } from 'firebase-admin/firestore';

export const cashRecordsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        date: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        collectorId: z.string().optional(),
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
      return snapshot.docs.map((doc) => ({
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
        date: z.string().min(1),
        customerId: z.string().optional(),
        customerName: z.string().min(1),
        customerCode: z.string().optional(),
        amount: z.number().positive(),
        collectorId: z.string().min(1),
        collectorName: z.string().min(1),
        notes: z.string().optional(),
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
        rpaStatus: 'pending',
        rpaError: null,
        rpaSyncAt: null,
        rpaQueuedAt: now,
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
        date: z.string().min(1),
        collectorId: z.string().min(1),
        collectorName: z.string().min(1),
        records: z.array(
          z.object({
            customerId: z.string().optional(),
            customerName: z.string().min(1),
            customerCode: z.string().optional(),
            amount: z.number().positive(),
            notes: z.string().optional(),
          })
        ).min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const now = FieldValue.serverTimestamp();

      const chunks: typeof input.records[] = [];
      for (let i = 0; i < input.records.length; i += 500) {
        chunks.push(input.records.slice(i, i + 500));
      }

      const createdIds: string[] = [];
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
            rpaStatus: 'pending',
            rpaError: null,
            rpaSyncAt: null,
            rpaQueuedAt: now,
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

      return { ids: createdIds, count: createdIds.length };
    }),

  update: protectedProcedure
    .use(requirePermission('ledger', 'edit'))
    .input(
      z.object({
        id: z.string(),
        date: z.string().optional(),
        customerId: z.string().optional(),
        customerName: z.string().optional(),
        customerCode: z.string().optional(),
        amount: z.number().positive().optional(),
        collectorId: z.string().optional(),
        collectorName: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const { id, ...updateData } = input;

      const doc = await db.collection('cash_records').doc(id).get();
      if (!doc.exists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi không tồn tại' });
      }

      const data = doc.data()!;
      const isAdmin = ctx.userData!.role === 'admin';

      // Non-admin: restricted to own records, same day
      if (!isAdmin) {
        if (data.createdBy !== ctx.userData!.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn chỉ được sửa bản ghi của mình' });
        }
        const now = new Date();
        const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
        const todayISO = vnNow.toISOString().split('T')[0];
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

      await db.collection('cash_records').doc(id).update(firestoreUpdate);
      return { success: true };
    }),

  delete: protectedProcedure
    .use(requirePermission('ledger', 'delete'))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      const doc = await db.collection('cash_records').doc(input.id).get();
      if (!doc.exists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi không tồn tại' });
      }
      await db.collection('cash_records').doc(input.id).delete();
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
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      await db.collection('cash_records').doc(input.id).update({
        [input.field]: input.value,
        updatedAt: FieldValue.serverTimestamp(),
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
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      const snapshot = await db
        .collection('cash_records')
        .where('date', '==', input.date)
        .where(input.field, '==', !input.value)
        .get();

      if (snapshot.empty) return { updated: 0 };

      const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
      for (let i = 0; i < snapshot.docs.length; i += 500) {
        chunks.push(snapshot.docs.slice(i, i + 500));
      }

      let updated = 0;
      for (const chunk of chunks) {
        const batch = db.batch();
        for (const doc of chunk) {
          batch.update(doc.ref, {
            [input.field]: input.value,
            updatedAt: FieldValue.serverTimestamp(),
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

      let totalAmount = 0;
      let checkActualCount = 0;
      let checkKiotVietCount = 0;
      const total = snapshot.size;

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        totalAmount += data.amount || 0;
        if (data.checkActualReceived) checkActualCount++;
        if (data.checkKiotVietEntered) checkKiotVietCount++;
      });

      return {
        totalAmount,
        totalRecords: total,
        checkActualCount,
        checkKiotVietCount,
      };
    }),

  checkDuplicate: protectedProcedure
    .input(
      z.object({
        date: z.string(),
        customerName: z.string(),
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
        .filter((doc) => doc.id !== input.excludeId)
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
            customerName: z.string(),
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

      const existingRecords = snapshot.docs.map((doc) => ({
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
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      const snapshot = await db
        .collection('cash_records')
        .where('date', '==', input.date)
        .where('checkActualReceived', '==', true)
        .where('checkKiotVietEntered', '==', false)
        .get();

      // Filter out records already pending or success
      const eligibleDocs = snapshot.docs.filter((doc) => {
        const d = doc.data();
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
    .mutation(async ({ input }) => {
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
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      await db.collection('cash_records').doc(input.id).update({
        rpaNeedsKiotVietCorrection: false,
        rpaKiotVietCorrected: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { success: true };
    }),
});
