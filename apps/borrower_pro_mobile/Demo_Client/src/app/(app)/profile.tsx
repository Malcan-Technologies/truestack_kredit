import type {
  BorrowerDetail,
  CompanyMembersContext,
  TruestackKycStatusData,
} from '@kredit/borrower';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { BorrowerDocumentCard } from '@/components/borrower-document-card';
import { PageHeaderToolbarButton, PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { TruestackKycMobileCard } from '@/components/truestack-kyc-mobile-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { borrowerAuthClient, borrowerClient } from '@/lib/api/borrower';
import { useBorrowerAccess } from '@/lib/borrower-access';
import {
  formatAddressValue,
  formatBankLabel,
  formatBooleanLabel,
  formatBorrowerDocumentLine,
  formatBorrowerTypeLabel,
  formatCurrency,
  formatICForDisplay,
  formatOptionLabel,
  getBorrowerDisplayName,
  humanizeToken,
  normalizeDisplayValue,
} from '@/lib/format/borrower';
import { formatDate, formatDateTime } from '@/lib/format/date';

type Tone = 'primary' | 'success' | 'warning' | 'error' | 'neutral';

type InfoItem = {
  label: string;
  value: string;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toneColor(theme: ReturnType<typeof useTheme>, tone: Tone) {
  if (tone === 'primary') return theme.primary;
  if (tone === 'success') return theme.success;
  if (tone === 'warning') return theme.warning;
  if (tone === 'error') return theme.error;
  return theme.border;
}

function getVerificationSummary(
  borrower: BorrowerDetail,
  kyc: TruestackKycStatusData | null,
): { label: string; tone: Tone; hint: string } {
  const latest = kyc?.latest;

  if (latest?.status === 'completed' && latest.result === 'approved') {
    return {
      label: 'Verified',
      tone: 'success',
      hint: 'Latest TrueStack verification was approved.',
    };
  }

  if (latest?.status === 'completed' && latest.result === 'rejected') {
    return {
      label: 'Action needed',
      tone: 'error',
      hint: 'Latest TrueStack verification was rejected.',
    };
  }

  if (latest?.status === 'processing') {
    return {
      label: 'In review',
      tone: 'warning',
      hint: 'TrueStack is currently reviewing the latest submission.',
    };
  }

  if (latest?.status === 'pending') {
    return {
      label: 'Pending',
      tone: 'warning',
      hint: 'A verification session exists but has not completed yet.',
    };
  }

  if (latest?.status === 'expired' || latest?.status === 'failed') {
    return {
      label: humanizeToken(latest.status),
      tone: 'error',
      hint: 'Start a fresh verification attempt from the borrower web portal.',
    };
  }

  if (borrower.documentVerified) {
    return {
      label: 'Verified',
      tone: 'success',
      hint: 'Borrower document is currently marked as verified.',
    };
  }

  if (borrower.verificationStatus) {
    return {
      label: humanizeToken(borrower.verificationStatus),
      tone: 'warning',
      hint: 'Document verification is still in progress or awaiting action.',
    };
  }

  if (borrower.trueIdentityStatus) {
    return {
      label: humanizeToken(borrower.trueIdentityStatus),
      tone: 'warning',
      hint: 'TrueStack verification has status updates but is not complete yet.',
    };
  }

  return {
    label: 'Not started',
    tone: 'neutral',
    hint: 'Start verification from the borrower web portal when ready.',
  };
}

function getLatestKycTimestamp(kyc: TruestackKycStatusData | null): string {
  const latest = kyc?.latest;
  return latest?.updatedAt ? formatDateTime(latest.updatedAt) : 'No session yet';
}

function buildContactLine(borrower: BorrowerDetail): string | null {
  const parts =
    borrower.borrowerType === 'CORPORATE'
      ? [borrower.companyPhone, borrower.companyEmail]
      : [borrower.phone, borrower.email];

  const populated = parts
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return populated.length > 0 ? populated.join(' • ') : null;
}

function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  const theme = useTheme();
  const color = toneColor(theme, tone);

  return (
    <View
      style={[
        styles.statusBadge,
        {
          borderColor: color,
          backgroundColor: theme.backgroundSelected,
        },
      ]}>
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </View>
  );
}

function InfoGrid({ items }: { items: InfoItem[] }) {
  return (
    <View style={styles.infoGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.infoField}>
          <ThemedText type="small" themeColor="textSecondary">
            {item.label}
          </ThemedText>
          <ThemedText type="default">{item.value}</ThemedText>
        </View>
      ))}
    </View>
  );
}

function SurfacePanel({ children }: { children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.surfacePanel,
        {
          backgroundColor: theme.background,
          borderColor: theme.border,
        },
      ]}>
      {children}
    </View>
  );
}

export function ProfileScreen({ embeddedInTab = false }: { embeddedInTab?: boolean }) {
  const router = useRouter();
  const { activeBorrowerId, borrowerContextVersion, hasBorrowerProfiles, refreshBorrowerProfiles } =
    useBorrowerAccess();
  const [borrower, setBorrower] = useState<BorrowerDetail | null>(null);
  const [kyc, setKyc] = useState<TruestackKycStatusData | null>(null);
  const [companyContext, setCompanyContext] = useState<CompanyMembersContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);

  const loadProfileData = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      const requestId = ++requestIdRef.current;

      if (mode === 'initial') {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);

      try {
        if (!hasBorrowerProfiles || !activeBorrowerId) {
          setBorrower(null);
          setKyc(null);
          setCompanyContext(null);
          return;
        }

        let borrowerResponse;
        try {
          borrowerResponse = await borrowerClient.fetchBorrower();
        } catch {
          await wait(200);
          borrowerResponse = await borrowerClient.fetchBorrower();
        }

        const borrowerData = borrowerResponse.data;
        const [kycData, corporateContext] = await Promise.all([
          borrowerClient
            .getTruestackKycStatus()
            .then((response) => response.data)
            .catch(() => null),
          borrowerData.borrowerType === 'CORPORATE'
            ? borrowerAuthClient
                .fetchCompanyMembersContext()
                .then((response) => response.data)
                .catch(() => null)
            : Promise.resolve(null),
        ]);

        if (requestId !== requestIdRef.current) {
          return;
        }

        setBorrower(borrowerData);
        setKyc(kycData);
        setCompanyContext(corporateContext);
      } catch (loadError) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : 'Unable to load your borrower profile.',
        );
      } finally {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeBorrowerId, hasBorrowerProfiles],
  );

  useEffect(() => {
    const mode = hasLoadedRef.current ? 'refresh' : 'initial';
    hasLoadedRef.current = true;
    void loadProfileData(mode);
  }, [borrowerContextVersion, loadProfileData]);

  useEffect(() => {
    const hasActiveFlow =
      kyc?.sessions.some(
        (session) => session.status === 'pending' || session.status === 'processing',
      ) ?? false;
    if (!hasActiveFlow) {
      return;
    }

    const timer = setInterval(() => {
      void loadProfileData('refresh');
    }, 4000);

    return () => clearInterval(timer);
  }, [kyc?.sessions, loadProfileData]);

  const handleRefresh = useCallback(async () => {
    await refreshBorrowerProfiles();
    await loadProfileData('refresh');
  }, [loadProfileData, refreshBorrowerProfiles]);

  const openExternalLink = useCallback(async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      throw new Error('Unable to open the verification link on this device.');
    }

    await Linking.openURL(url);
  }, []);

  const handleStartIndividualKyc = useCallback(async () => {
    try {
      const response = await borrowerClient.startTruestackKycSession();
      await openExternalLink(response.data.onboardingUrl);
      await loadProfileData('refresh');
    } catch (startError) {
      Alert.alert(
        'Unable to start e-KYC',
        startError instanceof Error ? startError.message : 'Please try again.',
      );
    }
  }, [loadProfileData, openExternalLink]);

  const handleStartDirectorKyc = useCallback(
    async (directorId: string) => {
      try {
        const response = await borrowerClient.startTruestackKycSession({ directorId });
        await openExternalLink(response.data.onboardingUrl);
        await loadProfileData('refresh');
      } catch (startError) {
        Alert.alert(
          'Unable to start e-KYC',
          startError instanceof Error ? startError.message : 'Please try again.',
        );
      }
    },
    [loadProfileData, openExternalLink],
  );

  const handleOpenKycLink = useCallback(
    async (url: string) => {
      try {
        await openExternalLink(url);
      } catch (openError) {
        Alert.alert(
          'Unable to open link',
          openError instanceof Error ? openError.message : 'Please try again.',
        );
      }
    },
    [openExternalLink],
  );

  const handleSyncKycSession = useCallback(
    async (externalSessionId: string) => {
      try {
        await borrowerClient.refreshTruestackKycSession(externalSessionId);
        await loadProfileData('refresh');
      } catch (syncError) {
        Alert.alert(
          'Unable to sync status',
          syncError instanceof Error ? syncError.message : 'Please try again.',
        );
      }
    },
    [loadProfileData],
  );

  const verificationSummary = useMemo(
    () => (borrower ? getVerificationSummary(borrower, kyc) : null),
    [borrower, kyc],
  );

  if (loading) {
    return (
      <PageScreen
        title="Your profile"
        showBackButton={!embeddedInTab}
        showBottomNav={!embeddedInTab}
        backFallbackHref="/settings-menu"
        showBorrowerContextHeader={embeddedInTab}>
        <SectionCard title="Loading profile">
          <View style={styles.centeredState}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              Fetching the active borrower profile...
            </ThemedText>
          </View>
        </SectionCard>
      </PageScreen>
    );
  }

  return (
    <PageScreen
      title="Your profile"
      showBackButton={!embeddedInTab}
      showBottomNav={!embeddedInTab}
      backFallbackHref="/settings-menu"
      showBorrowerContextHeader={embeddedInTab}
      headerActions={
        error ? (
          <PageHeaderToolbarButton
            label={refreshing ? 'Retrying...' : 'Retry'}
            variant="outline"
            loading={refreshing}
            onPress={handleRefresh}
          />
        ) : borrower ? (
          <PageHeaderToolbarButton label="Edit profile" onPress={() => router.push('/profile-edit')} />
        ) : null
      }>
      {error ? (
        <SectionCard title="Profile unavailable" description="The mobile app could not load the latest borrower data.">
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        </SectionCard>
      ) : null}

      {borrower ? (
        <>
          <SectionCard hideHeader>
            <View style={styles.overviewStack}>
              <View style={styles.overviewHeader}>
                <View style={styles.overviewCopy}>
                  <ThemedText type="subtitle">{getBorrowerDisplayName(borrower)}</ThemedText>
                  <View style={styles.badgeRow}>
                    <StatusBadge
                      label={formatBorrowerTypeLabel(borrower.borrowerType)}
                      tone="primary"
                    />
                    {verificationSummary ? (
                      <StatusBadge
                        label={verificationSummary.label}
                        tone={verificationSummary.tone}
                      />
                    ) : null}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatBorrowerDocumentLine(borrower)}
                  </ThemedText>
                  {buildContactLine(borrower) ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {buildContactLine(borrower)}
                    </ThemedText>
                  ) : null}
                </View>
              </View>

              {verificationSummary ? (
                <SurfacePanel>
                  <ThemedText type="smallBold">Verification status</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {verificationSummary.hint}
                  </ThemedText>
                  <InfoGrid
                    items={[
                      {
                        label: 'Latest KYC sync',
                        value: getLatestKycTimestamp(kyc),
                      },
                      {
                        label: 'Document verified',
                        value: formatBooleanLabel(borrower.documentVerified),
                      },
                      {
                        label: borrower.borrowerType === 'CORPORATE' ? 'Directors on file' : 'Bank linked',
                        value:
                          borrower.borrowerType === 'CORPORATE'
                            ? `${borrower.directors.length}`
                            : borrower.bankAccountNo
                              ? 'Yes'
                              : 'No',
                      },
                      {
                        label: 'Documents uploaded',
                        value: `${borrower.documents.length}`,
                      },
                    ]}
                  />
                </SurfacePanel>
              ) : null}
            </View>
          </SectionCard>

          <TruestackKycMobileCard
            borrower={borrower}
            kyc={kyc}
            onStartIndividualSession={handleStartIndividualKyc}
            onStartDirectorSession={handleStartDirectorKyc}
            onOpenLink={handleOpenKycLink}
            onSyncSession={handleSyncKycSession}
          />

          {borrower.borrowerType === 'INDIVIDUAL' ? (
            <>
              <SectionCard title="Personal information">
                <InfoGrid
                  items={[
                    { label: 'Name', value: normalizeDisplayValue(borrower.name) },
                    {
                      label: 'Document type',
                      value: formatOptionLabel('documentType', borrower.documentType),
                    },
                    {
                      label: 'IC / Passport',
                      value:
                        borrower.documentType === 'IC'
                          ? formatICForDisplay(borrower.icNumber)
                          : normalizeDisplayValue(borrower.icNumber),
                    },
                    { label: 'Date of birth', value: formatDate(borrower.dateOfBirth) },
                    { label: 'Gender', value: formatOptionLabel('gender', borrower.gender) },
                    { label: 'Race', value: formatOptionLabel('race', borrower.race) },
                    {
                      label: 'Education',
                      value: formatOptionLabel('educationLevel', borrower.educationLevel),
                    },
                    { label: 'Occupation', value: normalizeDisplayValue(borrower.occupation) },
                    {
                      label: 'Employment',
                      value: formatOptionLabel('employmentStatus', borrower.employmentStatus),
                    },
                    {
                      label: 'Monthly income',
                      value: formatCurrency(borrower.monthlyIncome),
                    },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Contact information">
                <InfoGrid
                  items={[
                    { label: 'Phone', value: normalizeDisplayValue(borrower.phone) },
                    { label: 'Email', value: normalizeDisplayValue(borrower.email) },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Address">
                <InfoGrid
                  items={[
                    {
                      label: 'Registered address',
                      value: formatAddressValue(borrower),
                    },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Emergency contact">
                <InfoGrid
                  items={[
                    {
                      label: 'Name',
                      value: normalizeDisplayValue(borrower.emergencyContactName),
                    },
                    {
                      label: 'Phone',
                      value: normalizeDisplayValue(borrower.emergencyContactPhone),
                    },
                    {
                      label: 'Relationship',
                      value: formatOptionLabel(
                        'emergencyContactRelationship',
                        borrower.emergencyContactRelationship,
                      ),
                    },
                  ]}
                />
              </SectionCard>

              <SectionCard
                title="Bank information"
                description={borrower.bankAccountNo ? 'Bank account linked.' : 'No bank account linked yet.'}>
                <InfoGrid
                  items={[
                    {
                      label: 'Bank',
                      value: formatBankLabel(borrower.bankName, borrower.bankNameOther),
                    },
                    {
                      label: 'Account number',
                      value: normalizeDisplayValue(borrower.bankAccountNo),
                    },
                  ]}
                />
              </SectionCard>
            </>
          ) : (
            <>
              <SectionCard title="Company information">
                <InfoGrid
                  items={[
                    {
                      label: 'Company name',
                      value: normalizeDisplayValue(borrower.companyName),
                    },
                    {
                      label: 'SSM registration no',
                      value: normalizeDisplayValue(borrower.ssmRegistrationNo),
                    },
                    {
                      label: 'Taraf (Bumi status)',
                      value: formatOptionLabel('bumiStatus', borrower.bumiStatus),
                    },
                    {
                      label: 'Nature of business',
                      value: normalizeDisplayValue(borrower.natureOfBusiness),
                    },
                    {
                      label: 'Date of incorporation',
                      value: formatDate(borrower.dateOfIncorporation),
                    },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Business address">
                <InfoGrid
                  items={[
                    {
                      label: 'Registered address',
                      value: formatAddressValue({
                        addressLine1: borrower.addressLine1,
                        addressLine2: borrower.addressLine2,
                        city: borrower.city,
                        state: borrower.state,
                        postcode: borrower.postcode,
                        country: borrower.country,
                        businessAddress: borrower.businessAddress,
                      }),
                    },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Company contact">
                <InfoGrid
                  items={[
                    {
                      label: 'Phone',
                      value: normalizeDisplayValue(borrower.companyPhone),
                    },
                    {
                      label: 'Email',
                      value: normalizeDisplayValue(borrower.companyEmail),
                    },
                    {
                      label: 'Authorized representative',
                      value: normalizeDisplayValue(borrower.authorizedRepName),
                    },
                    {
                      label: 'Representative IC',
                      value: formatICForDisplay(borrower.authorizedRepIc),
                    },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Additional details">
                <InfoGrid
                  items={[
                    {
                      label: 'Paid-up capital',
                      value: formatCurrency(borrower.paidUpCapital),
                    },
                    {
                      label: 'Number of employees',
                      value: normalizeDisplayValue(borrower.numberOfEmployees),
                    },
                  ]}
                />
              </SectionCard>

              <SectionCard
                title="Company access"
                description="Role and permissions inherited from the borrower web organization setup.">
                <InfoGrid
                  items={[
                    {
                      label: 'Organization role',
                      value: humanizeToken(companyContext?.role, 'Not available'),
                    },
                    {
                      label: 'Manage members',
                      value: formatBooleanLabel(companyContext?.canManageMembers),
                    },
                    {
                      label: 'Edit company profile',
                      value: formatBooleanLabel(companyContext?.canEditCompanyProfile),
                    },
                  ]}
                />
              </SectionCard>

              <SectionCard
                title="Company directors"
                description="These directors are used by the corporate verification flow.">
                {borrower.directors.length > 0 ? (
                  <View style={styles.stack}>
                    {borrower.directors.map((director, index) => (
                      <SurfacePanel key={director.id || `${director.name}-${index}`}>
                        <View style={styles.rowBetween}>
                          <ThemedText type="smallBold">{`Director ${index + 1}`}</ThemedText>
                          {director.isAuthorizedRepresentative ? (
                            <StatusBadge label="Authorized rep" tone="primary" />
                          ) : null}
                        </View>
                        <InfoGrid
                          items={[
                            { label: 'Name', value: normalizeDisplayValue(director.name) },
                            { label: 'IC', value: formatICForDisplay(director.icNumber) },
                            {
                              label: 'Position',
                              value: normalizeDisplayValue(director.position),
                            },
                          ]}
                        />
                      </SurfacePanel>
                    ))}
                  </View>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    No company directors are on this borrower profile yet.
                  </ThemedText>
                )}
              </SectionCard>

              <SectionCard
                title="Bank information"
                description={borrower.bankAccountNo ? 'Bank account linked.' : 'No bank account linked yet.'}>
                <InfoGrid
                  items={[
                    {
                      label: 'Bank',
                      value: formatBankLabel(borrower.bankName, borrower.bankNameOther),
                    },
                    {
                      label: 'Account number',
                      value: normalizeDisplayValue(borrower.bankAccountNo),
                    },
                  ]}
                />
              </SectionCard>
            </>
          )}

          <SectionCard title="Social media">
            <InfoGrid
              items={[
                { label: 'Instagram', value: normalizeDisplayValue(borrower.instagram) },
                { label: 'TikTok', value: normalizeDisplayValue(borrower.tiktok) },
                { label: 'Facebook', value: normalizeDisplayValue(borrower.facebook) },
                { label: 'LinkedIn', value: normalizeDisplayValue(borrower.linkedin) },
                { label: 'X (Twitter)', value: normalizeDisplayValue(borrower.xTwitter) },
              ]}
            />
          </SectionCard>

          <SectionCard
            title="Documents"
            description="Uploaded borrower documents and their latest timestamps."
            collapsible
            collapsedSummary={
              borrower.documents.length > 0
                ? `${borrower.documents.length} file${borrower.documents.length === 1 ? '' : 's'}`
                : 'No documents yet'
            }>
            {borrower.documents.length > 0 ? (
              <View style={styles.stack}>
                {borrower.documents.map((document) => (
                  <BorrowerDocumentCard key={document.id} document={document} />
                ))}
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                No borrower documents have been uploaded yet.
              </ThemedText>
            )}
          </SectionCard>
        </>
      ) : (
        <SectionCard title="No active borrower" description="A borrower profile is required before applications and loans can be used.">
          <ThemedText type="small" themeColor="textSecondary">
            Once a borrower profile exists and is selected, the full mobile profile experience will
            appear here.
          </ThemedText>
        </SectionCard>
      )}
    </PageScreen>
  );
}

export default function ProfileRoute() {
  return <ProfileScreen />;
}

const styles = StyleSheet.create({
  centeredState: {
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  overviewStack: {
    gap: Spacing.three,
  },
  overviewHeader: {
    gap: Spacing.two,
  },
  overviewCopy: {
    gap: Spacing.one,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    alignSelf: 'flex-start',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  infoField: {
    flexBasis: 160,
    flexGrow: 1,
    gap: Spacing.one,
  },
  surfacePanel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  stack: {
    gap: Spacing.two,
  },
  stackTight: {
    gap: Spacing.one,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
});
