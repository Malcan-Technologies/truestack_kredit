import type { LoanApplicationDetail } from '@kredit/borrower';
import { LoanApplicationOfferParty, LoanApplicationOfferStatus } from '@kredit/shared';

/**
 * Mirror of the helper in the web dashboard. Returns the lender's pending counter offer
 * for an in-flight application, or null when none is awaiting borrower review.
 */
export function getPendingLenderCounterOffer(app: LoanApplicationDetail) {
  if (app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW') return null;
  return (
    (app.offerRounds ?? []).find(
      (offer) =>
        offer.status === LoanApplicationOfferStatus.PENDING &&
        offer.fromParty === LoanApplicationOfferParty.ADMIN,
    ) ?? null
  );
}
