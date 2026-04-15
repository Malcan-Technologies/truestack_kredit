import type { LoanApplicationDetail } from '@kredit/borrower';
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
import { applicationsClient } from '@/lib/api/borrower';
import { formatCurrencyRM } from '@/lib/loan-application-wizard';

function StatusPill({ status }: { status: string }) {
  const theme = useTheme();
  const colorMap: Record<string, string> = {
    DRAFT: theme.textSecondary,
    SUBMITTED: theme.info,
    UNDER_REVIEW: theme.warning,
    APPROVED: theme.success,
    REJECTED: theme.error,
    CANCELLED: theme.error,
  };
  const color = colorMap[status] ?? theme.textSecondary;
  return (
    <View style={[styles.pill, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <ThemedText type="small" style={{ color, fontWeight: '600', fontSize: 12 }}>
        {status.replace(/_/g, ' ')}
      </ThemedText>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedText type="smallBold" style={{ textAlign: 'right', flex: 1 }}>{value}</ThemedText>
    </View>
  );
}

export default function ApplicationDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [app, setApp] = useState<LoanApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  useEffect(() => { void load(); }, [load]);

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
          try {
            await applicationsClient.postBorrowerAcceptOffer(id);
            await load();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to accept offer');
          } finally {
            setOfferActionLoading(false);
          }
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
          try {
            await applicationsClient.postBorrowerRejectOffers(id);
            await load();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to reject offer');
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
          try {
            await applicationsClient.deleteApplicationDocument(id, docId);
            await load(true);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Could not delete document');
          }
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

  return (
    <PageScreen
      title={app.product?.name ?? 'Application'}
      showBackButton
      backFallbackHref="/applications"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />
      }>
      <View style={{ gap: Spacing.three }}>

        <SectionCard title="Overview">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <ThemedText type="small" themeColor="textSecondary">Status</ThemedText>
            <StatusPill status={app.status} />
          </View>
          {loanChannel && (
            <InfoRow label="Channel" value={loanChannel === 'PHYSICAL' ? 'Physical branch' : 'Online'} />
          )}
          <InfoRow
            label="Submitted"
            value={new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(app.createdAt))}
          />
        </SectionCard>

        <SectionCard title="Loan details">
          <InfoRow label="Amount" value={formatCurrencyRM(app.amount)} />
          <InfoRow label="Term" value={`${app.term} months`} />
          {(app as unknown as { collateralType?: string }).collateralType ? (
            <InfoRow label="Collateral type" value={String((app as unknown as { collateralType: string }).collateralType)} />
          ) : null}
          {(app as unknown as { collateralValue?: unknown }).collateralValue ? (
            <InfoRow label="Collateral value" value={formatCurrencyRM((app as unknown as { collateralValue: unknown }).collateralValue)} />
          ) : null}
        </SectionCard>

        {borrowerObj && (
          <SectionCard title="Borrower information">
            {borrowerObj.name ? <InfoRow label="Name" value={String(borrowerObj.name)} /> : null}
            {borrowerObj.icNumber ? <InfoRow label="IC / Passport" value={String(borrowerObj.icNumber)} /> : null}
            {borrowerObj.phone ? <InfoRow label="Phone" value={String(borrowerObj.phone)} /> : null}
            {borrowerObj.email ? <InfoRow label="Email" value={String(borrowerObj.email)} /> : null}
          </SectionCard>
        )}

        {pendingOffer && (
          <SectionCard title="Counter-offer from lender" description="The lender has proposed revised terms. Please review and respond.">
            <View style={[styles.offerBox, { backgroundColor: theme.warning + '14', borderColor: theme.warning + '44' }]}>
              {pendingOffer.amount != null && (
                <InfoRow label="Proposed amount" value={formatCurrencyRM(pendingOffer.amount)} />
              )}
              {pendingOffer.term != null && (
                <InfoRow label="Proposed term" value={`${pendingOffer.term} months`} />
              )}
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
                  {offerActionLoading ? (
                    <ActivityIndicator size="small" color={theme.primaryForeground} />
                  ) : (
                    <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>Accept</ThemedText>
                  )}
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
                    {counterSubmitting ? (
                      <ActivityIndicator size="small" color={theme.primaryForeground} />
                    ) : (
                      <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>Send counter</ThemedText>
                    )}
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
        )}

        <SectionCard
          title="Documents"
          description={uploadedDocs.length > 0 ? `${uploadedDocs.length} document${uploadedDocs.length !== 1 ? 's' : ''} uploaded` : 'No documents uploaded yet'}
          collapsible
          defaultExpanded={requiredDocs.length > 0}>
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
                      {uploaded && (
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {uploaded.originalName ?? uploaded.filename}
                        </ThemedText>
                      )}
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

        {isDraft && loanChannel !== 'PHYSICAL' && (
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
        )}
      </View>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
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
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 4,
    borderRadius: 14,
  },
});
