import type { LoanApplicationDetail, LoanPreviewData } from '@kredit/borrower';
import { LoanApplicationOfferParty, LoanApplicationOfferStatus } from '@kredit/shared';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { applicationsClient, loansClient } from '@/lib/api/borrower';
import { formatCurrencyRM } from '@/lib/loan-application-wizard';

type ApplicationTimelineEvent = {
  id: string;
  action: string;
  previousData: unknown;
  newData: unknown;
  createdAt: string;
  user: { id: string; email: string; name: string | null } | null;
};

// --- helpers ---

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// --- small ui components ---

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'textSecondary',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'error',
};

function StatusPill({ status, theme }: { status: string; theme: ReturnType<typeof import('@/hooks/use-theme').useTheme> }) {
  const colorKey = STATUS_COLORS[status];
  const color = colorKey === 'textSecondary'
    ? theme.textSecondary
    : colorKey === 'info' ? theme.info
    : colorKey === 'warning' ? theme.warning
    : colorKey === 'success' ? theme.success
    : theme.error;
  return (
    <View style={[styles.pill, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <ThemedText type="small" style={{ color, fontWeight: '600', fontSize: 11 }}>
        {status.replace(/_/g, ' ')}
      </ThemedText>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" themeColor="textSecondary" style={{ flexShrink: 0 }}>{label}</ThemedText>
      <ThemedText type="smallBold" style={{ textAlign: 'right', flex: 1 }}>{value}</ThemedText>
    </View>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: 'success' | 'warning' }) {
  const theme = useTheme();
  const valueColor = highlight === 'success' ? theme.success : highlight === 'warning' ? theme.warning : theme.text;
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" themeColor="textSecondary" style={{ flexShrink: 0 }}>{label}</ThemedText>
      <ThemedText type="smallBold" style={{ textAlign: 'right', flex: 1, color: valueColor }}>{value}</ThemedText>
    </View>
  );
}

// --- timeline action labels (aligned with web app) ---

const TIMELINE_LABELS: Record<string, string> = {
  CREATE: 'Application created',
  UPDATE: 'Application updated',
  SUBMIT: 'Application submitted',
  APPROVE: 'Application approved',
  REJECT: 'Application rejected',
  RETURN_TO_DRAFT: 'Returned for amendments',
  DOCUMENT_UPLOAD: 'Document uploaded',
  DOCUMENT_DELETE: 'Document deleted',
  BORROWER_CREATE_APPLICATION: 'Application created',
  BORROWER_UPDATE_APPLICATION: 'Application updated',
  BORROWER_SUBMIT_APPLICATION: 'Application submitted',
  BORROWER_APPLICATION_DOCUMENT_UPLOAD: 'Document uploaded',
  BORROWER_APPLICATION_DOCUMENT_DELETE: 'Document removed',
  BORROWER_APPLICATION_STATUS_CHANGE: 'Status updated',
  BORROWER_WITHDRAW_APPLICATION: 'Application withdrawn',
  APPLICATION_COUNTER_OFFER: 'Counter offer from lender',
  APPLICATION_ACCEPT_BORROWER_OFFER: 'Borrower offer accepted',
  APPLICATION_REJECT_OFFERS: 'Negotiation offers rejected',
  BORROWER_COUNTER_OFFER: 'Counter offer sent',
  BORROWER_ACCEPT_LENDER_OFFER: 'Lender offer accepted',
  BORROWER_REJECT_OFFERS: 'Pending offers declined',
};

function timelineActionLabel(action: string): string {
  return TIMELINE_LABELS[action] ?? action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timelineActorLabel(event: ApplicationTimelineEvent): string | null {
  if (event.user?.name ?? event.user?.email) return event.user?.name ?? event.user?.email ?? null;
  if (event.action.startsWith('BORROWER_')) return 'You';
  if (
    event.action.startsWith('APPLICATION_') ||
    event.action === 'APPROVE' ||
    event.action === 'REJECT' ||
    event.action === 'RETURN_TO_DRAFT'
  ) return 'Lender';
  return null;
}

function TimelineItem({ event }: { event: ApplicationTimelineEvent }) {
  const theme = useTheme();
  const label = timelineActionLabel(event.action);
  const actorLabel = timelineActorLabel(event);
  const nd = event.newData && typeof event.newData === 'object' ? (event.newData as Record<string, unknown>) : null;
  const prev = event.previousData && typeof event.previousData === 'object'
    ? (event.previousData as Record<string, unknown>)
    : null;

  const renderDetail = () => {
    if (
      (event.action === 'DOCUMENT_UPLOAD' || event.action === 'BORROWER_APPLICATION_DOCUMENT_UPLOAD') && nd
    ) {
      return (
        <View style={[styles.timelineDetail, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Uploaded: <ThemedText type="smallBold">{String(nd.originalName ?? nd.filename ?? '—')}</ThemedText>
          </ThemedText>
        </View>
      );
    }
    if (
      (event.action === 'DOCUMENT_DELETE' || event.action === 'BORROWER_APPLICATION_DOCUMENT_DELETE')
    ) {
      const src = prev ?? nd;
      return (
        <View style={[styles.timelineDetail, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Removed: <ThemedText type="smallBold">{String(src?.originalName ?? src?.filename ?? '—')}</ThemedText>
          </ThemedText>
        </View>
      );
    }
    if (
      (event.action === 'BORROWER_APPLICATION_STATUS_CHANGE' ||
        event.action === 'APPROVE' ||
        event.action === 'REJECT' ||
        event.action === 'RETURN_TO_DRAFT') && nd
    ) {
      return (
        <View style={[styles.timelineDetail, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {prev?.status
              ? `${String(prev.status).replace(/_/g, ' ')} → ${String(nd.status ?? '').replace(/_/g, ' ')}`
              : String(nd.status ?? '').replace(/_/g, ' ')}
          </ThemedText>
          {(nd.reason ?? nd.notes) ? (
            <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.one }}>
              {String(nd.reason ?? nd.notes)}
            </ThemedText>
          ) : null}
        </View>
      );
    }
    if (
      (event.action === 'APPLICATION_COUNTER_OFFER' || event.action === 'BORROWER_COUNTER_OFFER') && nd
    ) {
      return (
        <View style={[styles.timelineDetail, { backgroundColor: theme.background, borderColor: theme.border }]}>
          {nd.amount != null ? (
            <ThemedText type="small" themeColor="textSecondary">
              Amount: <ThemedText type="smallBold">{formatCurrencyRM(nd.amount)}</ThemedText>
            </ThemedText>
          ) : null}
          {nd.term != null ? (
            <ThemedText type="small" themeColor="textSecondary">
              Term: <ThemedText type="smallBold">{String(nd.term)} months</ThemedText>
            </ThemedText>
          ) : null}
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineDotCol}>
        <View style={[styles.timelineDot, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <MaterialIcons name="radio-button-checked" size={10} color={theme.textSecondary} />
        </View>
        <View style={[styles.timelineLine, { backgroundColor: theme.border }]} />
      </View>
      <View style={styles.timelineContent}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {actorLabel ? (
            <ThemedText type="small" themeColor="textSecondary">by {actorLabel} · </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">{formatRelativeTime(event.createdAt)}</ThemedText>
        </View>
        {renderDetail()}
        <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.one }}>
          {formatDateShort(event.createdAt)}
        </ThemedText>
      </View>
    </View>
  );
}

// --- main screen ---

export default function ApplicationDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [app, setApp] = useState<LoanApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [preview, setPreview] = useState<LoanPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [timeline, setTimeline] = useState<ApplicationTimelineEvent[]>([]);
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

  const load = useCallback(async (isRefresh = false) => {
    if (!id) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await applicationsClient.getBorrowerApplication(id);
      if (res.success && res.data) setApp(res.data as unknown as LoanApplicationDetail);
    } catch { /* silent */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

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
      const res = await loansClient.getBorrowerApplicationTimeline(appId, { limit: 10 });
      setTimeline((res.data ?? []) as ApplicationTimelineEvent[]);
      setHasMoreTimeline(res.pagination?.hasMore ?? false);
      setTimelineCursor(res.pagination?.nextCursor ?? null);
    } catch { /* silent */ } finally {
      setTimelineLoading(false);
    }
  }, []);

  const loadMoreTimeline = useCallback(async (appId: string) => {
    if (!timelineCursor) return;
    setLoadingMoreTimeline(true);
    try {
      const res = await loansClient.getBorrowerApplicationTimeline(appId, { limit: 10, cursor: timelineCursor });
      setTimeline((curr) => [...curr, ...((res.data ?? []) as ApplicationTimelineEvent[])]);
      setHasMoreTimeline(res.pagination?.hasMore ?? false);
      setTimelineCursor(res.pagination?.nextCursor ?? null);
    } catch { /* silent */ } finally {
      setLoadingMoreTimeline(false);
    }
  }, [timelineCursor]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (app) {
      void loadPreview(app);
      if (id) void loadTimeline(id);
    }
  }, [app?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingOffer = app?.offerRounds?.find(
    (o) => o.status === LoanApplicationOfferStatus.PENDING && o.fromParty === LoanApplicationOfferParty.ADMIN,
  ) as (undefined | { amount?: unknown; term?: number | null });

  async function handleAcceptOffer() {
    if (!id) return;
    Alert.alert('Accept offer', "Are you sure you want to accept the lender's offer?", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          setOfferActionLoading(true);
          try { await applicationsClient.postBorrowerAcceptOffer(id); await load(); }
          catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed to accept offer'); }
          finally { setOfferActionLoading(false); }
        },
      },
    ]);
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
          try { await applicationsClient.postBorrowerRejectOffers(id); await load(); }
          catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed to reject offer'); }
          finally { setOfferActionLoading(false); }
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
      await applicationsClient.postBorrowerCounterOffer(id, { amount: amt, term: trm });
      setShowCounterForm(false);
      setCounterAmount('');
      setCounterTerm('');
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to submit counter-offer');
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
      formData.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream' } as unknown as Blob);
      formData.append('category', docKey);
      await applicationsClient.uploadApplicationDocument(id, formData);
      await load(true);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload file');
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
          try { await applicationsClient.deleteApplicationDocument(id, docId); await load(true); }
          catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Could not delete file'); }
        },
      },
    ]);
  }

  if (loading && !app) {
    return (
      <PageScreen title="Application" showBackButton>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </PageScreen>
    );
  }

  if (!app) {
    return (
      <PageScreen title="Application" showBackButton>
        <ThemedText type="small" themeColor="textSecondary">Application not found.</ThemedText>
      </PageScreen>
    );
  }

  const requiredDocs = (app.product?.requiredDocuments ?? []) as Array<{ key: string; label: string; required: boolean }>;
  const uploadedDocs = (app.documents ?? []) as Array<{ id: string; category?: string; filename?: string; originalName?: string }>;
  const isDraft = app.status === 'DRAFT';
  const loanChannel = (app as unknown as { loanChannel?: string }).loanChannel;
  const borrowerObj = (app as unknown as { borrower?: Record<string, unknown> }).borrower;
  const product = app.product;
  const isJadualK = product?.loanScheduleType === 'JADUAL_K';
  const interestModelLabel = product?.interestModel === 'RULE_78' ? 'Rule 78'
    : product?.interestModel ? product.interestModel.replace(/_/g, ' ') : null;

  return (
    <PageScreen
      title={product?.name ?? 'Application'}
      showBackButton
      backFallbackHref="/applications"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />
      }>
      <View style={{ gap: Spacing.three }}>

        {/* Overview — compact single card */}
        <SectionCard title="Overview">
          {/* Status row */}
          <View style={styles.overviewStatusRow}>
            <StatusPill status={app.status} theme={theme} />
            {loanChannel ? (
              <View style={[styles.channelChip, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <MaterialIcons
                  name={loanChannel === 'PHYSICAL' ? 'store' : 'wifi'}
                  size={11}
                  color={theme.textSecondary}
                />
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                  {loanChannel === 'PHYSICAL' ? 'Physical' : 'Online'}
                </ThemedText>
              </View>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary" style={{ marginLeft: 'auto', fontSize: 11 }}>
              {formatDateShort(app.createdAt)}
            </ThemedText>
          </View>

          {/* Borrower — inline below status */}
          {borrowerObj ? (
            <View style={[styles.borrowerRow, { borderTopColor: theme.border }]}>
              <MaterialIcons name="person" size={14} color={theme.textSecondary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                {borrowerObj.name ? (
                  <ThemedText type="smallBold" numberOfLines={1}>{String(borrowerObj.name)}</ThemedText>
                ) : null}
                <View style={styles.borrowerMeta}>
                  {borrowerObj.icNumber ? (
                    <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                      {String(borrowerObj.icNumber)}
                    </ThemedText>
                  ) : null}
                  {borrowerObj.phone ? (
                    <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                      {borrowerObj.icNumber ? ' · ' : ''}{String(borrowerObj.phone)}
                    </ThemedText>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}
        </SectionCard>

        {/* Loan summary — calculated from preview API */}
        <SectionCard
          title="Loan summary"
          collapsible
          defaultExpanded>
          {previewLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: Spacing.two }}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : preview ? (
            <View style={{ gap: Spacing.one }}>
              {/* Hero amount + monthly */}
              <View style={styles.summaryHero}>
                <View>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>Loan amount</ThemedText>
                  <ThemedText type="default" style={{ fontWeight: '700', fontSize: 20 }}>
                    {formatCurrencyRM(preview.loanAmount)}
                  </ThemedText>
                </View>
                <View style={[styles.monthlyBox, { backgroundColor: theme.primary + '14', borderColor: theme.primary + '33' }]}>
                  <ThemedText type="small" style={{ fontSize: 10, color: theme.primary }}>Monthly</ThemedText>
                  <ThemedText type="smallBold" style={{ color: theme.primary, fontSize: 15 }}>
                    {formatCurrencyRM(preview.monthlyPayment)}
                  </ThemedText>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <SummaryRow label="Term" value={`${preview.term} months`} />
              <SummaryRow label={`Interest (${preview.interestRate}% p.a.)`} value={formatCurrencyRM(preview.totalInterest)} />
              <SummaryRow label="Legal fee" value={formatCurrencyRM(preview.legalFee)} highlight="warning" />
              <SummaryRow label="Stamping fee" value={formatCurrencyRM(preview.stampingFee)} highlight="warning" />
              <SummaryRow label="Total fees" value={formatCurrencyRM(preview.totalFees)} highlight="warning" />

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <SummaryRow label="Net disbursement" value={formatCurrencyRM(preview.netDisbursement)} highlight="success" />
              <SummaryRow label="Total payable" value={formatCurrencyRM(preview.totalPayable)} />
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">Loan estimate could not be loaded.</ThemedText>
          )}
        </SectionCard>

        {/* Product details — collapsible, collapsed by default */}
        <SectionCard
          title="Product details"
          collapsible
          defaultExpanded={false}
          collapsedSummary={[
            product?.name,
            isJadualK ? 'Jadual K' : 'Jadual J',
            interestModelLabel,
          ].filter(Boolean).join(' · ')}>
          {product?.name ? <InfoRow label="Product" value={product.name} /> : null}
          <InfoRow label="Schedule type" value={isJadualK ? 'Jadual K' : 'Jadual J'} />
          {interestModelLabel ? <InfoRow label="Interest model" value={interestModelLabel} /> : null}
          {product?.interestRate != null ? <InfoRow label="Interest rate" value={`${Number(product.interestRate)}% p.a.`} /> : null}
          {product?.latePaymentRate != null ? <InfoRow label="Late payment rate" value={`${Number(product.latePaymentRate)}% p.a.`} /> : null}
          {product?.arrearsPeriod != null ? <InfoRow label="Arrears period" value={`${product.arrearsPeriod} days`} /> : null}
          {product?.defaultPeriod != null ? <InfoRow label="Default period" value={`${product.defaultPeriod} days`} /> : null}
          {(app as unknown as { collateralType?: string }).collateralType ? (
            <>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <InfoRow label="Collateral type" value={String((app as unknown as { collateralType: string }).collateralType)} />
              {(app as unknown as { collateralValue?: unknown }).collateralValue ? (
                <InfoRow label="Collateral value" value={formatCurrencyRM((app as unknown as { collateralValue: unknown }).collateralValue)} />
              ) : null}
            </>
          ) : null}
          {product?.earlySettlementEnabled ? (
            <>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <InfoRow label="Early settlement" value="Enabled" />
              {product.earlySettlementLockInMonths != null ? (
                <InfoRow
                  label="Lock-in period"
                  value={product.earlySettlementLockInMonths > 0 ? `${product.earlySettlementLockInMonths} months` : 'None'}
                />
              ) : null}
            </>
          ) : null}
        </SectionCard>

        {/* Pending offer from lender */}
        {pendingOffer ? (
          <SectionCard title="Counter-offer from lender" description="Review and respond to the lender's proposed terms.">
            <View style={[styles.offerBox, { backgroundColor: theme.warning + '14', borderColor: theme.warning + '44' }]}>
              {pendingOffer.amount != null ? (
                <InfoRow label="Proposed amount" value={formatCurrencyRM(pendingOffer.amount)} />
              ) : null}
              {pendingOffer.term != null ? (
                <InfoRow label="Proposed term" value={`${pendingOffer.term} months`} />
              ) : null}
            </View>

            {!showCounterForm ? (
              <View style={styles.offerActions}>
                <Pressable
                  disabled={offerActionLoading}
                  onPress={() => void handleAcceptOffer()}
                  style={({ pressed }) => [
                    styles.offerBtn,
                    { backgroundColor: theme.success, opacity: pressed || offerActionLoading ? 0.75 : 1 },
                  ]}>
                  {offerActionLoading
                    ? <ActivityIndicator size="small" color={theme.primaryForeground} />
                    : <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>Accept</ThemedText>}
                </Pressable>
                <Pressable
                  disabled={offerActionLoading}
                  onPress={() => void handleRejectOffer()}
                  style={({ pressed }) => [
                    styles.offerBtn,
                    { backgroundColor: theme.error, opacity: pressed || offerActionLoading ? 0.75 : 1 },
                  ]}>
                  <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>Reject</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setShowCounterForm(true)}
                  style={({ pressed }) => [
                    styles.offerBtn,
                    { backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: theme.border, opacity: pressed ? 0.75 : 1 },
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
                  style={[styles.counterInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                />
                <TextInput
                  value={counterTerm}
                  onChangeText={setCounterTerm}
                  placeholder="Your counter term (months)"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="numeric"
                  style={[styles.counterInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                />
                <View style={styles.offerActions}>
                  <Pressable
                    disabled={counterSubmitting}
                    onPress={() => void handleSubmitCounter()}
                    style={({ pressed }) => [
                      styles.offerBtn,
                      { backgroundColor: theme.primary, opacity: pressed || counterSubmitting ? 0.75 : 1 },
                    ]}>
                    {counterSubmitting
                      ? <ActivityIndicator size="small" color={theme.primaryForeground} />
                      : <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>Send counter</ThemedText>}
                  </Pressable>
                  <Pressable
                    onPress={() => setShowCounterForm(false)}
                    style={({ pressed }) => [
                      styles.offerBtn,
                      { backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: theme.border, opacity: pressed ? 0.75 : 1 },
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
          description={uploadedDocs.length > 0
            ? `${uploadedDocs.length} document${uploadedDocs.length !== 1 ? 's' : ''} uploaded`
            : 'No documents uploaded yet'}
          collapsible
          defaultExpanded={requiredDocs.length > 0}
          collapsedSummary={uploadedDocs.length > 0
            ? `${uploadedDocs.length} uploaded`
            : requiredDocs.length > 0 ? `${requiredDocs.length} required` : undefined}>
          {requiredDocs.length > 0 ? (
            requiredDocs.map((doc) => {
              const uploaded = uploadedDocs.find((d) => d.category === doc.key);
              return (
                <View key={doc.key} style={[styles.docRow, { borderColor: theme.border }]}>
                  <View style={styles.docRowLeft}>
                    <MaterialIcons
                      name={uploaded ? 'check-circle' : 'radio-button-unchecked'}
                      size={18}
                      color={uploaded ? theme.success : doc.required ? theme.error : theme.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                      <ThemedText type="small">{doc.label}</ThemedText>
                      {uploaded ? (
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {uploaded.originalName ?? uploaded.filename}
                        </ThemedText>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ flexShrink: 0, flexDirection: 'row', gap: Spacing.one }}>
                    {uploadingDoc === doc.key ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : uploaded ? (
                      <Pressable onPress={() => void handleDocDelete(uploaded.id)}>
                        <MaterialIcons name="delete-outline" size={20} color={theme.error} />
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => void handleDocUpload(doc.key)}
                        style={({ pressed }) => [
                          styles.uploadButton,
                          { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
                        ]}>
                        <MaterialIcons name="upload-file" size={14} color={theme.primary} />
                        <ThemedText type="small" style={{ color: theme.primary }}>Upload</ThemedText>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          ) : uploadedDocs.length > 0 ? (
            uploadedDocs.map((doc) => (
              <View key={doc.id} style={[styles.docRow, { borderColor: theme.border }]}>
                <View style={styles.docRowLeft}>
                  <MaterialIcons name="insert-drive-file" size={18} color={theme.textSecondary} />
                  <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>
                    {doc.originalName ?? doc.filename}
                  </ThemedText>
                </View>
                <Pressable onPress={() => void handleDocDelete(doc.id)}>
                  <MaterialIcons name="delete-outline" size={20} color={theme.error} />
                </Pressable>
              </View>
            ))
          ) : (
            <ThemedText type="small" themeColor="textSecondary">No documents uploaded</ThemedText>
          )}
        </SectionCard>

        {/* Activity timeline */}
        <SectionCard
          title="Activity"
          collapsible
          defaultExpanded={false}
          collapsedSummary={timeline.length > 0 ? `${timeline.length} event${timeline.length !== 1 ? 's' : ''}` : undefined}>
          {timelineLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: Spacing.three }}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : timeline.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">No activity recorded yet.</ThemedText>
          ) : (
            <View>
              {timeline.map((event, index) => (
                <TimelineItem key={event.id ?? String(index)} event={event} />
              ))}
              {hasMoreTimeline ? (
                <Pressable
                  disabled={loadingMoreTimeline}
                  onPress={() => id ? void loadMoreTimeline(id) : undefined}
                  style={({ pressed }) => [
                    styles.loadMoreBtn,
                    { borderColor: theme.border, opacity: pressed || loadingMoreTimeline ? 0.75 : 1 },
                  ]}>
                  {loadingMoreTimeline
                    ? <ActivityIndicator size="small" color={theme.primary} />
                    : <ThemedText type="small" style={{ color: theme.primary }}>Load more</ThemedText>}
                </Pressable>
              ) : null}
            </View>
          )}
        </SectionCard>

        {/* Draft CTA */}
        {isDraft && loanChannel !== 'PHYSICAL' ? (
          <Pressable
            onPress={() => router.push(`/apply-loan?applicationId=${app.id}` as never)}
            style={({ pressed }) => [
              styles.continueButton,
              { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
            ]}>
            <MaterialIcons name="edit" size={18} color={theme.primaryForeground} />
            <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
              Continue application
            </ThemedText>
          </Pressable>
        ) : null}

        {/* Approved — loan pending */}
        {app.status === 'APPROVED' && !(app as unknown as { loan?: { id?: string } }).loan?.id ? (
          <View style={[styles.infoNotice, { backgroundColor: theme.success + '14', borderColor: theme.success + '33' }]}>
            <MaterialIcons name="check-circle" size={16} color={theme.success} />
            <ThemedText type="small" style={{ color: theme.success, flex: 1 }}>
              Approved — your loan record will appear in the Loans tab when ready.
            </ThemedText>
          </View>
        ) : null}
      </View>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  overviewStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  borrowerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  borrowerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
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
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 8,
    borderWidth: 1,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  timelineDotCol: {
    alignItems: 'center',
    width: 20,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    flex: 1,
    width: 1,
    marginTop: 4,
    minHeight: 8,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: Spacing.two,
    gap: 3,
  },
  timelineDetail: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    marginTop: Spacing.one,
  },
  loadMoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: Spacing.two,
    minHeight: 44,
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
});
