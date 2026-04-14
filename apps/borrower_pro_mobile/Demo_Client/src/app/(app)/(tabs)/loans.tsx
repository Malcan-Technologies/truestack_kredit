import { OnboardingFirstGate } from '@/components/onboarding-first-gate';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function LoansScreen() {
  return (
    <OnboardingFirstGate title="Loans" pageSubtitle="Your loan center and repayments.">
      <PlaceholderScreen
        title="Loans"
        subtitle="Loan servicing screens are scaffolded here."
        body="This tab will hold the borrower loan center, repayments, and agreement follow-up screens. It stays as a placeholder while we focus on authentication and account parity first."
      />
    </OnboardingFirstGate>
  );
}
