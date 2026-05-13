import React from 'react';

import { OnboardingFirstGate } from '@/components/onboarding-first-gate';
import { ProfileScreen } from '../profile';

export default function BorrowerProfileTabScreen() {
  return (
    <OnboardingFirstGate title="Profile" pageSubtitle="Your borrower profile and verification.">
      <ProfileScreen embeddedInTab />
    </OnboardingFirstGate>
  );
}
