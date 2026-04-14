import type { BorrowerMeResponse } from '@kredit/borrower';
import { Stack, usePathname, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/lib/auth';
import { borrowerAuthClient } from '@/lib/api/borrower';
import { BorrowerAccessProvider } from '@/lib/borrower-access';
import { getOnboardingDismissed } from '@/lib/onboarding';

const ONBOARDING_EXEMPT_PATHS = new Set([
  '/',
  '/account',
  '/app-settings',
  '/about',
  '/applications',
  '/loans',
  '/onboarding',
  '/profile',
  '/borrower-profile',
  '/settings-menu',
]);

function isOnboardingExemptPath(pathname: string) {
  return ONBOARDING_EXEMPT_PATHS.has(pathname) || pathname === '/help' || pathname.startsWith('/help/');
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function BorrowerProfileGate() {
  const { session, isLoading } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [borrowerContext, setBorrowerContext] = useState<BorrowerMeResponse['data'] | null>(null);
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null);
  const [borrowerContextVersion, setBorrowerContextVersion] = useState(0);
  const requestIdRef = useRef(0);
  const hasLoadedBorrowerContextRef = useRef(false);

  const loadBorrowerContext = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    let nextContext = (await borrowerAuthClient.fetchBorrowerMe()).data;

    if (!nextContext.activeBorrowerId && nextContext.profiles.length > 0) {
      await borrowerAuthClient.switchBorrowerProfile(nextContext.profiles[0].id);
      await wait(150);
      nextContext = (await borrowerAuthClient.fetchBorrowerMe()).data;
    }

    if (requestId !== requestIdRef.current) {
      return null;
    }

    setBorrowerContext(nextContext);
    hasLoadedBorrowerContextRef.current = true;
    setBorrowerContextVersion((current) => current + 1);
    return nextContext;
  }, []);

  const refreshBorrowerProfiles = useCallback(async () => {
    try {
      return await loadBorrowerContext();
    } catch {
      setBorrowerContext(null);
      return null;
    }
  }, [loadBorrowerContext]);

  const handleSwitchBorrowerProfile = useCallback(
    async (borrowerId: string) => {
      if (switchingProfileId || borrowerId === borrowerContext?.activeBorrowerId) {
        return;
      }

      setSwitchingProfileId(borrowerId);

      try {
        await borrowerAuthClient.switchBorrowerProfile(borrowerId);
        await wait(150);
        await loadBorrowerContext();
      } finally {
        setSwitchingProfileId(null);
      }
    },
    [borrowerContext?.activeBorrowerId, loadBorrowerContext, switchingProfileId],
  );

  useEffect(() => {
    let cancelled = false;

    async function enforceProfileAccess() {
      if (isLoading || !session) {
        if (!cancelled) {
          setBorrowerContext(null);
          setChecking(false);
        }
        return;
      }

      try {
        const shouldBlockNavigation = !hasLoadedBorrowerContextRef.current;
        if (shouldBlockNavigation) {
          setChecking(true);
        }
        const [dismissed, profileContext] = await Promise.all([
          getOnboardingDismissed(),
          loadBorrowerContext(),
        ]);

        if (cancelled) {
          return;
        }

        const hasProfiles = Boolean(profileContext && profileContext.profileCount > 0);
        const isExempt = isOnboardingExemptPath(pathname);

        if (!hasProfiles && !dismissed && !isExempt) {
          router.replace('/onboarding');
          return;
        }
      } catch {
        // Leave navigation usable if the profile guard check fails.
        if (!cancelled) {
          setBorrowerContext(null);
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    void enforceProfileAccess();

    return () => {
      cancelled = true;
    };
  }, [isLoading, loadBorrowerContext, pathname, router, session]);

  const hasBorrowerProfiles = Boolean(borrowerContext && borrowerContext.profileCount > 0);

  if (isLoading || checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <BorrowerAccessProvider
      value={{
        hasBorrowerProfiles,
        isCheckingBorrowerProfiles: checking,
        profileCount: borrowerContext?.profileCount ?? 0,
        profiles: borrowerContext?.profiles ?? [],
        activeBorrowerId: borrowerContext?.activeBorrowerId ?? null,
        activeBorrower: borrowerContext?.activeBorrower ?? null,
        switchingProfileId,
        borrowerContextVersion,
        refreshBorrowerProfiles,
        switchBorrowerProfile: handleSwitchBorrowerProfile,
      }}>
      <Stack screenOptions={{ headerShown: false }} />
    </BorrowerAccessProvider>
  );
}

export default function AppShellLayout() {
  return <BorrowerProfileGate />;
}
