/**
 * Early settlement screen — borrower-facing flow to settle a loan in full.
 *
 * Mirrors `apps/borrower_pro/components/loan-center/borrower-early-settlement-page.tsx`
 * but adapted for mobile UX: stacked step cards, hero settlement total, copyable bank
 * rows, copy-to-clipboard transfer reference and sticky footer with the submit CTA.
 *
 * Like the web version, this is the manual-payment flow with early-settlement pricing
 * applied: borrower transfers the discounted total to the lender's bank account, then
 * submits this request for the lender to approve.
 */

import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ConfirmTransferSheet } from '@/components/confirm-transfer-sheet';
import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loansClient } from '@/lib/api/borrower';
import { formatBankLabel } from '@/lib/format/borrower';
import { formatRm, toAmountNumber } from '@/lib/loans/currency';
import { generateTransferReference } from '@/lib/loans/payment';
import { toast } from '@/lib/toast';
import type {
  BorrowerEarlySettlementRequest,
  BorrowerLoanDetail,
  EarlySettlementQuoteData,
  LenderBankInfo,
} from '@kredit/borrower';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const SETTLEMENT_STATUSES = new Set(['ACTIVE', 'IN_ARREARS']);

/* ------------------------------------------------------------------ */
/*  Route entry                                                       */
/* ------------------------------------------------------------------ */

export default function EarlySettlementScreen() {
  const params = useLocalSearchParams<{ loanId: string }>();
  const loanId = typeof params.loanId === 'string' ? params.loanId : '';

  if (!loanId) {
    return (
      <PageScreen title="Early settlement" showBackButton backFallbackHref="/loans">
        <NotFoundState />
      </PageScreen>
    );
  }

  return <EarlySettlementContent loanId={loanId} />;
}

/* ------------------------------------------------------------------ */
/*  Main content                                                      */
/* ------------------------------------------------------------------ */

function EarlySettlementContent({ loanId }: { loanId: string }) {
  const theme = useTheme();
  const router = useRouter();

  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [lender, setLender] = useState<LenderBankInfo | null>(null);
  const [quote, setQuote] = useState<EarlySettlementQuoteData | null>(null);
  const [requests, setRequests] = useState<BorrowerEarlySettlementRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [reference, setReference] = useState('');
  const [referenceCopied, setReferenceCopied] = useState(false);
  const [borrowerNote, setBorrowerNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTransferred, setConfirmTransferred] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loanRes, lenderRes, quoteRes, reqRes] = await Promise.all([
        loansClient.getBorrowerLoan(loanId),
        loansClient.fetchBorrowerLender().catch(() => null),
        loansClient
          .getBorrowerEarlySettlementQuote(loanId)
          .catch(() => ({ success: false as const, data: null as EarlySettlementQuoteData | null })),
        loansClient.listBorrowerEarlySettlementRequests(loanId).catch(() => ({
          success: true,
          data: [] as BorrowerEarlySettlementRequest[],
        })),
      ]);

      setLoan(loanRes.data);
      setLender(lenderRes);
      setQuote(quoteRes.data ?? null);
      setRequests(reqRes.data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load loan');
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setReference((current) => current || generateTransferReference(loanId));
  }, [loanId]);

  const pendingRequest = useMemo(
    () => requests.some((r) => r.status === 'PENDING'),
    [requests],
  );

  const productAllowsEarly = loan?.product?.earlySettlementEnabled === true;
  const statusOk = loan ? SETTLEMENT_STATUSES.has(loan.status) : false;

  const bankConfigured = Boolean(
    lender?.lenderBankCode &&
      lender.lenderAccountHolderName?.trim() &&
      lender.lenderAccountNumber?.trim(),
  );

  const totalSettlement =
    quote?.eligible && quote.totalSettlement != null
      ? toAmountNumber(quote.totalSettlement)
      : null;

  const canSubmit =
    quote?.eligible === true &&
    !pendingRequest &&
    reference.trim().length > 0 &&
    bankConfigured;

  /* --- Actions ------------------------------------------------- */

  const copyReference = useCallback(async () => {
    if (!reference.trim()) return;
    try {
      await Clipboard.setStringAsync(reference.trim());
      setReferenceCopied(true);
      toast.success('Transfer reference copied');
      setTimeout(() => setReferenceCopied(false), 2000);
    } catch {
      toast.error('Failed to copy reference');
    }
  }, [reference]);

  const openConfirm = useCallback(() => {
    if (!quote?.eligible || totalSettlement == null) {
      toast.error('Settlement is not available');
      return;
    }
    if (!bankConfigured) {
      toast.error('Bank details are not available yet. Please contact your lender.');
      return;
    }
    if (!reference.trim()) {
      toast.error('Transfer reference is required');
      return;
    }
    setConfirmTransferred(false);
    setConfirmOpen(true);
  }, [bankConfigured, quote?.eligible, reference, totalSettlement]);

  const submitRequest = useCallback(async () => {
    if (!quote?.eligible || totalSettlement == null) {
      toast.error('Settlement is not available');
      return;
    }
    if (!bankConfigured) {
      toast.error('Bank details are not available yet. Please contact your lender.');
      return;
    }
    if (!reference.trim()) {
      toast.error('Transfer reference is required');
      return;
    }

    setSubmitting(true);
    try {
      await loansClient.createBorrowerEarlySettlementRequest(loanId, {
        reference: reference.trim(),
        borrowerNote: borrowerNote.trim() || undefined,
      });
      toast.success('Early settlement submitted', {
        description: 'Your lender will review it shortly.',
      });
      setConfirmOpen(false);
      router.replace(`/loans/${loanId}` as Href);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }, [
    bankConfigured,
    borrowerNote,
    loanId,
    quote?.eligible,
    reference,
    router,
    totalSettlement,
  ]);

  /* --- Loading / gating ---------------------------------------- */

  if (loading || !loan) {
    return (
      <PageScreen
        title="Early settlement"
        showBackButton
        backFallbackHref={`/loans/${loanId}` as Href}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </PageScreen>
    );
  }

  if (!statusOk) {
    return (
      <PageScreen
        title="Early settlement"
        showBackButton
        backFallbackHref={`/loans/${loanId}` as Href}>
        <BannerCard
          tone="warning"
          icon="info"
          title="Not available"
          description="Early settlement is only available for active or in-arrears loans."
        />
      </PageScreen>
    );
  }

  if (!productAllowsEarly) {
    return (
      <PageScreen
        title="Early settlement"
        showBackButton
        backFallbackHref={`/loans/${loanId}` as Href}>
        <BannerCard
          tone="warning"
          icon="info"
          title="Not enabled"
          description="Early settlement is not enabled for this product. Contact your lender if you have questions."
        />
      </PageScreen>
    );
  }

  /* --- Render -------------------------------------------------- */

  return (
    <PageScreen
      title="Early settlement"
      showBackButton
      backFallbackHref={`/loans/${loanId}` as Href}
      stickyFooter={
        quote?.eligible && !pendingRequest ? (
          <SubmitFooter
            amount={totalSettlement}
            onSubmit={openConfirm}
            submitting={submitting}
            disabled={!canSubmit}
          />
        ) : undefined
      }>
      {pendingRequest ? (
        <BannerCard
          tone="warning"
          icon="schedule"
          title="Pending request"
          description="You already have a pending early settlement request. Please wait for your lender to respond."
        />
      ) : null}

      <SummaryHero quote={quote} amount={totalSettlement} />

      <SettlementBreakdownCard quote={quote} />

      <BankAccountStep lender={lender} bankConfigured={bankConfigured} amount={totalSettlement} />

      <ReferenceStep
        reference={reference}
        onCopy={copyReference}
        copied={referenceCopied}
        disabled={!bankConfigured || pendingRequest}
      />

      <NoteStep
        value={borrowerNote}
        onChange={setBorrowerNote}
        disabled={!bankConfigured || pendingRequest}
      />

      {requests.length > 0 ? <RequestsHistoryCard requests={requests} /> : null}

      <DisclaimerCard />

      <ConfirmTransferSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void submitRequest()}
        submitting={submitting}
        title="Confirm early settlement"
        description="Confirm you've already transferred the exact settlement amount to your lender's bank account before submitting this request."
        amountLabel="Amount transferred"
        amountText={totalSettlement != null ? formatRm(totalSettlement) : 'RM —'}
        rows={[
          ...(bankConfigured && lender
            ? [
                {
                  label: 'To',
                  value: formatBankLabel(lender.lenderBankCode, lender.lenderBankOtherName),
                },
                {
                  label: 'Account',
                  value: lender.lenderAccountNumber ?? '',
                  mono: true,
                },
              ]
            : []),
          { label: 'Reference', value: reference.trim(), mono: true },
        ]}
        checkboxLabel={
          <>
            I confirm I have transferred the exact amount of{' '}
            <ThemedText type="smallBold">
              {totalSettlement != null ? formatRm(totalSettlement) : 'RM —'}
            </ThemedText>{' '}
            to the lender&apos;s bank account using the reference above.
          </>
        }
        confirmLabel="Confirm and submit"
        confirmed={confirmTransferred}
        onConfirmedChange={setConfirmTransferred}
        warning="False confirmations may delay approval or be rejected when your lender reconciles incoming transfers."
      />
    </PageScreen>
  );
}

/* ------------------------------------------------------------------ */
/*  Sticky submit footer                                              */
/* ------------------------------------------------------------------ */

function SubmitFooter({
  amount,
  onSubmit,
  submitting,
  disabled,
}: {
  amount: number | null;
  onSubmit: () => void;
  submitting: boolean;
  disabled: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.footerRow}>
      <View style={styles.footerTotal}>
        <ThemedText type="small" themeColor="textSecondary">
          Settlement total
        </ThemedText>
        <ThemedText
          type="smallBold"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={styles.footerAmount}>
          {amount != null ? formatRm(amount) : 'RM —'}
        </ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || submitting }}
        disabled={disabled || submitting}
        onPress={onSubmit}
        style={({ pressed }) => [
          styles.footerCta,
          {
            backgroundColor: theme.primary,
            opacity: disabled || submitting ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}>
        {submitting ? (
          <ActivityIndicator color={theme.primaryForeground} />
        ) : (
          <>
            <MaterialIcons name="check-circle" size={18} color={theme.primaryForeground} />
            <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
              Submit request
            </ThemedText>
          </>
        )}
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero summary                                                      */
/* ------------------------------------------------------------------ */

function SummaryHero({
  quote,
  amount,
}: {
  quote: EarlySettlementQuoteData | null;
  amount: number | null;
}) {
  const theme = useTheme();
  const savings =
    quote?.eligible && quote.totalSavings != null && toAmountNumber(quote.totalSavings) > 0
      ? toAmountNumber(quote.totalSavings)
      : null;

  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.heroLabel}>
        Settlement total
      </ThemedText>
      <ThemedText
        type="title"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        style={styles.heroAmount}>
        {amount != null ? formatRm(amount) : 'RM —'}
      </ThemedText>
      {savings != null ? (
        <ThemedText type="small" style={{ color: theme.success, fontWeight: '600' }}>
          Includes {formatRm(savings)} interest discount
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Pay your loan off in one lump sum
        </ThemedText>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1 — Settlement breakdown                                     */
/* ------------------------------------------------------------------ */

function SettlementBreakdownCard({ quote }: { quote: EarlySettlementQuoteData | null }) {
  const theme = useTheme();

  if (!quote) {
    return (
      <SectionCard title="1. Settlement amount">
        <ThemedText type="small" themeColor="textSecondary">
          Could not load settlement quote. Pull down to refresh or try again later.
        </ThemedText>
      </SectionCard>
    );
  }

  if (!quote.eligible) {
    return (
      <SectionCard
        title="1. Settlement amount"
        description="Not available right now.">
        <View
          style={[
            styles.notEligibleBox,
            { borderColor: theme.border, backgroundColor: theme.backgroundElement },
          ]}>
          <MaterialIcons name="lock" size={18} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.notEligibleText}>
            {quote.reason ?? 'See your product terms or contact your lender.'}
          </ThemedText>
        </View>
      </SectionCard>
    );
  }

  const remainingPrincipal = toAmountNumber(quote.remainingPrincipal ?? 0);
  const remainingInterest = toAmountNumber(quote.remainingInterest ?? 0);
  const remainingFutureInterest = toAmountNumber(quote.remainingFutureInterest ?? 0);
  const discountAmount = toAmountNumber(quote.discountAmount ?? 0);
  const lateFees = toAmountNumber(quote.outstandingLateFees ?? 0);
  const totalSettlement = toAmountNumber(quote.totalSettlement ?? 0);

  const discountSummary =
    quote.discountType === 'PERCENTAGE'
      ? `${toAmountNumber(quote.discountValue ?? 0)}% off future interest`
      : 'Fixed discount on interest';

  return (
    <SectionCard
      title="1. Settlement amount"
      description="Based on your loan schedule, unpaid instalments, late fees and your product's early settlement discount.">
      <View
        style={[
          styles.breakdownBox,
          { borderColor: theme.primary + '40', backgroundColor: theme.primary + '0F' },
        ]}>
        <BreakdownRow label="Remaining principal" value={formatRm(remainingPrincipal)} />
        <BreakdownRow label="Interest (unpaid portion)" value={formatRm(remainingInterest)} />
        {remainingFutureInterest > 0 ? (
          <BreakdownRow
            label="Of which future-scheduled interest"
            value={formatRm(remainingFutureInterest)}
            subtle
          />
        ) : null}
        {discountAmount > 0 ? (
          <BreakdownRow
            label="Early settlement discount"
            sublabel={discountSummary}
            value={`− ${formatRm(discountAmount)}`}
            accent={theme.success}
            bold
          />
        ) : null}
        <BreakdownRow label="Outstanding late fees" value={formatRm(lateFees)} />
        <View style={[styles.breakdownDivider, { backgroundColor: theme.border }]} />
        <View style={styles.breakdownTotalRow}>
          <ThemedText type="smallBold" style={styles.breakdownTotalLabel}>
            Total to transfer
          </ThemedText>
          <ThemedText
            type="subtitle"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={styles.breakdownTotalAmount}>
            {formatRm(totalSettlement)}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Figures follow the same rules as your lender&apos;s admin portal. The final amount may
        adjust slightly when your lender approves, if the schedule has changed.
      </ThemedText>
    </SectionCard>
  );
}

function BreakdownRow({
  label,
  sublabel,
  value,
  accent,
  bold,
  subtle,
}: {
  label: string;
  sublabel?: string;
  value: string;
  accent?: string;
  bold?: boolean;
  subtle?: boolean;
}) {
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownLabelWrap}>
        <ThemedText
          type={bold ? 'smallBold' : 'small'}
          themeColor={subtle ? 'textSecondary' : undefined}
          style={accent ? { color: accent } : undefined}>
          {label}
        </ThemedText>
        {sublabel ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.breakdownSublabel}>
            {sublabel}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText
        type={bold ? 'smallBold' : 'small'}
        themeColor={subtle ? 'textSecondary' : undefined}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={[
          styles.breakdownValue,
          accent ? { color: accent } : undefined,
          subtle ? { fontSize: 12 } : undefined,
        ]}>
        {value}
      </ThemedText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2 — Bank account                                             */
/* ------------------------------------------------------------------ */

function BankAccountStep({
  lender,
  bankConfigured,
  amount,
}: {
  lender: LenderBankInfo | null;
  bankConfigured: boolean;
  amount: number | null;
}) {
  if (!bankConfigured || !lender) {
    return (
      <SectionCard title="2. Pay to" description="Bank details for the lender's account.">
        <BannerCard
          tone="error"
          icon="error-outline"
          title="Bank details not available"
          description="Contact your lender before transferring any funds."
        />
      </SectionCard>
    );
  }

  const bankLabel = formatBankLabel(lender.lenderBankCode, lender.lenderBankOtherName);

  return (
    <SectionCard
      title="2. Pay to"
      description="Open your bank app and transfer the settlement total to the account below.">
      <View style={styles.bankRowGroup}>
        <BankCopyRow icon="account-balance" label="Bank" value={bankLabel} copyLabel="Bank name" />
        <BankCopyRow
          icon="person"
          label="Account name"
          value={lender.lenderAccountHolderName ?? ''}
          copyLabel="Account name"
        />
        <BankCopyRow
          icon="credit-card"
          label="Account number"
          value={lender.lenderAccountNumber ?? ''}
          copyLabel="Account number"
          mono
          isLast
        />
      </View>

      <BannerCard
        tone="info"
        icon="info"
        title={`Transfer exactly ${amount != null ? formatRm(amount) : '—'}`}
        description="Use the transfer reference in the next step when your bank app asks for a recipient reference or payment note."
      />
    </SectionCard>
  );
}

function BankCopyRow({
  icon,
  label,
  value,
  copyLabel,
  mono = false,
  isLast = false,
}: {
  icon: IconName;
  label: string;
  value: string;
  copyLabel: string;
  mono?: boolean;
  isLast?: boolean;
}) {
  const theme = useTheme();
  const hasValue = Boolean(value);

  const handleCopy = async () => {
    if (!hasValue) return;
    try {
      await Clipboard.setStringAsync(value);
      toast.success(`${copyLabel} copied`, { description: value });
    } catch {
      toast.error(`Couldn't copy ${copyLabel.toLowerCase()}`);
    }
  };

  return (
    <Pressable
      accessibilityRole={hasValue ? 'button' : undefined}
      accessibilityLabel={hasValue ? `Copy ${copyLabel.toLowerCase()}: ${value}` : undefined}
      disabled={!hasValue}
      onPress={() => void handleCopy()}
      style={({ pressed }) => [
        styles.bankRow,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
        { opacity: hasValue && pressed ? 0.7 : 1 },
      ]}>
      <View style={[styles.bankIconWrap, { backgroundColor: theme.backgroundSelected }]}>
        <MaterialIcons name={icon} size={18} color={theme.primary} />
      </View>
      <View style={styles.bankCopy}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.bankLabel}>
          {label}
        </ThemedText>
        <ThemedText
          type={mono ? 'code' : 'smallBold'}
          numberOfLines={1}
          style={mono ? styles.bankAccountValue : undefined}>
          {value || '—'}
        </ThemedText>
      </View>
      {hasValue ? (
        <View style={[styles.bankCopyAffordance, { backgroundColor: theme.backgroundSelected }]}>
          <MaterialIcons name="content-copy" size={16} color={theme.text} />
        </View>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3 — Reference                                                */
/* ------------------------------------------------------------------ */

function ReferenceStep({
  reference,
  onCopy,
  copied,
  disabled,
}: {
  reference: string;
  onCopy: () => void;
  copied: boolean;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <SectionCard
      title="3. Transfer reference"
      description="Paste this into your bank app's reference field so we can match the payment.">
      <View
        style={[
          styles.referenceBox,
          {
            borderColor: theme.border,
            backgroundColor: theme.background,
            opacity: disabled ? 0.6 : 1,
          },
        ]}>
        <ThemedText type="code" style={styles.referenceText} numberOfLines={1}>
          {reference || '—'}
        </ThemedText>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || !reference }}
        disabled={disabled || !reference}
        onPress={onCopy}
        style={({ pressed }) => [
          styles.copyButton,
          {
            borderColor: theme.primary,
            backgroundColor: theme.background,
            opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}>
        <MaterialIcons
          name={copied ? 'check' : 'content-copy'}
          size={18}
          color={theme.primary}
        />
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          {copied ? 'Copied' : 'Copy reference'}
        </ThemedText>
      </Pressable>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 4 — Optional note                                            */
/* ------------------------------------------------------------------ */

function NoteStep({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <SectionCard
      title="4. Note to lender"
      description="Optional — include a transfer date, bank used or anything that helps your lender match your payment.">
      <View
        style={[
          styles.noteBox,
          {
            borderColor: theme.border,
            backgroundColor: theme.background,
            opacity: disabled ? 0.6 : 1,
          },
        ]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          editable={!disabled}
          placeholder="e.g. Transferred from Maybank on 20 Apr 2026"
          placeholderTextColor={theme.textSecondary}
          multiline
          numberOfLines={4}
          maxLength={1000}
          style={[styles.noteInput, { color: theme.text }]}
        />
      </View>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Requests history                                                  */
/* ------------------------------------------------------------------ */

function RequestsHistoryCard({ requests }: { requests: BorrowerEarlySettlementRequest[] }) {
  return (
    <SectionCard
      title="Your requests"
      description="History of early settlement requests for this loan.">
      <View style={styles.requestsList}>
        {requests.map((r) => (
          <RequestRow key={r.id} request={r} />
        ))}
      </View>
    </SectionCard>
  );
}

function RequestRow({ request }: { request: BorrowerEarlySettlementRequest }) {
  const theme = useTheme();
  const tone =
    request.status === 'APPROVED'
      ? theme.success
      : request.status === 'REJECTED'
        ? theme.error
        : theme.warning;
  const settlementAmount =
    request.snapshotTotalSettlement != null
      ? toAmountNumber(request.snapshotTotalSettlement)
      : null;

  return (
    <View style={[styles.requestRow, { borderColor: theme.border }]}>
      <View style={styles.requestRowHeader}>
        <View style={[styles.requestStatusPill, { backgroundColor: tone + '1A', borderColor: tone + '55' }]}>
          <ThemedText type="small" style={{ color: tone, fontWeight: '700' }}>
            {request.status}
          </ThemedText>
        </View>
        {settlementAmount != null ? (
          <ThemedText type="smallBold">{formatRm(settlementAmount)}</ThemedText>
        ) : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {new Date(request.createdAt).toLocaleString('en-MY', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </ThemedText>
      {request.reference ? (
        <ThemedText type="small" themeColor="textSecondary">
          Ref: <ThemedText type="code">{request.reference}</ThemedText>
        </ThemedText>
      ) : null}
      {request.status === 'REJECTED' && request.rejectionReason ? (
        <ThemedText type="small" style={{ color: theme.error }}>
          Reason: {request.rejectionReason}
        </ThemedText>
      ) : null}
      {request.status === 'APPROVED' && request.paymentTransaction?.receiptNumber ? (
        <ThemedText type="small" themeColor="textSecondary">
          Receipt {request.paymentTransaction.receiptNumber}
        </ThemedText>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Disclaimer / banner / not-found                                   */
/* ------------------------------------------------------------------ */

function DisclaimerCard() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.disclaimer,
        { borderColor: theme.border, backgroundColor: theme.backgroundElement },
      ]}>
      <MaterialIcons name="shield" size={18} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimerText}>
        Your lender will confirm the settlement amount and complete the loan after approval — same
        process as a manual payment, with early settlement pricing applied.
      </ThemedText>
    </View>
  );
}

function BannerCard({
  tone,
  icon,
  title,
  description,
}: {
  tone: 'info' | 'warning' | 'error';
  icon: IconName;
  title: string;
  description: string;
}) {
  const theme = useTheme();
  const accent =
    tone === 'error' ? theme.error : tone === 'warning' ? theme.warning : theme.info;
  return (
    <View
      style={[
        styles.banner,
        {
          borderColor: accent,
          backgroundColor: theme.backgroundElement,
        },
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

function NotFoundState() {
  return (
    <View style={styles.centered}>
      <ThemedText type="smallBold">Loan not found</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centeredHint}>
        We couldn&apos;t find that loan. Open it from the loans tab and try again.
      </ThemedText>
    </View>
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
    gap: Spacing.one,
  },
  centeredHint: {
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
  hero: {
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
  },
  heroLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroAmount: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '700',
    textAlign: 'center',
  },
  notEligibleBox: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
  },
  notEligibleText: {
    flex: 1,
  },
  breakdownBox: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  breakdownLabelWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  breakdownSublabel: {
    fontSize: 11,
  },
  breakdownValue: {
    textAlign: 'right',
  },
  breakdownDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginVertical: Spacing.one,
  },
  breakdownTotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  breakdownTotalLabel: {
    flexShrink: 0,
  },
  breakdownTotalAmount: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    fontWeight: '700',
  },
  bankRowGroup: {
    marginHorizontal: -Spacing.three,
    marginVertical: -Spacing.one,
  },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  bankIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bankLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  bankAccountValue: {
    fontSize: 16,
    letterSpacing: 1,
  },
  bankCopyAffordance: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referenceBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    minHeight: 52,
    justifyContent: 'center',
  },
  referenceText: {
    fontSize: 14,
    letterSpacing: 0.5,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: Spacing.three,
  },
  noteBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 96,
  },
  noteInput: {
    fontSize: 14,
    lineHeight: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  requestsList: {
    gap: Spacing.two,
  },
  requestRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  requestRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  requestStatusPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  disclaimer: {
    flexDirection: 'row',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'flex-start',
  },
  disclaimerText: {
    flex: 1,
    lineHeight: 20,
  },
  banner: {
    flexDirection: 'row',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'flex-start',
  },
  bannerIcon: {
    marginTop: 2,
  },
  bannerCopy: {
    flex: 1,
    gap: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  footerTotal: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  footerAmount: {
    fontSize: 18,
  },
  footerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    minWidth: 160,
  },
});
