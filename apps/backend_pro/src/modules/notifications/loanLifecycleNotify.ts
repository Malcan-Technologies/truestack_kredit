import { prisma } from '../../lib/prisma.js';
import { NotificationOrchestrator } from './orchestrator.js';

const PRE_DISBURSEMENT_STATUSES = ['PENDING_DISBURSEMENT', 'PENDING_ATTESTATION'] as const;

/** True when borrower meets the identity gate used for signing / certificate (aligned with portal KYC complete). */
export function borrowerIdentityGateSatisfied(b: {
  verificationStatus: string | null;
  documentVerified: boolean;
  borrowerType: string;
} | null | undefined): boolean {
  if (!b) return false;
  if (b.verificationStatus === 'FULLY_VERIFIED') return true;
  if (b.borrowerType === 'INDIVIDUAL' && b.documentVerified) return true;
  return false;
}

/** Most recent pre-disbursement loan for deep links (attestation / KYC / signing pipeline). */
export async function resolvePreDisbursementLoanDeepLink(
  tenantId: string,
  borrowerId: string,
): Promise<string | null> {
  const loan = await prisma.loan.findFirst({
    where: {
      tenantId,
      borrowerId,
      status: { in: [...PRE_DISBURSEMENT_STATUSES] },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  return loan ? `/loans/${loan.id}` : null;
}

/** One in-app/push notification per borrower after successful MTSA certificate enrollment (not when a cert is merely detected on status check). */
export async function notifySigningCertificateReadyIfNew(params: {
  tenantId: string;
  borrowerId: string;
  /** Prefer linking to this loan when provided (e.g. pipeline loan). */
  loanId?: string | null;
}): Promise<void> {
  const existing = await prisma.borrowerNotification.findFirst({
    where: {
      tenantId: params.tenantId,
      borrowerId: params.borrowerId,
      notificationKey: 'loan_signing_certificate_ready',
    },
    select: { id: true },
  });
  if (existing) return;

  const deepLink = params.loanId?.trim()
    ? `/loans/${params.loanId}`
    : (await resolvePreDisbursementLoanDeepLink(params.tenantId, params.borrowerId)) ?? '/loans';

  try {
    await NotificationOrchestrator.notifyBorrowerEvent({
      tenantId: params.tenantId,
      borrowerId: params.borrowerId,
      notificationKey: 'loan_signing_certificate_ready',
      category: 'loan_lifecycle',
      title: 'Digital signing certificate ready',
      body: 'Your digital signing certificate is active. You can continue to sign your loan agreement when ready.',
      deepLink,
      sourceType: 'BORROWER_SIGNING',
      sourceId: params.borrowerId,
    });
  } catch (err) {
    console.error('[loanLifecycleNotify] loan_signing_certificate_ready failed:', err);
  }
}
