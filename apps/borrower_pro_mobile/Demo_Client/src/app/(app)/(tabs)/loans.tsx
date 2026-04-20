import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { BottomSheetModal } from '@/components/bottom-sheet-modal';
import { ChannelPill } from '@/components/channel-pill';
import { OnboardingFirstGate } from '@/components/onboarding-first-gate';
import { PageHeaderToolbarButton, PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { applicationsClient, borrowerClient, loansClient } from '@/lib/api/borrower';
import { useBorrowerAccess } from '@/lib/borrower-access';
import { isBorrowerKycComplete } from '@/lib/borrower-verification';
import { borrowerLoanNeedsContinueAction } from '@/lib/loans/continue-eligibility';
import { formatRm } from '@/lib/loans/currency';
import {
  PHASE_HINTS,
  PRE_DISBURSEMENT_PHASES,
  type LoanJourneyPhase,
  deriveLoanJourneyPhase,
  loanJourneyPhaseLabel,
} from '@/lib/loans/journey-phase';
import {
  borrowerLoanStatusBadgeTone,
  loanStatusBadgeLabelFromDb,
  type BorrowerStatusTone,
} from '@/lib/loans/status-label';
import { formatDate } from '@/lib/format/date';

import type {
  BorrowerLoanListItem,
  LoanApplicationDetail,
  LoanCenterOverview,
} from '@kredit/borrower';

/* ------------------------------------------------------------------ */
/*  Tabs                                                              */
/* ------------------------------------------------------------------ */

type LoanCenterTab = 'all' | 'active' | 'before_payout' | 'discharged' | 'rejected';

const LOAN_CENTER_TABS: { key: LoanCenterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'before_payout', label: 'Before payout' },
  { key: 'discharged', label: 'Discharged' },
  { key: 'rejected', label: 'Rejected' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function formatApplicationStatusLabel(status: string): string {
  if (status === 'CANCELLED') return 'Withdrawn';
  return status.replace(/_/g, ' ');
}

function filterByProductName<T extends { product?: { name?: string | null } }>(
  rows: T[],
  productName: string,
): T[] {
  if (!productName) return rows;
  return rows.filter((r) => (r.product?.name ?? '') === productName);
}

/* ------------------------------------------------------------------ */
/*  Status badge (semantic tone)                                      */
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
/*  Channel pill (Online / Physical)                                  */
/*  See `@/components/channel-pill` — kept compact for list rows.     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Progress donut (SVG)                                              */
/* ------------------------------------------------------------------ */

function ProgressDonut({
  percent,
  size = 120,
  strokeWidth = 10,
  readyToComplete = false,
  status,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  readyToComplete?: boolean;
  status?: string;
}) {
  const theme = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePercent = Math.max(0, Math.min(100, percent));
  const offset = circumference - (safePercent / 100) * circumference;
  const center = size / 2;

  let strokeColor = theme.text;
  if (status === 'COMPLETED') strokeColor = theme.success;
  else if (status === 'DEFAULTED' || status === 'WRITTEN_OFF') strokeColor = theme.error;
  else if (status === 'IN_ARREARS') strokeColor = theme.warning;
  else if (readyToComplete) strokeColor = theme.success;

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
        {readyToComplete ? (
          <MaterialIcons name="check-circle" size={size * 0.32} color={theme.success} />
        ) : (
          <ThemedText
            type="smallBold"
            style={[styles.donutText, { fontSize: size * 0.22, lineHeight: size * 0.26 }]}>
            {Math.round(safePercent)}%
          </ThemedText>
        )}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Journey stepper                                                   */
/* ------------------------------------------------------------------ */

function JourneyStepper({
  currentPhase,
  loanChannel,
}: {
  currentPhase: LoanJourneyPhase;
  loanChannel?: 'ONLINE' | 'PHYSICAL';
}) {
  const theme = useTheme();
  const phases: LoanJourneyPhase[] =
    loanChannel === 'PHYSICAL' ? ['disbursement'] : PRE_DISBURSEMENT_PHASES;
  const currentIdx = phases.indexOf(currentPhase);

  return (
    <View>
      {phases.map((phase, idx) => {
        const isCompleted = currentIdx > idx;
        const isCurrent = currentIdx === idx;
        const isLast = idx === phases.length - 1;
        const hint = PHASE_HINTS[phase];
        const dotBackground = isCompleted
          ? `${theme.success}26`
          : isCurrent
            ? `${theme.warning}26`
            : 'transparent';
        const dotBorder = isCurrent ? theme.warning : 'transparent';

        return (
          <View key={phase} style={styles.stepRow}>
            <View style={styles.stepIndicatorColumn}>
              <View
                style={[
                  styles.stepDotOuter,
                  {
                    backgroundColor: dotBackground,
                    borderColor: dotBorder,
                    borderWidth: isCurrent ? 2 : 0,
                  },
                ]}>
                {isCompleted ? (
                  <MaterialIcons name="check" size={14} color={theme.success} />
                ) : isCurrent ? (
                  <View
                    style={[styles.stepDotInnerActive, { backgroundColor: theme.warning }]}
                  />
                ) : (
                  <View
                    style={[
                      styles.stepDotInnerIdle,
                      { borderColor: theme.textSecondary },
                    ]}
                  />
                )}
              </View>
              {!isLast ? (
                <View
                  style={[
                    styles.stepConnector,
                    { backgroundColor: isCompleted ? `${theme.success}66` : theme.border },
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.stepCopy}>
              <ThemedText
                type={isCurrent ? 'smallBold' : 'small'}
                style={{
                  color: isCompleted
                    ? theme.success
                    : isCurrent
                      ? theme.text
                      : theme.textSecondary,
                }}>
                {loanJourneyPhaseLabel(phase)}
              </ThemedText>
              {hint && isCurrent ? (
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  style={styles.stepHint}>
                  {hint}
                </ThemedText>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  CTA button                                                        */
/* ------------------------------------------------------------------ */

function CtaButton({
  label,
  icon,
  onPress,
  variant = 'primary',
}: {
  label: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  variant?: 'primary' | 'outline';
}) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.cta,
        {
          backgroundColor: isPrimary ? theme.primary : theme.background,
          borderColor: isPrimary ? theme.primary : theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {icon ? (
        <MaterialIcons
          name={icon}
          size={18}
          color={isPrimary ? theme.primaryForeground : theme.text}
        />
      ) : null}
      <ThemedText
        type="smallBold"
        style={{ color: isPrimary ? theme.primaryForeground : theme.text }}>
        {label}
      </ThemedText>
      <MaterialIcons
        name="chevron-right"
        size={18}
        color={isPrimary ? theme.primaryForeground : theme.text}
      />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Loan card                                                         */
/* ------------------------------------------------------------------ */

function LoanCard({
  loan,
  showContinue,
  borrowerKycDone,
  onOpen,
  onPay,
  onContinue,
}: {
  loan: BorrowerLoanListItem;
  showContinue: boolean;
  borrowerKycDone: boolean | null;
  onOpen: (id: string) => void;
  onPay: (id: string) => void;
  onContinue: (id: string) => void;
}) {
  const theme = useTheme();
  const progress = loan.progress;

  const tone = borrowerLoanStatusBadgeTone(loan);
  const statusLabel = loanStatusBadgeLabelFromDb(loan);

  const journeyPhase = deriveLoanJourneyPhase({
    applicationStatus: loan.application?.status,
    loanStatus: loan.status,
    attestationCompletedAt: loan.attestationCompletedAt,
    kycComplete: borrowerKycDone,
    signedAgreementReviewStatus: loan.signedAgreementReviewStatus,
    agreementPath: undefined,
    loanChannel: loan.loanChannel,
  });

  const canPay =
    loan.status === 'ACTIVE' || loan.status === 'IN_ARREARS' || loan.status === 'DEFAULTED';
  const needsContinue =
    showContinue &&
    (loan.status === 'PENDING_ATTESTATION' || loan.status === 'PENDING_DISBURSEMENT') &&
    borrowerLoanNeedsContinueAction(loan);
  const isPreDisbursement =
    loan.status === 'PENDING_ATTESTATION' || loan.status === 'PENDING_DISBURSEMENT';
  const isActiveLoan =
    loan.status === 'ACTIVE' || loan.status === 'IN_ARREARS' || loan.status === 'DEFAULTED';
  const isCompleted = loan.status === 'COMPLETED';
  const isDischarged =
    loan.status === 'COMPLETED' || loan.status === 'WRITTEN_OFF' || loan.status === 'CANCELLED';
  const clickable = isPreDisbursement || isActiveLoan || isCompleted;

  return (
    <Pressable
      accessibilityRole={clickable ? 'button' : undefined}
      onPress={() => {
        if (clickable) onOpen(loan.id);
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: progress?.readyToComplete
            ? `${theme.success}66`
            : isPreDisbursement
              ? `${theme.warning}66`
              : theme.border,
          opacity: isDischarged ? 0.78 : pressed && clickable ? 0.95 : 1,
        },
      ]}>
      <View style={styles.cardHeaderRow}>
        <StatusPill label={statusLabel} tone={tone} />
        <ChannelPill channel={loan.loanChannel} size="compact" />
      </View>

      <View
        style={[
          styles.cardBlockHeader,
          (isActiveLoan || isCompleted) && styles.centeredBlock,
        ]}>
        <ThemedText type="small" themeColor="textSecondary">
          {loan.product?.name ?? 'Loan'}
        </ThemedText>
        <ThemedText style={styles.amount}>{formatRm(loan.principalAmount)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {loan.term} months
          {loan.disbursementDate ? `  ·  Disbursed ${formatDate(loan.disbursementDate)}` : ''}
        </ThemedText>
      </View>

      {(isActiveLoan || isCompleted) && progress ? (
        <View style={styles.progressBlock}>
          <ProgressDonut
            percent={progress.progressPercent}
            readyToComplete={progress.readyToComplete}
            size={130}
            strokeWidth={12}
            status={loan.status}
          />
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.progressCaption}>
            Paid
          </ThemedText>
          <ThemedText style={styles.progressTotal}>
            {progress.totalPaid != null
              ? formatRm(progress.totalPaid)
              : `${progress.paidCount}/${progress.totalRepayments}`}
          </ThemedText>
          {progress.totalDue != null && progress.totalDue > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              paid of {formatRm(progress.totalDue)}
            </ThemedText>
          ) : null}
          {progress.nextPaymentDue && !isCompleted ? (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.nextPaymentLine}>
              Next payment: {formatDate(progress.nextPaymentDue)}
            </ThemedText>
          ) : null}
          {progress.readyToComplete ? (
            <ThemedText
              type="smallBold"
              style={[styles.readyText, { color: theme.success }]}>
              Ready to complete
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {isPreDisbursement ? (
        <View
          style={[
            styles.journeyWrap,
            { borderColor: theme.border, backgroundColor: theme.background },
          ]}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.journeyHeading}>
            Journey progress
          </ThemedText>
          <JourneyStepper currentPhase={journeyPhase} loanChannel={loan.loanChannel} />
        </View>
      ) : null}

      {isDischarged && !isCompleted && !isActiveLoan ? (
        <View
          style={[
            styles.dischargedWrap,
            { borderColor: theme.border, backgroundColor: theme.background },
          ]}>
          <ThemedText type="small" themeColor="textSecondary">
            Created {formatDate(loan.createdAt)}
          </ThemedText>
          {loan.disbursementDate ? (
            <ThemedText type="small" themeColor="textSecondary">
              Disbursed {formatDate(loan.disbursementDate)}
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      <View style={styles.cardFooter}>
        {needsContinue ? (
          <CtaButton label="Continue" onPress={() => onContinue(loan.id)} />
        ) : null}
        {!needsContinue && canPay ? (
          <CtaButton label="Make payment" icon="payments" onPress={() => onPay(loan.id)} />
        ) : null}
        {!needsContinue && !canPay && clickable ? (
          <CtaButton
            label="View details"
            variant="outline"
            onPress={() => onOpen(loan.id)}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Application row (Rejected / Withdrawn tab)                        */
/* ------------------------------------------------------------------ */

function ApplicationRow({
  app,
  onWithdraw,
  onOpen,
}: {
  app: LoanApplicationDetail;
  onWithdraw: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const theme = useTheme();
  const isRejected = app.status === 'REJECTED';
  const isWithdrawn = app.status === 'CANCELLED';
  const isDraft = app.status === 'DRAFT';
  const withdrawable = app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW';

  const iconName = isRejected ? 'warning' : isWithdrawn ? 'logout' : 'description';
  const iconColor = isRejected
    ? theme.error
    : isWithdrawn
      ? theme.textSecondary
      : theme.primary;

  const tone: BorrowerStatusTone = isRejected ? 'error' : isWithdrawn ? 'neutral' : 'info';

  return (
    <Pressable
      accessibilityRole={isDraft ? undefined : 'button'}
      onPress={() => {
        if (!isDraft) onOpen(app.id);
      }}
      style={({ pressed }) => [
        styles.appRow,
        {
          borderColor: theme.border,
          backgroundColor: pressed && !isDraft ? theme.backgroundSelected : 'transparent',
        },
      ]}>
      <View style={styles.appRowHeader}>
        <View style={styles.appRowTitle}>
          <MaterialIcons name={iconName} size={18} color={iconColor} />
          <ThemedText type="smallBold" style={styles.appRowProduct} numberOfLines={1}>
            {app.product?.name ?? 'Application'}
          </ThemedText>
        </View>
        <StatusPill label={formatApplicationStatusLabel(app.status)} tone={tone} />
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.appRowMeta}>
        ID {shortId(app.id)} · {formatRm(app.amount)} · {app.term} mo · {formatDate(app.createdAt)}
      </ThemedText>
      {withdrawable ? (
        <View style={styles.appRowActions}>
          <PageHeaderToolbarButton
            label="Withdraw"
            variant="outline"
            onPress={() => onWithdraw(app.id)}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                          */
/* ------------------------------------------------------------------ */

function LoanCardSkeleton() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        styles.skeletonCard,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <View style={styles.cardHeaderRow}>
        <View
          style={[styles.skelChip, { backgroundColor: theme.backgroundSelected }]}
        />
        <View
          style={[styles.skelChip, { backgroundColor: theme.backgroundSelected, width: 70 }]}
        />
      </View>
      <View style={styles.skelLines}>
        <View
          style={[styles.skelLineSm, { backgroundColor: theme.backgroundSelected }]}
        />
        <View
          style={[styles.skelLineLg, { backgroundColor: theme.backgroundSelected }]}
        />
        <View
          style={[styles.skelLineSm, { backgroundColor: theme.backgroundSelected }]}
        />
      </View>
      <View
        style={[styles.skelDonut, { backgroundColor: theme.backgroundSelected }]}
      />
      <View
        style={[styles.skelButton, { backgroundColor: theme.backgroundSelected }]}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Main screen                                                       */
/* ------------------------------------------------------------------ */

function LoansContent() {
  const router = useRouter();
  const theme = useTheme();
  const { borrowerContextVersion } = useBorrowerAccess();

  const [tab, setTab] = useState<LoanCenterTab>('all');
  const [productFilter, setProductFilter] = useState<string>('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<LoanCenterOverview | null>(null);
  const [applications, setApplications] = useState<LoanApplicationDetail[]>([]);
  const [activeLoans, setActiveLoans] = useState<BorrowerLoanListItem[]>([]);
  const [pendingDisbursementLoans, setPendingDisbursementLoans] = useState<
    BorrowerLoanListItem[]
  >([]);
  const [dischargedLoans, setDischargedLoans] = useState<BorrowerLoanListItem[]>([]);
  const [borrowerKycDone, setBorrowerKycDone] = useState<boolean | null>(null);

  const loadAll = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    try {
      const [ov, apps, aLoans, pLoans, dLoans, borrowerRes, kycRes] = await Promise.all([
        loansClient.fetchLoanCenterOverview(),
        applicationsClient.listBorrowerApplications({ pageSize: 200 }),
        loansClient.listBorrowerLoans({ tab: 'active', pageSize: 200 }),
        loansClient.listBorrowerLoans({ tab: 'pending_disbursement', pageSize: 200 }),
        loansClient.listBorrowerLoans({ tab: 'discharged', pageSize: 200 }),
        borrowerClient.fetchBorrower().catch(() => null),
        borrowerClient.getTruestackKycStatus().catch(() => null),
      ]);
      if (ov.success) setOverview(ov.data);
      if (apps.success) setApplications(apps.data);
      setActiveLoans(aLoans.data);
      setPendingDisbursementLoans(pLoans.data);
      setDischargedLoans(dLoans.data);
      if (borrowerRes?.success) {
        setBorrowerKycDone(
          isBorrowerKycComplete(borrowerRes.data, kycRes?.success ? kycRes.data : null),
        );
      } else {
        setBorrowerKycDone(null);
      }
    } catch (error) {
      Alert.alert('Failed to load', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      if (mode === 'initial') setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAll('initial');
  }, [loadAll, borrowerContextVersion]);

  const allLoansMerged = useMemo(() => {
    const DISCHARGED_STATUSES = new Set(['COMPLETED', 'WRITTEN_OFF', 'CANCELLED']);
    const PRE_DISBURSEMENT = new Set(['PENDING_ATTESTATION', 'PENDING_DISBURSEMENT']);
    const m = new Map<string, BorrowerLoanListItem>();
    for (const loan of [...activeLoans, ...pendingDisbursementLoans, ...dischargedLoans]) {
      m.set(loan.id, loan);
    }
    const tier = (s: string) =>
      DISCHARGED_STATUSES.has(s) ? 2 : PRE_DISBURSEMENT.has(s) ? 1 : 0;
    return Array.from(m.values()).sort((a, b) => {
      const d = tier(a.status) - tier(b.status);
      if (d !== 0) return d;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [activeLoans, pendingDisbursementLoans, dischargedLoans]);

  const productOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of applications) if (a.product?.name) set.add(a.product.name);
    for (const l of allLoansMerged) if (l.product?.name) set.add(l.product.name);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [applications, allLoansMerged]);

  useEffect(() => {
    if (productFilter && !productOptions.includes(productFilter)) {
      setProductFilter('');
    }
  }, [productOptions, productFilter]);

  const rejectedApps = useMemo(
    () => applications.filter((a) => ['REJECTED', 'CANCELLED'].includes(a.status)),
    [applications],
  );

  const loanRowsRaw = useMemo(() => {
    switch (tab) {
      case 'all':
        return allLoansMerged;
      case 'active':
        return activeLoans;
      case 'before_payout':
        return pendingDisbursementLoans;
      case 'discharged':
        return dischargedLoans;
      default:
        return [];
    }
  }, [tab, allLoansMerged, activeLoans, pendingDisbursementLoans, dischargedLoans]);

  const loanRows = useMemo(
    () => filterByProductName(loanRowsRaw, productFilter),
    [loanRowsRaw, productFilter],
  );

  const applicationRows = useMemo(() => {
    const base = tab === 'rejected' ? rejectedApps : [];
    return filterByProductName(base, productFilter);
  }, [tab, rejectedApps, productFilter]);

  const counts = overview?.counts;
  const allLoansTotal = counts
    ? counts.activeLoans + counts.pendingDisbursementLoans + counts.dischargedLoans
    : 0;

  const tabCount = useCallback(
    (key: LoanCenterTab): number | null => {
      if (!counts) return null;
      switch (key) {
        case 'all':
          return allLoansTotal;
        case 'active':
          return counts.activeLoans;
        case 'before_payout':
          return counts.pendingDisbursementLoans;
        case 'discharged':
          return counts.dischargedLoans;
        case 'rejected':
          return counts.rejectedApplications;
      }
    },
    [counts, allLoansTotal],
  );

  const showLoanCards = ['all', 'active', 'before_payout', 'discharged'].includes(tab);
  const showApplications = tab === 'rejected';

  const handleOpenLoan = useCallback(
    (loanId: string) => {
      router.push(`/loans/${loanId}` as Href);
    },
    [router],
  );

  const handleMakePayment = useCallback(
    (loanId: string) => {
      router.push(`/loans/${loanId}/payment` as Href);
    },
    [router],
  );

  const handleContinueLoan = useCallback(
    (loanId: string) => {
      router.push(`/loans/${loanId}` as Href);
    },
    [router],
  );

  const handleOpenApplication = useCallback(
    (applicationId: string) => {
      router.push(`/applications/${applicationId}` as Href);
    },
    [router],
  );

  const handleWithdrawApplication = useCallback(
    (applicationId: string) => {
      Alert.alert(
        'Withdraw application',
        'Are you sure you want to withdraw this application? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Withdraw',
            style: 'destructive',
            onPress: async () => {
              try {
                await loansClient.withdrawBorrowerApplication(applicationId);
                await loadAll('refresh');
              } catch (error) {
                Alert.alert(
                  'Withdraw failed',
                  error instanceof Error ? error.message : 'Please try again.',
                );
              }
            },
          },
        ],
      );
    },
    [loadAll],
  );

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

  return (
    <PageScreen
      title="Your loans"
      subtitle="View and manage your loans."
      showBorrowerContextHeader
      refreshControl={loading ? undefined : refreshControl}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}>
        {LOAN_CENTER_TABS.map(({ key, label }) => {
          const isActive = tab === key;
          const count = tabCount(key);
          const isDangerCount = key === 'rejected';
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              onPress={() => setTab(key)}
              style={({ pressed }) => [
                styles.tabChip,
                {
                  backgroundColor: isActive ? theme.primary : theme.backgroundElement,
                  borderColor: isActive ? theme.primary : theme.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <ThemedText
                type="smallBold"
                style={{
                  color: isActive ? theme.primaryForeground : theme.text,
                }}>
                {label}
              </ThemedText>
              {count != null && count > 0 ? (
                <View
                  style={[
                    styles.tabChipCount,
                    {
                      backgroundColor: isActive
                        ? `${theme.primaryForeground}26`
                        : isDangerCount
                          ? `${theme.error}1F`
                          : theme.backgroundSelected,
                    },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{
                      fontSize: 10,
                      color: isActive
                        ? theme.primaryForeground
                        : isDangerCount
                          ? theme.error
                          : theme.text,
                    }}>
                    {count}
                  </ThemedText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {productOptions.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filter by product"
          onPress={() => setProductPickerOpen(true)}
          style={({ pressed }) => [
            styles.productFilter,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: productFilter ? theme.primary : theme.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <MaterialIcons name="filter-list" size={18} color={theme.textSecondary} />
          <View style={styles.productFilterCopy}>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.productFilterLabel}>
              Product
            </ThemedText>
            <ThemedText type="smallBold" numberOfLines={1}>
              {productFilter || 'All types'}
            </ThemedText>
          </View>
          {productFilter ? (
            <Pressable
              hitSlop={12}
              onPress={() => setProductFilter('')}
              accessibilityLabel="Clear product filter">
              <MaterialIcons name="close" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : (
            <MaterialIcons name="expand-more" size={20} color={theme.textSecondary} />
          )}
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.cardList}>
          <LoanCardSkeleton />
          <LoanCardSkeleton />
        </View>
      ) : showLoanCards ? (
        loanRows.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <MaterialIcons
              name="description"
              size={36}
              color={theme.textSecondary}
              style={{ opacity: 0.5 }}
            />
            <ThemedText type="smallBold" style={styles.emptyTitle}>
              No loans in this category
            </ThemedText>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.emptyBody}>
              Try a different tab or clear the product filter.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.cardList}>
            {loanRows.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                showContinue={tab === 'before_payout' || tab === 'all'}
                borrowerKycDone={borrowerKycDone}
                onOpen={handleOpenLoan}
                onPay={handleMakePayment}
                onContinue={handleContinueLoan}
              />
            ))}
          </View>
        )
      ) : showApplications ? (
        <SectionCard
          title="Applications"
          description={
            applicationRows.length === 1
              ? '1 rejected or withdrawn application'
              : `${applicationRows.length} rejected or withdrawn applications`
          }>
          {applicationRows.length === 0 ? (
            <View style={styles.emptyAppsBlock}>
              <MaterialIcons
                name="schedule"
                size={28}
                color={theme.textSecondary}
                style={{ opacity: 0.5 }}
              />
              <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>
                Nothing here
              </ThemedText>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.emptyBody}>
                No rejected or withdrawn applications.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.appList}>
              {applicationRows.map((app, idx) => (
                <View
                  key={app.id}
                  style={[
                    idx > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.border,
                      paddingTop: Spacing.three,
                    },
                  ]}>
                  <ApplicationRow
                    app={app}
                    onWithdraw={handleWithdrawApplication}
                    onOpen={handleOpenApplication}
                  />
                </View>
              ))}
            </View>
          )}
        </SectionCard>
      ) : null}

      <BottomSheetModal
        visible={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        title="Filter by product"
        subtitle="Show only loans and applications for the selected product."
        scrollable>
        <View style={styles.pickerOptions}>
          <ProductPickerOption
            label="All types"
            selected={!productFilter}
            onPress={() => {
              setProductFilter('');
              setProductPickerOpen(false);
            }}
          />
          {productOptions.map((name) => (
            <ProductPickerOption
              key={name}
              label={name}
              selected={productFilter === name}
              onPress={() => {
                setProductFilter(name);
                setProductPickerOpen(false);
              }}
            />
          ))}
        </View>
      </BottomSheetModal>
    </PageScreen>
  );
}

function ProductPickerOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pickerRow,
        {
          backgroundColor: selected ? theme.backgroundSelected : 'transparent',
          borderColor: theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <ThemedText type={selected ? 'smallBold' : 'small'}>{label}</ThemedText>
      {selected ? (
        <MaterialIcons name="check" size={18} color={theme.primary} />
      ) : null}
    </Pressable>
  );
}

export default function LoansScreen() {
  return (
    <OnboardingFirstGate
      title="Your loans"
      pageSubtitle="View and manage your loans.">
      <LoansContent />
    </OnboardingFirstGate>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  tabsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingRight: Spacing.three,
  },
  tabChip: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  tabChipCount: {
    minWidth: 20,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
  },
  productFilterCopy: {
    flex: 1,
    minWidth: 0,
  },
  productFilterLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardList: {
    gap: Spacing.three,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardBlockHeader: {
    gap: Spacing.one,
  },
  centeredBlock: {
    alignItems: 'center',
  },
  amount: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  progressBlock: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  progressCaption: {
    marginTop: Spacing.one,
  },
  progressTotal: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  nextPaymentLine: {
    marginTop: Spacing.one,
  },
  readyText: {
    marginTop: Spacing.one,
  },
  journeyWrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  journeyHeading: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dischargedWrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardFooter: {
    gap: Spacing.two,
  },
  cta: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
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
  stepRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stepIndicatorColumn: {
    alignItems: 'center',
    width: 28,
  },
  stepDotOuter: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotInnerActive: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  stepDotInnerIdle: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 2,
  },
  stepConnector: {
    flex: 1,
    width: 2,
    minHeight: Spacing.three,
    marginVertical: 2,
  },
  stepCopy: {
    flex: 1,
    paddingBottom: Spacing.three,
  },
  stepHint: {
    marginTop: 2,
  },
  appList: {
    gap: Spacing.three,
  },
  appRow: {
    borderRadius: 12,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
    gap: Spacing.one,
  },
  appRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  appRowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
    minWidth: 0,
  },
  appRowProduct: {
    flex: 1,
  },
  appRowMeta: {
    paddingLeft: 26,
  },
  appRowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
  },
  emptyTitle: {
    marginTop: Spacing.two,
  },
  emptyBody: {
    textAlign: 'center',
    marginTop: 2,
  },
  emptyAppsBlock: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  pickerOptions: {
    gap: Spacing.two,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
  },
  skeletonCard: {
    gap: Spacing.three,
  },
  skelChip: {
    height: 22,
    width: 90,
    borderRadius: 999,
  },
  skelLines: {
    gap: Spacing.one,
    alignItems: 'center',
  },
  skelLineSm: {
    height: 12,
    width: 100,
    borderRadius: 6,
  },
  skelLineLg: {
    height: 24,
    width: 160,
    borderRadius: 6,
  },
  skelDonut: {
    height: 130,
    width: 130,
    borderRadius: 999,
    alignSelf: 'center',
  },
  skelButton: {
    height: 44,
    borderRadius: 12,
  },
});
