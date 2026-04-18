/**
 * Application detail screen.
 *
 * Mirrors the loan detail page anatomy (subtitle hero · status / channel
 * badges · stacked SectionCards · subtle cross-link to the related loan
 * when one exists). The timeline uses the shared dot-line
 * `ActivityTimelineCard` so applications, loans, and any future detail
 * screen share one visual language.
 */

import type { LoanApplicationDetail, LoanPreviewData } from '@kredit/borrower';
import { LoanApplicationOfferParty, LoanApplicationOfferStatus } from '@kredit/shared';
import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  ActivityTimelineCard,
  type ActivityTimelineEvent,
} from '@/components/activity-timeline';
import { MetaBadge } from '@/components/meta-badge';
import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { applicationsClient, loansClient } from '@/lib/api/borrower';
import {
  applicationTimelineActorLabel,
  applicationTimelineDetailItems,
  applicationTimelineLabel,
  type RawApplicationTimelineEvent,
} from '@/lib/applications/timeline';
import { extractLastAmendmentMessageFromNotes } from '@/lib/applications/amendment';
import { formatDate } from '@/lib/format/date';
import { formatCurrencyRM } from '@/lib/loan-application-wizard';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatStatusLabel(status: string): string {
  return status
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function applicationEventToTimelineEvent(
  event: RawApplicationTimelineEvent,
  renderDetail: (
    items: ReturnType<typeof applicationTimelineDetailItems>,
  ) => React.ReactNode,
): ActivityTimelineEvent {
  const items = applicationTimelineDetailItems(event);
  return {
    id: event.id,
    label: applicationTimelineLabel(event.action),
    timestamp: event.createdAt,
    actor: applicationTimelineActorLabel(event),
    detail: items.length > 0 ? renderDetail(items) : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function ApplicationDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [app, setApp] = useState<LoanApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [preview, setPreview] = useState<LoanPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [timeline, setTimeline] = useState<RawApplicationTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(false);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [loadingMoreTimeline, setLoadingMoreTimeline] = useState(false);

  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterTerm, setCounterTerm] = useState('');
  const [counterSubmitting, setCounterSubmitting] = useState(false);
  const [offerActionLoading, setOfferActionLoading] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await applicationsClient.getBorrowerApplication(id);
        if (res.success && res.data)
          setApp(res.data as unknown as LoanApplicationDetail);
      } catch {
        /* silent */
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  const loadPreview = useCallback(async (data: LoanApplicationDetail) => {
    setPreviewLoading(true);
    try {
      const res = await applicationsClient.previewBorrowerApplication({
        productId: data.productId,
        amount: Number(data.amount),
        term: data.term,
      });
      if (res.success) setPreview(res.data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const loadTimeline = useCallback(async (appId: string) => {
    setTimelineLoading(true);
    try {
      const res = await loansClient.getBorrowerApplicationTimeline(appId, {
        limit: 10,
      });
      setTimeline((res.data ?? []) as RawApplicationTimelineEvent[]);
      setHasMoreTimeline(res.pagination?.hasMore ?? false);
      setTimelineCursor(res.pagination?.nextCursor ?? null);
    } catch {
      /* silent */
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  const loadMoreTimeline = useCallback(async () => {
    if (!id || !timelineCursor) return;
    setLoadingMoreTimeline(true);
    try {
      const res = await loansClient.getBorrowerApplicationTimeline(id, {
        limit: 10,
        cursor: timelineCursor,
      });
      setTimeline((curr) => [
        ...curr,
        ...((res.data ?? []) as RawApplicationTimelineEvent[]),
      ]);
      setHasMoreTimeline(res.pagination?.hasMore ?? false);
      setTimelineCursor(res.pagination?.nextCursor ?? null);
    } catch {
      /* silent */
    } finally {
      setLoadingMoreTimeline(false);
    }
  }, [id, timelineCursor]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (app) {
      void loadPreview(app);
      if (id) void loadTimeline(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id]);

  const pendingOffer = app?.offerRounds?.find(
    (o) =>
      o.status === LoanApplicationOfferStatus.PENDING &&
      o.fromParty === LoanApplicationOfferParty.ADMIN,
  ) as undefined | { amount?: unknown; term?: number | null };

  const returnedForAmendments = useMemo(() => {
    if (!app || app.status !== 'DRAFT') return false;
    const ch = (app as unknown as { loanChannel?: string }).loanChannel;
    if (ch === 'PHYSICAL') return false;
    return timeline.some((e) => e.action === 'RETURN_TO_DRAFT');
  }, [app, timeline]);

  const latestAmendmentNote = useMemo(() => {
    if (!app || app.status !== 'DRAFT') return null;
    const ch = (app as unknown as { loanChannel?: string }).loanChannel;
    if (ch === 'PHYSICAL') return null;
    const sorted = [...timeline].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const amend = sorted.find((e) => e.action === 'RETURN_TO_DRAFT');
    const data =
      amend?.newData && typeof amend.newData === 'object'
        ? (amend.newData as Record<string, unknown>)
        : null;
    const reason =
      data && typeof data.reason === 'string' && data.reason.trim()
        ? data.reason.trim()
        : null;
    const notesFromEvent =
      data && typeof data.notes === 'string' && data.notes.trim()
        ? data.notes.trim()
        : null;
    const fromApp = extractLastAmendmentMessageFromNotes(app.notes);
    const combined =
      [reason, notesFromEvent].filter(Boolean).join('\n\n') || fromApp;
    return combined || null;
  }, [app, timeline]);

  /* -------- Action handlers -------- */

  async function handleAcceptOffer() {
    if (!id) return;
    Alert.alert(
      'Accept offer',
      "Are you sure you want to accept the lender's offer?",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setOfferActionLoading(true);
            try {
              await applicationsClient.postBorrowerAcceptOffer(id);
              await load();
            } catch (e) {
              Alert.alert(
                'Error',
                e instanceof Error ? e.message : 'Failed to accept offer',
              );
            } finally {
              setOfferActionLoading(false);
            }
          },
        },
      ],
    );
  }

  async function handleRejectOffer() {
    if (!id) return;
    Alert.alert('Reject offer', 'Are you sure you want to reject this offer?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setOfferActionLoading(true);
          try {
            await applicationsClient.postBorrowerRejectOffers(id);
            await load();
          } catch (e) {
            Alert.alert(
              'Error',
              e instanceof Error ? e.message : 'Failed to reject offer',
            );
          } finally {
            setOfferActionLoading(false);
          }
        },
      },
    ]);
  }

  async function handleSubmitCounter() {
    if (!id || !counterAmount || !counterTerm) return;
    const amt = parseFloat(counterAmount);
    const trm = parseInt(counterTerm, 10);
    if (isNaN(amt) || amt <= 0 || isNaN(trm) || trm <= 0) {
      Alert.alert('Invalid input', 'Please enter a valid amount and term.');
      return;
    }
    setCounterSubmitting(true);
    try {
      await applicationsClient.postBorrowerCounterOffer(id, {
        amount: amt,
        term: trm,
      });
      setShowCounterForm(false);
      setCounterAmount('');
      setCounterTerm('');
      await load();
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'Failed to submit counter-offer',
      );
    } finally {
      setCounterSubmitting(false);
    }
  }

  async function handleDocUpload(docKey: string) {
    if (!id) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/png', 'image/jpeg'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if ((asset.size ?? 0) > 5 * 1024 * 1024) {
        Alert.alert('File too large', 'Maximum file size is 5 MB');
        return;
      }
      setUploadingDoc(docKey);
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? 'application/octet-stream',
      } as unknown as Blob);
      formData.append('category', docKey);
      await applicationsClient.uploadApplicationDocument(id, formData);
      await load(true);
    } catch (e) {
      Alert.alert(
        'Upload failed',
        e instanceof Error ? e.message : 'Could not upload file',
      );
    } finally {
      setUploadingDoc(null);
    }
  }

  async function handleDocDelete(docId: string) {
    if (!id) return;
    Alert.alert('Delete document', 'Remove this uploaded document?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await applicationsClient.deleteApplicationDocument(id, docId);
            await load(true);
          } catch (e) {
            Alert.alert(
              'Error',
              e instanceof Error ? e.message : 'Could not delete file',
            );
          }
        },
      },
    ]);
  }

  /* -------- Render -------- */

  if (loading && !app) {
    return (
      <PageScreen title="Application" showBackButton backFallbackHref="/applications">
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </PageScreen>
    );
  }

  if (!app) {
    return (
      <PageScreen title="Application" showBackButton backFallbackHref="/applications">
        <ThemedText type="small" themeColor="textSecondary">
          Application not found.
        </ThemedText>
      </PageScreen>
    );
  }

  const requiredDocs = (app.product?.requiredDocuments ?? []) as {
    key: string;
    label: string;
    required: boolean;
  }[];
  const uploadedDocs = (app.documents ?? []) as {
    id: string;
    category?: string;
    filename?: string;
    originalName?: string;
  }[];
  const isDraft = app.status === 'DRAFT';
  const loanChannel = (app as unknown as { loanChannel?: 'ONLINE' | 'PHYSICAL' })
    .loanChannel;
  const borrowerObj = (app as unknown as {
    borrower?: Record<string, unknown>;
  }).borrower;
  const product = app.product;
  const isJadualK = product?.loanScheduleType === 'JADUAL_K';
  const interestModelLabel =
    product?.interestModel === 'RULE_78'
      ? 'Rule 78'
      : product?.interestModel
        ? product.interestModel.replace(/_/g, ' ')
        : null;
  const linkedLoanId = (app as unknown as { loan?: { id?: string } }).loan?.id ?? null;
  const isCorporate = (borrowerObj as { borrowerType?: string } | undefined)
    ?.borrowerType === 'CORPORATE';
  const borrowerName = isCorporate
    ? String(
        (borrowerObj as { companyName?: string }).companyName ??
          borrowerObj?.name ??
          '—',
      )
    : String(borrowerObj?.name ?? '—');
  const heroAmount = preview?.loanAmount ?? Number(app.amount);
  const isPhysical = loanChannel === 'PHYSICAL';

  /* Inset detail renderer for the timeline. */
  const renderTimelineDetail = (
    items: ReturnType<typeof applicationTimelineDetailItems>,
  ) => (
    <>
      {items.map((item, i) => {
        const formattedValue =
          item.label === 'Amount' ? formatCurrencyRM(item.value) : item.value;
        return (
          <ThemedText
            key={`${item.label ?? 'detail'}-${i}`}
            type="small"
            themeColor="textSecondary">
            {item.label ? `${item.label}: ` : ''}
            <ThemedText
              type={item.emphasis ? 'smallBold' : 'small'}
              style={!item.emphasis ? { color: theme.textSecondary } : undefined}>
              {formattedValue}
            </ThemedText>
          </ThemedText>
        );
      })}
    </>
  );

  const timelineEvents: ActivityTimelineEvent[] = timeline.map((event) =>
    applicationEventToTimelineEvent(event, renderTimelineDetail),
  );

  const showContinueCta = isDraft && loanChannel !== 'PHYSICAL';

  return (
    <PageScreen
      title={product?.name ?? 'Application'}
      showBackButton
      backFallbackHref="/applications"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={theme.primary}
        />
      }
      stickyFooter={
        showContinueCta ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              returnedForAmendments
                ? 'Review and amend application'
                : 'Continue application'
            }
            onPress={() =>
              router.push(`/apply-loan?applicationId=${app.id}` as never)
            }
            style={({ pressed }) => [
              styles.continueButton,
              { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
            ]}>
            <MaterialIcons
              name={returnedForAmendments ? 'edit-note' : 'edit'}
              size={18}
              color={theme.primaryForeground}
            />
            <ThemedText
              type="smallBold"
              style={{ color: theme.primaryForeground }}>
              {returnedForAmendments
                ? 'Review and amend application'
                : 'Continue application'}
            </ThemedText>
          </Pressable>
        ) : undefined
      }>
      {/* Header — same anatomy as loan detail */}
      <View style={styles.headerWrap}>
        <ThemedText type="subtitle">{formatCurrencyRM(heroAmount)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {borrowerName} · {product?.name ?? 'Loan application'}
        </ThemedText>
        <View style={styles.headerBadges}>
          <MetaBadge label={formatStatusLabel(app.status)} />
          {loanChannel ? (
            <MetaBadge
              icon={isPhysical ? 'apartment' : 'computer'}
              label={isPhysical ? 'Physical' : 'Online'}
            />
          ) : null}
          {product?.loanScheduleType ? (
            <MetaBadge
              icon="receipt-long"
              label={isJadualK ? 'Jadual K' : 'Jadual J'}
            />
          ) : null}
        </View>
        {linkedLoanId ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="View linked loan"
            onPress={() => router.push(`/loans/${linkedLoanId}` as Href)}
            style={({ pressed }) => [
              styles.crossLink,
              { opacity: pressed ? 0.6 : 1 },
            ]}>
            <ThemedText type="small" themeColor="textSecondary">
              Loan created
            </ThemedText>
            <View style={styles.crossLinkAction}>
              <ThemedText type="linkPrimary">View loan</ThemedText>
              <MaterialIcons
                name="arrow-forward"
                size={13}
                color={theme.primary}
              />
            </View>
          </Pressable>
        ) : null}
      </View>

      {returnedForAmendments ? (
        <View
          style={[
            styles.amendmentBanner,
            {
              backgroundColor: `${theme.warning}18`,
              borderColor: `${theme.warning}40`,
            },
          ]}>
          <MaterialIcons
            name="assignment-return"
            size={20}
            color={theme.warning}
            style={styles.amendmentBannerIcon}
          />
          <View style={styles.amendmentBannerBody}>
            <ThemedText type="smallBold" style={{ color: theme.text }}>
              Returned for amendments
            </ThemedText>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.amendmentBannerIntro}>
              {latestAmendmentNote
                ? 'Your lender left the message below. Review it with your full application details, then update and resubmit.'
                : 'Your lender returned this application so you can make changes. Review your details on this page, then update and resubmit.'}
            </ThemedText>
            {latestAmendmentNote ? (
              <View
                style={[
                  styles.amendmentNoteBox,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}>
                <ThemedText
                  type="small"
                  style={{ color: theme.text, lineHeight: 20 }}>
                  {latestAmendmentNote}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Loan summary */}
      <SectionCard title="Loan summary" collapsible defaultExpanded>
        {previewLoading ? (
          <View style={styles.previewLoading}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : preview ? (
          <View style={{ gap: Spacing.one }}>
            <View style={styles.summaryHero}>
              <View>
                <ThemedText type="small" themeColor="textSecondary">
                  Loan amount
                </ThemedText>
                <ThemedText
                  type="default"
                  style={{ fontWeight: '700', fontSize: 20 }}>
                  {formatCurrencyRM(preview.loanAmount)}
                </ThemedText>
              </View>
              <View
                style={[
                  styles.monthlyBox,
                  {
                    backgroundColor: theme.primary + '14',
                    borderColor: theme.primary + '33',
                  },
                ]}>
                <ThemedText
                  type="small"
                  style={{ fontSize: 10, color: theme.primary }}>
                  Monthly
                </ThemedText>
                <ThemedText
                  type="smallBold"
                  style={{ color: theme.primary, fontSize: 15 }}>
                  {formatCurrencyRM(preview.monthlyPayment)}
                </ThemedText>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <SummaryRow label="Term" value={`${preview.term} months`} />
            <SummaryRow
              label={`Interest (${preview.interestRate}% p.a.)`}
              value={formatCurrencyRM(preview.totalInterest)}
            />
            <SummaryRow
              label="Legal fee"
              value={formatCurrencyRM(preview.legalFee)}
              highlight="warning"
            />
            <SummaryRow
              label="Stamping fee"
              value={formatCurrencyRM(preview.stampingFee)}
              highlight="warning"
            />
            <SummaryRow
              label="Total fees"
              value={formatCurrencyRM(preview.totalFees)}
              highlight="warning"
            />

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <SummaryRow
              label="Net disbursement"
              value={formatCurrencyRM(preview.netDisbursement)}
              highlight="success"
            />
            <SummaryRow
              label="Total payable"
              value={formatCurrencyRM(preview.totalPayable)}
            />
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Loan estimate could not be loaded.
          </ThemedText>
        )}
      </SectionCard>

      {/* Borrower */}
      {borrowerObj ? (
        <SectionCard
          title="Borrower"
          collapsible
          defaultExpanded={false}
          collapsedSummary={borrowerName}>
          {borrowerObj.name ? (
            <DetailRow label="Name" value={String(borrowerObj.name)} />
          ) : null}
          {(borrowerObj as { icNumber?: string }).icNumber ? (
            <DetailRow
              label="IC number"
              value={String((borrowerObj as { icNumber: string }).icNumber)}
            />
          ) : null}
          {(borrowerObj as { phone?: string }).phone ? (
            <DetailRow
              label="Phone"
              value={String((borrowerObj as { phone: string }).phone)}
            />
          ) : null}
          {(borrowerObj as { email?: string }).email ? (
            <DetailRow
              label="Email"
              value={String((borrowerObj as { email: string }).email)}
            />
          ) : null}
        </SectionCard>
      ) : null}

      {/* Product details */}
      <SectionCard
        title="Product details"
        collapsible
        defaultExpanded={false}
        collapsedSummary={[
          product?.name,
          isJadualK ? 'Jadual K' : 'Jadual J',
          interestModelLabel,
        ]
          .filter(Boolean)
          .join(' · ')}>
        {product?.name ? <DetailRow label="Product" value={product.name} /> : null}
        <DetailRow
          label="Schedule type"
          value={isJadualK ? 'Jadual K' : 'Jadual J'}
        />
        {interestModelLabel ? (
          <DetailRow label="Interest model" value={interestModelLabel} />
        ) : null}
        {product?.interestRate != null ? (
          <DetailRow
            label="Interest rate"
            value={`${Number(product.interestRate)}% p.a.`}
          />
        ) : null}
        {product?.latePaymentRate != null ? (
          <DetailRow
            label="Late payment rate"
            value={`${Number(product.latePaymentRate)}% p.a.`}
          />
        ) : null}
        {product?.arrearsPeriod != null ? (
          <DetailRow
            label="Arrears period"
            value={`${product.arrearsPeriod} days`}
          />
        ) : null}
        {product?.defaultPeriod != null ? (
          <DetailRow
            label="Default period"
            value={`${product.defaultPeriod} days`}
          />
        ) : null}
        {(app as unknown as { collateralType?: string }).collateralType ? (
          <>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <DetailRow
              label="Collateral type"
              value={String(
                (app as unknown as { collateralType: string }).collateralType,
              )}
            />
            {(app as unknown as { collateralValue?: unknown })
              .collateralValue ? (
              <DetailRow
                label="Collateral value"
                value={formatCurrencyRM(
                  (app as unknown as { collateralValue: unknown })
                    .collateralValue,
                )}
              />
            ) : null}
          </>
        ) : null}
        {product?.earlySettlementEnabled ? (
          <>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <DetailRow label="Early settlement" value="Enabled" />
            {product.earlySettlementLockInMonths != null ? (
              <DetailRow
                label="Lock-in period"
                value={
                  product.earlySettlementLockInMonths > 0
                    ? `${product.earlySettlementLockInMonths} months`
                    : 'None'
                }
              />
            ) : null}
          </>
        ) : null}
        <DetailRow label="Created" value={formatDate(app.createdAt)} />
      </SectionCard>

      {/* Pending lender offer */}
      {pendingOffer ? (
        <SectionCard
          title="Counter-offer from lender"
          description="Review and respond to the lender's proposed terms.">
          <View
            style={[
              styles.offerBox,
              {
                backgroundColor: theme.warning + '14',
                borderColor: theme.warning + '44',
              },
            ]}>
            {pendingOffer.amount != null ? (
              <DetailRow
                label="Proposed amount"
                value={formatCurrencyRM(pendingOffer.amount)}
              />
            ) : null}
            {pendingOffer.term != null ? (
              <DetailRow
                label="Proposed term"
                value={`${pendingOffer.term} months`}
              />
            ) : null}
          </View>

          {!showCounterForm ? (
            <View style={styles.offerActions}>
              <Pressable
                disabled={offerActionLoading}
                onPress={() => void handleAcceptOffer()}
                style={({ pressed }) => [
                  styles.offerBtn,
                  {
                    backgroundColor: theme.success,
                    opacity: pressed || offerActionLoading ? 0.75 : 1,
                  },
                ]}>
                {offerActionLoading ? (
                  <ActivityIndicator size="small" color={theme.primaryForeground} />
                ) : (
                  <ThemedText
                    type="smallBold"
                    style={{ color: theme.primaryForeground }}>
                    Accept
                  </ThemedText>
                )}
              </Pressable>
              <Pressable
                disabled={offerActionLoading}
                onPress={() => void handleRejectOffer()}
                style={({ pressed }) => [
                  styles.offerBtn,
                  {
                    backgroundColor: theme.error,
                    opacity: pressed || offerActionLoading ? 0.75 : 1,
                  },
                ]}>
                <ThemedText
                  type="smallBold"
                  style={{ color: theme.primaryForeground }}>
                  Reject
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setShowCounterForm(true)}
                style={({ pressed }) => [
                  styles.offerBtn,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderWidth: 1,
                    borderColor: theme.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}>
                <ThemedText type="smallBold">Counter</ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: Spacing.two }}>
              <TextInput
                value={counterAmount}
                onChangeText={setCounterAmount}
                placeholder="Your counter amount (RM)"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
                style={[
                  styles.counterInput,
                  {
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.background,
                  },
                ]}
              />
              <TextInput
                value={counterTerm}
                onChangeText={setCounterTerm}
                placeholder="Your counter term (months)"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
                style={[
                  styles.counterInput,
                  {
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.background,
                  },
                ]}
              />
              <View style={styles.offerActions}>
                <Pressable
                  disabled={counterSubmitting}
                  onPress={() => void handleSubmitCounter()}
                  style={({ pressed }) => [
                    styles.offerBtn,
                    {
                      backgroundColor: theme.primary,
                      opacity: pressed || counterSubmitting ? 0.75 : 1,
                    },
                  ]}>
                  {counterSubmitting ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.primaryForeground}
                    />
                  ) : (
                    <ThemedText
                      type="smallBold"
                      style={{ color: theme.primaryForeground }}>
                      Send counter
                    </ThemedText>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setShowCounterForm(false)}
                  style={({ pressed }) => [
                    styles.offerBtn,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderWidth: 1,
                      borderColor: theme.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}>
                  <ThemedText type="smallBold">Cancel</ThemedText>
                </Pressable>
              </View>
            </View>
          )}
        </SectionCard>
      ) : null}

      {/* Documents */}
      <SectionCard
        title="Documents"
        collapsible
        defaultExpanded={false}
        collapsedSummary={
          uploadedDocs.length > 0
            ? `${uploadedDocs.length} uploaded${requiredDocs.length > 0 ? ` of ${requiredDocs.length} required` : ''}`
            : requiredDocs.length > 0
              ? `${requiredDocs.length} required`
              : 'None'
        }>
        {requiredDocs.length > 0 ? (
          requiredDocs.map((doc) => {
            const uploaded = uploadedDocs.find((d) => d.category === doc.key);
            return (
              <View
                key={doc.key}
                style={[styles.docRow, { borderColor: theme.border }]}>
                <View style={styles.docRowLeft}>
                  <MaterialIcons
                    name={uploaded ? 'check-circle' : 'radio-button-unchecked'}
                    size={18}
                    color={
                      uploaded
                        ? theme.success
                        : doc.required
                          ? theme.error
                          : theme.textSecondary
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <ThemedText type="small">{doc.label}</ThemedText>
                    {uploaded ? (
                      <ThemedText
                        type="small"
                        themeColor="textSecondary"
                        numberOfLines={1}>
                        {uploaded.originalName ?? uploaded.filename}
                      </ThemedText>
                    ) : null}
                  </View>
                </View>
                <View style={styles.docRowActions}>
                  {uploadingDoc === doc.key ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : uploaded ? (
                    <Pressable onPress={() => void handleDocDelete(uploaded.id)}>
                      <MaterialIcons
                        name="delete-outline"
                        size={20}
                        color={theme.error}
                      />
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => void handleDocUpload(doc.key)}
                      style={({ pressed }) => [
                        styles.uploadButton,
                        {
                          backgroundColor: theme.backgroundElement,
                          borderColor: theme.border,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}>
                      <MaterialIcons
                        name="upload-file"
                        size={14}
                        color={theme.primary}
                      />
                      <ThemedText type="small" style={{ color: theme.primary }}>
                        Upload
                      </ThemedText>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })
        ) : uploadedDocs.length > 0 ? (
          uploadedDocs.map((doc) => (
            <View
              key={doc.id}
              style={[styles.docRow, { borderColor: theme.border }]}>
              <View style={styles.docRowLeft}>
                <MaterialIcons
                  name="insert-drive-file"
                  size={18}
                  color={theme.textSecondary}
                />
                <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>
                  {doc.originalName ?? doc.filename}
                </ThemedText>
              </View>
              <Pressable onPress={() => void handleDocDelete(doc.id)}>
                <MaterialIcons
                  name="delete-outline"
                  size={20}
                  color={theme.error}
                />
              </Pressable>
            </View>
          ))
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            No documents uploaded
          </ThemedText>
        )}
      </SectionCard>

      {/* Activity timeline — shared dot-line component */}
      <ActivityTimelineCard
        events={timelineEvents}
        loading={timelineLoading}
        hasMore={hasMoreTimeline}
        loadingMore={loadingMoreTimeline}
        onLoadMore={loadMoreTimeline}
      />

      {/* Approved — loan pending */}
      {app.status === 'APPROVED' && !linkedLoanId ? (
        <View
          style={[
            styles.infoNotice,
            {
              backgroundColor: theme.success + '14',
              borderColor: theme.success + '33',
            },
          ]}>
          <MaterialIcons name="check-circle" size={16} color={theme.success} />
          <ThemedText type="small" style={{ color: theme.success, flex: 1 }}>
            Approved — your loan record will appear in the Loans tab when
            ready.
          </ThemedText>
        </View>
      ) : null}
    </PageScreen>
  );
}

/* ------------------------------------------------------------------ */
/*  Local helpers                                                      */
/* ------------------------------------------------------------------ */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.infoValue}>
        {value}
      </ThemedText>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'success' | 'warning';
}) {
  const theme = useTheme();
  const valueColor =
    highlight === 'success'
      ? theme.success
      : highlight === 'warning'
        ? theme.warning
        : theme.text;
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText
        type="smallBold"
        style={[styles.infoValue, { color: valueColor }]}>
        {value}
      </ThemedText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
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
  previewLoading: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  summaryHero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  monthlyBox: {
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 8,
    borderWidth: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: 3,
  },
  infoValue: {
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '65%',
  },
  offerBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  offerActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  offerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 10,
    minHeight: 44,
  },
  counterInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
    minHeight: 48,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  docRowLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    flex: 1,
    minWidth: 0,
  },
  docRowActions: {
    flexShrink: 0,
    flexDirection: 'row',
    gap: Spacing.one,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 8,
    borderWidth: 1,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 4,
    borderRadius: 14,
    minHeight: 44,
  },
  infoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: 10,
    borderWidth: 1,
  },
  amendmentBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  amendmentBannerIcon: {
    marginTop: 2,
  },
  amendmentBannerBody: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  amendmentBannerIntro: {
    marginTop: 2,
    lineHeight: 20,
  },
  amendmentNoteBox: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
    borderWidth: 1,
  },
});
