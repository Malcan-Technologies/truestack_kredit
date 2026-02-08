/**
 * Cron Jobs
 * 
 * Scheduled tasks for the backend server.
 * All times use Asia/Kuala_Lumpur timezone (GMT+8).
 */

import cron from 'node-cron';
import { LateFeeProcessor } from './lateFeeProcessor.js';

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
}
