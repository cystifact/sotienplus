# SoTienPlus — Progress Tracker

## Overview

Ứng dụng số hóa quy trình thu tiền từ khách hàng, thay thế sổ tay giấy.
Staff ghi nhận tiền thu → Admin xác nhận → RPA tự động nhập KiotViet.

**Firebase Project:** `sotienplus`
**Dev URL:** `http://localhost:3009`
**Tech Stack:** Next.js 14 + tRPC v11 + Firestore + Cloud Run

---

## Phase 0: Project Scaffolding ✅

| Task | File | Status |
|------|------|--------|
| Next.js project init | `package.json`, `tsconfig.json` | ✅ |
| Tailwind + shadcn/ui | `tailwind.config.ts`, `globals.css` | ✅ |
| 22 UI components | `src/components/ui/*` | ✅ Copied from XuongPro |
| tRPC server core | `src/server/trpc.ts` | ✅ Adapted from EcoKiot |
| tRPC API route | `src/app/api/trpc/[trpc]/route.ts` | ✅ |
| tRPC client | `src/lib/trpc.ts`, `src/_trpc/Provider.tsx` | ✅ |
| Session auth (cookie) | `src/app/api/session/login/route.ts`, `logout/route.ts` | ✅ |
| Firebase client SDK | `src/lib/firebase.ts`, `firebase-config.ts` | ✅ |
| Firebase Admin SDK | `src/lib/firebase-admin.ts` | ✅ |
| Auth store (Zustand) | `src/lib/auth-store.ts` | ✅ |
| Auth provider | `src/app/client-providers.tsx` | ✅ |
| Login page | `src/app/login/page.tsx` | ✅ |
| Layout + Header | `src/components/layout/Header.tsx` | ✅ |
| Dockerfile | `Dockerfile` | ✅ Multi-stage, Node 18 Alpine |
| Firebase config | `.firebaserc`, `firebase.json`, `firestore.rules` | ✅ |
| Emerald green theme | `globals.css` | ✅ `--primary: 160 84% 39%` |

**Key decisions:**
- `output: 'standalone'` (Cloud Run, not static export)
- Session cookie auth (14-day expiry, `__session`)
- Single-tenant (no multi-store like EcoKiot)
- Shadow email: `@sotienplus.local`
- Dev port: 3009

---

## Phase 1: User Management ✅

| Task | File | Status |
|------|------|--------|
| Users tRPC router | `src/server/routers/users.ts` | ✅ |
| Users settings page | `src/app/(authenticated)/settings/users/page.tsx` | ✅ |
| Seed admin script | `scripts/seed-admin.js` | ✅ |

**tRPC procedures:**
- `users.getCurrentUser` — query, protectedProcedure
- `users.list` — query, adminProcedure
- `users.getById` — query, adminProcedure
- `users.create` — mutation, adminProcedure (Firebase Auth + Firestore)
- `users.update` — mutation, adminProcedure
- `users.updatePassword` — mutation, adminProcedure
- `users.delete` — mutation, adminProcedure (soft delete)

**Roles:** `admin` | `staff`

**⚠️ Setup required:** Enable Email/Password auth in Firebase Console, then `node scripts/seed-admin.js`

---

## Phase 2: Collectors CRUD ✅

| Task | File | Status |
|------|------|--------|
| Collectors tRPC router | `src/server/routers/collectors.ts` | ✅ |
| Collectors settings page | `src/app/(authenticated)/settings/collectors/page.tsx` | ✅ |

**tRPC procedures:**
- `collectors.list` — active only, protectedProcedure
- `collectors.listAll` — admin sees all, adminProcedure
- `collectors.create` / `update` / `delete` — adminProcedure

---

## Phase 3: KiotViet Customer Sync ✅

| Task | File | Status |
|------|------|--------|
| KiotViet service | `src/server/services/kiotviet.service.ts` | ✅ |
| Customers tRPC router | `src/server/routers/customers.ts` | ✅ |
| KiotViet settings page | `src/app/(authenticated)/settings/kiotviet/page.tsx` | ✅ |

**tRPC procedures:**
- `customers.list` — protectedProcedure
- `customers.sync` — adminProcedure (manual sync)
- `customers.testConnection` — adminProcedure
- `customers.getSettings` / `saveSettings` — adminProcedure

**Sync logic:** OAuth2 token → paginate `/customers` API → batch upsert to Firestore (chunked for >500 docs)

---

## Phase 4: Cash Records (Core Feature) ✅

| Task | File | Status |
|------|------|--------|
| Cash records tRPC router | `src/server/routers/cashRecords.ts` | ✅ |
| Record form dialog | `src/components/cash-ledger/record-form.tsx` | ✅ |
| Ledger page | `src/app/(authenticated)/ledger/page.tsx` | ✅ |
| Router registration | `src/server/router.ts` | ✅ |

**tRPC procedures:**
- `cashRecords.list` — query by date/range + collector filter
- `cashRecords.create` — with audit trail (createdBy/createdByName)
- `cashRecords.update` — admin: all, staff: own records same day only
- `cashRecords.delete` — admin only, hard delete
- `cashRecords.toggleCheck` — admin toggle ✓1 or ✓2
- `cashRecords.bulkCheck` — admin batch-tick all ✓1 or ✓2 for a date
- `cashRecords.dailySummary` — total amount, counts, check progress
- `cashRecords.checkDuplicate` — same customer + amount + date warning
- `cashRecords.markForSync` — mark ✓1=true, ✓2=false as `rpaStatus: 'pending'`

**Ledger page features:**
- Quick date filters: Hôm nay / Hôm qua / Hôm kia + custom date + range
- Collector filter dropdown
- Summary card: total amount, record count, ✓1/✓2 progress badges
- Desktop table + mobile card view
- Admin inline checkboxes on each row
- Bulk check dropdown (tick all ✓1, tick all ✓2, RPA sync)
- Export Excel (client-side `xlsx` library)
- Edit on row click, delete with confirmation dialog
- RPA status badges: pending (yellow), success (green), failed (red)

**Record form features:**
- Customer combobox with Vietnamese fuzzy search + debt badge
- Amount NumberInput with VND formatting (thousand separators)
- Collector combobox
- Date picker (admin can backdate, staff locked)
- Duplicate detection warning dialog before save

---

## Phase 5: Polish & Deploy ✅

| Task | File | Status |
|------|------|--------|
| PWA manifest (maskable icons) | `public/manifest.json` | ✅ |
| Icon generator | `scripts/generate-icons.js` | ✅ SVG generated |
| Deploy scripts | `package.json` | ✅ |
| Cloud Function (scheduled sync) | `functions/src/index.ts` | ✅ |
| Functions package | `functions/package.json`, `functions/tsconfig.json` | ✅ |
| Firestore composite indexes | `firestore.indexes.json` | ✅ 6 indexes |
| Firebase config (functions) | `firebase.json` | ✅ |

**Deploy commands:**
```bash
npm run deploy              # Full: Docker → Cloud Run
npm run deploy:functions    # Cloud Functions only
npm run deploy:firestore    # Firestore rules + indexes
npm run deploy:hosting      # Firebase Hosting
```

**Cloud Function:**
- `scheduledCustomerSync` — daily at 00:00 Asia/Ho_Chi_Minh
- Region: asia-southeast1, retry: 2, timeout: 300s

**Firestore indexes for `cash_records`:**
1. `date` DESC + `createdAt` DESC (default list query)
2. `date` + `collectorId` + `createdAt` DESC (filter by collector)
3. `date` + `checkActualReceived` (bulk check ✓1)
4. `date` + `checkKiotVietEntered` (bulk check ✓2)
5. `date` + `checkActualReceived` + `checkKiotVietEntered` (markForSync)
6. `date` + `customerName` + `amount` (duplicate detection)

**⚠️ Before production:**
- Convert SVG icons to PNG (use realfavicongenerator.net or sharp-cli)
- Create Artifact Registry repo: `gcloud artifacts repositories create cloud-run --location=asia-southeast1 --repository-format=docker`
- First deploy: `gcloud run deploy soghitien ...`

---

## Phase 6: RPA Integration ✅

| Task | File | Location | Status |
|------|------|----------|--------|
| Firestore source | `firestore_source.py` | RPA tool dir | ✅ |
| RPA runner GUI | `rpa_runner.py` | RPA tool dir | ✅ |
| Run batch script | `run_rpa_runner.bat` | RPA tool dir | ✅ |
| Updated deps | `requirements.txt` | RPA tool dir | ✅ +google-cloud-firestore |

**RPA tool location:** `C:\Users\PC\Dropbox\Nhu Tien\kiotviet-payment-automation\`

**`firestore_source.py` — FirestorePaymentSource class:**
- `get_pending_payments()` — reads `rpaStatus == 'pending'`
- `mark_success(record_id)` — sets success + auto-ticks ✓2
- `mark_failed(record_id, error)` — sets failed + error message
- `reset_failed(record_id)` — re-queue for retry
- `get_summary()` — pending count + total amount

**`rpa_runner.py` — Simplified GUI:**
- Single screen: payment list + progress bar + log + Run/Stop/Refresh buttons
- Reads from Firestore → runs Playwright RPA (reuses existing `rpa.py`) → writes back
- Thread-safe, stop-capable, emerald green branding

**Existing files kept as-is:**
- `rpa.py` — Playwright automation (search → click → debt tab → payment → submit)
- `config.yaml` — KiotViet URL + Playwright timeouts
- `browser_data/` — Persistent browser login session
- `app_tk.py` — Old 3-tab GUI (kept for fallback, use `rpa_runner.py` instead)
- `ocr.py`, `bot.py` — OCR + Telegram (independent, still usable)

**⚠️ RPA setup required:**
1. Copy `soghitien-service-account-key.json` into RPA tool directory
2. Run `venv\Scripts\pip install google-cloud-firestore`
3. Double-click `run_rpa_runner.bat`

---

## End-to-End Flow

```
Staff ghi nhận thu tiền (web/mobile)
        ↓
Admin xem sổ ghi → tick ✓1 "Thực nhận" (từng dòng hoặc hàng loạt)
        ↓
Admin bấm "Đồng bộ KiotViet (RPA)" → rpaStatus = 'pending'
        ↓
Python RPA Runner (trên máy admin):
  1. Đọc pending records từ Firestore
  2. Playwright: search KH → debt tab → fill amount → submit
  3. Thành công → ✓2 auto-tick, rpaStatus = 'success'
  4. Thất bại → rpaStatus = 'failed', rpaError = reason
        ↓
Web app refresh → hiển thị kết quả (badge xanh/đỏ)
```

---

## Project Structure

```
d:\SoTienPlus\
├── src/
│   ├── app/
│   │   ├── (authenticated)/
│   │   │   ├── layout.tsx              # Auth guard
│   │   │   ├── ledger/page.tsx         # ★ Main ledger page
│   │   │   └── settings/
│   │   │       ├── page.tsx            # Settings hub
│   │   │       ├── users/page.tsx      # User management
│   │   │       ├── collectors/page.tsx # Collector management
│   │   │       └── kiotviet/page.tsx   # KiotViet sync config
│   │   ├── api/
│   │   │   ├── trpc/[trpc]/route.ts   # tRPC endpoint
│   │   │   └── session/               # Login/logout cookies
│   │   ├── login/page.tsx
│   │   ├── page.tsx                    # Redirect → /ledger
│   │   ├── layout.tsx                  # Root layout
│   │   ├── globals.css                 # Emerald theme
│   │   └── client-providers.tsx        # tRPC + Auth providers
│   ├── server/
│   │   ├── trpc.ts                     # tRPC core + middleware
│   │   ├── router.ts                   # Router composition
│   │   ├── routers/
│   │   │   ├── users.ts
│   │   │   ├── collectors.ts
│   │   │   ├── customers.ts
│   │   │   └── cashRecords.ts          # ★ Core router
│   │   └── services/
│   │       └── kiotviet.service.ts
│   ├── components/
│   │   ├── ui/                         # 22 shadcn components
│   │   ├── layout/Header.tsx
│   │   └── cash-ledger/
│   │       └── record-form.tsx         # ★ Add/edit dialog
│   ├── lib/
│   │   ├── firebase.ts                 # Client SDK
│   │   ├── firebase-admin.ts           # Server SDK
│   │   ├── firebase-config.ts
│   │   ├── auth-store.ts               # Zustand
│   │   ├── trpc.ts                     # Client hooks
│   │   └── utils.ts                    # formatCurrency, dates
│   ├── _trpc/Provider.tsx
│   └── types/index.ts
├── functions/
│   ├── src/index.ts                    # scheduledCustomerSync
│   ├── package.json
│   └── tsconfig.json
├── public/
│   ├── manifest.json
│   ├── icon-*.svg
│   └── sw.js (auto-generated)
├── scripts/
│   ├── seed-admin.js
│   └── generate-icons.js
├── Dockerfile
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
└── package.json

RPA Tool (separate repo):
C:\Users\PC\Dropbox\Nhu Tien\kiotviet-payment-automation\
├── firestore_source.py     # ★ NEW — reads from Firestore
├── rpa_runner.py           # ★ NEW — simplified GUI
├── run_rpa_runner.bat      # ★ NEW — launcher
├── rpa.py                  # Playwright automation (unchanged)
├── config.yaml             # KiotViet config (unchanged)
├── app_tk.py               # Old GUI (kept as fallback)
├── ocr.py                  # Gemini OCR (independent)
├── bot.py                  # Telegram bot (independent)
└── requirements.txt        # +google-cloud-firestore
```

---

## Firestore Collections

| Collection | Purpose | Write Access |
|------------|---------|-------------|
| `users` | User accounts | Server only (Admin SDK) |
| `cash_records` | ★ Cash collection records | Server only |
| `customers` | KiotViet customers (synced) | Server only |
| `collectors` | People who collect money | Server only |
| `settings` | App config (KiotViet API keys) | Server only |

---

## Remaining Tasks

- [ ] Enable Firebase Auth (Email/Password) in Console
- [ ] Run `node scripts/seed-admin.js` to create first admin
- [ ] Enter KiotViet API credentials in Settings
- [ ] Run initial customer sync
- [ ] Convert SVG icons → PNG for PWA
- [ ] Setup Artifact Registry + first Cloud Run deploy
- [ ] Copy `sotienplus-service-account-key.json` to RPA tool dir
- [ ] Install `google-cloud-firestore` in RPA venv
- [ ] Deploy Firestore indexes: `firebase deploy --only firestore:indexes`
