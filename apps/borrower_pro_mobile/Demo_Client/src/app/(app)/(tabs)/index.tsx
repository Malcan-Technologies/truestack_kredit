import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import {
  HorizontalSnapCarousel,
  useSnapCarouselCardWidth,
} from '@/components/horizontal-snap-carousel';
import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  applicationsClient,
  borrowerClient,
  loansClient,
} from '@/lib/api/borrower';
import { useBorrowerAccess } from '@/lib/borrower-access';
import { isBorrowerKycComplete } from '@/lib/borrower-verification';
import { isReturnedForAmendment } from '@/lib/applications/amendment';
import { borrowerApplicationDetailPath } from '@/lib/applications/navigation';
import { getPendingLenderCounterOffer } from '@/lib/applications/counter-offer';
import { borrowerLoanNeedsContinueAction } from '@/lib/loans/continue-eligibility';
import { formatRm, toAmountNumber } from '@/lib/loans/currency';
import {
  deriveLoanJourneyPhase,
  loanJourneyPhaseLabel,
  type LoanJourneyPhase,
} from '@/lib/loans/journey-phase';
import {
  borrowerLoanStatusBadgeTone,
  loanStatusBadgeLabelFromDb,
  type BorrowerStatusTone,
} from '@/lib/loans/status-label';
import { formatDate } from '@/lib/format/date';
import { getBorrowerDisplayName } from '@/lib/format/borrower';
import { loadOnboardingDraft, type OnboardingDraft } from '@/lib/onboarding';

import type {
  BorrowerLoanListItem,
  LoanApplicationDetail,
  LoanCenterOverview,
} from '@kredit/borrower';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function updatedAtSortMs(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** List API spreads Prisma loan; `updatedAt` may be present though not on the narrow TS type. */
function borrowerLoanListSortMs(loan: BorrowerLoanListItem): number {
  const ext = loan as BorrowerLoanListItem & { updatedAt?: string };
  return updatedAtSortMs(ext.updatedAt ?? loan.createdAt);
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-MY', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kuala_Lumpur',
    });
  } catch {
    return '—';
  }
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                      */
/* ------------------------------------------------------------------ */

function toneToColors(theme: ReturnType<typeof useTheme>, tone: BorrowerStatusTone) {
  switch (tone) {
    case 'success':
      return { fg: theme.success, bg: `${theme.success}1F`, border: `${theme.success}3A` };
    case 'warning':
      return { fg: theme.warning, bg: `${theme.warning}1F`, border: `${theme.warning}3A` };
    case 'error':
      return { fg: theme.error, bg: `${theme.error}1F`, border: `${theme.error}3A` };
    case 'info':
      return { fg: theme.info, bg: `${theme.info}1F`, border: `${theme.info}3A` };
    case 'primary':
      return { fg: theme.text, bg: theme.backgroundSelected, border: theme.border };
    default:
      return { fg: theme.textSecondary, bg: theme.backgroundElement, border: theme.border };
  }
}

function StatusPill({ label, tone }: { label: string; tone: BorrowerStatusTone }) {
  const theme = useTheme();
  const colors = toneToColors(theme, tone);
  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: colors.bg, borderColor: colors.border },
      ]}>
      <ThemedText type="smallBold" style={{ color: colors.fg, fontSize: 11 }}>
        {label}
      </ThemedText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress donut                                                    */
/* ------------------------------------------------------------------ */

function ProgressDonut({
  percent,
  size = 56,
  strokeWidth = 5,
  status,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  status?: string;
}) {
  const theme = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safe = Math.max(0, Math.min(100, percent));
  const offset = circumference - (safe / 100) * circumference;
  const center = size / 2;

  let strokeColor = theme.text;
  if (status === 'COMPLETED') strokeColor = theme.success;
  else if (status === 'DEFAULTED' || status === 'WRITTEN_OFF') strokeColor = theme.error;
  else if (status === 'IN_ARREARS') strokeColor = theme.warning;

  return (
    <View style={[styles.donutWrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.donutRotated}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          stroke={theme.backgroundSelected}
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference}, ${circumference}`}
          strokeDashoffset={offset}
          stroke={strokeColor}
        />
      </Svg>
      <View style={styles.donutCenter}>
        <ThemedText
          type="smallBold"
          style={[styles.donutText, { fontSize: size * 0.24, lineHeight: size * 0.28 }]}>
          {Math.round(safe)}%
        </ThemedText>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI card                                                          */
/* ------------------------------------------------------------------ */

function KpiCard({
  label,
  icon,
  value,
  helper,
  footerLabel,
  footerValue,
}: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  value: string;
  helper?: string;
  footerLabel?: string;
  footerValue?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.kpiCard,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <View style={styles.kpiHeader}>
        <ThemedText
          type="smallBold"
          themeColor="textSecondary"
          style={styles.kpiLabel}
          numberOfLines={1}>
          {label}
        </ThemedText>
        <View
          style={[
            styles.kpiIconWrap,
            { backgroundColor: theme.backgroundSelected },
          ]}>
          <MaterialIcons name={icon} size={16} color={theme.text} />
        </View>
      </View>
      <ThemedText style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
      {helper ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {helper}
        </ThemedText>
      ) : null}
      {footerLabel ? (
        <View style={[styles.kpiFooter, { borderTopColor: theme.border }]}>
          <ThemedText
            type="smallBold"
            themeColor="textSecondary"
            style={styles.kpiFooterLabel}>
            {footerLabel}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.kpiFooterValue}>
            {footerValue}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI carousel — uses the shared HorizontalSnapCarousel component   */
/* ------------------------------------------------------------------ */

const KPI_GAP = Spacing.three;


/* ------------------------------------------------------------------ */
/*  Action item                                                       */
/* ------------------------------------------------------------------ */

type ActionTier = 'urgent' | 'action' | 'low';

type ActionItem = {
  id: string;
  label: string;
  statusLabel: string;
  sublabel: string;
  description: string;
  href: Href;
  icon: keyof typeof MaterialIcons.glyphMap;
  tier: ActionTier;
};

function ActionRow({ action, onPress }: { action: ActionItem; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        {
          backgroundColor: pressed ? `${theme.warning}14` : `${theme.warning}0D`,
          borderColor: `${theme.warning}33`,
        },
      ]}>
      <View
        style={[
          styles.actionIconWrap,
          { backgroundColor: `${theme.warning}26` },
        ]}>
        <MaterialIcons name={action.icon} size={16} color={theme.warning} />
      </View>
      <View style={styles.actionRowBody}>
        <ThemedText type="smallBold" style={styles.actionRowTitle} numberOfLines={1}>
          {action.label}
          <ThemedText type="small" themeColor="textSecondary">
            {'  ·  '}
            {action.sublabel}
          </ThemedText>
        </ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.actionRowDescription}
          numberOfLines={1}>
          {action.description}
        </ThemedText>
      </View>
      <MaterialIcons name="chevron-right" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

function ActionsSection({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.actionsSection}>
      <View style={styles.actionsHeader}>
        <MaterialIcons name="error-outline" size={16} color={theme.warning} />
        <ThemedText type="smallBold" style={styles.actionsHeaderTitle}>
          Action needed
        </ThemedText>
        <View
          style={[
            styles.actionsCountBadge,
            { backgroundColor: `${theme.warning}1F` },
          ]}>
          <ThemedText
            type="smallBold"
            style={{ color: theme.warning, fontSize: 11, lineHeight: 14 }}>
            {count}
          </ThemedText>
        </View>
      </View>
      <View style={styles.actionList}>{children}</View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Active loan row                                                   */
/* ------------------------------------------------------------------ */

function ActiveLoanRow({
  loan,
  onPress,
}: {
  loan: BorrowerLoanListItem;
  onPress: () => void;
}) {
  const theme = useTheme();
  const progress = loan.progress;
  const isOverdue = loan.status === 'IN_ARREARS' || loan.status === 'DEFAULTED';
  const tone = borrowerLoanStatusBadgeTone(loan);
  const statusLabel = loanStatusBadgeLabelFromDb(loan);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.loanRow,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: isOverdue ? `${theme.warning}55` : theme.border,
        },
      ]}>
      <ProgressDonut
        percent={progress.progressPercent}
        size={56}
        strokeWidth={5}
        status={loan.status}
      />
      <View style={styles.loanRowBody}>
        <View style={styles.loanRowHeader}>
          <View style={styles.loanRowTitleWrap}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {loan.product?.name ?? 'Loan'}
            </ThemedText>
            <ThemedText style={styles.loanRowAmount} numberOfLines={1}>
              {formatRm(loan.principalAmount)}
            </ThemedText>
          </View>
          <StatusPill label={statusLabel} tone={tone} />
        </View>
        <View style={styles.loanRowMeta}>
          <ThemedText type="small" themeColor="textSecondary">
            {progress.paidCount}/{progress.totalRepayments} paid
          </ThemedText>
          {(progress.overdueCount ?? 0) > 0 ? (
            <ThemedText type="smallBold" style={{ color: theme.error, fontSize: 12 }}>
              {progress.overdueCount} overdue
            </ThemedText>
          ) : null}
          {progress.nextPaymentDue ? (
            <ThemedText type="small" themeColor="textSecondary">
              Next: {formatDateShort(progress.nextPaymentDue)}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Pending (before payout) loan row                                  */
/* ------------------------------------------------------------------ */

function PendingLoanRow({
  loan,
  borrowerKycDone,
  onPress,
}: {
  loan: BorrowerLoanListItem;
  borrowerKycDone: boolean | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  const phase = deriveLoanJourneyPhase({
    applicationStatus: loan.application?.status,
    loanStatus: loan.status,
    attestationCompletedAt: loan.attestationCompletedAt,
    kycComplete: borrowerKycDone,
    signedAgreementReviewStatus: loan.signedAgreementReviewStatus,
    agreementPath: undefined,
    loanChannel: loan.loanChannel,
  });
  const needsAction = borrowerLoanNeedsContinueAction(loan);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.pendingRow,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: `${theme.warning}40`,
        },
      ]}>
      <View style={styles.pendingHeader}>
        <View style={styles.pendingTitleWrap}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {loan.product?.name ?? 'Loan'}
          </ThemedText>
          <ThemedText style={styles.pendingAmount} numberOfLines={1}>
            {formatRm(loan.principalAmount)}
          </ThemedText>
        </View>
        <StatusPill label={loanJourneyPhaseLabel(phase)} tone="warning" />
      </View>
      <View style={styles.pendingMeta}>
        <ThemedText type="small" themeColor="textSecondary">
          {loan.term} months
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          ·
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.pendingId}>
          {shortId(loan.id)}
        </ThemedText>
      </View>
      {needsAction ? (
        <View style={styles.pendingActionRow}>
          <MaterialIcons name="arrow-forward" size={14} color={theme.warning} />
          <ThemedText type="smallBold" style={{ color: theme.warning, fontSize: 12 }}>
            Action required — continue
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Section header (title + view all link)                            */
/* ------------------------------------------------------------------ */

function SectionHeader({
  title,
  onViewAll,
}: {
  title: string;
  onViewAll?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="smallBold" style={styles.sectionHeaderTitle}>
        {title}
      </ThemedText>
      {onViewAll ? (
        <Pressable
          accessibilityRole="button"
          onPress={onViewAll}
          hitSlop={8}
          style={({ pressed }) => [
            styles.viewAllPressable,
            { opacity: pressed ? 0.6 : 1 },
          ]}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.viewAllText}>
            View all
          </ThemedText>
          <MaterialIcons name="chevron-right" size={16} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Locked / onboarding-required state                                */
/* ------------------------------------------------------------------ */

function getDraftProgress(draft: OnboardingDraft | null) {
  if (!draft) return null;
  const maxSub = draft.borrowerType === 'INDIVIDUAL' ? 3 : 5;
  const totalSteps = maxSub + 2;
  let currentIndex = 0;
  if (draft.step === 1) currentIndex = 0;
  else if (draft.step === 2) currentIndex = draft.borrowerDetailSubStep;
  else if (draft.step === 3) currentIndex = totalSteps - 1;
  if (currentIndex <= 0) return null;
  return `Step ${currentIndex + 1} of ${totalSteps}`;
}

function OnboardingRequiredScreen({
  draftProgress,
  loadingDraft,
  onStart,
}: {
  draftProgress: string | null;
  loadingDraft: boolean;
  onStart: () => void;
}) {
  const theme = useTheme();
  return (
    <PageScreen
      title="Complete onboarding"
      subtitle="Create your borrower profile before applications, loans, and profile management unlock.">
      <SectionCard
        title="Borrower profile required"
        description="This app is intentionally limited until your first borrower profile is completed, so the next step is always clear.">
        {loadingDraft ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : (
          <View style={styles.lockedStack}>
            {draftProgress ? (
              <View
                style={[
                  styles.draftBanner,
                  {
                    borderColor: theme.primary,
                    backgroundColor: theme.backgroundSelected,
                  },
                ]}>
                <ThemedText type="small" style={{ color: theme.primary }}>
                  {`${draftProgress} saved.`}
                </ThemedText>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={onStart}
              style={({ pressed }) => [
                styles.lockedButton,
                {
                  backgroundColor: theme.primary,
                  borderColor: theme.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
                {draftProgress ? 'Continue onboarding' : 'Get started'}
              </ThemedText>
            </Pressable>
          </View>
        )}
      </SectionCard>
    </PageScreen>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                          */
/* ------------------------------------------------------------------ */

function DashboardSkeleton() {
  const theme = useTheme();
  const cardWidth = useSnapCarouselCardWidth();
  return (
    <View style={styles.skeletonRoot}>
      <View style={[styles.kpiSkeletonWrap, { marginHorizontal: -Spacing.four }]}>
        <View
          style={[
            styles.kpiSkeletonRow,
            { paddingHorizontal: Spacing.four },
          ]}>
          {Array.from({ length: 2 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.kpiCard,
                styles.kpiCardSkeleton,
                {
                  width: cardWidth,
                  marginRight: i === 0 ? KPI_GAP : 0,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}>
              <View
                style={[styles.skelLineSm, { backgroundColor: theme.backgroundSelected }]}
              />
              <View
                style={[styles.skelLineLg, { backgroundColor: theme.backgroundSelected }]}
              />
              <View
                style={[styles.skelLineMd, { backgroundColor: theme.backgroundSelected }]}
              />
            </View>
          ))}
        </View>
      </View>
      <View
        style={[
          styles.skelBlock,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}
      />
      <View
        style={[
          styles.skelBlock,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Main dashboard                                                    */
/* ------------------------------------------------------------------ */

const ACTIONS_PAGE_SIZE = 3;

function DashboardContent() {
  const router = useRouter();
  const theme = useTheme();
  const { activeBorrower, borrowerContextVersion } = useBorrowerAccess();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<LoanCenterOverview | null>(null);
  const [activeLoans, setActiveLoans] = useState<BorrowerLoanListItem[]>([]);
  const [pendingLoans, setPendingLoans] = useState<BorrowerLoanListItem[]>([]);
  const [counterOfferApps, setCounterOfferApps] = useState<LoanApplicationDetail[]>([]);
  const [amendmentApps, setAmendmentApps] = useState<LoanApplicationDetail[]>([]);
  const [borrowerKycDone, setBorrowerKycDone] = useState<boolean | null>(null);
  const [actionsVisible, setActionsVisible] = useState(ACTIONS_PAGE_SIZE);

  const resetState = useCallback(() => {
    setOverview(null);
    setActiveLoans([]);
    setPendingLoans([]);
    setCounterOfferApps([]);
    setAmendmentApps([]);
    setBorrowerKycDone(null);
  }, []);

  const loadAll = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);

      try {
        const [ov, aLoans, pLoans, apps, borrowerRes, kycRes] = await Promise.all([
          loansClient.fetchLoanCenterOverview(),
          loansClient.listBorrowerLoans({ tab: 'active', pageSize: 200 }),
          loansClient.listBorrowerLoans({ tab: 'pending_disbursement', pageSize: 200 }),
          applicationsClient.listBorrowerApplications({ pageSize: 200 }),
          borrowerClient.fetchBorrower().catch(() => null),
          borrowerClient.getTruestackKycStatus().catch(() => null),
        ]);

        setOverview(ov.success ? ov.data : null);
        setActiveLoans(aLoans.data);
        setPendingLoans(pLoans.data);

        const applicationRows = apps.success ? apps.data : [];
        setCounterOfferApps(
          applicationRows.filter((a) => getPendingLenderCounterOffer(a) != null),
        );
        setAmendmentApps(applicationRows.filter(isReturnedForAmendment));

        if (borrowerRes?.success) {
          setBorrowerKycDone(
            isBorrowerKycComplete(borrowerRes.data, kycRes?.success ? kycRes.data : null),
          );
        } else {
          setBorrowerKycDone(null);
        }
      } catch {
        resetState();
      } finally {
        if (mode === 'initial') setLoading(false);
        else setRefreshing(false);
      }
    },
    [resetState],
  );

  useEffect(() => {
    void loadAll('initial');
  }, [loadAll, borrowerContextVersion]);

  const pendingActions = useMemo<Array<ActionItem & { sortAt: number }>>(() => {
    const items: Array<ActionItem & { sortAt: number }> = [];

    const phaseIcon = (phase: LoanJourneyPhase): keyof typeof MaterialIcons.glyphMap => {
      switch (phase) {
        case 'attestation':
          return 'check-circle';
        case 'ekyc':
          return 'fingerprint';
        case 'signing':
          return 'edit';
        default:
          return 'description';
      }
    };

    const phaseDescription = (phase: LoanJourneyPhase): string => {
      switch (phase) {
        case 'attestation':
          return 'Please review and attest to the terms to proceed to e-KYC.';
        case 'ekyc':
          return 'Complete identity verification to continue with your loan.';
        case 'signing':
          return 'Document ready for signature at HQ or digital via portal.';
        case 'disbursement':
          return 'Awaiting final disbursement of funds to your account.';
        default:
          return 'Action required to proceed with your loan.';
      }
    };

    for (const loan of pendingLoans) {
      if (!borrowerLoanNeedsContinueAction(loan)) continue;
      const phase = deriveLoanJourneyPhase({
        applicationStatus: loan.application?.status,
        loanStatus: loan.status,
        attestationCompletedAt: loan.attestationCompletedAt,
        kycComplete: borrowerKycDone,
        signedAgreementReviewStatus: loan.signedAgreementReviewStatus,
        agreementPath: undefined,
        loanChannel: loan.loanChannel,
      });
      items.push({
        sortAt: borrowerLoanListSortMs(loan),
        id: `loan-${loan.id}`,
        label: loanJourneyPhaseLabel(phase),
        statusLabel: phase === 'attestation' ? 'Due soon' : loanJourneyPhaseLabel(phase),
        sublabel: `${loan.product?.name ?? 'Loan'} (${formatRm(loan.principalAmount)})`,
        description: phaseDescription(phase),
        href: `/loans/${loan.id}` as Href,
        icon: phaseIcon(phase),
        tier: 'urgent',
      });
    }

    for (const app of amendmentApps) {
      items.push({
        sortAt: updatedAtSortMs(app.updatedAt),
        id: `amendment-${app.id}`,
        label: 'Amendment',
        statusLabel: 'Action needed',
        sublabel: `${app.product?.name ?? 'Application'} (${formatRm(app.amount)})`,
        description:
          'Your lender returned this application for changes. Review their message, update your details, and resubmit.',
        href: borrowerApplicationDetailPath(app) as Href,
        icon: 'assignment',
        tier: 'action',
      });
    }

    for (const app of counterOfferApps) {
      const pending = getPendingLenderCounterOffer(app);
      const amountLabel =
        pending?.amount != null
          ? formatRm(pending.amount)
          : formatRm(toAmountNumber(app.amount));
      const termLabel =
        pending?.term != null ? `${pending.term} months` : `${app.term} months`;
      items.push({
        sortAt: updatedAtSortMs(app.updatedAt),
        id: `counter-${app.id}`,
        label: 'Counter offer',
        statusLabel: 'Review',
        sublabel: `${app.product?.name ?? 'Application'} (${amountLabel})`,
        description: `New offer received: ${amountLabel} over ${termLabel}. Review and respond.`,
        href: borrowerApplicationDetailPath(app) as Href,
        icon: 'assignment',
        tier: 'action',
      });
    }

    return items.sort((a, b) => b.sortAt - a.sortAt);
  }, [pendingLoans, amendmentApps, counterOfferApps, borrowerKycDone]);

  const summary = overview?.summary;
  const counts = overview?.counts;

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={() => void loadAll('refresh')}
        tintColor={theme.primary}
        colors={Platform.OS === 'android' ? [theme.primary] : undefined}
      />
    ),
    [loadAll, refreshing, theme.primary],
  );

  const borrowerName = activeBorrower ? getBorrowerDisplayName(activeBorrower) : null;
  const headerTitle = borrowerName ? `Welcome, ${borrowerName}` : 'Dashboard';
  const headerSubtitle = 'Overview of your borrowing activity.';

  const visibleActions = pendingActions.slice(0, actionsVisible);

  return (
    <PageScreen
      title={headerTitle}
      subtitle={headerSubtitle}
      showBorrowerContextHeader
      refreshControl={loading ? undefined : refreshControl}>
      {loading && !overview ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Action needed — top of dashboard for fastest access */}
          {pendingActions.length > 0 ? (
            <ActionsSection count={pendingActions.length}>
              {visibleActions.map((action) => (
                <ActionRow
                  key={action.id}
                  action={action}
                  onPress={() => router.push(action.href)}
                />
              ))}
              {pendingActions.length > actionsVisible ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setActionsVisible((v) => v + ACTIONS_PAGE_SIZE)}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.showMoreLink,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.showMoreText}>
                    Show {pendingActions.length - actionsVisible} more
                  </ThemedText>
                </Pressable>
              ) : null}
            </ActionsSection>
          ) : null}

          {/* KPI Summary */}
          <HorizontalSnapCarousel initialIndex={1} gap={KPI_GAP}>
            <KpiCard
              label="Active Loans"
              icon="account-balance-wallet"
              value={summary?.activeLoanCount != null ? String(summary.activeLoanCount) : '—'}
              helper={
                (summary?.activeLoanCount ?? 0) === 0
                  ? 'No active loans'
                  : 'Loans in repayment'
              }
            />
            <KpiCard
              label="Outstanding"
              icon="payments"
              value={summary != null ? formatRm(summary.totalOutstanding) : '—'}
              helper="Total balance remaining"
              footerLabel={
                summary != null && summary.totalPaid > 0 ? 'Paid' : undefined
              }
              footerValue={
                summary != null && summary.totalPaid > 0
                  ? formatRm(summary.totalPaid)
                  : undefined
              }
            />
            <KpiCard
              label="Next Payment"
              icon="event"
              value={summary?.nextPaymentDue ? formatDateShort(summary.nextPaymentDue) : '—'}
              helper={
                summary?.nextPaymentAmount != null
                  ? formatRm(summary.nextPaymentAmount)
                  : 'No upcoming payments'
              }
            />
            <KpiCard
              label="Before Payout"
              icon="description"
              value={
                counts?.pendingDisbursementLoans != null
                  ? String(counts.pendingDisbursementLoans)
                  : '—'
              }
              helper={
                (counts?.pendingDisbursementLoans ?? 0) === 0
                  ? 'No loans awaiting payout'
                  : 'Attestation or signing pending'
              }
            />
          </HorizontalSnapCarousel>

          {/* Active loans */}
          <View style={styles.sectionBlock}>
            <SectionHeader
              title="Active loans"
              onViewAll={
                activeLoans.length > 0
                  ? () => router.push('/loans?tab=active' as Href)
                  : undefined
              }
            />
            {activeLoans.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}>
                <MaterialIcons
                  name="account-balance-wallet"
                  size={32}
                  color={theme.textSecondary}
                  style={{ opacity: 0.5 }}
                />
                <ThemedText type="smallBold" style={styles.emptyTitle}>
                  No active loans yet
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/applications' as Href)}
                  style={({ pressed }) => [
                    styles.emptyButton,
                    {
                      borderColor: theme.border,
                      backgroundColor: pressed
                        ? theme.backgroundSelected
                        : 'transparent',
                    },
                  ]}>
                  <ThemedText type="smallBold">Apply for a loan</ThemedText>
                  <MaterialIcons name="arrow-forward" size={16} color={theme.text} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.list}>
                {activeLoans.slice(0, 3).map((loan) => (
                  <ActiveLoanRow
                    key={loan.id}
                    loan={loan}
                    onPress={() => router.push(`/loans/${loan.id}` as Href)}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Before payout */}
          {pendingLoans.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionHeader
                title="Before payout"
                onViewAll={() => router.push('/loans?tab=before_payout' as Href)}
              />
              <View style={styles.list}>
                {pendingLoans.slice(0, 3).map((loan) => (
                  <PendingLoanRow
                    key={loan.id}
                    loan={loan}
                    borrowerKycDone={borrowerKycDone}
                    onPress={() => router.push(`/loans/${loan.id}` as Href)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </PageScreen>
  );
}

/* ------------------------------------------------------------------ */
/*  Default export — handles onboarding-required state                */
/* ------------------------------------------------------------------ */

export default function DashboardScreen() {
  const router = useRouter();
  const { hasBorrowerProfiles, isCheckingBorrowerProfiles } = useBorrowerAccess();

  const [draftProgress, setDraftProgress] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (hasBorrowerProfiles) {
      setDraftProgress(null);
      return;
    }
    setDraftLoading(true);
    void loadOnboardingDraft()
      .then((draft) => {
        if (!cancelled) setDraftProgress(getDraftProgress(draft));
      })
      .finally(() => {
        if (!cancelled) setDraftLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasBorrowerProfiles]);

  if (isCheckingBorrowerProfiles && !hasBorrowerProfiles) {
    return (
      <PageScreen title="Dashboard" subtitle="Loading…">
        <SectionCard title="Loading">
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        </SectionCard>
      </PageScreen>
    );
  }

  if (!hasBorrowerProfiles) {
    return (
      <OnboardingRequiredScreen
        draftProgress={draftProgress}
        loadingDraft={draftLoading}
        onStart={() => router.push('/onboarding')}
      />
    );
  }

  return <DashboardContent />;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  loading: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedStack: {
    gap: Spacing.three,
  },
  draftBanner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.three,
  },
  lockedButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },

  /* KPI cards (carousel chrome lives in HorizontalSnapCarousel) */
  kpiSkeletonWrap: {
    gap: Spacing.two,
  },
  kpiSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 2,
  },
  kpiCard: {
    flex: 1,
    minHeight: 132,
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  kpiCardSkeleton: {
    justifyContent: 'space-between',
  },
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  kpiLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  kpiIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  kpiFooter: {
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  kpiFooterLabel: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  kpiFooterValue: {
    fontSize: 13,
    fontWeight: '700',
  },

  /* Action list */
  actionsSection: {
    gap: Spacing.two,
  },
  actionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.one,
  },
  actionsHeaderTitle: {
    fontSize: 13,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  actionsCountBadge: {
    minWidth: 20,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  actionList: {
    gap: Spacing.one + 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
    minHeight: 56,
  },
  actionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRowBody: {
    flex: 1,
    minWidth: 0,
  },
  actionRowTitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionRowDescription: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  showMoreLink: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.one + 2,
  },
  showMoreText: {
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  /* Section header */
  sectionBlock: {
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  viewAllPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.one,
  },
  viewAllText: {
    fontSize: 13,
  },

  /* Loan rows */
  list: {
    gap: Spacing.two,
  },
  loanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
  },
  loanRowBody: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  loanRowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  loanRowTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  loanRowAmount: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  loanRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: Spacing.two,
    rowGap: 2,
  },

  /* Pending loan rows */
  pendingRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  pendingTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pendingAmount: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  pendingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pendingId: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  pendingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },

  /* Empty state */
  emptyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyTitle: {
    marginTop: Spacing.one,
  },
  emptyButton: {
    marginTop: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },

  /* Status pill */
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },

  /* Donut */
  donutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutRotated: {
    transform: [{ rotate: '-90deg' }],
  },
  donutCenter: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutText: {
    fontWeight: '700',
  },

  /* Skeleton */
  skeletonRoot: {
    gap: Spacing.three,
  },
  skelLineSm: {
    height: 10,
    width: '50%',
    borderRadius: 6,
  },
  skelLineMd: {
    height: 12,
    width: '70%',
    borderRadius: 6,
  },
  skelLineLg: {
    height: 22,
    width: '60%',
    borderRadius: 6,
  },
  skelBlock: {
    height: 140,
    borderRadius: 16,
    borderWidth: 1,
  },
});
