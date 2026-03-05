/**
 * Cron Jobs
 * 
 * Scheduled tasks for the backend server.
 * All times use Asia/Kuala_Lumpur timezone (GMT+8).
 */

import cron from 'node-cron';
import { LateFeeProcessor } from './lateFeeProcessor.js';
import { PaymentReminderProcessor } from './paymentReminderProcessor.js';
import { BillingCronService } from './billingCronService.js';

/**
 * Initialize all cron jobs.
 * Called once from the server entry point.
 */
export function initCronJobs(): void {
  console.log('⏰ Initializing cron jobs...');

  // Late fee processing: 12:30 AM Malaysia Time daily
  // node-cron supports timezone option directly
  cron.schedule('30 0 * * *', async () => {
    console.log('[CRON] Starting daily late fee processing...');
    try {
      const result = await LateFeeProcessor.processLateFees('CRON');
      if (result.skippedReason) {
        console.log(`[CRON] Late fee processing skipped: ${result.skippedReason}`);
      } else {
        console.log(
          `[CRON] Late fee processing complete: ` +
          `${result.loansProcessed} loans, ${result.feesCalculated} fees, ` +
          `RM ${result.totalFeeAmount.toFixed(2)} total, ` +
          `${result.arrearsLettersGenerated} arrears letters, ` +
          `${result.defaultReadyLoans} ready for default, ` +
          `${result.processingTimeMs}ms`
        );
      }
      if (result.errors.length > 0) {
        console.error(`[CRON] Late fee processing errors:`, result.errors);
      }
    } catch (error) {
      console.error('[CRON] Late fee processing failed:', error);
    }
  }, {
    timezone: 'Asia/Kuala_Lumpur',
  });

  console.log('  ✓ Late fee processing: 12:30 AM MYT daily');

  // TrueSend payment reminders: 9:00 AM Malaysia Time daily
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Starting TrueSend payment reminders...');
    try {
      const result = await PaymentReminderProcessor.processReminders();
      console.log(
        `[CRON] Payment reminders complete: ` +
        `${result.tenantsChecked} tenants, ${result.remindersSent} reminders sent`
      );
      if (result.errors.length > 0) {
        console.error(`[CRON] Payment reminder errors:`, result.errors);
      }
    } catch (error) {
      console.error('[CRON] Payment reminders failed:', error);
    }
  }, {
    timezone: 'Asia/Kuala_Lumpur',
  });

  console.log('  ✓ TrueSend payment reminders: 9:00 AM MYT daily');

  // Billing reconciliation + renewal generation: 12:05 AM Malaysia Time daily
  cron.schedule('5 0 * * *', async () => {
    console.log('[CRON] Starting daily billing reconciliation...');
    try {
      await BillingCronService.run();
      console.log('[CRON] Billing reconciliation completed');
    } catch (error) {
      console.error('[CRON] Billing reconciliation failed:', error);
    }
  }, {
    timezone: 'Asia/Kuala_Lumpur',
  });

  console.log('  ✓ Billing reconciliation: 12:05 AM MYT daily');

  // Startup catch-up: ensures missed midnight window still gets reconciled
  // (safe due to advisory lock and idempotent invoice checks).
  setTimeout(async () => {
    console.log('[CRON] Startup billing reconciliation catch-up...');
    try {
      await BillingCronService.run();
      console.log('[CRON] Startup billing reconciliation completed');
    } catch (error) {
      console.error('[CRON] Startup billing reconciliation failed:', error);
    }
  }, 10_000);
}
