/**
 * RPA Worker Template for Expense Automation
 *
 * This template should be integrated into the existing RPA project at:
 * C:\Users\PC\Dropbox\Nhu Tien\kiotviet-payment-automation
 *
 * Prerequisites:
 * - Puppeteer or Playwright installed
 * - tRPC client configured to call SoTienPlus API
 * - KiotViet login credentials configured
 *
 * Usage:
 * 1. Copy this file to the RPA project directory
 * 2. Install dependencies: npm install puppeteer
 * 3. Configure API endpoint and credentials
 * 4. Run: node rpa-expense-worker.js
 */

const puppeteer = require('puppeteer');

// Configuration
const CONFIG = {
  apiEndpoint: 'http://localhost:3000/api/trpc', // Update with actual API endpoint
  kiotVietUrl: 'https://nhutiencamau.kiotviet.vn/man/#/CashFlow',
  headless: false, // Set to true for production
  slowMo: 100, // Slow down for debugging
};

/**
 * Initialize tRPC client
 * (This is a placeholder - actual implementation depends on your tRPC setup)
 */
async function createTrpcClient() {
  // TODO: Implement actual tRPC client
  // For now, using fetch as placeholder
  return {
    expenseRecords: {
      rpaClaimNext: async (date) => {
        const response = await fetch(`${CONFIG.apiEndpoint}/expenseRecords.rpaClaimNext`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date }),
        });
        return response.json();
      },
      rpaComplete: async ({ id, status, error }) => {
        const response = await fetch(`${CONFIG.apiEndpoint}/expenseRecords.rpaComplete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status, error }),
        });
        return response.json();
      },
    },
  };
}

/**
 * Process expense queue for a specific date
 */
async function processExpenseQueue(date, browser) {
  const trpc = await createTrpcClient();
  const page = await browser.newPage();

  try {
    // Navigate to KiotViet cash flow page
    console.log(`[${date}] Navigating to KiotViet...`);
    await page.goto(CONFIG.kiotVietUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    let processedCount = 0;
    let failedCount = 0;

    // Process tasks until queue is empty
    while (true) {
      // Claim next pending task (atomic transaction on server)
      const task = await trpc.expenseRecords.rpaClaimNext(date);
      if (!task) {
        console.log(`[${date}] Queue empty`);
        break;
      }

      console.log(`[${date}] Processing task ${task.id}: ${task.expenseTypeName} - ${task.amount} VND`);

      try {
        // Click "Phiếu chi" (Expense Voucher) button
        await page.waitForSelector('a.kv-btn[ng-click="createItem(true)"]', { timeout: 5000 });
        await page.click('a.kv-btn[ng-click="createItem(true)"]');
        await page.waitForTimeout(1000);

        // Wait for expense type input field
        await page.waitForSelector('input[ng-model*="expenseType"], select[ng-model*="expenseType"]', { timeout: 5000 });

        // Select expense type (loại chi)
        const expenseTypeSelector = 'input[placeholder*="loại chi"], select[ng-model*="expenseType"]';
        await page.click(expenseTypeSelector);
        await page.type(expenseTypeSelector, task.expenseTypeName);
        await page.waitForTimeout(500); // Wait for dropdown
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        // Verify selection
        const selectedValue = await page.$eval(expenseTypeSelector, el => el.value || el.textContent);
        if (selectedValue.trim() !== task.expenseTypeName.trim()) {
          throw new Error(`Expense type mismatch: "${selectedValue}" !== "${task.expenseTypeName}"`);
        }

        // Enter amount
        const amountSelector = 'input[ng-model*="amount"], input[placeholder*="tiền"]';
        await page.waitForSelector(amountSelector, { timeout: 3000 });
        await page.click(amountSelector, { clickCount: 3 }); // Select all
        await page.type(amountSelector, task.amount.toString());
        await page.waitForTimeout(300);

        // Enter notes if provided
        if (task.notes) {
          const notesSelector = 'textarea[ng-model*="note"], textarea[placeholder*="chú"]';
          const notesField = await page.$(notesSelector);
          if (notesField) {
            await page.type(notesSelector, task.notes);
            await page.waitForTimeout(300);
          }
        }

        // Click "Lưu" (Save) button
        await page.click('button:has-text("Lưu")');
        await page.waitForTimeout(1000);

        // Handle confirmation dialog (recipient name empty)
        const confirmDialog = await page.$('text=chưa nhập Tên người nhận');
        if (confirmDialog) {
          console.log(`[${date}] Handling empty recipient confirmation...`);
          await page.click('button:has-text("Đồng ý")');
          await page.waitForTimeout(1000);
        }

        // Verify success message
        const successMessage = await page.waitForSelector('text=thành công', { timeout: 5000 }).catch(() => null);
        if (!successMessage) {
          throw new Error('Success message not found after save');
        }

        // Mark as success
        await trpc.expenseRecords.rpaComplete({
          id: task.id,
          status: 'success',
        });

        console.log(`[${date}] ✓ Task ${task.id} completed successfully`);
        processedCount++;

        // Small delay before next task
        await page.waitForTimeout(1000);

      } catch (error) {
        console.error(`[${date}] ✗ Task ${task.id} failed:`, error.message);

        // Mark as failed with error message
        await trpc.expenseRecords.rpaComplete({
          id: task.id,
          status: 'failed',
          error: error.message,
        });

        failedCount++;

        // Take screenshot for debugging
        const screenshotPath = `./error-${task.id}-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath });
        console.log(`[${date}] Screenshot saved: ${screenshotPath}`);

        // Navigate back to cash flow page for next task
        await page.goto(CONFIG.kiotVietUrl, { waitUntil: 'networkidle0' });
      }
    }

    console.log(`[${date}] Completed: ${processedCount} processed, ${failedCount} failed`);
  } catch (error) {
    console.error(`[${date}] Queue processing error:`, error);
  } finally {
    await page.close();
  }
}

/**
 * Main worker loop
 */
async function main() {
  console.log('Starting RPA Expense Worker...');

  const browser = await puppeteer.launch({
    headless: CONFIG.headless,
    slowMo: CONFIG.slowMo,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // TODO: Implement KiotViet login
    // This will depend on your existing RPA setup
    console.log('TODO: Implement KiotViet login');

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Process today's queue
    await processExpenseQueue(today, browser);

    // Optional: Schedule periodic processing
    // setInterval(() => processExpenseQueue(today, browser), 5 * 60 * 1000); // Every 5 minutes

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await browser.close();
    console.log('RPA worker stopped');
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { processExpenseQueue };
