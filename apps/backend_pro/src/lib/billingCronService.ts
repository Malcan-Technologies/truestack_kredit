/**
 * SaaS billing cron was removed for TrueKredit Pro. Kept as a stub for webhook imports.
 */

export type PaymentDecision = {
  id: string;
  request_id: string;
  tenant_id: string;
  status: 'approved' | 'rejected' | 'pending';
  billing_type?: 'first_subscription' | 'addon_purchase' | 'renewal' | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  amount_cents?: number;
  amount_myr?: number;
  requested_add_ons?: string[] | null;
  period_start?: string | null;
  period_end?: string | null;
  updated_at?: string | null;
};

export async function applyApprovedDecision(_decision: PaymentDecision): Promise<void> {
  console.warn('[BillingCronService] applyApprovedDecision ignored in TrueKredit Pro (no subscription billing)');
}

export async function applyRejectedDecision(_decision: PaymentDecision): Promise<void> {
  console.warn('[BillingCronService] applyRejectedDecision ignored in TrueKredit Pro (no subscription billing)');
}

export class BillingCronService {
  static async run(): Promise<void> {
    // No SaaS billing reconciliation in Pro
  }
}
