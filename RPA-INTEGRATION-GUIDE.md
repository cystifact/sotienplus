# RPA Integration Guide for Expense Automation

This guide explains how to complete the RPA integration for automated expense voucher creation in KiotViet.

## Status

**Backend:** ✅ Complete - All tRPC procedures implemented
**Frontend:** ✅ Complete - UI with RPA status badges and polling
**RPA Worker:** ⏳ Pending - Template provided, needs integration

## What's Already Done

### Backend (Complete)
- ✅ `expenseRecords` router with 16 procedures
- ✅ `rpaClaimNext` - Atomic task claiming with Firestore transactions
- ✅ `rpaComplete` - Mark tasks as success/failed
- ✅ `markForSync` - Queue eligible expenses for RPA
- ✅ `retryFailed` - Retry failed RPA tasks
- ✅ `confirmKiotVietCorrected` - User confirms manual fix
- ✅ `updateRpaStatus` - Admin override RPA status

### Frontend (Complete)
- ✅ Expenses page with RPA status badges (Chờ TT, Đang TT..., Đã TT, TT lỗi)
- ✅ 1-second polling when in-flight RPA tasks exist
- ✅ "Thanh toán KV" button to queue eligible expenses
- ✅ "Retry" functionality for failed tasks
- ✅ Edit detection with KiotViet correction warnings
- ✅ Admin RPA status override dropdown

## What Needs To Be Done

### RPA Worker Integration

The RPA worker needs to be integrated into your existing RPA project at:
`C:\Users\PC\Dropbox\Nhu Tien\kiotviet-payment-automation`

#### Step 1: Copy Template

Copy the provided `rpa-expense-worker-template.js` to your RPA project directory.

#### Step 2: Configure tRPC Client

Update the `createTrpcClient()` function to use your actual tRPC setup. Example:

```javascript
const { createTRPCProxyClient, httpBatchLink } = require('@trpc/client');
const fetch = require('node-fetch');

async function createTrpcClient() {
  return createTRPCProxyClient({
    links: [
      httpBatchLink({
        url: 'http://localhost:3000/api/trpc',
        fetch,
        headers: {
          // Add authentication headers if needed
          'x-api-key': process.env.RPA_API_KEY,
        },
      }),
    ],
  });
}
```

#### Step 3: Integrate with Existing Login

If you have existing KiotViet login logic for cash records RPA, reuse it:

```javascript
// Import from your existing RPA project
const { loginToKiotViet } = require('./kiotviet-login');

async function main() {
  const browser = await puppeteer.launch({ /* ... */ });
  const page = await browser.newPage();

  // Use existing login
  await loginToKiotViet(page);

  // Process expenses
  await processExpenseQueue(today, browser);
}
```

#### Step 4: Update Selectors

KiotViet UI selectors may have changed. Verify and update these selectors:

```javascript
// Current selectors in template (may need updates):
const SELECTORS = {
  createExpenseButton: 'a.kv-btn[ng-click="createItem(true)"]',
  expenseTypeInput: 'input[ng-model*="expenseType"], select[ng-model*="expenseType"]',
  amountInput: 'input[ng-model*="amount"], input[placeholder*="tiền"]',
  notesInput: 'textarea[ng-model*="note"], textarea[placeholder*="chú"]',
  saveButton: 'button:has-text("Lưu")',
  confirmButton: 'button:has-text("Đồng ý")',
  successMessage: 'text=thành công',
};
```

To verify selectors:
1. Open KiotViet cash flow page in Chrome
2. Open DevTools (F12)
3. Use Element Inspector to find correct selectors
4. Test with `document.querySelector()` in console

#### Step 5: Add Multiple Selector Fallbacks

For robustness, add fallback selectors:

```javascript
async function clickWithFallback(page, selectors, description) {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 2000 });
      await page.click(selector);
      return;
    } catch (error) {
      console.log(`Selector "${selector}" not found, trying next...`);
    }
  }
  throw new Error(`${description}: All selectors failed`);
}

// Usage:
await clickWithFallback(
  page,
  ['button.save-btn', 'button:has-text("Lưu")', 'button[ng-click="save()"]'],
  'Save button'
);
```

#### Step 6: Test Workflow

Test the RPA workflow step by step:

1. **Manual Test First**
   - Open KiotViet manually
   - Create an expense voucher
   - Note the exact steps and UI elements

2. **Test with Single Task**
   - Queue one expense for RPA in SoTienPlus
   - Run worker with `headless: false`
   - Watch the browser automation
   - Check for errors in console

3. **Test Error Scenarios**
   - Unknown expense type name
   - Network timeout
   - Session expired
   - Amount validation error

4. **Test Batch Processing**
   - Queue 5-10 expenses
   - Run worker and verify all process correctly
   - Check screenshots for any failures

#### Step 7: Schedule Worker

Once tested, schedule the worker to run periodically:

**Option A: Continuous Process (Recommended)**
```javascript
async function continuousProcessing() {
  const browser = await puppeteer.launch({ headless: true });

  while (true) {
    const today = new Date().toISOString().split('T')[0];
    await processExpenseQueue(today, browser);

    // Wait 5 minutes before next check
    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
  }
}
```

**Option B: Scheduled Task (Windows)**
Use Task Scheduler to run worker every 5-15 minutes:
- Create a .bat file: `node rpa-expense-worker.js`
- Schedule in Task Scheduler
- Set working directory to RPA project folder

**Option C: Cloud Run (Recommended for Production)**
Deploy as a Cloud Run job that runs every 5 minutes.

## Testing Checklist

- [ ] Backend procedures work (test via tRPC playground or API calls)
- [ ] Frontend displays RPA statuses correctly
- [ ] Worker can claim tasks atomically (no duplicate processing)
- [ ] Worker creates expense vouchers in KiotViet successfully
- [ ] Worker handles errors gracefully (unknown type, timeout, etc.)
- [ ] Worker takes screenshots on failure for debugging
- [ ] Failed tasks can be retried from UI
- [ ] Edit detection flags expenses needing KiotViet correction
- [ ] Imported expenses (Excel) skip RPA queue correctly
- [ ] Polling activates when tasks are pending/processing
- [ ] KiotViet confirmation dialog is handled correctly

## Common Issues

### Issue: Expense Type Mismatch

**Symptom:** RPA fails with "Expense type not found"

**Solution:**
- Expense type names in SoTienPlus must match KiotViet exactly
- Go to Settings > Expense Types and verify names
- Case-sensitive matching

### Issue: Session Expired

**Symptom:** Worker fails after some time

**Solution:**
- Implement session refresh logic
- Check for login page redirect
- Re-login if session expired

### Issue: Selectors Not Found

**Symptom:** `waiting for selector timeout`

**Solution:**
- KiotViet UI changed
- Update selectors using Chrome DevTools
- Add multiple fallback selectors

### Issue: Duplicate Processing

**Symptom:** Same expense processed twice

**Solution:**
- Ensure using `rpaClaimNext` with Firestore transactions
- Check worker isn't running multiple instances
- Verify `rpaStatus` transitions correctly

## Firestore Indexes

Already deployed. If you see index warnings, re-deploy:

```bash
firebase deploy --only firestore:indexes
```

## Security Notes

1. **API Authentication**: Add API key or session cookie validation to tRPC calls
2. **Credentials**: Store KiotViet credentials in environment variables, not code
3. **Screenshots**: Don't commit screenshots with sensitive data to git
4. **Logs**: Sanitize logs before sharing (remove amounts, names)

## Next Steps

1. [ ] Copy template to RPA project
2. [ ] Configure tRPC client with authentication
3. [ ] Integrate with existing KiotViet login
4. [ ] Verify and update KiotViet selectors
5. [ ] Test with single task (headless: false)
6. [ ] Test error scenarios
7. [ ] Test batch processing
8. [ ] Schedule worker (continuous or task scheduler)
9. [ ] Monitor for 24 hours
10. [ ] Enable headless mode for production

## Support

If you need help:
- Check browser screenshots in `./error-*.png`
- Check worker console logs
- Check Firestore `expense_records` collection for RPA fields
- Verify selectors in Chrome DevTools on KiotViet page
