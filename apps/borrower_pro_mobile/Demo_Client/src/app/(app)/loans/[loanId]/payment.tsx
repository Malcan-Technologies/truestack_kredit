/**
 * Make payment screen — borrower-facing manual bank transfer flow.
 *
 * Mirrors `apps/borrower_pro/components/loan-center/borrower-make-payment-page.tsx`
 * but adapted for mobile UX: vertical step cards, sticky summary footer with the
 * primary CTA, large tap targets and copy-to-clipboard rows for bank details.
 */

import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loansClient } from '@/lib/api/borrower';
import { formatBankLabel } from '@/lib/format/borrower';
import { formatDate } from '@/lib/format/date';
import { formatRm } from '@/lib/loans/currency';
import {
  findNextPayableInstalment,
  formatMalaysiaMoneyInput,
  generateTransferReference,
  parseMoneyStringToNumber,
} from '@/lib/loans/payment';
import type { SchedulePayload } from '@/lib/loans/repayment';
import { toast } from '@/lib/toast';
import type { BorrowerLoanDetail, LenderBankInfo } from '@kredit/borrower';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const PAYABLE_STATUSES = new Set(['ACTIVE', 'IN_ARREARS', 'DEFAULTED']);
const RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

interface ReceiptAsset {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
}

/* ------------------------------------------------------------------ */
/*  Route entry                                                       */
/* ------------------------------------------------------------------ */

export default function MakePaymentScreen() {
  const params = useLocalSearchParams<{ loanId: string }>();
  const loanId = typeof params.loanId === 'string' ? params.loanId : '';

  if (!loanId) {
    return (
      <PageScreen title="Make payment" showBackButton backFallbackHref="/loans">
        <NotFoundState />
      </PageScreen>
    );
  }

  return <MakePaymentContent loanId={loanId} />;
}

/* ------------------------------------------------------------------ */
/*  Main content                                                      */
/* ------------------------------------------------------------------ */

function MakePaymentContent({ loanId }: { loanId: string }) {
  const theme = useTheme();
  const router = useRouter();

  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [lender, setLender] = useState<LenderBankInfo | null>(null);
  const [monthlyInstallment, setMonthlyInstallment] = useState<number | null>(null);
  const [nextDueDate, setNextDueDate] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [amountMode, setAmountMode] = useState<'monthly' | 'custom'>('monthly');
  const [customAmount, setCustomAmount] = useState('');
  const [reference, setReference] = useState('');
  const [referenceCopied, setReferenceCopied] = useState(false);
  const [receiptFile, setReceiptFile] = useState<ReceiptAsset | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loanRes, schRes, lenderRes] = await Promise.all([
        loansClient.getBorrowerLoan(loanId),
        loansClient.getBorrowerLoanSchedule(loanId).catch(() => ({
          success: true,
          data: null as SchedulePayload | null,
        })),
        loansClient.fetchBorrowerLender().catch(() => null),
      ]);

      setLoan(loanRes.data);
      setLender(lenderRes);

      const sch = schRes.data as SchedulePayload | null;
      const repayments = sch?.schedule?.repayments ?? [];
      const next = findNextPayableInstalment(repayments);
      if (next) {
        setMonthlyInstallment(next.balance);
        setNextDueDate(next.dueDate);
      } else {
        setMonthlyInstallment(null);
        setNextDueDate(null);
      }
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

  const resolvedAmount = useMemo<number | null>(() => {
    if (amountMode === 'monthly') {
      return monthlyInstallment;
    }
    return parseMoneyStringToNumber(customAmount);
  }, [amountMode, monthlyInstallment, customAmount]);

  const bankConfigured = Boolean(
    lender?.lenderBankCode &&
      lender.lenderAccountHolderName?.trim() &&
      lender.lenderAccountNumber?.trim(),
  );
  const canPayLoanStatus = loan ? PAYABLE_STATUSES.has(loan.status) : false;
  const canSubmit =
    resolvedAmount != null && reference.trim().length > 0 && bankConfigured && canPayLoanStatus;

  const dueDateLabel = nextDueDate ? formatDate(nextDueDate) : null;

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

  const pickReceipt = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: RECEIPT_MIME_TYPES,
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      setReceiptFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open file picker');
    }
  }, []);

  const clearReceipt = useCallback(() => setReceiptFile(null), []);

  const submitManual = useCallback(async () => {
    if (resolvedAmount == null) {
      toast.error('Enter a valid payment amount');
      return;
    }
    if (!bankConfigured) {
      toast.error('Bank details are not available yet. Please contact the admin team.');
      return;
    }
    if (!reference.trim()) {
      toast.error('Payment reference is required');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('amount', String(resolvedAmount));
      fd.append('reference', reference.trim());
      if (receiptFile) {
        // RN's FormData accepts a `{ uri, name, type }` blob shape for file uploads.
        fd.append(
          'receipt',
          {
            uri: receiptFile.uri,
            name: receiptFile.name,
            type: receiptFile.mimeType ?? 'application/octet-stream',
          } as unknown as Blob,
        );
      }
      await loansClient.createBorrowerManualPaymentRequest(loanId, fd);
      toast.success('Payment submitted', {
        description: 'Your lender will review it shortly.',
      });
      router.replace(`/loans/${loanId}` as Href);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }, [bankConfigured, loanId, receiptFile, reference, resolvedAmount, router]);

  /* --- Loading ------------------------------------------------- */

  if (loading || !loan) {
    return (
      <PageScreen title="Make payment" showBackButton backFallbackHref={`/loans/${loanId}` as Href}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </PageScreen>
    );
  }

  /* --- Render -------------------------------------------------- */

  return (
    <PageScreen
      title="Make payment"
      showBackButton
      backFallbackHref={`/loans/${loanId}` as Href}
      stickyFooter={
        <SubmitFooter
          amount={resolvedAmount}
          onSubmit={submitManual}
          submitting={submitting}
          disabled={!canSubmit}
        />
      }>
      {!canPayLoanStatus ? (
        <BannerCard
          tone="warning"
          icon="info"
          title="Payments are paused"
          description="This loan is not currently accepting payments. Contact the admin team if you believe this is an error."
        />
      ) : null}

      <SummaryHero
        amount={resolvedAmount}
        amountMode={amountMode}
        dueDateLabel={dueDateLabel}
      />

      <AmountStep
        amountMode={amountMode}
        onChangeMode={setAmountMode}
        monthlyInstallment={monthlyInstallment}
        dueDateLabel={dueDateLabel}
        customAmount={customAmount}
        onChangeCustomAmount={setCustomAmount}
      />

      <BankAccountStep
        lender={lender}
        bankConfigured={bankConfigured}
        amount={resolvedAmount}
      />

      <ReferenceStep
        reference={reference}
        onCopy={copyReference}
        copied={referenceCopied}
        disabled={!bankConfigured}
      />

      <ReceiptStep
        file={receiptFile}
        onPick={pickReceipt}
        onClear={clearReceipt}
        disabled={!bankConfigured}
      />

      <DisclaimerCard />
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
          Total
        </ThemedText>
        <ThemedText type="smallBold" style={styles.footerAmount}>
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
              Submit payment
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
  amount,
  amountMode,
  dueDateLabel,
}: {
  amount: number | null;
  amountMode: 'monthly' | 'custom';
  dueDateLabel: string | null;
}) {
  const theme = useTheme();
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
        You&apos;re paying
      </ThemedText>
      <ThemedText type="title" style={styles.heroAmount}>
        {amount != null ? formatRm(amount) : 'RM —'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {amountMode === 'monthly'
          ? dueDateLabel
            ? `Instalment due ${dueDateLabel}`
            : 'Next instalment balance'
          : 'Custom amount'}
      </ThemedText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1 — Amount                                                   */
/* ------------------------------------------------------------------ */

function AmountStep({
  amountMode,
  onChangeMode,
  monthlyInstallment,
  dueDateLabel,
  customAmount,
  onChangeCustomAmount,
}: {
  amountMode: 'monthly' | 'custom';
  onChangeMode: (mode: 'monthly' | 'custom') => void;
  monthlyInstallment: number | null;
  dueDateLabel: string | null;
  customAmount: string;
  onChangeCustomAmount: (value: string) => void;
}) {
  return (
    <SectionCard
      title="1. Amount"
      description="Pay the next instalment balance or enter a custom amount.">
      <ChoiceCard
        active={amountMode === 'monthly'}
        onPress={() => onChangeMode('monthly')}
        label="Instalment balance"
        primary={monthlyInstallment != null ? formatRm(monthlyInstallment) : '—'}
        helper={dueDateLabel ? `Due ${dueDateLabel}` : 'No payable instalment'}
        disabled={monthlyInstallment == null}
      />
      <ChoiceCard
        active={amountMode === 'custom'}
        onPress={() => onChangeMode('custom')}
        label="Custom amount"
        primary="Enter your own"
        helper="Any amount you prefer"
      />
      {amountMode === 'custom' ? (
        <CustomAmountField value={customAmount} onChangeText={onChangeCustomAmount} />
      ) : null}
    </SectionCard>
  );
}

function ChoiceCard({
  active,
  onPress,
  label,
  primary,
  helper,
  disabled = false,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  primary: string;
  helper?: string | null;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.choiceCard,
        {
          borderColor: active ? theme.primary : theme.border,
          backgroundColor: active ? theme.backgroundSelected : theme.background,
          opacity: disabled ? 0.55 : pressed ? 0.9 : 1,
        },
      ]}>
      <View style={styles.choiceCopy}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.choiceLabel}>
          {label.toUpperCase()}
        </ThemedText>
        <ThemedText type="subtitle" style={styles.choicePrimary}>
          {primary}
        </ThemedText>
        {helper ? (
          <ThemedText type="small" themeColor="textSecondary">
            {helper}
          </ThemedText>
        ) : null}
      </View>
      {active ? (
        <MaterialIcons name="check-circle" size={22} color={theme.primary} />
      ) : (
        <MaterialIcons
          name="radio-button-unchecked"
          size={22}
          color={theme.textSecondary}
        />
      )}
    </Pressable>
  );
}

function CustomAmountField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (value: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.fieldWrap}>
      <ThemedText type="smallBold">Amount</ThemedText>
      <View
        style={[
          styles.amountInputWrap,
          {
            borderColor: theme.border,
            backgroundColor: theme.background,
          },
        ]}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.amountPrefix}>
          RM
        </ThemedText>
        <TextInput
          value={value}
          onChangeText={(next) => onChangeText(formatMalaysiaMoneyInput(next))}
          placeholder="0.00"
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoCorrect={false}
          style={[styles.amountInput, { color: theme.text }]}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Use a dot for cents (e.g. 1,234.56). Up to two decimal places.
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
      <SectionCard title="2. Pay to" description="Bank details for the company account.">
        <BannerCard
          tone="error"
          icon="error-outline"
          title="Bank details not set up yet"
          description="The company bank account is not available. Please contact the admin team before making payment."
        />
      </SectionCard>
    );
  }

  const bankLabel = formatBankLabel(lender.lenderBankCode, lender.lenderBankOtherName);

  return (
    <SectionCard
      title="2. Pay to"
      description="Open your bank app and transfer to the account below.">
      <View style={styles.bankRowGroup}>
        <BankCopyRow
          icon="account-balance"
          label="Bank"
          value={bankLabel}
          copyLabel="Bank name"
        />
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
/*  Step 4 — Receipt                                                  */
/* ------------------------------------------------------------------ */

function ReceiptStep({
  file,
  onPick,
  onClear,
  disabled,
}: {
  file: ReceiptAsset | null;
  onPick: () => void;
  onClear: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <SectionCard
      title="4. Payment receipt"
      description="Optional — speeds up review when your lender can match the transfer to a screenshot or PDF.">
      {file ? (
        <View
          style={[
            styles.receiptPill,
            { borderColor: theme.border, backgroundColor: theme.backgroundSelected },
          ]}>
          <View style={[styles.receiptIconWrap, { backgroundColor: theme.background }]}>
            <MaterialIcons name="description" size={18} color={theme.primary} />
          </View>
          <View style={styles.receiptCopy}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {file.name}
            </ThemedText>
            {file.size != null ? (
              <ThemedText type="small" themeColor="textSecondary">
                {formatFileSize(file.size)}
              </ThemedText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove receipt"
            onPress={onClear}
            hitSlop={8}
            style={({ pressed }) => [
              styles.receiptClear,
              { backgroundColor: theme.background, opacity: pressed ? 0.7 : 1 },
            ]}>
            <MaterialIcons name="close" size={16} color={theme.text} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={onPick}
          style={({ pressed }) => [
            styles.uploadDropzone,
            {
              borderColor: theme.border,
              backgroundColor: theme.background,
              opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
            },
          ]}>
          <MaterialIcons name="cloud-upload" size={28} color={theme.primary} />
          <ThemedText type="smallBold">Attach receipt</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.uploadHint}>
            PNG, JPG, WEBP or PDF
          </ThemedText>
        </Pressable>
      )}
    </SectionCard>
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
        Your payment will be reviewed by the admin team before your repayment schedule is updated.
        You&apos;ll see a pending payment on your loan in the meantime.
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
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  choiceCard: {
    borderWidth: 2,
    borderRadius: 16,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  choiceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  choiceLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
  },
  choicePrimary: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  fieldWrap: {
    gap: Spacing.one,
  },
  amountInputWrap: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 56,
  },
  amountPrefix: {
    fontSize: 16,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    paddingVertical: 0,
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
  uploadDropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  uploadHint: {
    textAlign: 'center',
  },
  receiptPill: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  receiptIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  receiptClear: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
