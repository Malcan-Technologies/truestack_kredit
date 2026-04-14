import { OnboardingFirstGate } from '@/components/onboarding-first-gate';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function ApplicationsScreen() {
  return (
    <OnboardingFirstGate
      title="Applications"
      pageSubtitle="Track drafts, submissions, and application status.">
      <PlaceholderScreen
        title="Applications"
        subtitle="Loan application flows are coming next."
        body="This tab is reserved for borrower application drafts, submissions, and status tracking. For now the auth work is in place and the tab shell is ready."
      />
    </OnboardingFirstGate>
  );
}
