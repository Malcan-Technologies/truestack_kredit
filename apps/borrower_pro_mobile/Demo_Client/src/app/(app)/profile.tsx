import type { BorrowerDetail, TruestackKycStatusData } from '@kredit/borrower';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { MaterialIcons } from '@expo/vector-icons';

import { BorrowerDocumentListItem } from '@/components/borrower-document-card';
import { StatusBadge } from '@/components/status-badge';
import { PageHeaderToolbarButton, PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { CompanyMembersMobileCard } from '@/components/company-members-mobile-card';
import { ProfileHeroCardSkeleton } from '@/components/profile-hero-skeleton';
import { DigitalSigningCertCard } from '@/components/digital-signing-cert-card';
import { TruestackKycMobileCard } from '@/components/truestack-kyc-mobile-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { borrowerClient } from '@/lib/api/borrower';
import { useBorrowerAccess } from '@/lib/borrower-access';
import {
  formatAddressValue,
  formatBankLabel,
  formatBorrowerDocumentLine,
  formatBorrowerTypeLabel,
  formatCurrency,
  formatICForDisplay,
  formatOptionLabel,
  getBorrowerDisplayName,
  normalizeDisplayValue,
} from '@/lib/format/borrower';
import { formatDate } from '@/lib/format/date';

type InfoItem = {
  label: string;
  value: string;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const theme = useTheme();
  const { activeBorrowerId, borrowerContextVersion, hasBorrowerProfiles, refreshBorrowerProfiles } =
    useBorrowerAccess();
  const [borrower, setBorrower] = useState<BorrowerDetail | null>(null);
  const [kyc, setKyc] = useState<TruestackKycStatusData | null>(null);
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
        const kycData = await borrowerClient
          .getTruestackKycStatus()
          .then((response) => response.data)
          .catch(() => null);

        if (requestId !== requestIdRef.current) {
          return;
        }

        setBorrower(borrowerData);
        setKyc(kycData);
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

  /** Hero placeholder while the initial borrower + KYC fetch runs (avoids full-screen spinner). */
  const showHeroSkeleton = loading && !borrower && !error;

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
        ) : null
      }>
      {error ? (
        <SectionCard title="Profile unavailable" description="The mobile app could not load the latest borrower data.">
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        </SectionCard>
      ) : null}

      {showHeroSkeleton ? (
        <SectionCard hideHeader>
          <ProfileHeroCardSkeleton />
        </SectionCard>
      ) : null}

      {borrower ? (
        <>
          <SectionCard hideHeader>
            <View style={styles.overviewStack}>
              <View style={styles.overviewHeader}>
                <View style={styles.overviewCopy}>
                  <View style={styles.badgeRow}>
                    <StatusBadge
                      label={formatBorrowerTypeLabel(borrower.borrowerType)}
                      tone="primary"
                    />
                  </View>
                  <ThemedText type="subtitle">{getBorrowerDisplayName(borrower)}</ThemedText>
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

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/profile-edit')}
                style={({ pressed }) => [
                  styles.editProfileRow,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                <MaterialIcons name="edit" size={18} color={theme.primary} />
                <ThemedText type="smallBold" style={{ color: theme.primary, flex: 1 }}>
                  Edit profile
                </ThemedText>
                <MaterialIcons name="chevron-right" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
          </SectionCard>

          {borrower.borrowerType === 'CORPORATE' ? (
            <CompanyMembersMobileCard refreshKey={borrowerContextVersion} />
          ) : null}

          <TruestackKycMobileCard
            borrower={borrower}
            kyc={kyc}
            onStartIndividualSession={handleStartIndividualKyc}
            onStartDirectorSession={handleStartDirectorKyc}
            onOpenLink={handleOpenKycLink}
          />

          <DigitalSigningCertCard />

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
            description={
              borrower.documents.length > 0
                ? `${borrower.documents.length} file${borrower.documents.length === 1 ? '' : 's'} attached to your profile.`
                : 'Uploads from your borrower onboarding and applications appear here.'
            }>
            {borrower.documents.length > 0 ? (
              <View>
                {borrower.documents.map((document, index) => (
                  <BorrowerDocumentListItem
                    key={document.id}
                    document={document}
                    isLast={index === borrower.documents.length - 1}
                  />
                ))}
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                No borrower documents have been uploaded yet.
              </ThemedText>
            )}
          </SectionCard>
        </>
      ) : showHeroSkeleton ? null : (
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
  editProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    minHeight: 44,
  },
});
