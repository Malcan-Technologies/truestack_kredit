/**
 * Loan detail screen for active / completed / arrears / defaulted loans.
 *
 * Mirrors `apps/borrower_pro/components/loan-center/borrower-loan-servicing-panel.tsx` but redesigned for
 * mobile: single column, collapsible cards, sticky `Make payment` footer, mobile-friendly schedule list.
 *
 * Pre-disbursement loans (PENDING_ATTESTATION, PENDING_DISBURSEMENT, etc.) currently render a brief
 * "continue on web" placeholder — their dedicated mobile flow will land in a future task.
 */

import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import {
  ActivityTimelineCard as SharedActivityTimelineCard,
  type ActivityTimelineEvent,
} from '@/components/activity-timeline';
import { HorizontalSnapCarousel } from '@/components/horizontal-snap-carousel';
import { MetaBadge } from '@/components/meta-badge';
import { LoanCertEnrollmentCard } from '@/components/loan-cert-enrollment-card';
import { LoanEkycProfileCard } from '@/components/loan-ekyc-profile-card';
import { PageHeaderToolbarButton, PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { TruestackKycMobileCard } from '@/components/truestack-kyc-mobile-card';
import { InlineStatusRow } from '@/components/verified-status-row';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { borrowerClient, loansClient } from '@/lib/api/borrower';
import { isBorrowerKycComplete } from '@/lib/borrower-verification';
import { getEnv } from '@/lib/config/env';
import { formatDate } from '@/lib/format/date';
import { formatICForDisplay } from '@/lib/format/borrower';
import { formatRm, toAmountNumber } from '@/lib/loans/currency';
import {
  DocumentDownloadError,
  downloadAndShareDocument,
} from '@/lib/loans/document-download';
import {
  loanStatusBadgeLabelFromDb,
  type BorrowerLoanStatusLabelInput,
} from '@/lib/loans/status-label';
import {
  repaymentStatusIcon,
  repaymentStatusLabel,
  repaymentStatusTone,
  type RepaymentRow,
  type SchedulePayload,
} from '@/lib/loans/repayment';
import {
  borrowerTimelineActionInfo,
  borrowerTimelineActorLabel,
  extractManualPaymentSummary,
  formatAuditValue,
  getAuditChanges,
  type MaterialIconName,
} from '@/lib/loans/timeline';
import { getStoredItem, setStoredItem } from '@/lib/storage/app-storage';
import { toast } from '@/lib/toast';
import {
  borrowerDisbursementProofUrl,
  borrowerLoanViewSignedAgreementUrl,
  borrowerStampCertificateUrl,
  borrowerTransactionProofUrl,
  borrowerTransactionReceiptUrl,
} from '@kredit/borrower';
import type {
  AttestationStatus,
  BorrowerDetail,
  BorrowerLoanDetail,
  BorrowerLoanMetrics,
  BorrowerLoanTimelineEvent,
  SignedAgreementReviewStatus,
  TruestackKycStatusData,
} from '@kredit/borrower';

const PAYABLE_STATUSES = new Set(['ACTIVE', 'IN_ARREARS', 'DEFAULTED']);
const PRE_DISBURSEMENT_STATUSES = new Set(['PENDING_ATTESTATION', 'PENDING_DISBURSEMENT']);

const SERVICING_BASE_URL = `${getEnv().backendUrl}/api/borrower-auth`;

function mimeFromFilename(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback;
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return fallback;
  }
}

interface ManualPaymentSummary {
  id: string;
  status: string;
  amount: unknown;
  reference: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function LoanDetailScreen() {
  const params = useLocalSearchParams<{ loanId?: string | string[] }>();
  const loanId = Array.isArray(params.loanId) ? params.loanId[0] : params.loanId;

  if (!loanId) {
    return <NotFoundState />;
  }

  return <LoanDetailContent loanId={loanId} />;
}

function LoanDetailContent({ loanId }: { loanId: string }) {
  const router = useRouter();
  const theme = useTheme();

  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [schedule, setSchedule] = useState<SchedulePayload | null>(null);
  const [metrics, setMetrics] = useState<BorrowerLoanMetrics | null>(null);
  const [manualPayments, setManualPayments] = useState<ManualPaymentSummary[]>([]);
  const [timeline, setTimeline] = useState<BorrowerLoanTimelineEvent[]>([]);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(false);
  const [loadingMoreTimeline, setLoadingMoreTimeline] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const loanRes = await loansClient.getBorrowerLoan(loanId);
      const nextLoan = loanRes.data;
      setLoan(nextLoan);

      if (PRE_DISBURSEMENT_STATUSES.has(nextLoan.status)) {
        setSchedule(null);
        setMetrics(null);
        setManualPayments([]);
        setTimeline([]);
        setHasMoreTimeline(false);
        setTimelineCursor(null);
        return;
      }

      const [sch, met, manual, timelineRes] = await Promise.all([
        loansClient.getBorrowerLoanSchedule(loanId).catch(() => ({ success: true, data: null })),
        loansClient.getBorrowerLoanMetrics(loanId).catch(() => ({
          success: true,
          data: { loanId, status: nextLoan.status, hasSchedule: false } as BorrowerLoanMetrics,
        })),
        loansClient
          .listBorrowerManualPaymentRequests(loanId)
          .catch(() => ({ success: true, data: [] as ManualPaymentSummary[] })),
        loansClient.getBorrowerLoanTimeline(loanId, { limit: 10 }).catch(() => ({
          success: true,
          data: [] as BorrowerLoanTimelineEvent[],
          pagination: { hasMore: false, nextCursor: null },
        })),
      ]);

      setSchedule((sch.data as SchedulePayload | null) ?? null);
      setMetrics(met.data);
      setManualPayments((manual.data ?? []) as ManualPaymentSummary[]);
      setTimeline(timelineRes.data ?? []);
      setHasMoreTimeline(timelineRes.pagination?.hasMore ?? false);
      setTimelineCursor(timelineRes.pagination?.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load loan');
    }
  }, [loanId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const handleLoadMoreTimeline = useCallback(async () => {
    if (!timelineCursor || loadingMoreTimeline) return;
    setLoadingMoreTimeline(true);
    try {
      const res = await loansClient.getBorrowerLoanTimeline(loanId, {
        limit: 10,
        cursor: timelineCursor,
      });
      setTimeline((current) => [...current, ...(res.data ?? [])]);
      setHasMoreTimeline(res.pagination?.hasMore ?? false);
      setTimelineCursor(res.pagination?.nextCursor ?? null);
    } catch (err) {
      Alert.alert('Could not load activity', err instanceof Error ? err.message : 'Try again later');
    } finally {
      setLoadingMoreTimeline(false);
    }
  }, [loanId, loadingMoreTimeline, timelineCursor]);

  /* --- States -------------------------------------------------- */

  if (loading) {
    return (
      <PageScreen title="Loan" showBackButton backFallbackHref="/loans">
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
          <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
            Loading loan…
          </ThemedText>
        </View>
      </PageScreen>
    );
  }

  if (error || !loan) {
    return (
      <PageScreen
        title="Loan"
        showBackButton
        backFallbackHref="/loans"
        headerActions={
          <PageHeaderToolbarButton label="Retry" variant="outline" onPress={handleRefresh} />
        }>
        <View style={styles.centered}>
          <MaterialIcons name="error-outline" size={32} color={theme.error} />
          <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>
            {error ?? 'Loan not found'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.errorHint}>
            Pull down to refresh or head back to your loans list.
          </ThemedText>
        </View>
      </PageScreen>
    );
  }

  if (PRE_DISBURSEMENT_STATUSES.has(loan.status)) {
    return <PreDisbursementPlaceholder loan={loan} loanId={loanId} onRefresh={handleRefresh} />;
  }

  /* --- Servicing view ------------------------------------------ */

  const canPay = PAYABLE_STATUSES.has(loan.status);
  const pendingManualPayments = manualPayments.filter((m) => m.status === 'PENDING').length;
  const productScheduleType = loan.product?.loanScheduleType;

  return (
    <PageScreen
      title="Loan"
      showBackButton
      backFallbackHref="/loans"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
      }
      stickyFooter={
        canPay ? (
          <CtaButton
            label="Make payment"
            icon="credit-card"
            onPress={() => router.push(`/loans/${loanId}/payment` as Href)}
          />
        ) : undefined
      }>
      <LoanHeader loan={loan} />

      {pendingManualPayments > 0 ? (
        <BannerCard
          tone="warning"
          icon="schedule"
          title="Pending payment approval"
          description={`${pendingManualPayments} manual payment${
            pendingManualPayments === 1 ? '' : 's'
          } awaiting your lender. Your schedule updates after approval.`}
        />
      ) : null}

      {metrics ? <ProgressCard loan={loan} metrics={metrics} /> : null}

      <RepaymentScheduleCard loan={loan} schedule={schedule} />

      <BorrowerCard loan={loan} />

      <LoanDetailsCard loan={loan} />

      {(loan.agreementPath || loan.disbursementProofPath || loan.stampCertPath) && (
        <DocumentsCard loan={loan} />
      )}

      <QuickInfoCard loan={loan} loanId={loanId} />

      <SharedActivityTimelineCard
        events={timeline.map((event) => loanEventToTimelineEvent(event))}
        hasMore={hasMoreTimeline}
        loadingMore={loadingMoreTimeline}
        onLoadMore={handleLoadMoreTimeline}
      />

      {/* Helpful hint about active loan early settlement / web flows */}
      <ThemedText type="small" themeColor="textSecondary" style={styles.bottomHint}>
        Need early settlement, attestation, or document downloads? They&apos;re available in the web
        portal while we finish bringing those flows to mobile.
      </ThemedText>

      {Platform.OS === 'web' ? null : <View style={styles.spacer} />}
    </PageScreen>
  );
}

/* ------------------------------------------------------------------ */
/*  Header                                                            */
/* ------------------------------------------------------------------ */

function LoanHeader({ loan }: { loan: BorrowerLoanDetail }) {
  const router = useRouter();
  const theme = useTheme();
  const statusInput: BorrowerLoanStatusLabelInput = {
    status: loan.status,
    attestationCompletedAt: loan.attestationCompletedAt ?? null,
    loanChannel: loan.loanChannel,
  };
  const statusLabel = loanStatusBadgeLabelFromDb(statusInput);
  const isCorporate = loan.borrower?.borrowerType === 'CORPORATE';
  const displayName =
    isCorporate && loan.borrower?.companyName
      ? loan.borrower.companyName
      : loan.borrower?.name ?? '—';
  const isPhysical = loan.loanChannel === 'PHYSICAL';

  return (
    <View style={styles.headerWrap}>
      <ThemedText type="subtitle">{formatRm(loan.principalAmount)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {displayName} · {loan.product?.name ?? 'Loan'}
      </ThemedText>
      <View style={styles.headerBadges}>
        <MetaBadge label={statusLabel} />
        {loan.loanChannel ? (
          <MetaBadge
            icon={isPhysical ? 'apartment' : 'computer'}
            label={isPhysical ? 'Physical' : 'Online'}
          />
        ) : null}
        {loan.product?.loanScheduleType ? (
          <MetaBadge
            icon="receipt-long"
            label={
              loan.product.loanScheduleType === 'JADUAL_K' ? 'Jadual K' : 'Jadual J'
            }
          />
        ) : null}
      </View>
      {loan.application?.id ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="View related application"
          onPress={() =>
            router.push(`/applications/${loan.application!.id}` as Href)
          }
          style={({ pressed }) => [
            styles.crossLink,
            { opacity: pressed ? 0.6 : 1 },
          ]}>
          <ThemedText type="small" themeColor="textSecondary">
            From application
          </ThemedText>
          <View style={styles.crossLinkAction}>
            <ThemedText type="linkPrimary">View</ThemedText>
            <MaterialIcons
              name="arrow-forward"
              size={13}
              color={theme.primary}
            />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Banner                                                            */
/* ------------------------------------------------------------------ */

function BannerCard({
  tone,
  icon,
  title,
  description,
}: {
  tone: 'warning' | 'info' | 'error' | 'success';
  icon: MaterialIconName;
  title: string;
  description: string;
}) {
  const theme = useTheme();
  const colorMap: Record<typeof tone, string> = {
    warning: theme.warning,
    info: theme.info,
    error: theme.error,
    success: theme.success,
  } as Record<'warning' | 'info' | 'error' | 'success', string>;
  const accent = colorMap[tone];

  return (
    <View
      style={[
        styles.banner,
        { borderColor: accent + '66', backgroundColor: accent + '14' },
      ]}>
      <MaterialIcons name={icon} size={20} color={accent} style={styles.bannerIcon} />
      <View style={styles.bannerCopy}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress card                                                     */
/* ------------------------------------------------------------------ */

function ProgressCard({
  loan,
  metrics,
}: {
  loan: BorrowerLoanDetail;
  metrics: BorrowerLoanMetrics;
}) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  // Show ~2 chips at a time with a peek of the next card so the carousel
  // affordance is visible. Page padding (Spacing.four) + section card padding
  // (Spacing.three) eat 56pt from the screen width before the carousel kicks in.
  const metricCardWidth = Math.max(
    132,
    Math.floor((windowWidth - Spacing.four * 2 - Spacing.two - 56) / 2),
  );
  if (!metrics.hasSchedule) {
    return (
      <SectionCard title="Repayment progress">
        <ThemedText type="small" themeColor="textSecondary">
          No repayment schedule yet.
        </ThemedText>
      </SectionCard>
    );
  }
  const totalPaid = metrics.totalPaid ?? 0;
  const totalDue = metrics.totalDue ?? 0;
  const outstanding = metrics.totalOutstanding ?? Math.max(0, totalDue - totalPaid);
  const overdue = metrics.overdueCount ?? 0;
  const lateFees = metrics.totalLateFees ?? 0;
  const onTime = metrics.repaymentRate;
  const progressPercent = Math.min(100, metrics.progressPercent ?? 0);
  const oldestOverdueDays = metrics.oldestOverdueDays ?? 0;
  const isCompleted = loan.status === 'COMPLETED';
  const isReadyToComplete =
    !isCompleted &&
    progressPercent >= 100 &&
    (loan.status === 'ACTIVE' || loan.status === 'IN_ARREARS');

  let donutColor = theme.text;
  if (loan.status === 'COMPLETED') donutColor = theme.success;
  else if (loan.status === 'DEFAULTED' || loan.status === 'WRITTEN_OFF') donutColor = theme.error;
  else if (loan.status === 'IN_ARREARS') donutColor = theme.warning;
  else donutColor = theme.primary;

  return (
    <SectionCard title="Repayment progress">
      <View style={styles.progressRow}>
        <ProgressDonut percent={progressPercent} color={donutColor} />
        <View style={styles.progressCopy}>
          <ThemedText type="subtitle" style={styles.progressTotal}>
            {formatRm(totalPaid)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            of {formatRm(totalDue)}
          </ThemedText>
          {outstanding > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Outstanding: <ThemedText type="smallBold">{formatRm(outstanding)}</ThemedText>
            </ThemedText>
          ) : null}
          {isReadyToComplete ? (
            <View style={styles.readyChip}>
              <MaterialIcons name="check-circle" size={14} color={theme.success} />
              <ThemedText type="small" style={{ color: theme.success, fontWeight: '700' }}>
                Ready to complete
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>

      <HorizontalSnapCarousel
        showDots={false}
        pagePadding={Spacing.three}
        gap={Spacing.two}
        cardWidth={metricCardWidth}>
        <MetricChip
          label="Paid"
          value={`${metrics.paidCount ?? 0}/${metrics.totalRepayments ?? 0}`}
        />
        <MetricChip
          label="Overdue"
          value={String(overdue)}
          accent={overdue > 0 ? theme.error : undefined}
          hint={overdue > 0 && oldestOverdueDays > 0 ? `${oldestOverdueDays}d` : undefined}
        />
        <MetricChip
          label="Late fees"
          value={formatRm(lateFees)}
          accent={lateFees > 0 ? theme.warning : undefined}
        />
        <MetricChip
          label="On-time"
          value={onTime != null ? `${onTime}%` : '—'}
          accent={
            onTime == null
              ? undefined
              : onTime >= 80
                ? theme.success
                : onTime >= 50
                  ? theme.warning
                  : theme.error
          }
        />
      </HorizontalSnapCarousel>

      {metrics.nextPaymentDue && !isCompleted ? (
        <ThemedText type="small" themeColor="textSecondary">
          Next payment due {formatDate(metrics.nextPaymentDue)}
        </ThemedText>
      ) : null}
    </SectionCard>
  );
}

function MetricChip({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.metricChip,
        { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
      ]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.metricChipValueRow}>
        <ThemedText type="smallBold" style={accent ? { color: accent } : undefined}>
          {value}
        </ThemedText>
        {hint ? (
          <ThemedText type="small" style={{ color: accent ?? theme.textSecondary }}>
            ({hint})
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

function ProgressDonut({
  percent,
  size = 84,
  strokeWidth = 8,
  color,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color: string;
}) {
  const theme = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const center = size / 2;

  return (
    <View style={[styles.donutWrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.donutSvg}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={theme.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          fill="none"
        />
      </Svg>
      <View style={styles.donutLabel}>
        <ThemedText type="smallBold">{Math.round(percent)}%</ThemedText>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Borrower card                                                     */
/* ------------------------------------------------------------------ */

function BorrowerCard({ loan }: { loan: BorrowerLoanDetail }) {
  const borrower = loan.borrower;
  if (!borrower) {
    return (
      <SectionCard title="Borrower">
        <ThemedText type="small" themeColor="textSecondary">
          Borrower details unavailable.
        </ThemedText>
      </SectionCard>
    );
  }
  const isCorporate = borrower.borrowerType === 'CORPORATE';
  const name =
    isCorporate && borrower.companyName ? borrower.companyName : borrower.name ?? '—';
  const docLabel = isCorporate ? 'SSM' : borrower.documentType === 'IC' ? 'IC Number' : 'Passport';
  const docValue = formatICForDisplay(borrower.icNumber ?? undefined);

  return (
    <SectionCard
      title="Borrower"
      action={<TypeChip isCorporate={isCorporate} />}>
      <View style={styles.detailGroup}>
        <ThemedText type="default" style={styles.borrowerName}>
          {name}
        </ThemedText>
        {isCorporate && borrower.name ? (
          <ThemedText type="small" themeColor="textSecondary">
            Rep: {borrower.name}
          </ThemedText>
        ) : null}
      </View>
      <DetailRow label={docLabel} value={docValue} />
      {borrower.phone ? <DetailRow label="Phone" value={borrower.phone} /> : null}
      {borrower.email ? <DetailRow label="Email" value={borrower.email} /> : null}
    </SectionCard>
  );
}

function TypeChip({ isCorporate }: { isCorporate: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.channelChip,
        { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
      ]}>
      <MaterialIcons
        name={isCorporate ? 'business' : 'person'}
        size={14}
        color={theme.textSecondary}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {isCorporate ? 'Corporate' : 'Individual'}
      </ThemedText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Loan details                                                      */
/* ------------------------------------------------------------------ */

function LoanDetailsCard({ loan }: { loan: BorrowerLoanDetail }) {
  const product = loan.product;
  const interestModel = product?.interestModel
    ? product.interestModel === 'RULE_78'
      ? 'Rule 78'
      : product.interestModel.replace(/_/g, ' ')
    : null;
  const interestRate = toAmountNumber(loan.interestRate);

  return (
    <SectionCard title="Loan details">
      <View style={styles.detailGroup}>
        <ThemedText type="subtitle" style={styles.amountText}>
          {formatRm(loan.principalAmount)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {interestRate}% p.a. · {loan.term} months
        </ThemedText>
      </View>
      {interestModel ? <DetailRow label="Interest model" value={interestModel} /> : null}
      {product?.loanScheduleType === 'JADUAL_K' && loan.collateralType ? (
        <>
          <DetailRow label="Collateral" value={loan.collateralType} />
          {loan.collateralValue != null ? (
            <DetailRow label="Collateral value" value={formatRm(loan.collateralValue)} />
          ) : null}
        </>
      ) : null}
      {loan.disbursementDate ? (
        <DetailRow label="Disbursed" value={formatDate(loan.disbursementDate)} />
      ) : null}
      {loan.disbursementReference ? (
        <DetailRow label="Disbursement ref" value={loan.disbursementReference} mono />
      ) : null}
      {loan.agreementDate ? (
        <DetailRow label="Agreement date" value={formatDate(loan.agreementDate)} />
      ) : null}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Documents                                                         */
/* ------------------------------------------------------------------ */

interface LoanDocumentEntry {
  key: string;
  title: string;
  subtitle?: string;
  filename: string;
  mimeType?: string;
  url: string;
}

function DocumentsCard({ loan }: { loan: BorrowerLoanDetail }) {
  const docs: LoanDocumentEntry[] = [];

  if (loan.agreementPath) {
    docs.push({
      key: 'agreement',
      title: 'Signed loan agreement',
      subtitle: loan.agreementOriginalName ?? 'Agreement on file',
      filename: loan.agreementOriginalName || `loan-agreement-${loan.id}.pdf`,
      mimeType: mimeFromFilename(loan.agreementOriginalName, 'application/pdf'),
      url: borrowerLoanViewSignedAgreementUrl(SERVICING_BASE_URL, loan.id),
    });
  }
  if (loan.disbursementProofPath) {
    docs.push({
      key: 'disbursement',
      title: 'Proof of disbursement',
      subtitle: loan.disbursementProofName ?? undefined,
      filename: loan.disbursementProofName || `disbursement-proof-${loan.id}.pdf`,
      mimeType: mimeFromFilename(loan.disbursementProofName, 'application/pdf'),
      url: borrowerDisbursementProofUrl(SERVICING_BASE_URL, loan.id),
    });
  }
  if (loan.stampCertPath) {
    docs.push({
      key: 'stamp',
      title: 'Stamp certificate',
      subtitle: loan.stampCertOriginalName ?? undefined,
      filename: loan.stampCertOriginalName || `stamp-certificate-${loan.id}.pdf`,
      mimeType: mimeFromFilename(loan.stampCertOriginalName, 'application/pdf'),
      url: borrowerStampCertificateUrl(SERVICING_BASE_URL, loan.id),
    });
  }

  if (docs.length === 0) {
    return (
      <SectionCard title="Loan documents" collapsible defaultExpanded={false} collapsedSummary="No documents yet">
        <ThemedText type="small" themeColor="textSecondary">
          Your lender has not shared any signed documents for this loan yet. They will appear here once issued.
        </ThemedText>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Loan documents"
      collapsible
      defaultExpanded={false}
      collapsedSummary={`${docs.length} document${docs.length === 1 ? '' : 's'} on file`}>
      <ThemedText type="small" themeColor="textSecondary">
        Tap a document to download a signed copy and open it in your preferred viewer.
      </ThemedText>
      {docs.map((doc) => (
        <DocumentRow key={doc.key} doc={doc} />
      ))}
    </SectionCard>
  );
}

function DocumentRow({ doc }: { doc: LoanDocumentEntry }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  const open = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await downloadAndShareDocument({
        url: doc.url,
        filename: doc.filename,
        mimeType: doc.mimeType,
        dialogTitle: doc.title,
      });
    } catch (e) {
      const message =
        e instanceof DocumentDownloadError
          ? e.message
          : 'Could not open document. Please try again.';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [busy, doc.filename, doc.mimeType, doc.title, doc.url]);

  return (
    <Pressable
      onPress={open}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`Download ${doc.title}`}
      style={({ pressed }) => [
        styles.docRow,
        {
          borderColor: theme.border,
          backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
          opacity: busy ? 0.6 : 1,
        },
      ]}>
      <MaterialIcons name="description" size={20} color={theme.textSecondary} />
      <View style={styles.docCopy}>
        <ThemedText type="smallBold">{doc.title}</ThemedText>
        {doc.subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {doc.subtitle}
          </ThemedText>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={theme.textSecondary} />
      ) : (
        <MaterialIcons name="file-download" size={20} color={theme.textSecondary} />
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Repayment schedule                                                */
/* ------------------------------------------------------------------ */

function RepaymentScheduleCard({
  loan,
  schedule,
}: {
  loan: BorrowerLoanDetail;
  schedule: SchedulePayload | null;
}) {
  const repayments = schedule?.schedule?.repayments ?? [];
  const summary = schedule?.summary;

  if (repayments.length === 0) {
    return (
      <SectionCard title="Repayment schedule">
        <ThemedText type="small" themeColor="textSecondary">
          {loan.status === 'PENDING_DISBURSEMENT' || loan.status === 'PENDING_ATTESTATION'
            ? 'Your instalment timeline appears once your loan is disbursed.'
            : 'No repayment schedule yet.'}
        </ThemedText>
      </SectionCard>
    );
  }

  const summaryText = summary
    ? `${repayments.length} instalment${repayments.length === 1 ? '' : 's'} · ${formatRm(
        summary.totalOutstanding ?? 0,
      )} outstanding`
    : `${repayments.length} instalment${repayments.length === 1 ? '' : 's'}`;

  return (
    <SectionCard
      title="Repayment schedule"
      collapsible
      defaultExpanded
      collapsedSummary={summaryText}>
      {summary ? (
        <ThemedText type="small" themeColor="textSecondary">
          Outstanding: <ThemedText type="smallBold">{formatRm(summary.totalOutstanding ?? 0)}</ThemedText>{' '}
          · Paid: <ThemedText type="smallBold">{formatRm(summary.totalPaid ?? 0)}</ThemedText>
          {summary.overdueCount && summary.overdueCount > 0 ? ` · ${summary.overdueCount} overdue` : ''}
        </ThemedText>
      ) : null}
      <View style={{ gap: Spacing.two }}>
        {repayments.map((row, index) => (
          <RepaymentItem key={row.id} index={index + 1} row={row} />
        ))}
      </View>
    </SectionCard>
  );
}

interface PaymentTransactionGroup {
  id: string;
  amount: number;
  count: number;
  receiptPath: string | null;
  proofPath: string | null;
  sortKey: string;
}

function aggregatePaymentTransactions(
  allocations: NonNullable<RepaymentRow['allocations']>,
): PaymentTransactionGroup[] {
  const map = new Map<string, PaymentTransactionGroup>();
  allocations.forEach((allocation, allocationIndex) => {
    const tx = allocation.transaction;
    if (!tx) return;
    const amount = toAmountNumber(allocation.amount);
    const existing = map.get(tx.id);
    if (existing) {
      existing.amount += amount;
      existing.count += 1;
      return;
    }
    map.set(tx.id, {
      id: tx.id,
      amount,
      count: 1,
      receiptPath: tx.receiptPath ?? null,
      proofPath: tx.proofPath ?? null,
      sortKey: allocation.allocatedAt ?? `${allocationIndex}`,
    });
  });
  return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function RepaymentItem({ index, row }: { index: number; row: RepaymentRow }) {
  const theme = useTheme();
  const principalDue = toAmountNumber(row.principal ?? 0);
  const interestDue = toAmountNumber(row.interest ?? 0);
  const totalDue = toAmountNumber(row.totalDue);
  const paid = (row.allocations ?? []).reduce((sum, a) => sum + toAmountNumber(a.amount), 0);
  const lateAccrued = toAmountNumber(row.lateFeeAccrued ?? 0);
  const isCancelled = row.status === 'CANCELLED';
  const isOverdue = !isCancelled && row.status !== 'PAID' && new Date(row.dueDate) < new Date();
  const balance = isCancelled ? 0 : Math.max(0, totalDue - paid);
  const label = repaymentStatusLabel(row.status, isOverdue);
  const statusIcon = repaymentStatusIcon(row.status, isOverdue);
  const statusTone = repaymentStatusTone(row.status, isOverdue);
  const transactions = useMemo(
    () => aggregatePaymentTransactions(row.allocations ?? []),
    [row.allocations],
  );

  return (
    <View
      style={[
        styles.repayCard,
        {
          borderColor: isOverdue ? theme.error + '55' : theme.border,
          backgroundColor: isOverdue ? theme.error + '0F' : theme.background,
          opacity: isCancelled ? 0.55 : 1,
        },
      ]}>
      <View style={styles.repayHeader}>
        <View style={styles.repayHeaderLeft}>
          <ThemedText type="smallBold">#{index}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Due {formatDate(row.dueDate)}
          </ThemedText>
        </View>
        <MetaBadge icon={statusIcon} label={label} tone={statusTone} />
      </View>
      <View style={styles.repayGrid}>
        <RepayCell label="Principal" value={formatRm(principalDue)} />
        <RepayCell label="Interest" value={formatRm(interestDue)} />
        <RepayCell label="Total due" value={formatRm(totalDue)} bold />
        <RepayCell
          label="Paid"
          value={formatRm(paid)}
          accent={paid > 0 ? theme.success : undefined}
        />
        <RepayCell
          label="Balance"
          value={formatRm(balance)}
          bold
          accent={balance > 0 && isOverdue ? theme.error : undefined}
        />
        {lateAccrued > 0 ? (
          <RepayCell label="Late fees" value={formatRm(lateAccrued)} accent={theme.error} />
        ) : null}
      </View>
      {transactions.length > 0 ? (
        <PaymentDocumentsList transactions={transactions} />
      ) : null}
    </View>
  );
}

function PaymentDocumentsList({ transactions }: { transactions: PaymentTransactionGroup[] }) {
  const theme = useTheme();
  return (
    <View style={[styles.repayDocs, { borderTopColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {transactions.length === 1
          ? '1 payment recorded'
          : `${transactions.length} payments recorded`}
      </ThemedText>
      <View style={{ gap: Spacing.two }}>
        {transactions.map((tx) => (
          <PaymentDocumentRow key={tx.id} tx={tx} />
        ))}
      </View>
    </View>
  );
}

function PaymentDocumentRow({ tx }: { tx: PaymentTransactionGroup }) {
  const theme = useTheme();
  const hasReceipt = Boolean(tx.receiptPath);
  const hasProof = Boolean(tx.proofPath);

  return (
    <View style={[styles.paymentDocRow, { borderColor: theme.border }]}>
      <View style={styles.paymentDocCopy}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {formatRm(tx.amount)}
        </ThemedText>
        {!hasReceipt && !hasProof ? (
          <ThemedText type="small" themeColor="textSecondary">
            Receipt and proof not yet available.
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.paymentDocActions}>
        <PaymentDocActionButton
          enabled={hasReceipt}
          icon="receipt"
          label="Receipt"
          url={borrowerTransactionReceiptUrl(SERVICING_BASE_URL, tx.id)}
          filename={`payment-receipt-${tx.id}.pdf`}
          mimeType="application/pdf"
          dialogTitle="Payment receipt"
        />
        <PaymentDocActionButton
          enabled={hasProof}
          icon="verified"
          label="Proof"
          url={borrowerTransactionProofUrl(SERVICING_BASE_URL, tx.id)}
          filename={`proof-of-payment-${tx.id}`}
          mimeType={undefined}
          dialogTitle="Proof of payment"
        />
      </View>
    </View>
  );
}

function PaymentDocActionButton({
  enabled,
  icon,
  label,
  url,
  filename,
  mimeType,
  dialogTitle,
}: {
  enabled: boolean;
  icon: MaterialIconName;
  label: string;
  url: string;
  filename: string;
  mimeType?: string;
  dialogTitle: string;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  const onPress = useCallback(async () => {
    if (!enabled || busy) return;
    setBusy(true);
    try {
      await downloadAndShareDocument({ url, filename, mimeType, dialogTitle });
    } catch (e) {
      const message =
        e instanceof DocumentDownloadError
          ? e.message
          : 'Could not open document. Please try again.';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [busy, dialogTitle, enabled, filename, mimeType, url]);

  const tint = enabled ? theme.text : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled || busy}
      accessibilityRole="button"
      accessibilityLabel={enabled ? `View ${label.toLowerCase()}` : `${label} not available`}
      style={({ pressed }) => [
        styles.paymentDocAction,
        {
          borderColor: theme.border,
          backgroundColor: pressed && enabled ? theme.backgroundSelected : 'transparent',
          opacity: enabled ? (busy ? 0.6 : 1) : 0.4,
        },
      ]}>
      {busy ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <MaterialIcons name={icon} size={16} color={tint} />
      )}
      <ThemedText type="small" style={{ color: tint }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function RepayCell({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: string;
}) {
  return (
    <View style={styles.repayCell}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText
        type={bold ? 'smallBold' : 'small'}
        style={accent ? { color: accent } : undefined}>
        {value}
      </ThemedText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick info                                                        */
/* ------------------------------------------------------------------ */

function QuickInfoCard({ loan, loanId }: { loan: BorrowerLoanDetail; loanId: string }) {
  const router = useRouter();
  const product = loan.product;
  return (
    <SectionCard title="Quick info" collapsible defaultExpanded={false} collapsedSummary={`Product: ${product?.name ?? '—'}`}>
      <DetailRow label="Loan ID" value={`${loanId.slice(0, 12)}…`} mono />
      <DetailRow
        label="Status"
        value={loanStatusBadgeLabelFromDb({
          status: loan.status,
          attestationCompletedAt: loan.attestationCompletedAt ?? null,
          loanChannel: loan.loanChannel,
        })}
      />
      {loan.createdAt ? <DetailRow label="Created" value={formatDate(loan.createdAt)} /> : null}
      {loan.updatedAt ? <DetailRow label="Last updated" value={formatDate(loan.updatedAt)} /> : null}
      {loan.disbursementDate ? (
        <DetailRow label="Disbursed" value={formatDate(loan.disbursementDate)} />
      ) : null}
      <DetailRow label="Product" value={product?.name ?? '—'} />
      {product ? (
        <>
          <DetailRow
            label="Schedule"
            value={product.loanScheduleType === 'JADUAL_K' ? 'Jadual K' : 'Jadual J'}
          />
          {product.arrearsPeriod != null ? (
            <DetailRow label="Arrears period" value={`${product.arrearsPeriod} days`} />
          ) : null}
          {product.defaultPeriod != null ? (
            <DetailRow label="Default period" value={`${product.defaultPeriod} days`} />
          ) : null}
          {product.latePaymentRate != null ? (
            <DetailRow
              label="Late payment rate"
              value={`${toAmountNumber(product.latePaymentRate)}% p.a.`}
            />
          ) : null}
          {product.earlySettlementEnabled ? (
            <>
              <DetailRow
                label="Early settlement lock-in"
                value={
                  product.earlySettlementLockInMonths && product.earlySettlementLockInMonths > 0
                    ? `${product.earlySettlementLockInMonths} months`
                    : 'None'
                }
              />
              <DetailRow
                label="Settlement discount"
                value={
                  product.earlySettlementDiscountType === 'PERCENTAGE'
                    ? `${toAmountNumber(product.earlySettlementDiscountValue)}%`
                    : formatRm(product.earlySettlementDiscountValue)
                }
              />
            </>
          ) : null}
        </>
      ) : null}
      {loan.application?.id ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/applications/${loan.application!.id}` as Href)}
          style={styles.viewApplicationRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Application
          </ThemedText>
          <View style={styles.viewApplicationLink}>
            <ThemedText type="linkPrimary">View</ThemedText>
            <MaterialIcons name="open-in-new" size={14} />
          </View>
        </Pressable>
      ) : null}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Activity timeline                                                 */
/*  Converts BorrowerLoanTimelineEvent → ActivityTimelineEvent so the */
/*  shared dot-line `ActivityTimelineCard` can render it identically  */
/*  to the application detail screen.                                 */
/* ------------------------------------------------------------------ */

function loanEventToTimelineEvent(
  event: BorrowerLoanTimelineEvent,
): ActivityTimelineEvent {
  const info = borrowerTimelineActionInfo(event.action);
  const actor = borrowerTimelineActorLabel(event);
  return {
    id: event.id,
    label: info.label,
    timestamp: event.createdAt,
    actor: actor ?? null,
    detail: renderTimelineDetail(event),
  };
}

function renderTimelineDetail(event: BorrowerLoanTimelineEvent): React.ReactNode {
  const nd = event.newData;
  const summary = extractManualPaymentSummary(event);

  if (
    (summary.amount != null && summary.amount > 0) ||
    (event.action === 'BORROWER_MANUAL_PAYMENT_REJECTED' && summary.rejectReason)
  ) {
    return (
      <>
        {summary.amount != null && summary.amount > 0 ? (
          <ThemedText type="small">
            Amount <ThemedText type="smallBold">{formatRm(summary.amount)}</ThemedText>
            {summary.reference ? (
              <ThemedText type="small" themeColor="textSecondary">
                {'  ·  Ref ' + summary.reference}
              </ThemedText>
            ) : null}
          </ThemedText>
        ) : null}
        {summary.rejectReason ? (
          <ThemedText type="small" themeColor="textSecondary">
            Reason: {summary.rejectReason}
          </ThemedText>
        ) : null}
      </>
    );
  }

  if (event.action === 'STATUS_UPDATE' && nd) {
    const prev = event.previousData?.status;
    const next = nd.status;
    return (
      <>
        <ThemedText type="small">
          {prev ? (
            <>
              <ThemedText type="smallBold">{formatAuditValue(prev, 'status')}</ThemedText>
              {' → '}
              <ThemedText type="smallBold">{formatAuditValue(next, 'status')}</ThemedText>
            </>
          ) : (
            <ThemedText type="smallBold">{formatAuditValue(next, 'status')}</ThemedText>
          )}
        </ThemedText>
        {nd.reason ? (
          <ThemedText type="small" themeColor="textSecondary">
            Reason: {formatAuditValue(nd.reason, 'reason')}
          </ThemedText>
        ) : null}
      </>
    );
  }

  if (event.action === 'LATE_FEE_ACCRUAL' && nd) {
    return (
      <>
        <ThemedText type="small">
          Fee charged{' '}
          <ThemedText type="smallBold">{formatAuditValue(nd.totalFeeCharged, 'totalFeeCharged')}</ThemedText>
        </ThemedText>
        {nd.repaymentsAffected != null ? (
          <ThemedText type="small" themeColor="textSecondary">
            Repayments affected: {formatAuditValue(nd.repaymentsAffected, 'repaymentsAffected')}
          </ThemedText>
        ) : null}
      </>
    );
  }

  if (event.action === 'EARLY_SETTLEMENT' && nd) {
    return (
      <>
        <ThemedText type="small">
          Settlement{' '}
          <ThemedText type="smallBold">{formatAuditValue(nd.settlementAmount, 'settlementAmount')}</ThemedText>
        </ThemedText>
        {nd.discountAmount != null ? (
          <ThemedText type="small" themeColor="textSecondary">
            Discount: {formatAuditValue(nd.discountAmount, 'discountAmount')}
          </ThemedText>
        ) : null}
      </>
    );
  }

  if (
    (event.action === 'BORROWER_UPLOAD_AGREEMENT' ||
      event.action === 'UPLOAD_AGREEMENT' ||
      event.action === 'UPLOAD_DISBURSEMENT_PROOF' ||
      event.action === 'UPLOAD_STAMP_CERTIFICATE') &&
    nd
  ) {
    return (
      <ThemedText type="small">
        File{' '}
        <ThemedText type="smallBold">
          {formatAuditValue(nd.filename ?? nd.originalName ?? nd.path, 'filename')}
        </ThemedText>
      </ThemedText>
    );
  }

  if (event.action === 'DISBURSE' && nd) {
    return (
      <>
        {nd.disbursementDate ? (
          <ThemedText type="small">
            Disbursed{' '}
            <ThemedText type="smallBold">
              {formatAuditValue(nd.disbursementDate, 'disbursementDate')}
            </ThemedText>
          </ThemedText>
        ) : null}
        {nd.reference ? (
          <ThemedText type="small" themeColor="textSecondary">
            Ref: {formatAuditValue(nd.reference, 'reference')}
          </ThemedText>
        ) : null}
      </>
    );
  }

  const changes = getAuditChanges(event.previousData, event.newData);
  if (changes.length === 0) return null;
  return (
    <View style={{ gap: Spacing.one }}>
      {changes.slice(0, 4).map((change) => (
        <View key={`${event.id}-${change.field}`}>
          <ThemedText type="smallBold">{change.field}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {change.from} → {change.to}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Pre-disbursement placeholder                                      */
/* ------------------------------------------------------------------ */

const MALAYSIA_TZ = 'Asia/Kuala_Lumpur';

function formatMalaysiaDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-MY', {
    timeZone: MALAYSIA_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMalaysiaTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-MY', {
    timeZone: MALAYSIA_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

type JourneyStepId = 'attestation' | 'ekyc' | 'certificate' | 'sign' | 'review';

function certDoneKey(loanId: string) {
  return `cert_done_${loanId}`;
}

function PreDisbursementPlaceholder({
  loan,
  loanId,
  onRefresh,
}: {
  loan: BorrowerLoanDetail;
  loanId: string;
  onRefresh: () => void | Promise<void>;
}) {
  // Physical loans skip the borrower-signed flow entirely (lender handles disbursement).
  if (loan.loanChannel === 'PHYSICAL') {
    return <PhysicalLoanAwaitingCard loan={loan} />;
  }
  return <PreDisbursementJourney loan={loan} loanId={loanId} onRefresh={onRefresh} />;
}

function PhysicalLoanAwaitingCard({ loan }: { loan: BorrowerLoanDetail }) {
  const router = useRouter();
  const theme = useTheme();
  const statusInput: BorrowerLoanStatusLabelInput = {
    status: loan.status,
    attestationCompletedAt: loan.attestationCompletedAt ?? null,
    loanChannel: loan.loanChannel,
  };
  return (
    <PageScreen title="Loan" showBackButton backFallbackHref="/loans">
      <View style={styles.headerWrap}>
        <ThemedText type="subtitle">{formatRm(loan.principalAmount)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {loan.product?.name ?? 'Loan'} · {loan.term} months
        </ThemedText>
        <View style={styles.headerBadges}>
          <MetaBadge label={loanStatusBadgeLabelFromDb(statusInput)} />
        </View>
      </View>
      <SectionCard title="Awaiting disbursement">
        <ThemedText type="small">
          This physical loan does not require any more borrower action here. Your lender will
          handle the remaining disbursement steps. Your repayment schedule will appear once funds
          are released.
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/loans')}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
          ]}>
          <MaterialIcons name="arrow-back" size={16} color={theme.text} />
          <ThemedText type="smallBold">Back to loans</ThemedText>
        </Pressable>
      </SectionCard>
    </PageScreen>
  );
}

function PreDisbursementJourney({
  loan,
  loanId,
  onRefresh,
}: {
  loan: BorrowerLoanDetail;
  loanId: string;
  onRefresh: () => void | Promise<void>;
}) {
  const theme = useTheme();
  const statusInput: BorrowerLoanStatusLabelInput = {
    status: loan.status,
    attestationCompletedAt: loan.attestationCompletedAt ?? null,
    loanChannel: loan.loanChannel,
  };

  const requiresAttestation = loan.loanChannel !== 'PHYSICAL';
  const attestationDone = Boolean(loan.attestationCompletedAt);
  const review: SignedAgreementReviewStatus = loan.signedAgreementReviewStatus ?? 'NONE';
  const awaitingLenderReview = review === 'PENDING' || review === 'APPROVED';

  const [borrower, setBorrower] = useState<BorrowerDetail | null>(null);
  const [kyc, setKyc] = useState<TruestackKycStatusData | null>(null);
  const [kycLoading, setKycLoading] = useState(true);
  const [certDone, setCertDone] = useState(false);
  const [activeStep, setActiveStep] = useState<JourneyStepId>('attestation');
  const [kycActionBusy, setKycActionBusy] = useState(false);

  const loadKycData = useCallback(async () => {
    setKycLoading(true);
    try {
      const [borrowerRes, kycRes] = await Promise.all([
        borrowerClient.fetchBorrower(),
        borrowerClient.getTruestackKycStatus().catch(() => null),
      ]);
      setBorrower(borrowerRes.data);
      setKyc(kycRes?.success ? kycRes.data : null);
    } catch {
      setBorrower(null);
      setKyc(null);
    } finally {
      setKycLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKycData();
  }, [loadKycData]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getStoredItem(certDoneKey(loanId));
      if (!cancelled && stored === '1') setCertDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loanId]);

  const handleCertReady = useCallback(() => {
    setCertDone(true);
    void setStoredItem(certDoneKey(loanId), '1');
  }, [loanId]);

  const kycDone = Boolean(borrower) && isBorrowerKycComplete(borrower!, kyc);

  // Clear persisted certDone if the lender review lifecycle resets (e.g. REJECTED → re-sign).
  useEffect(() => {
    if (review === 'APPROVED') {
      // Done. Leave stored value so we don't re-check.
      return;
    }
    if (review === 'REJECTED') {
      // Keep certDone true; certificate doesn't need re-issuing.
      return;
    }
  }, [review]);

  // Auto-advance active step as conditions are satisfied.
  useEffect(() => {
    if (awaitingLenderReview) {
      setActiveStep('review');
      return;
    }
    if (requiresAttestation && !attestationDone) {
      setActiveStep('attestation');
      return;
    }
    if (kycLoading) return;
    if (!kycDone) {
      setActiveStep('ekyc');
      return;
    }
    if (!certDone) {
      setActiveStep('certificate');
      return;
    }
    setActiveStep('sign');
  }, [
    awaitingLenderReview,
    requiresAttestation,
    attestationDone,
    kycDone,
    kycLoading,
    certDone,
  ]);

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([onRefresh(), loadKycData()]);
  }, [onRefresh, loadKycData]);

  const openExternalLink = useCallback(async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error('Unable to open the verification link on this device.');
    await Linking.openURL(url);
  }, []);

  const handleStartIndividualKyc = useCallback(async () => {
    setKycActionBusy(true);
    try {
      const response = await borrowerClient.startTruestackKycSession();
      await openExternalLink(response.data.onboardingUrl);
      await loadKycData();
    } catch (e) {
      Alert.alert(
        'Unable to start e-KYC',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setKycActionBusy(false);
    }
  }, [loadKycData, openExternalLink]);

  const handleStartDirectorKyc = useCallback(
    async (directorId: string) => {
      setKycActionBusy(true);
      try {
        const response = await borrowerClient.startTruestackKycSession({ directorId });
        await openExternalLink(response.data.onboardingUrl);
        await loadKycData();
      } catch (e) {
        Alert.alert(
          'Unable to start e-KYC',
          e instanceof Error ? e.message : 'Please try again.',
        );
      } finally {
        setKycActionBusy(false);
      }
    },
    [loadKycData, openExternalLink],
  );

  const handleOpenKycLink = useCallback(
    async (url: string) => {
      try {
        await openExternalLink(url);
      } catch (e) {
        Alert.alert(
          'Unable to open link',
          e instanceof Error ? e.message : 'Please try again.',
        );
      }
    },
    [openExternalLink],
  );

  const steps = useMemo<{ id: JourneyStepId; label: string; done: boolean }[]>(() => {
    const out: { id: JourneyStepId; label: string; done: boolean }[] = [];
    if (requiresAttestation) out.push({ id: 'attestation', label: 'Attestation', done: attestationDone });
    out.push({ id: 'ekyc', label: 'e-KYC', done: kycDone });
    out.push({ id: 'certificate', label: 'Certificate', done: certDone });
    out.push({
      id: 'sign',
      label: 'Sign',
      done: awaitingLenderReview,
    });
    out.push({ id: 'review', label: 'Review', done: review === 'APPROVED' });
    return out;
  }, [requiresAttestation, attestationDone, kycDone, certDone, awaitingLenderReview, review]);

  const handleStepperPress = useCallback(
    (stepId: JourneyStepId) => {
      if (stepId === 'attestation') {
        setActiveStep('attestation');
        return;
      }
      if (stepId === 'ekyc') {
        if (requiresAttestation && !attestationDone) {
          toast.error('Complete attestation first.');
          return;
        }
        setActiveStep('ekyc');
        return;
      }
      if (stepId === 'certificate') {
        if (requiresAttestation && !attestationDone) {
          toast.error('Complete attestation first.');
          return;
        }
        if (!kycDone) {
          toast.error('Complete e-KYC first.');
          setActiveStep('ekyc');
          return;
        }
        setActiveStep('certificate');
        return;
      }
      if (stepId === 'sign') {
        if (requiresAttestation && !attestationDone) {
          toast.error('Complete attestation first.');
          return;
        }
        if (!kycDone) {
          toast.error('Complete e-KYC first.');
          setActiveStep('ekyc');
          return;
        }
        if (!certDone) {
          toast.error('Get your digital certificate first.');
          setActiveStep('certificate');
          return;
        }
        if (awaitingLenderReview) {
          setActiveStep('review');
          return;
        }
        setActiveStep('sign');
        return;
      }
      if (stepId === 'review') {
        if (!awaitingLenderReview) {
          toast.error('Sign your agreement first.');
          return;
        }
        setActiveStep('review');
      }
    },
    [requiresAttestation, attestationDone, kycDone, certDone, awaitingLenderReview],
  );

  const stepNumber = (id: JourneyStepId): number =>
    steps.findIndex((s) => s.id === id) + 1;

  return (
    <PageScreen
      title="Before payout"
      showBackButton
      backFallbackHref="/loans"
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={handleRefreshAll} tintColor={theme.primary} />
      }>
      <View style={styles.headerWrap}>
        <ThemedText type="subtitle">{formatRm(loan.principalAmount)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {loan.product?.name ?? 'Loan'} · {loan.term} months
        </ThemedText>
        <View style={styles.headerBadges}>
          <MetaBadge label={loanStatusBadgeLabelFromDb(statusInput)} />
          <MetaBadge icon="computer" label="Online" />
        </View>
      </View>

      <JourneyStepper steps={steps} activeStep={activeStep} onPress={handleStepperPress} />

      {activeStep === 'attestation' && requiresAttestation ? (
        attestationDone ? (
          <SectionCard
            title={`Step ${stepNumber('attestation')} — Attestation complete`}
            description="You can revisit earlier steps anytime from the progress bar above."
            action={<InlineStatusRow tone="success" label="Done" />}>
            {loan.attestationCompletedAt ? (
              <ThemedText type="small" themeColor="textSecondary">
                Completed: {formatMalaysiaDateTime(loan.attestationCompletedAt)}
              </ThemedText>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setActiveStep(kycDone ? (certDone ? 'sign' : 'certificate') : 'ekyc')
              }
              style={({ pressed }) => [
                styles.ctaPrimary,
                { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
                {kycDone ? (certDone ? 'Go to sign agreement' : 'Go to certificate') : 'Go to e-KYC'}
              </ThemedText>
              <MaterialIcons name="chevron-right" size={18} color={theme.primaryForeground} />
            </Pressable>
          </SectionCard>
        ) : (
          <AttestationStateCard loan={loan} loanId={loanId} onRefresh={onRefresh} />
        )
      ) : null}

      {activeStep === 'ekyc' ? (
        <>
          {borrower ? (
            <LoanEkycProfileCard borrower={borrower} loanId={loanId} />
          ) : kycLoading ? (
            <SectionCard title={`Step ${stepNumber('ekyc')} — e-KYC`}>
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={theme.primary} size="small" />
                <ThemedText type="small" themeColor="textSecondary">
                  Loading your profile…
                </ThemedText>
              </View>
            </SectionCard>
          ) : (
            <SectionCard title={`Step ${stepNumber('ekyc')} — e-KYC`}>
              <ThemedText type="small" style={{ color: theme.error }}>
                Could not load your borrower profile. Pull down to refresh.
              </ThemedText>
            </SectionCard>
          )}
          {borrower ? (
            <TruestackKycMobileCard
              borrower={borrower}
              kyc={kyc}
              onStartIndividualSession={handleStartIndividualKyc}
              onStartDirectorSession={handleStartDirectorKyc}
              onOpenLink={handleOpenKycLink}
            />
          ) : null}
          {kycDone ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setActiveStep('certificate')}
              disabled={kycActionBusy}
              style={({ pressed }) => [
                styles.ctaPrimary,
                { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
                Continue to certificate
              </ThemedText>
              <MaterialIcons name="chevron-right" size={18} color={theme.primaryForeground} />
            </Pressable>
          ) : null}
        </>
      ) : null}

      {activeStep === 'certificate' ? (
        <LoanCertEnrollmentCard
          stepLabel={`Step ${stepNumber('certificate')} — Digital certificate`}
          onCertReady={handleCertReady}
        />
      ) : null}

      {activeStep === 'sign' ? (
        <SignAgreementCta
          loanId={loanId}
          stepNumber={stepNumber('sign')}
          review={review}
          canSign={(!requiresAttestation || attestationDone) && kycDone && certDone}
        />
      ) : null}

      {activeStep === 'review' ? (
        <LenderReviewCard
          stepNumber={stepNumber('review')}
          review={review}
          loan={loan}
          onEditAndResign={() => setActiveStep('sign')}
        />
      ) : null}
    </PageScreen>
  );
}

/*  Compact journey stepper  */

function JourneyStepper({
  steps,
  activeStep,
  onPress,
}: {
  steps: { id: JourneyStepId; label: string; done: boolean }[];
  activeStep: JourneyStepId;
  onPress: (id: JourneyStepId) => void;
}) {
  const theme = useTheme();
  return (
    <SectionCard hideHeader>
      <ThemedText type="small" themeColor="textSecondary">
        Your progress
      </ThemedText>
      <View style={styles.stepperRow}>
        {steps.map((step, i) => {
          const isActive = step.id === activeStep;
          const isFirst = i === 0;
          const isLast = i === steps.length - 1;
          const prev = steps[i - 1];
          const circleBg = step.done
            ? theme.success
            : isActive
              ? theme.primary
              : 'transparent';
          const circleBorder = step.done
            ? theme.success
            : isActive
              ? theme.primary
              : theme.border;
          const circleFg = step.done || isActive ? theme.primaryForeground : theme.textSecondary;
          const leftConnectorColor = prev?.done ? theme.success : theme.border;
          const rightConnectorColor = step.done ? theme.success : theme.border;
          return (
            <Pressable
              key={step.id}
              accessibilityRole="button"
              accessibilityLabel={`Step ${i + 1}: ${step.label}`}
              onPress={() => onPress(step.id)}
              style={styles.stepperColumn}>
              <View style={styles.stepperCircleRow}>
                <View
                  style={[
                    styles.stepperConnector,
                    {
                      backgroundColor: leftConnectorColor,
                      opacity: isFirst ? 0 : 1,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.stepperCircle,
                    { backgroundColor: circleBg, borderColor: circleBorder },
                  ]}>
                  {step.done ? (
                    <MaterialIcons name="check" size={14} color={circleFg} />
                  ) : (
                    <ThemedText
                      type="smallBold"
                      style={{ color: circleFg, fontSize: 12, lineHeight: 14 }}>
                      {i + 1}
                    </ThemedText>
                  )}
                </View>
                <View
                  style={[
                    styles.stepperConnector,
                    {
                      backgroundColor: rightConnectorColor,
                      opacity: isLast ? 0 : 1,
                    },
                  ]}
                />
              </View>
              <ThemedText
                type="small"
                themeColor={isActive ? 'text' : 'textSecondary'}
                numberOfLines={2}
                style={[styles.stepperLabel, isActive ? { fontWeight: '600' } : undefined]}>
                {step.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </SectionCard>
  );
}

/*  Sign-agreement CTA — leads to the pushed /sign-agreement route  */

function SignAgreementCta({
  loanId,
  stepNumber,
  review,
  canSign,
}: {
  loanId: string;
  stepNumber: number;
  review: SignedAgreementReviewStatus;
  canSign: boolean;
}) {
  const router = useRouter();
  const theme = useTheme();
  const rejected = review === 'REJECTED';
  return (
    <SectionCard
      title={`Step ${stepNumber} — Sign agreement`}
      description={
        rejected
          ? 'Your lender rejected the previous signature. Review their note and re-sign.'
          : 'Review the agreement PDF, capture your signature, then confirm with an OTP.'
      }>
      <View
        style={[
          styles.attestInfoBox,
          { borderColor: theme.border, backgroundColor: theme.background },
        ]}>
        <View style={styles.inlineLoading}>
          <MaterialIcons name="description" size={18} color={theme.primary} />
          <ThemedText type="smallBold">PDF + signature + email OTP</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          We&apos;ll generate a preview of your agreement and seal it with your MTSA certificate
          when you finish.
        </ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={!canSign}
        onPress={() => router.push(`/loans/${loanId}/sign-agreement` as Href)}
        style={({ pressed }) => [
          styles.ctaPrimary,
          {
            backgroundColor: theme.primary,
            opacity: !canSign ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}>
        <MaterialIcons name="edit" size={16} color={theme.primaryForeground} />
        <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
          {rejected ? 'Re-sign agreement' : 'Open signing'}
        </ThemedText>
      </Pressable>
      {!canSign ? (
        <ThemedText type="small" themeColor="textSecondary">
          Finish the previous steps to unlock signing.
        </ThemedText>
      ) : null}
    </SectionCard>
  );
}

/*  Lender review status  */

function LenderReviewCard({
  stepNumber,
  review,
  loan,
  onEditAndResign,
}: {
  stepNumber: number;
  review: SignedAgreementReviewStatus;
  loan: BorrowerLoanDetail;
  onEditAndResign: () => void;
}) {
  const theme = useTheme();
  const tone = review === 'APPROVED' ? 'success' : review === 'REJECTED' ? 'error' : 'warning';
  const label =
    review === 'APPROVED'
      ? 'Approved'
      : review === 'REJECTED'
        ? 'Rejected'
        : 'Awaiting lender review';

  return (
    <SectionCard
      title={`Step ${stepNumber} — Lender review`}
      description={
        review === 'APPROVED'
          ? 'Your lender approved the signed agreement. Disbursement is being scheduled.'
          : review === 'REJECTED'
            ? 'Your lender rejected the signed agreement. Review their note and re-sign.'
            : 'Your signed agreement is with your lender. No action needed from you right now.'
      }
      action={<InlineStatusRow tone={tone} label={label} />}>
      {review === 'REJECTED' && loan.signedAgreementReviewNotes ? (
        <View
          style={[
            styles.attestNoteBox,
            { borderColor: theme.error, backgroundColor: theme.background },
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.error }}>
            Lender note
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {loan.signedAgreementReviewNotes}
          </ThemedText>
        </View>
      ) : null}
      {review === 'REJECTED' ? (
        <Pressable
          accessibilityRole="button"
          onPress={onEditAndResign}
          style={({ pressed }) => [
            styles.ctaPrimary,
            { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
          ]}>
          <MaterialIcons name="edit" size={16} color={theme.primaryForeground} />
          <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
            Re-sign agreement
          </ThemedText>
        </Pressable>
      ) : null}
    </SectionCard>
  );
}

/*  Attestation state-machine card  */

function AttestationStateCard({
  loan,
  loanId,
  onRefresh,
}: {
  loan: BorrowerLoanDetail;
  loanId: string;
  onRefresh: () => void | Promise<void>;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const status: AttestationStatus =
    (loan.attestationStatus as AttestationStatus | undefined) ?? 'NOT_STARTED';

  const runAction = useCallback(
    async (fn: () => Promise<unknown>, successMsg?: string) => {
      setBusy(true);
      try {
        await fn();
        if (successMsg) toast.success(successMsg);
        await onRefresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Action failed');
      } finally {
        setBusy(false);
      }
    },
    [onRefresh],
  );

  const onProceedSigning = useCallback(
    () =>
      runAction(
        () => loansClient.postAttestationProceedToSigning(loanId),
        'Attestation complete. Continue with e-KYC.',
      ),
    [loanId, runAction],
  );

  const onRequestMeeting = useCallback(async () => {
    setBusy(true);
    try {
      await loansClient.postAttestationRequestMeeting(loanId);
      toast.success('Meeting requested — choose a time.');
      await onRefresh();
      router.push(`/loans/${loanId}/schedule-meeting` as Href);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }, [loanId, onRefresh, router]);

  const confirmRequestMeeting = useCallback(() => {
    Alert.alert(
      'Request an online meeting?',
      'Video attestation is immediate. Scheduling a meeting usually takes 2–3 business days while your lender confirms a time.',
      [
        { text: 'Stay here', style: 'cancel' },
        { text: 'Request meeting', onPress: () => void onRequestMeeting() },
      ],
    );
  }, [onRequestMeeting]);

  const onAcceptCounter = useCallback(
    () =>
      runAction(
        () => loansClient.postAttestationAcceptCounter(loanId),
        'Meeting confirmed. Check your Meet link below.',
      ),
    [loanId, runAction],
  );

  const onDeclineCounter = useCallback(
    () =>
      runAction(
        () => loansClient.postAttestationDeclineCounter(loanId),
        'You can pick another slot.',
      ),
    [loanId, runAction],
  );

  const onCancelLoan = useCallback(
    (reason: 'WITHDRAWN' | 'REJECTED_AFTER_ATTESTATION') => {
      setBusy(true);
      (async () => {
        try {
          await loansClient.postAttestationCancelLoan(loanId, { reason });
          toast.success('Loan cancelled.');
          router.replace('/loans' as Href);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Action failed');
        } finally {
          setBusy(false);
        }
      })();
    },
    [loanId, router],
  );

  const confirmWithdraw = useCallback(() => {
    Alert.alert(
      'Withdraw and cancel this loan?',
      'You finished the attestation video but have not accepted the terms yet. If you withdraw now, this application will be cancelled and you will need to start a new application if you change your mind.',
      [
        { text: 'Stay on this loan', style: 'cancel' },
        {
          text: 'Yes, withdraw',
          style: 'destructive',
          onPress: () => onCancelLoan('WITHDRAWN'),
        },
      ],
    );
  }, [onCancelLoan]);

  const confirmRejectAgreement = useCallback(() => {
    Alert.alert(
      'Reject agreement and cancel loan?',
      'This will cancel the loan after meeting attestation. You cannot undo this.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject and cancel',
          style: 'destructive',
          onPress: () => onCancelLoan('REJECTED_AFTER_ATTESTATION'),
        },
      ],
    );
  }, [onCancelLoan]);

  const openMeetLink = useCallback((url: string) => {
    void Linking.openURL(url).catch(() => toast.error('Could not open meeting link.'));
  }, []);

  return (
    <SectionCard
      title="Step 1 — Attestation"
      description="Watch the attestation video, or request an online meeting with a lawyer.">
      {status === 'NOT_STARTED' ? (
        <View style={styles.attestChoiceGrid}>
          <AttestationChoiceTile
            icon="videocam"
            label="Watch video"
            eta="About 5 mins"
            etaTone="success"
            helper="Instant option. Watch the required video and continue as soon as you finish."
            disabled={busy}
            onPress={() => router.push(`/loans/${loanId}/watch-video` as Href)}
          />
          <AttestationChoiceTile
            icon="groups"
            label="Request online meeting"
            eta="2 – 3 business days"
            etaTone="warning"
            helper="Schedule an online meeting with a lawyer to explain the terms of your loan before you continue."
            disabled={busy}
            onPress={confirmRequestMeeting}
          />
        </View>
      ) : null}

      {status === 'VIDEO_COMPLETED' ? (
        <View style={styles.attestActions}>
          <AttestActionButton
            label="Accept terms — continue to e-KYC"
            busy={busy}
            onPress={() => void onProceedSigning()}
            disabled={busy}
            variant="primary"
          />
          <AttestActionButton
            label="Request meeting — choose a time"
            icon="groups"
            busy={busy}
            onPress={() => void onRequestMeeting()}
            disabled={busy}
            variant="outline"
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={confirmWithdraw}
            style={({ pressed }) => [
              styles.attestGhost,
              { opacity: busy ? 0.5 : pressed ? 0.7 : 1 },
            ]}>
            <ThemedText type="small" style={{ color: theme.error, fontWeight: '600' }}>
              Withdraw / cancel loan
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {status === 'MEETING_REQUESTED' || status === 'PROPOSAL_EXPIRED' ? (
        <View
          style={[
            styles.attestInfoBox,
            { borderColor: theme.border, backgroundColor: theme.background },
          ]}>
          <View style={styles.attestInfoHeader}>
            <MaterialIcons name="event" size={18} color={theme.text} />
            <ThemedText type="smallBold">
              {status === 'PROPOSAL_EXPIRED'
                ? 'Propose a new time'
                : 'Choose a meeting time'}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {status === 'PROPOSAL_EXPIRED'
              ? 'Your previous slot was not confirmed in time. Pick another slot.'
              : 'Pick an available slot on the scheduling page (one proposal per loan).'}
          </ThemedText>
          <AttestActionButton
            label="Open schedule page"
            busy={busy}
            onPress={() => router.push(`/loans/${loanId}/schedule-meeting` as Href)}
            disabled={busy}
            variant="primary"
          />
        </View>
      ) : null}

      {status === 'SLOT_PROPOSED' ? (
        <View
          style={[
            styles.attestInfoBox,
            {
              borderColor: theme.warning,
              backgroundColor: theme.warning + '10',
            },
          ]}>
          <View style={styles.attestInfoHeader}>
            <MaterialIcons name="schedule" size={18} color={theme.warning} />
            <ThemedText type="smallBold">Waiting for lender confirmation</ThemedText>
          </View>
          {loan.attestationProposalStartAt ? (
            <ThemedText type="small" themeColor="textSecondary">
              Your slot: {formatMalaysiaDateTime(loan.attestationProposalStartAt)}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            A Google Meet link appears here only after your lender accepts this time. We will also
            email the same link to your account email.
          </ThemedText>
        </View>
      ) : null}

      {status === 'COUNTER_PROPOSED' && loan.attestationProposalStartAt ? (
        <View
          style={[
            styles.attestInfoBox,
            {
              borderColor: theme.primary,
              backgroundColor: theme.primary + '10',
            },
          ]}>
          <View style={styles.attestInfoHeader}>
            <MaterialIcons name="swap-horiz" size={18} color={theme.primary} />
            <ThemedText type="smallBold">Your lender proposed a different time</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {formatMalaysiaDateTime(loan.attestationProposalStartAt)}
            {loan.attestationProposalEndAt
              ? ` — ${formatMalaysiaTime(loan.attestationProposalEndAt)}`
              : ''}
          </ThemedText>
          {loan.attestationProposalDeadlineAt ? (
            <ThemedText type="small" style={{ color: theme.warning }}>
              Respond by: {formatMalaysiaDateTime(loan.attestationProposalDeadlineAt)}
            </ThemedText>
          ) : null}
          <View style={styles.attestActions}>
            <AttestActionButton
              label="Accept this time"
              busy={busy}
              onPress={() => void onAcceptCounter()}
              disabled={busy}
              variant="primary"
            />
            <AttestActionButton
              label="Decline and pick another slot"
              busy={busy}
              onPress={() => void onDeclineCounter()}
              disabled={busy}
              variant="outline"
            />
          </View>
        </View>
      ) : null}

      {status === 'MEETING_SCHEDULED' ? (
        <View
          style={[
            styles.attestInfoBox,
            {
              borderColor: theme.success,
              backgroundColor: theme.success + '10',
            },
          ]}>
          <View style={styles.attestInfoHeader}>
            <MaterialIcons name="event-available" size={18} color={theme.success} />
            <ThemedText type="smallBold">Your meeting</ThemedText>
          </View>
          {loan.attestationMeetingStartAt ? (
            <ThemedText type="small" themeColor="textSecondary">
              {formatMalaysiaDateTime(loan.attestationMeetingStartAt)}
              {loan.attestationMeetingEndAt
                ? ` — ${formatMalaysiaTime(loan.attestationMeetingEndAt)}`
                : ''}
            </ThemedText>
          ) : null}
          {loan.attestationMeetingNotes ? (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={[
                styles.attestNoteBox,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement },
              ]}>
              {loan.attestationMeetingNotes}
            </ThemedText>
          ) : null}
          {loan.attestationMeetingLink ? (
            <AttestActionButton
              label="Join meeting"
              icon="open-in-new"
              busy={false}
              onPress={() => openMeetLink(loan.attestationMeetingLink as string)}
              disabled={busy}
              variant="outline"
            />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Meet link not available yet — check your email or contact your lender.
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            Your lender will mark the meeting complete after it ends. Once confirmed, you can
            continue to e-KYC and signing.
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={confirmRejectAgreement}
            style={({ pressed }) => [
              styles.attestGhost,
              { opacity: busy ? 0.5 : pressed ? 0.7 : 1 },
            ]}>
            <ThemedText type="small" style={{ color: theme.error, fontWeight: '600' }}>
              Reject agreement — cancel loan
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </SectionCard>
  );
}

function AttestationChoiceTile({
  icon,
  label,
  eta,
  etaTone,
  helper,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  eta: string;
  etaTone: 'success' | 'warning';
  helper: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const toneColor = etaTone === 'success' ? theme.success : theme.warning;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.attestTile,
        {
          borderColor: theme.border,
          backgroundColor: theme.background,
          opacity: disabled ? 0.6 : pressed ? 0.9 : 1,
        },
      ]}>
      <View style={styles.attestTileTop}>
        <View style={[styles.attestTileIcon, { backgroundColor: theme.backgroundElement }]}>
          <MaterialIcons name={icon} size={20} color={theme.textSecondary} />
        </View>
        <View style={[styles.attestTileEta, { backgroundColor: toneColor + '1A' }]}>
          <MaterialIcons name="schedule" size={12} color={toneColor} />
          <ThemedText type="small" style={{ color: toneColor, fontWeight: '600' }}>
            {eta}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>
        {label}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {helper}
      </ThemedText>
    </Pressable>
  );
}

function AttestActionButton({
  label,
  icon,
  onPress,
  disabled,
  busy,
  variant,
}: {
  label: string;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
  disabled: boolean;
  busy: boolean;
  variant: 'primary' | 'outline';
}) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  const bg = isPrimary ? theme.primary : 'transparent';
  const fg = isPrimary ? theme.primaryForeground : theme.text;
  const borderColor = isPrimary ? theme.primary : theme.border;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.attestActionBtn,
        {
          backgroundColor: bg,
          borderColor,
          opacity: disabled || busy ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <MaterialIcons name={icon} size={16} color={fg} /> : null}
          <ThemedText type="smallBold" style={{ color: fg }}>
            {label}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Misc                                                              */
/* ------------------------------------------------------------------ */

function NotFoundState() {
  return (
    <PageScreen title="Loan" showBackButton backFallbackHref="/loans">
      <View style={styles.centered}>
        <ThemedText type="smallBold">Loan not found.</ThemedText>
      </View>
    </PageScreen>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type={mono ? 'code' : 'smallBold'} style={styles.detailValue}>
        {value}
      </ThemedText>
    </View>
  );
}

function CtaButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: MaterialIconName;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.ctaBtn,
        {
          backgroundColor: theme.primary,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <MaterialIcons name={icon} size={18} color={theme.primaryForeground} />
      <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  centered: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorHint: {
    marginTop: Spacing.two,
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
  headerWrap: {
    gap: Spacing.one,
  },
  headerBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  banner: {
    flexDirection: 'row',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
  },
  bannerIcon: {
    marginTop: 2,
  },
  bannerCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  detailGroup: {
    gap: Spacing.half,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  detailValue: {
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '65%',
  },
  borrowerName: {
    fontWeight: '700',
  },
  amountText: {
    fontWeight: '700',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  progressCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  progressTotal: {
    fontWeight: '700',
  },
  readyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  metricChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.half,
  },
  metricChipValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  donutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutSvg: {
    transform: [{ rotate: '-90deg' }],
  },
  donutLabel: {
    position: 'absolute',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
  },
  docCopy: {
    flex: 1,
    minWidth: 0,
  },
  repayCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  repayDocs: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  paymentDocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  paymentDocCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  paymentDocActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  paymentDocAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 32,
  },
  repayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  repayHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  repayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  repayCell: {
    minWidth: '46%',
    flexGrow: 1,
    gap: Spacing.half,
  },
  viewApplicationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  viewApplicationLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  crossLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
    minHeight: 24,
  },
  crossLinkAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bottomHint: {
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
  spacer: {
    height: Spacing.four,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderRadius: 14,
    paddingVertical: Spacing.three,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignSelf: 'flex-start',
  },
  attestChoiceGrid: {
    gap: Spacing.two,
  },
  attestTile: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  attestTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  attestTileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attestTileEta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  attestActions: {
    gap: Spacing.two,
  },
  attestGhost: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  attestActionBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
  attestInfoBox: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  attestInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  attestNoteBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: Spacing.two,
  },
  stepperColumn: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
  },
  stepperCircleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  stepperCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperLabel: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
    minHeight: 28,
    paddingHorizontal: 2,
  },
  stepperConnector: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  ctaPrimary: {
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
});
