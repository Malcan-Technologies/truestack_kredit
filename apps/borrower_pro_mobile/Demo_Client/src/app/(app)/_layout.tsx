import type { BorrowerMeResponse } from '@kredit/borrower';
import { Stack, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/lib/auth';
import { borrowerAuthClient } from '@/lib/api/borrower';
import { BorrowerAccessProvider } from '@/lib/borrower-access';
import { PushNotificationsProvider } from '@/lib/notifications/push-provider';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function BorrowerProfileProviderShell() {
  const { session, isLoading } = useSession();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [borrowerContext, setBorrowerContext] = useState<BorrowerMeResponse['data'] | null>(null);
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null);
  const [borrowerContextVersion, setBorrowerContextVersion] = useState(0);
  const requestIdRef = useRef(0);

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

    async function loadBorrowerMe() {
      if (isLoading || !session) {
        if (!cancelled) {
          setBorrowerContext(null);
          setChecking(false);
        }
        return;
      }

      setChecking(true);
      try {
        await loadBorrowerContext();
      } catch {
        if (!cancelled) {
          setBorrowerContext(null);
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    void loadBorrowerMe();

    return () => {
      cancelled = true;
    };
  }, [isLoading, loadBorrowerContext, pathname, session]);

  const hasBorrowerProfiles = Boolean(borrowerContext && borrowerContext.profileCount > 0);

  if (isLoading) {
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
      <PushNotificationsProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </PushNotificationsProvider>
    </BorrowerAccessProvider>
  );
}

export default function AppShellLayout() {
  return <BorrowerProfileProviderShell />;
}
