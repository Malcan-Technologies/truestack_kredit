import type { BorrowerDetail, BorrowerProduct, LoanApplicationDetail, LoanPreviewData } from '@kredit/borrower';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import {
  DatePickerField,
  Field,
  FormSwitchRow,
  OptionChipGroup,
  ReadOnlyField,
  SelectField,
  PhoneField,
  SliderField,
} from '@/components/borrower-form-fields';
import { IdentityEkycLockedCallout } from '@/components/identity-ekyc-locked-callout';
import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import {
  SectionCompleteStatusRow,
  SectionOptionalStatusRow,
} from '@/components/verified-status-row';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { applicationsClient, borrowerClient } from '@/lib/api/borrower';
import { getCountryOptions, getStateOptions } from '@/lib/address-options';
import {
  bankOptions,
  buildOnboardingPayload,
  bumiStatusOptions,
  documentTypeOptions,
  educationOptions,
  employmentOptions,
  extractDateFromIC,
  extractGenderFromIC,
  genderOptions,
  initialCorporateFormData,
  initialIndividualFormData,
  isCorporateAddressSectionComplete,
  isCorporateBankSectionComplete,
  isCorporateCompanySectionComplete,
  isCorporateContactSectionComplete,
  isCorporateDirectorsSectionComplete,
  isIndividualAddressSectionComplete,
  isIndividualBankSectionComplete,
  isIndividualContactSectionComplete,
  isIndividualEmergencyContactComplete,
  isIndividualPersonalSectionComplete,
  raceOptions,
  relationshipOptions,
  type CorporateFormData,
  type CorporateSubStep,
  type IndividualFormData,
  type IndividualSubStep,
  validateCorporateFormStep,
  validateIndividualFormStep,
} from '@/lib/onboarding';
import { formatICForDisplay, formatOptionLabel } from '@/lib/format/borrower';
import { formatDate } from '@/lib/format/date';
import { isIndividualIdentityLocked } from '@/lib/borrower-verification';
import { toast } from '@/lib/toast';
import {
  clearLoanWizardDraft,
  formatCurrencyRM,
  formatLatePaymentProductSummary,
  formatPreviewFeeLabel,
  formatProductAnnualRateDisplay,
  formatProductMonthlyInterestPercent,
  initialLoanWizardDraft,
  isCollateralSectionComplete,
  isLoanAmountAndTermComplete,
  loadLoanWizardDraft,
  productUsesCollateral,
  saveLoanWizardDraft,
  validateLoanDetails,
  type LoanWizardDraft,
} from '@/lib/loan-application-wizard';


// ─── Step 0: Product Selection ────────────────────────────────────────────────

function ProductCard({ product, selected, onSelect }: { product: BorrowerProduct; selected: boolean; onSelect: () => void }) {
  const theme = useTheme();
  const monthly = formatProductMonthlyInterestPercent(product.interestRate);
  const annual = formatProductAnnualRateDisplay(product.interestRate);
  const collateral = productUsesCollateral(product);
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.productCard,
        {
          backgroundColor: selected ? theme.primary + '11' : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <View style={styles.productCardHeader}>
        <ThemedText type="smallBold" style={selected ? { color: theme.primary } : undefined}>
          {product.name}
        </ThemedText>
        {selected && <MaterialIcons name="check-circle" size={18} color={theme.primary} />}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {collateral ? 'Collateral' : 'No collateral'}
      </ThemedText>
      {product.description ? (
        <ThemedText type="small" themeColor="textSecondary">{product.description}</ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        {monthly === '—'
          ? '—'
          : annual === '—'
            ? `${monthly}% / month`
            : `${monthly}% / month (${annual}% p.a.)`}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        RM {parseFloat(String(product.minAmount)).toLocaleString('en-MY', { minimumFractionDigits: 0 })} – RM {parseFloat(String(product.maxAmount)).toLocaleString('en-MY', { minimumFractionDigits: 0 })} · {product.minTerm}–{product.maxTerm} months
      </ThemedText>
    </Pressable>
  );
}

function ProductInformationSection({ product }: { product: BorrowerProduct }) {
  const monthly = formatProductMonthlyInterestPercent(product.interestRate);
  const annual = formatProductAnnualRateDisplay(product.interestRate);
  return (
    <SectionCard title="Product information">
      <View style={{ gap: Spacing.two }}>
        <View style={styles.previewRow}>
          <ThemedText type="small" themeColor="textSecondary">Interest</ThemedText>
          <View style={{ alignItems: 'flex-end', maxWidth: '68%' }}>
            {monthly === '—' ? (
              <ThemedText type="smallBold">—</ThemedText>
            ) : (
              <>
                <ThemedText type="smallBold">{monthly}% / month</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">({annual}% p.a.)</ThemedText>
              </>
            )}
          </View>
        </View>
        {product.description ? (
          <ThemedText type="small" themeColor="textSecondary">{product.description}</ThemedText>
        ) : null}
        <View style={styles.previewRow}>
          <ThemedText type="small" themeColor="textSecondary">Legal fee</ThemedText>
          <ThemedText type="smallBold" style={{ flex: 1, textAlign: 'right', marginLeft: Spacing.two }}>
            {formatPreviewFeeLabel(product.legalFeeType, product.legalFeeValue)}
          </ThemedText>
        </View>
        <View style={styles.previewRow}>
          <ThemedText type="small" themeColor="textSecondary">Stamping</ThemedText>
          <ThemedText type="smallBold" style={{ flex: 1, textAlign: 'right', marginLeft: Spacing.two }}>
            {formatPreviewFeeLabel(product.stampingFeeType, product.stampingFeeValue)}
          </ThemedText>
        </View>
        <View style={styles.previewRow}>
          <ThemedText type="small" themeColor="textSecondary">Late payment</ThemedText>
          <ThemedText type="smallBold" style={{ flex: 1, textAlign: 'right', marginLeft: Spacing.two }}>
            {formatLatePaymentProductSummary(product)}
          </ThemedText>
        </View>
        <View style={styles.previewRow}>
          <ThemedText type="small" themeColor="textSecondary">Schedule</ThemedText>
          <ThemedText type="smallBold">
            {productUsesCollateral(product) ? 'Jadual K' : 'Jadual J'}
          </ThemedText>
        </View>
        <View style={styles.previewRow}>
          <ThemedText type="small" themeColor="textSecondary">Security</ThemedText>
          <ThemedText type="smallBold">
            {productUsesCollateral(product) ? 'Collateral' : 'No collateral'}
          </ThemedText>
        </View>
      </View>
    </SectionCard>
  );
}

function SkeletonBar({ width = 90, height = 14 }: { width?: number; height?: number }) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: 4,
        backgroundColor: theme.border,
        opacity,
      }}
    />
  );
}

const PREVIEW_ROW_LABELS = [
  'Monthly payment',
  'Total payable',
  'Net disbursement',
  'Total interest',
] as const;

function PreviewPanel({ preview, loading }: { preview: LoanPreviewData | null; loading: boolean }) {
  const theme = useTheme();

  if (!preview && !loading) return null;

  const rows = preview
    ? [
        { label: 'Monthly payment', value: formatCurrencyRM(preview.monthlyPayment) },
        { label: 'Total payable', value: formatCurrencyRM(preview.totalPayable) },
        { label: 'Net disbursement', value: formatCurrencyRM(preview.netDisbursement) },
        { label: 'Total interest', value: formatCurrencyRM(preview.totalInterest) },
      ]
    : PREVIEW_ROW_LABELS.map((label) => ({ label, value: null as string | null }));

  return (
    <View style={[styles.previewPanel, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.previewHeaderRow}>
        <ThemedText type="smallBold">Estimated breakdown</ThemedText>
        {loading && preview ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : null}
      </View>
      {rows.map((row) => (
        <View key={row.label} style={styles.previewRow}>
          <ThemedText type="small" themeColor="textSecondary">{row.label}</ThemedText>
          {row.value !== null ? (
            <ThemedText type="smallBold">{row.value}</ThemedText>
          ) : (
            <SkeletonBar width={90} />
          )}
        </View>
      ))}
    </View>
  );
}

function DocRow({
  label,
  required,
  uploaded,
  uploading,
  onUpload,
  onDelete,
}: {
  label: string;
  required: boolean;
  uploaded: boolean;
  uploading: boolean;
  onUpload: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.docRow, { borderColor: theme.border }]}>
      <View style={styles.docRowLeft}>
        <MaterialIcons
          name={uploaded ? 'check-circle' : 'radio-button-unchecked'}
          size={20}
          color={uploaded ? theme.success : required ? theme.error : theme.textSecondary}
        />
        <View style={{ flex: 1 }}>
          <ThemedText type="small">{label}</ThemedText>
          <ThemedText type="small" style={{ color: required ? theme.error : theme.textSecondary }}>
            {required ? 'Required' : 'Optional'}
          </ThemedText>
        </View>
      </View>
      <View style={styles.docRowActions}>
        {uploading ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : uploaded ? (
          <Pressable
            onPress={onDelete}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <MaterialIcons name="delete-outline" size={22} color={theme.error} />
          </Pressable>
        ) : (
          <Pressable
            onPress={onUpload}
            style={({ pressed }) => [
              styles.uploadButton,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
            ]}>
            <MaterialIcons name="upload-file" size={16} color={theme.primary} />
            <ThemedText type="small" style={{ color: theme.primary }}>Upload</ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ConsentCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.consentRow, { opacity: pressed ? 0.8 : 1 }]}>
      <MaterialIcons
        name={checked ? 'check-box' : 'check-box-outline-blank'}
        size={22}
        color={checked ? theme.primary : theme.textSecondary}
      />
      <ThemedText type="small" style={{ flex: 1 }}>
        I confirm that the information provided is accurate and I consent to TrueKredit processing my application under the{' '}
        <ThemedText type="small" style={{ color: theme.primary }}>Terms & Conditions</ThemedText>
        {' '}and{' '}
        <ThemedText type="small" style={{ color: theme.primary }}>Privacy Policy</ThemedText>.
      </ThemedText>
    </Pressable>
  );
}

// ─── Step progress stepper ────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { label: 'Product' },
  { label: 'Details' },
  { label: 'Profile' },
  { label: 'Docs' },
  { label: 'Review' },
];

function StepperBar({ currentStep }: { currentStep: number }) {
  const theme = useTheme();
  return (
    <View style={[stepperStyles.wrapper, { borderBottomColor: theme.border }]}>
      <View style={stepperStyles.row}>
        {WIZARD_STEPS.map((s, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <React.Fragment key={s.label}>
              <View style={stepperStyles.stepCol}>
                <View
                  style={[
                    stepperStyles.circle,
                    {
                      backgroundColor: done
                        ? theme.primary
                        : active
                        ? theme.primary + '1A'
                        : theme.backgroundElement,
                      borderColor: done || active ? theme.primary : theme.border,
                      borderStyle: done || active ? 'solid' : 'dashed',
                    },
                  ]}>
                  {done ? (
                    <MaterialIcons name="check" size={13} color={theme.primaryForeground} />
                  ) : (
                    <ThemedText
                      type="small"
                      style={[
                        stepperStyles.stepNumber,
                        { color: active ? theme.primary : theme.textSecondary },
                      ]}>
                      {i + 1}
                    </ThemedText>
                  )}
                </View>
                <ThemedText
                  type="small"
                  style={[
                    stepperStyles.stepLabel,
                    {
                      color: active ? theme.primary : done ? theme.text : theme.textSecondary,
                      fontWeight: active ? '600' : '400',
                    },
                  ]}>
                  {s.label}
                </ThemedText>
              </View>
              {i < WIZARD_STEPS.length - 1 && (
                <View style={stepperStyles.connectorWrap}>
                  <View
                    style={[
                      stepperStyles.connector,
                      {
                        borderTopColor: done ? theme.primary : theme.border,
                        borderStyle: done ? 'solid' : 'dashed',
                        opacity: done ? 0.5 : 0.4,
                      },
                    ]}
                  />
                </View>
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

export default function ApplyLoanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ applicationId?: string }>();

  const [step, setStep] = useState(0);
  const [profileSubStep, setProfileSubStep] = useState<IndividualSubStep | CorporateSubStep>(1 as IndividualSubStep);
  const [draft, setDraft] = useState<LoanWizardDraft>(initialLoanWizardDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [products, setProducts] = useState<BorrowerProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<BorrowerProduct | null>(null);

  const [preview, setPreview] = useState<LoanPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [borrower, setBorrower] = useState<BorrowerDetail | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [individualForm, setIndividualForm] = useState<IndividualFormData>(initialIndividualFormData);
  const [corporateForm, setCorporateForm] = useState<CorporateFormData>(initialCorporateFormData);
  const [noMonthlyIncome, setNoMonthlyIncome] = useState(false);

  const [application, setApplication] = useState<LoanApplicationDetail | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const [consented, setConsented] = useState(false);

  const borrowerType: 'INDIVIDUAL' | 'CORPORATE' = (borrower as unknown as { borrowerType?: string })?.borrowerType === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL';

  useEffect(() => {
    async function init() {
      if (params.applicationId) {
        setDraft((prev) => ({ ...prev, applicationId: params.applicationId, step: 1 }));
        setStep(1);
        try {
          const res = await applicationsClient.getBorrowerApplication(params.applicationId);
          if (res.success && res.data) {
            const app = res.data as unknown as LoanApplicationDetail;
            setApplication(app);
            setSelectedProduct((app.product ?? null) as BorrowerProduct | null);
            setDraft({
              applicationId: params.applicationId,
              productId: (app as unknown as { productId?: string }).productId,
              amount: String(parseFloat(String(app.amount)) || ''),
              term: String(app.term),
              collateralType: (app as unknown as { collateralType?: string }).collateralType ?? '',
              collateralValue: (app as unknown as { collateralValue?: unknown }).collateralValue ? String((app as unknown as { collateralValue: unknown }).collateralValue) : '',
              step: 1,
              profileSubStep: 1,
            });
            setStep(app.status === 'DRAFT' ? 1 : 0);
          }
        } catch { /* ignore */ }
      } else {
        const stored = await loadLoanWizardDraft();
        if (stored) {
          setDraft(stored);
          setStep(stored.step);
          setProfileSubStep(stored.profileSubStep as IndividualSubStep);
        }
      }

      setProductsLoading(true);
      try {
        const res = await applicationsClient.fetchBorrowerProducts();
        if (res.success) setProducts((res.data ?? []) as unknown as BorrowerProduct[]);
      } catch { /* ignore */ } finally {
        setProductsLoading(false);
      }
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (products.length > 0 && draft.productId && !selectedProduct) {
      const p = products.find((pr) => pr.id === draft.productId);
      if (p) setSelectedProduct(p);
    }
  }, [products, draft.productId, selectedProduct]);

  useEffect(() => {
    if (step !== 2 || profileLoaded) return;
    void (async () => {
      try {
        const res = await borrowerClient.fetchBorrower();
        if (res.success && res.data) {
          const b = res.data as unknown as BorrowerDetail & Record<string, unknown>;
          setBorrower(b);
          const bt = (b as Record<string, unknown>).borrowerType;
          if (bt !== 'CORPORATE') {
            setIndividualForm({
              name: (b.name as string) ?? '',
              icNumber: (b.icNumber as string) ?? '',
              documentType: (b.documentType as string) ?? 'IC',
              phone: (b.phone as string) ?? '',
              email: (b.email as string) ?? '',
              addressLine1: (b.addressLine1 as string) ?? '',
              addressLine2: (b.addressLine2 as string) ?? '',
              city: (b.city as string) ?? '',
              state: (b.state as string) ?? '',
              postcode: (b.postcode as string) ?? '',
              country: (b.country as string) ?? 'MY',
              dateOfBirth: (b.dateOfBirth as string) ? String(b.dateOfBirth).substring(0, 10) : '',
              gender: (b.gender as string) ?? '',
              race: (b.race as string) ?? '',
              educationLevel: (b.educationLevel as string) ?? '',
              occupation: (b.occupation as string) ?? '',
              employmentStatus: (b.employmentStatus as string) ?? '',
              bankName: (b.bankName as string) ?? '',
              bankNameOther: (b.bankNameOther as string) ?? '',
              bankAccountNo: (b.bankAccountNo as string) ?? '',
              emergencyContactName: (b.emergencyContactName as string) ?? '',
              emergencyContactPhone: (b.emergencyContactPhone as string) ?? '',
              emergencyContactRelationship: (b.emergencyContactRelationship as string) ?? '',
              monthlyIncome: b.monthlyIncome != null ? String(b.monthlyIncome) : '',
              instagram: (b.instagram as string) ?? '',
              tiktok: (b.tiktok as string) ?? '',
              facebook: (b.facebook as string) ?? '',
              linkedin: (b.linkedin as string) ?? '',
              xTwitter: (b.xTwitter as string) ?? '',
            });
            setNoMonthlyIncome(b.monthlyIncome === 0);
          } else {
            setCorporateForm((prev) => ({
              ...prev,
              name: (b.name as string) ?? '',
              icNumber: (b.icNumber as string) ?? '',
              phone: (b.phone as string) ?? '',
              email: (b.email as string) ?? '',
              companyName: (b.companyName as string) ?? '',
              ssmRegistrationNo: (b.ssmRegistrationNo as string) ?? '',
              addressLine1: (b.addressLine1 as string) ?? '',
              addressLine2: (b.addressLine2 as string) ?? '',
              city: (b.city as string) ?? '',
              state: (b.state as string) ?? '',
              postcode: (b.postcode as string) ?? '',
              country: (b.country as string) ?? 'MY',
              bumiStatus: (b.bumiStatus as string) ?? '',
              authorizedRepName: (b.authorizedRepName as string) ?? '',
              authorizedRepIc: (b.authorizedRepIc as string) ?? '',
              companyPhone: (b.companyPhone as string) ?? '',
              companyEmail: (b.companyEmail as string) ?? '',
              natureOfBusiness: (b.natureOfBusiness as string) ?? '',
              dateOfIncorporation: (b.dateOfIncorporation as string) ? String(b.dateOfIncorporation).substring(0, 10) : '',
              paidUpCapital: b.paidUpCapital != null ? String(b.paidUpCapital) : '',
              numberOfEmployees: b.numberOfEmployees != null ? String(b.numberOfEmployees) : '',
              bankName: (b.bankName as string) ?? '',
              bankNameOther: (b.bankNameOther as string) ?? '',
              bankAccountNo: (b.bankAccountNo as string) ?? '',
              instagram: (b.instagram as string) ?? '',
              tiktok: (b.tiktok as string) ?? '',
              facebook: (b.facebook as string) ?? '',
              linkedin: (b.linkedin as string) ?? '',
              xTwitter: (b.xTwitter as string) ?? '',
            }));
          }
        }
      } catch { /* ignore */ } finally {
        setProfileLoaded(true);
      }
    })();
  }, [step, profileLoaded]);

  useEffect(() => {
    if (!selectedProduct) return;
    const current = parseInt(draft.term, 10);
    const allowed = (selectedProduct.allowedTerms ?? []).filter(
      (n): n is number => typeof n === 'number',
    );
    const interval =
      selectedProduct.termInterval && selectedProduct.termInterval > 0
        ? selectedProduct.termInterval
        : 1;
    const isValid =
      Number.isFinite(current) &&
      current >= selectedProduct.minTerm &&
      current <= selectedProduct.maxTerm &&
      (allowed.length > 0
        ? allowed.includes(current)
        : (current - selectedProduct.minTerm) % interval === 0);
    if (!isValid) {
      setDraft((d) => ({ ...d, term: String(selectedProduct.minTerm) }));
    }
  }, [selectedProduct]);

  useEffect(() => {
    if (step !== 1 || !selectedProduct || !draft.amount || !draft.term) {
      setPreview(null);
      return;
    }
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await applicationsClient.previewBorrowerApplication({
          productId: selectedProduct.id,
          amount: parseFloat(draft.amount),
          term: parseInt(draft.term, 10),
        });
        if (res.success) setPreview((res.data ?? null) as LoanPreviewData | null);
      } catch { /* ignore */ } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, [step, selectedProduct, draft.amount, draft.term]);

  useEffect(() => {
    if ((step !== 3 && step !== 4) || !draft.applicationId) return;
    void (async () => {
      try {
        const res = await applicationsClient.getBorrowerApplication(draft.applicationId!);
        if (res.success && res.data) setApplication(res.data as unknown as LoanApplicationDetail);
      } catch { /* ignore */ }
    })();
  }, [step, draft.applicationId]);

  async function handleBack() {
    if (step === 0) {
      router.back();
      return;
    }
    if (step === 2 && (profileSubStep as number) > 1) {
      const prev = (profileSubStep as number) - 1;
      setProfileSubStep(prev as IndividualSubStep);
      setErrors({});
      return;
    }
    const prevStep = step - 1;
    setStep(prevStep);
    setErrors({});
    const newDraft = { ...draft, step: prevStep };
    setDraft(newDraft);
    await saveLoanWizardDraft(newDraft);
  }
  async function advanceStep(newStep: number, updatedDraft?: Partial<LoanWizardDraft>) {
    const newDraft = { ...draft, ...updatedDraft, step: newStep };
    setDraft(newDraft);
    setStep(newStep);
    setErrors({});
    await saveLoanWizardDraft(newDraft);
  }

  async function handleSelectProduct(product: BorrowerProduct) {
    setSelectedProduct(product);
    await advanceStep(1, { productId: product.id, amount: '', term: '' });
  }

  async function handleLoanDetailsContinue() {
    if (!selectedProduct) return;
    const errs = validateLoanDetails(draft.amount, draft.term, selectedProduct, draft.collateralType, draft.collateralValue);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      let appId = draft.applicationId;
      const payload = {
        productId: selectedProduct.id,
        amount: parseFloat(draft.amount),
        term: parseInt(draft.term, 10),
        collateralType: draft.collateralType || undefined,
        collateralValue: draft.collateralValue ? parseFloat(draft.collateralValue) : undefined,
      };

      if (appId) {
        await applicationsClient.updateBorrowerApplication(appId, payload);
      } else {
        const res = await applicationsClient.createBorrowerApplication(payload);
        if (res.success && res.data) appId = (res.data as { id: string }).id;
      }

      if (!appId) throw new Error('Failed to create application');
      await advanceStep(2, { applicationId: appId });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save loan details');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProfileContinue() {
    let errs: Record<string, string> = {};
    if (borrowerType === 'INDIVIDUAL') {
      errs = validateIndividualFormStep(individualForm, profileSubStep as IndividualSubStep, noMonthlyIncome);
    } else {
      errs = validateCorporateFormStep(corporateForm, profileSubStep as CorporateSubStep);
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    if (borrowerType === 'INDIVIDUAL' && (profileSubStep as number) === 1) {
      setProfileSubStep(2 as IndividualSubStep);
      setErrors({});
      return;
    }

    if (borrowerType === 'CORPORATE') {
      const maxSubStep = 4;
      if ((profileSubStep as number) < maxSubStep) {
        setProfileSubStep(((profileSubStep as number) + 1) as CorporateSubStep);
        setErrors({});
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = buildOnboardingPayload({ borrowerType, individualFormData: individualForm, corporateFormData: corporateForm, noMonthlyIncome });
      await borrowerClient.updateBorrower(payload);
      await advanceStep(3, { profileSubStep: 1 });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save profile');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDocUpload(docKey: string) {
    if (!draft.applicationId) return;
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

      await applicationsClient.uploadApplicationDocument(draft.applicationId, formData);
      const res = await applicationsClient.getBorrowerApplication(draft.applicationId);
      if (res.success && res.data) setApplication(res.data as unknown as LoanApplicationDetail);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload file');
    } finally {
      setUploadingDoc(null);
    }
  }

  async function handleDocDelete(docId: string) {
    if (!draft.applicationId) return;
    try {
      await applicationsClient.deleteApplicationDocument(draft.applicationId, docId);
      const res = await applicationsClient.getBorrowerApplication(draft.applicationId);
      if (res.success && res.data) setApplication(res.data as unknown as LoanApplicationDetail);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not delete document');
    }
  }

  async function handleDocsContinue() {
    const required = (application?.product?.requiredDocuments ?? []) as { key: string; label: string; required: boolean }[];
    const uploaded = (application?.documents ?? []) as { id: string; category?: string }[];

    const missingRequired = required.filter(
      (r) => r.required && !uploaded.some((d) => d.category === r.key),
    );

    if (missingRequired.length > 0) {
      const labels = missingRequired.map((r) => `• ${r.label}`).join('\n');
      Alert.alert('Required documents missing', `Please upload:\n${labels}`);
      return;
    }

    const missingOptional = required.filter(
      (r) => !r.required && !uploaded.some((d) => d.category === r.key),
    );

    if (missingOptional.length > 0) {
      Alert.alert(
        'Optional documents not uploaded',
        `You haven't uploaded some optional documents. You can add them later from the application page.\n\nContinue anyway?`,
        [
          { text: 'Go back', style: 'cancel' },
          { text: 'Continue', onPress: () => void advanceStep(4) },
        ],
      );
      return;
    }

    await advanceStep(4);
  }

  async function handleSubmit() {
    if (!consented || !draft.applicationId) return;
    setSubmitting(true);
    try {
      await applicationsClient.submitBorrowerApplication(draft.applicationId);
      await clearLoanWizardDraft();
      router.replace('/applications' as never);
      toast.success('Application submitted', {
        description: 'We have received your application and will review it shortly.',
      });
    } catch (e) {
      toast.error('Submission failed', {
        description: e instanceof Error ? e.message : 'Could not submit application',
      });
    } finally {
      setSubmitting(false);
    }
  }

  function renderFooterButton(label: string, onPress: () => void, disabled = false) {
    return (
      <Pressable
        disabled={disabled || submitting}
        onPress={onPress}
        style={({ pressed }) => [
          styles.footerButton,
          {
            backgroundColor: disabled ? theme.border : theme.primary,
            opacity: pressed || submitting || disabled ? 0.7 : 1,
          },
        ]}>
        {submitting ? (
          <ActivityIndicator color={theme.primaryForeground} size="small" />
        ) : (
          <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
            {label}
          </ThemedText>
        )}
      </Pressable>
    );
  }

  function renderStep0() {
    if (productsLoading) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 64 }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      );
    }

    if (products.length === 0) {
      return (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ThemedText type="small" themeColor="textSecondary">No loan products available at this time.</ThemedText>
        </View>
      );
    }

    return (
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="small" themeColor="textSecondary">
          Select the loan product that best suits your needs.
        </ThemedText>
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            selected={selectedProduct?.id === p.id}
            onSelect={() => void handleSelectProduct(p)}
          />
        ))}
      </View>
    );
  }

  function renderStep1() {
    const isJadualK = (selectedProduct as unknown as { loanScheduleType?: string })?.loanScheduleType === 'JADUAL_K';
    const termMin = selectedProduct?.minTerm ?? 1;
    const termMax = selectedProduct?.maxTerm ?? 12;
    const termIntervalRaw = selectedProduct?.termInterval;
    const termStep = termIntervalRaw && termIntervalRaw > 0 ? termIntervalRaw : 1;
    const allowedTerms = selectedProduct?.allowedTerms
      ? [...new Set((selectedProduct.allowedTerms ?? []).filter((n): n is number => typeof n === 'number'))].sort(
          (a, b) => a - b,
        )
      : [];
    const parsedTerm = parseInt(draft.term, 10);
    const termValue = Number.isFinite(parsedTerm) ? parsedTerm : termMin;
    const formatMonths = (m: number) => `${m} ${m === 1 ? 'month' : 'months'}`;

    const amountTermComplete = selectedProduct
      ? isLoanAmountAndTermComplete(draft.amount, draft.term, selectedProduct)
      : false;
    const collateralComplete = selectedProduct
      ? isCollateralSectionComplete(selectedProduct, draft.collateralType, draft.collateralValue)
      : false;

    return (
      <View style={{ gap: Spacing.three }}>
        {selectedProduct ? <ProductInformationSection product={selectedProduct} /> : null}
        <SectionCard
          title="Loan amount & term"
          action={<SectionCompleteStatusRow complete={amountTermComplete} />}>
          <Field
            label={`Loan amount${selectedProduct ? ` (${formatCurrencyRM(selectedProduct.minAmount)} – ${formatCurrencyRM(selectedProduct.maxAmount)})` : ''}`}
            value={draft.amount}
            onChangeText={(v) => setDraft((d) => ({ ...d, amount: v }))}
            keyboardType="numeric"
            placeholder="e.g. 10000"
            error={errors.amount}
          />
          {selectedProduct ? (
            allowedTerms.length > 0 ? (
              <View style={{ gap: Spacing.one }}>
                <View style={styles.termHeaderRow}>
                  <ThemedText type="smallBold">Loan term</ThemedText>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    {draft.term ? formatMonths(termValue) : '—'}
                  </ThemedText>
                </View>
                <View style={styles.termChipWrap}>
                  {allowedTerms.map((m) => {
                    const selected = draft.term !== '' && termValue === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => {
                          setDraft((d) => ({ ...d, term: String(m) }));
                          if (errors.term) setErrors((e) => ({ ...e, term: '' }));
                        }}
                        style={({ pressed }) => [
                          styles.termChip,
                          {
                            borderColor: selected ? theme.primary : theme.border,
                            backgroundColor: selected ? theme.backgroundSelected : theme.background,
                            opacity: pressed ? 0.8 : 1,
                          },
                        ]}>
                        <ThemedText
                          type="smallBold"
                          style={{ color: selected ? theme.primary : theme.text }}>
                          {m} mo
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
                {errors.term ? (
                  <ThemedText type="small" style={{ color: theme.error }}>
                    {errors.term}
                  </ThemedText>
                ) : null}
              </View>
            ) : (
              <SliderField
                label="Loan term"
                value={termValue}
                onChange={(v) => setDraft((d) => ({ ...d, term: String(v) }))}
                min={termMin}
                max={termMax}
                step={termStep}
                formatValue={formatMonths}
                error={errors.term}
              />
            )
          ) : null}
        </SectionCard>

        {isJadualK && (
          <SectionCard
            title="Collateral"
            action={<SectionCompleteStatusRow complete={collateralComplete} />}>
            <Field
              label="Collateral type"
              value={draft.collateralType}
              onChangeText={(v) => setDraft((d) => ({ ...d, collateralType: v }))}
              placeholder="e.g. Land title"
              error={errors.collateralType}
            />
            <Field
              label="Collateral value (RM)"
              value={draft.collateralValue}
              onChangeText={(v) => setDraft((d) => ({ ...d, collateralValue: v }))}
              keyboardType="numeric"
              placeholder="e.g. 50000"
              error={errors.collateralValue}
            />
          </SectionCard>
        )}

        <PreviewPanel preview={preview} loading={previewLoading} />
      </View>
    );
  }

  function renderIndividualSubStep1() {
    const identityLocked = borrower
      ? isIndividualIdentityLocked(borrower as unknown as Parameters<typeof isIndividualIdentityLocked>[0])
      : false;
    const isIC = individualForm.documentType === 'IC';
    const personalComplete = isIndividualPersonalSectionComplete(individualForm, noMonthlyIncome);
    return (
      <View style={{ gap: Spacing.three }}>
        <SectionCard
          title="Identity & personal details"
          action={<SectionCompleteStatusRow complete={personalComplete} />}>
          {identityLocked ? (
            <>
              <IdentityEkycLockedCallout />
              <ReadOnlyField locked label="Full name" value={individualForm.name} />
              <ReadOnlyField
                locked
                label="Document type"
                value={formatOptionLabel('documentType', individualForm.documentType)}
              />
              <ReadOnlyField
                locked
                label="IC / Passport number"
                value={
                  isIC
                    ? formatICForDisplay(individualForm.icNumber)
                    : individualForm.icNumber
                }
              />
              <ReadOnlyField
                locked
                label="Date of birth"
                value={
                  individualForm.dateOfBirth ? formatDate(individualForm.dateOfBirth) : '—'
                }
              />
              <ReadOnlyField
                locked
                label="Gender"
                value={formatOptionLabel('gender', individualForm.gender)}
              />
            </>
          ) : (
            <>
              <Field
                label="Full name"
                value={individualForm.name}
                onChangeText={(v) => setIndividualForm((f) => ({ ...f, name: v }))}
                error={errors.name}
              />
              <OptionChipGroup
                label="Document type"
                value={individualForm.documentType}
                onChange={(v) => setIndividualForm((f) => ({ ...f, documentType: v }))}
                options={documentTypeOptions}
              />
              <Field
                label="IC / Passport number"
                value={individualForm.icNumber}
                onChangeText={(v) => {
                  const extracted = extractDateFromIC(v);
                  const gender = extractGenderFromIC(v);
                  setIndividualForm((f) => ({
                    ...f,
                    icNumber: v,
                    dateOfBirth: f.documentType === 'IC' ? (extracted || '') : f.dateOfBirth,
                    gender: f.documentType === 'IC' ? (gender || '') : f.gender,
                  }));
                }}
                keyboardType="numeric"
                error={errors.icNumber}
              />
              {isIC ? (
                <>
                  <ReadOnlyField
                    autoFilled
                    label="Date of birth"
                    value={individualForm.dateOfBirth ? formatDate(individualForm.dateOfBirth) : ''}
                    placeholder="Enter your IC number to auto-fill"
                    helperText="Derived from your IC number."
                  />
                  <ReadOnlyField
                    autoFilled
                    label="Gender"
                    value={
                      individualForm.gender
                        ? formatOptionLabel('gender', individualForm.gender)
                        : ''
                    }
                    placeholder="Enter your IC number to auto-fill"
                    helperText="Derived from your IC number."
                  />
                </>
              ) : (
                <>
                  <DatePickerField
                    label="Date of birth"
                    value={individualForm.dateOfBirth}
                    onChange={(v) => setIndividualForm((f) => ({ ...f, dateOfBirth: v }))}
                    error={errors.dateOfBirth}
                  />
                  <OptionChipGroup
                    label="Gender"
                    value={individualForm.gender}
                    onChange={(v) => setIndividualForm((f) => ({ ...f, gender: v }))}
                    options={genderOptions}
                    error={errors.gender}
                  />
                </>
              )}
            </>
          )}
          <SelectField
            label="Race"
            value={individualForm.race}
            onChange={(v) => setIndividualForm((f) => ({ ...f, race: v }))}
            options={raceOptions}
            error={errors.race}
          />
          <SelectField
            label="Education level"
            value={individualForm.educationLevel}
            onChange={(v) => setIndividualForm((f) => ({ ...f, educationLevel: v }))}
            options={educationOptions}
            error={errors.educationLevel}
          />
          <Field
            label="Occupation"
            value={individualForm.occupation}
            onChangeText={(v) => setIndividualForm((f) => ({ ...f, occupation: v }))}
            error={errors.occupation}
          />
          <SelectField
            label="Employment status"
            value={individualForm.employmentStatus}
            onChange={(v) => setIndividualForm((f) => ({ ...f, employmentStatus: v }))}
            options={employmentOptions}
            error={errors.employmentStatus}
          />
          <FormSwitchRow
            title="I don't have a monthly income"
            description="Toggle on if you are currently without a monthly income."
            value={noMonthlyIncome}
            onValueChange={setNoMonthlyIncome}
          />
          {!noMonthlyIncome && (
            <Field
              label="Monthly income (RM)"
              value={individualForm.monthlyIncome}
              onChangeText={(v) => setIndividualForm((f) => ({ ...f, monthlyIncome: v }))}
              keyboardType="numeric"
              error={errors.monthlyIncome}
            />
          )}
        </SectionCard>
      </View>
    );
  }

  function renderIndividualSubStep2() {
    const stateOptions = getStateOptions(individualForm.country);
    const countryOptions = getCountryOptions();
    const contactComplete = isIndividualContactSectionComplete(individualForm);
    const addressComplete = isIndividualAddressSectionComplete(individualForm);
    const bankComplete = isIndividualBankSectionComplete(individualForm);
    return (
      <View style={{ gap: Spacing.three }}>
        <SectionCard
          title="Contact details"
          action={<SectionCompleteStatusRow complete={contactComplete} />}>
          <PhoneField
            label="Phone number"
            value={individualForm.phone}
            onChangeText={(v) => setIndividualForm((f) => ({ ...f, phone: v }))}
            error={errors.phone}
          />
          <Field
            label="Email address"
            value={individualForm.email}
            onChangeText={(v) => setIndividualForm((f) => ({ ...f, email: v }))}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />
        </SectionCard>
        <SectionCard
          title="Address"
          action={<SectionCompleteStatusRow complete={addressComplete} />}>
          <Field
            label="Address line 1"
            value={individualForm.addressLine1}
            onChangeText={(v) => setIndividualForm((f) => ({ ...f, addressLine1: v }))}
            error={errors.addressLine1}
          />
          <Field
            label="Address line 2 (optional)"
            value={individualForm.addressLine2}
            onChangeText={(v) => setIndividualForm((f) => ({ ...f, addressLine2: v }))}
          />
          <Field
            label="City"
            value={individualForm.city}
            onChangeText={(v) => setIndividualForm((f) => ({ ...f, city: v }))}
            error={errors.city}
          />
          <SelectField
            label="Country"
            value={individualForm.country}
            onChange={(v) => setIndividualForm((f) => ({ ...f, country: v, state: '' }))}
            options={countryOptions}
            searchable
            error={errors.country}
          />
          {stateOptions.length > 0 ? (
            <SelectField
              label="State"
              value={individualForm.state}
              onChange={(v) => setIndividualForm((f) => ({ ...f, state: v }))}
              options={stateOptions}
              error={errors.state}
            />
          ) : (
            <Field
              label="State / Province"
              value={individualForm.state}
              onChangeText={(v) => setIndividualForm((f) => ({ ...f, state: v }))}
              error={errors.state}
            />
          )}
          <Field
            label="Postcode"
            value={individualForm.postcode}
            onChangeText={(v) => setIndividualForm((f) => ({ ...f, postcode: v }))}
            keyboardType="numeric"
            error={errors.postcode}
          />
        </SectionCard>
        <SectionCard
          title="Bank details"
          action={<SectionCompleteStatusRow complete={bankComplete} />}>
          <SelectField
            label="Bank"
            value={individualForm.bankName}
            onChange={(v) => setIndividualForm((f) => ({ ...f, bankName: v }))}
            options={bankOptions}
            searchable
            error={errors.bankName}
          />
          {individualForm.bankName === 'OTHER' && (
            <Field
              label="Bank name"
              value={individualForm.bankNameOther}
              onChangeText={(v) => setIndividualForm((f) => ({ ...f, bankNameOther: v }))}
              error={errors.bankNameOther}
            />
          )}
          <Field
            label="Account number"
            value={individualForm.bankAccountNo}
            onChangeText={(v) => setIndividualForm((f) => ({ ...f, bankAccountNo: v }))}
            keyboardType="numeric"
            error={errors.bankAccountNo}
          />
        </SectionCard>
        <SectionCard
          title="Emergency contact"
          action={
            <SectionOptionalStatusRow
              complete={isIndividualEmergencyContactComplete(individualForm)}
            />
          }
          collapsible
          defaultExpanded={false}>
          <Field
            label="Contact name"
            value={individualForm.emergencyContactName}
            onChangeText={(v) => setIndividualForm((f) => ({ ...f, emergencyContactName: v }))}
          />
          <Field
            label="Contact phone"
            value={individualForm.emergencyContactPhone}
            onChangeText={(v) => setIndividualForm((f) => ({ ...f, emergencyContactPhone: v }))}
            keyboardType="phone-pad"
          />
          <SelectField
            label="Relationship"
            value={individualForm.emergencyContactRelationship}
            onChange={(v) => setIndividualForm((f) => ({ ...f, emergencyContactRelationship: v }))}
            options={relationshipOptions}
          />
        </SectionCard>
      </View>
    );
  }

  function renderStep2() {
    if (!profileLoaded) {
      return (
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      );
    }
    if (borrowerType === 'INDIVIDUAL') {
      return (profileSubStep as number) === 1 ? renderIndividualSubStep1() : renderIndividualSubStep2();
    }
    return renderCorporateSubStep();
  }

  function renderCorporateSubStep() {
    const stateOptions = getStateOptions(corporateForm.country);
    const countryOptions = getCountryOptions();

    if ((profileSubStep as number) === 1) {
      const companyComplete = isCorporateCompanySectionComplete(corporateForm);
      const corporateAddressComplete = isCorporateAddressSectionComplete(corporateForm);
      return (
        <View style={{ gap: Spacing.three }}>
          <SectionCard
            title="Company details"
            action={<SectionCompleteStatusRow complete={companyComplete} />}>
            <Field label="Company name" value={corporateForm.companyName} onChangeText={(v) => setCorporateForm((f) => ({ ...f, companyName: v }))} error={errors.companyName} />
            <Field label="SSM registration no." value={corporateForm.ssmRegistrationNo} onChangeText={(v) => setCorporateForm((f) => ({ ...f, ssmRegistrationNo: v }))} error={errors.ssmRegistrationNo} />
            <SelectField label="Bumiputera status" value={corporateForm.bumiStatus} onChange={(v) => setCorporateForm((f) => ({ ...f, bumiStatus: v }))} options={bumiStatusOptions} error={errors.bumiStatus} />
          </SectionCard>
          <SectionCard
            title="Registered address"
            action={<SectionCompleteStatusRow complete={corporateAddressComplete} />}>
            <Field label="Address line 1" value={corporateForm.addressLine1} onChangeText={(v) => setCorporateForm((f) => ({ ...f, addressLine1: v }))} error={errors.addressLine1} />
            <Field label="Address line 2 (optional)" value={corporateForm.addressLine2} onChangeText={(v) => setCorporateForm((f) => ({ ...f, addressLine2: v }))} />
            <Field label="City" value={corporateForm.city} onChangeText={(v) => setCorporateForm((f) => ({ ...f, city: v }))} error={errors.city} />
            <SelectField label="Country" value={corporateForm.country} onChange={(v) => setCorporateForm((f) => ({ ...f, country: v, state: '' }))} options={countryOptions} searchable />
            {stateOptions.length > 0 ? (
              <SelectField label="State" value={corporateForm.state} onChange={(v) => setCorporateForm((f) => ({ ...f, state: v }))} options={stateOptions} error={errors.state} />
            ) : (
              <Field label="State / Province" value={corporateForm.state} onChangeText={(v) => setCorporateForm((f) => ({ ...f, state: v }))} error={errors.state} />
            )}
            <Field label="Postcode" value={corporateForm.postcode} onChangeText={(v) => setCorporateForm((f) => ({ ...f, postcode: v }))} keyboardType="numeric" error={errors.postcode} />
          </SectionCard>
        </View>
      );
    }

    if ((profileSubStep as number) === 2) {
      return (
        <SectionCard
          title="Company contact"
          action={<SectionCompleteStatusRow complete={isCorporateContactSectionComplete(corporateForm)} />}>
          <Field label="Company phone" value={corporateForm.companyPhone} onChangeText={(v) => setCorporateForm((f) => ({ ...f, companyPhone: v }))} keyboardType="phone-pad" error={errors.companyPhone} />
          <Field label="Company email" value={corporateForm.companyEmail} onChangeText={(v) => setCorporateForm((f) => ({ ...f, companyEmail: v }))} keyboardType="email-address" autoCapitalize="none" error={errors.companyEmail} />
        </SectionCard>
      );
    }

    if ((profileSubStep as number) === 3) {
      return (
        <SectionCard
          title="Directors"
          action={<SectionCompleteStatusRow complete={isCorporateDirectorsSectionComplete(corporateForm)} />}>
          {errors.directors ? (
            <ThemedText type="small" style={{ color: theme.error }}>{errors.directors}</ThemedText>
          ) : null}
          {corporateForm.directors.map((dir, i) => (
            <View key={i} style={[styles.directorRow, { borderColor: theme.border }]}>
              <View style={styles.directorRowHeader}>
                <ThemedText type="smallBold">Director {i + 1}</ThemedText>
                {corporateForm.directors.length > 1 && (
                  <Pressable
                    onPress={() => setCorporateForm((f) => ({ ...f, directors: f.directors.filter((_, idx) => idx !== i) }))}>
                    <MaterialIcons name="remove-circle-outline" size={20} color={theme.error} />
                  </Pressable>
                )}
              </View>
              <Field
                label="Full name"
                value={dir.name}
                onChangeText={(v) => setCorporateForm((f) => ({ ...f, directors: f.directors.map((d, idx) => idx === i ? { ...d, name: v } : d) }))}
                error={errors[`directorName_${i}`]}
              />
              <Field
                label="IC number"
                value={dir.icNumber}
                onChangeText={(v) => setCorporateForm((f) => ({ ...f, directors: f.directors.map((d, idx) => idx === i ? { ...d, icNumber: v } : d) }))}
                keyboardType="numeric"
                error={errors[`directorIc_${i}`]}
              />
              <Field
                label="Position (optional)"
                value={dir.position}
                onChangeText={(v) => setCorporateForm((f) => ({ ...f, directors: f.directors.map((d, idx) => idx === i ? { ...d, position: v } : d) }))}
              />
              <FormSwitchRow
                title="Authorized representative"
                description="Mark this director as the authorized representative."
                value={dir.isAuthorizedRepresentative}
                onValueChange={(v) => setCorporateForm((f) => ({
                  ...f,
                  directors: f.directors.map((d, idx) => ({
                    ...d,
                    isAuthorizedRepresentative: idx === i ? v : v ? false : d.isAuthorizedRepresentative,
                  })),
                }))}
              />
            </View>
          ))}
          {corporateForm.directors.length < 10 && (
            <Pressable
              onPress={() => setCorporateForm((f) => ({ ...f, directors: [...f.directors, { name: '', icNumber: '', position: '', isAuthorizedRepresentative: false }] }))}
              style={({ pressed }) => [styles.addDirectorButton, { borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="add" size={18} color={theme.primary} />
              <ThemedText type="small" style={{ color: theme.primary }}>Add director</ThemedText>
            </Pressable>
          )}
        </SectionCard>
      );
    }

    if ((profileSubStep as number) === 4) {
      return (
        <SectionCard
          title="Bank details"
          action={<SectionCompleteStatusRow complete={isCorporateBankSectionComplete(corporateForm)} />}>
          <SelectField label="Bank" value={corporateForm.bankName} onChange={(v) => setCorporateForm((f) => ({ ...f, bankName: v }))} options={bankOptions} searchable error={errors.bankName} />
          {corporateForm.bankName === 'OTHER' && (
            <Field label="Bank name" value={corporateForm.bankNameOther} onChangeText={(v) => setCorporateForm((f) => ({ ...f, bankNameOther: v }))} error={errors.bankNameOther} />
          )}
          <Field label="Account number" value={corporateForm.bankAccountNo} onChangeText={(v) => setCorporateForm((f) => ({ ...f, bankAccountNo: v }))} keyboardType="numeric" error={errors.bankAccountNo} />
        </SectionCard>
      );
    }

    return null;
  }

  function renderStep3() {
    const requiredDocs = (application?.product?.requiredDocuments ?? []) as { key: string; label: string; required: boolean }[];
    const uploaded = (application?.documents ?? []) as { id: string; category?: string }[];
    const requiredOnly = requiredDocs.filter((d) => d.required);
    const docsComplete =
      requiredOnly.length === 0 ||
      requiredOnly.every((d) => uploaded.some((u) => u.category === d.key));

    if (requiredDocs.length === 0) {
      return (
        <SectionCard
          title="Supporting documents"
          action={<SectionCompleteStatusRow complete />}>
          <ThemedText type="small" themeColor="textSecondary">
            No documents required for this product.
          </ThemedText>
        </SectionCard>
      );
    }

    return (
      <SectionCard
        title="Supporting documents"
        description="Upload the required documents for your application."
        action={<SectionCompleteStatusRow complete={docsComplete} />}>
        {requiredDocs.map((doc) => {
          const uploadedDoc = uploaded.find((d) => d.category === doc.key);
          return (
            <DocRow
              key={doc.key}
              label={doc.label}
              required={doc.required}
              uploaded={Boolean(uploadedDoc)}
              uploading={uploadingDoc === doc.key}
              onUpload={() => void handleDocUpload(doc.key)}
              onDelete={() => uploadedDoc ? void handleDocDelete(uploadedDoc.id) : undefined}
            />
          );
        })}
      </SectionCard>
    );
  }

  function renderStep4() {
    const app = application;
    const reviewDocs = (app?.product?.requiredDocuments ?? []) as { key: string; label: string; required: boolean }[];
    const uploadedDocs = (app?.documents ?? []) as { id: string; category?: string }[];
    const missingRequired = reviewDocs.filter((r) => r.required && !uploadedDocs.some((d) => d.category === r.key));
    const uploadedCount = uploadedDocs.filter((d) => reviewDocs.some((r) => r.key === d.category)).length;
    const borrowerName = (borrower as unknown as { name?: string }).name ?? '—';

    const productForSummary = (app?.product ?? selectedProduct) as BorrowerProduct | null;
    const monthlyR = productForSummary ? formatProductMonthlyInterestPercent(productForSummary.interestRate) : '—';
    const annualR = productForSummary ? formatProductAnnualRateDisplay(productForSummary.interestRate) : '—';
    const interestSummary =
      !productForSummary || monthlyR === '—'
        ? '—'
        : annualR === '—'
          ? `${monthlyR}% / month`
          : `${monthlyR}% / month (${annualR}% p.a.)`;
    const schedSummary = productForSummary
      ? productUsesCollateral(productForSummary)
        ? 'Jadual K'
        : 'Jadual J'
      : '—';
    const securitySummary = productForSummary
      ? productUsesCollateral(productForSummary)
        ? 'Collateral'
        : 'No collateral'
      : '—';

    return (
      <View style={{ gap: Spacing.three }}>
        {missingRequired.length > 0 && (
          <View style={[styles.warningBanner, { backgroundColor: theme.error + '18', borderColor: theme.error + '44' }]}>
            <MaterialIcons name="warning" size={16} color={theme.error} />
            <ThemedText type="small" style={{ color: theme.error, flex: 1 }}>
              Required documents are missing. Go back to upload all required documents.
            </ThemedText>
          </View>
        )}

        <SectionCard title="Loan details">
          {[
            { label: 'Product', value: app?.product?.name ?? selectedProduct?.name ?? '—' },
            { label: 'Interest', value: interestSummary },
            { label: 'Schedule', value: schedSummary },
            { label: 'Security', value: securitySummary },
            { label: 'Amount', value: formatCurrencyRM(app?.amount ?? draft.amount) },
            { label: 'Term', value: `${app?.term ?? draft.term} months` },
          ].map((row) => (
            <View key={row.label} style={styles.reviewRow}>
              <ThemedText type="small" themeColor="textSecondary">{row.label}</ThemedText>
              <ThemedText type="smallBold">{row.value}</ThemedText>
            </View>
          ))}
        </SectionCard>

        {preview && (
          <SectionCard title="Estimated fees" collapsible defaultExpanded>
            {[
              {
                label: 'Interest rate',
                value: `${Number((preview as unknown as { interestRate?: number }).interestRate ?? 0).toFixed(2)}% p.a. (${String((preview as unknown as { interestModel?: string }).interestModel ?? '')})`,
              },
              { label: 'Monthly payment', value: formatCurrencyRM(preview.monthlyPayment) },
              { label: 'Legal fee', value: formatCurrencyRM((preview as unknown as { legalFee?: unknown }).legalFee) },
              { label: 'Stamping fee', value: formatCurrencyRM((preview as unknown as { stampingFee?: unknown }).stampingFee) },
              { label: 'Net disbursement', value: formatCurrencyRM(preview.netDisbursement) },
              { label: 'Total payable', value: formatCurrencyRM(preview.totalPayable) },
            ].map((row) => (
              <View key={row.label} style={styles.reviewRow}>
                <ThemedText type="small" themeColor="textSecondary">{row.label}</ThemedText>
                <ThemedText type="smallBold">{row.value}</ThemedText>
              </View>
            ))}
          </SectionCard>
        )}

        {borrower && (
          <SectionCard
            title="Borrower information"
            collapsible
            defaultExpanded={false}
            collapsedSummary={borrowerName}>
            {[
              { label: 'Name', value: borrowerName },
              { label: 'IC / Passport', value: (borrower as unknown as { icNumber?: string }).icNumber ?? '—' },
              { label: 'Phone', value: (borrower as unknown as { phone?: string }).phone ?? '—' },
              { label: 'Email', value: (borrower as unknown as { email?: string }).email ?? '—' },
            ].map((row) => (
              <View key={row.label} style={styles.reviewRow}>
                <ThemedText type="small" themeColor="textSecondary">{row.label}</ThemedText>
                <ThemedText type="smallBold">{row.value}</ThemedText>
              </View>
            ))}
          </SectionCard>
        )}

        {reviewDocs.length > 0 && (
          <SectionCard
            title="Documents"
            collapsible
            defaultExpanded={missingRequired.length > 0}
            collapsedSummary={`${uploadedCount} / ${reviewDocs.length} uploaded`}>
            {reviewDocs.map((doc) => {
              const isUploaded = uploadedDocs.some((d) => d.category === doc.key);
              return (
                <View key={doc.key} style={styles.reviewRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flex: 1 }}>
                    <MaterialIcons
                      name={isUploaded ? 'check-circle' : 'cancel'}
                      size={16}
                      color={isUploaded ? theme.success : doc.required ? theme.error : theme.textSecondary}
                    />
                    <ThemedText type="small">{doc.label}</ThemedText>
                  </View>
                  <ThemedText
                    type="small"
                    style={{ color: isUploaded ? theme.success : doc.required ? theme.error : theme.textSecondary }}>
                    {isUploaded ? 'Uploaded' : doc.required ? 'Missing' : 'Optional'}
                  </ThemedText>
                </View>
              );
            })}
          </SectionCard>
        )}

        <ConsentCheckbox checked={consented} onToggle={() => setConsented((v) => !v)} />
      </View>
    );
  }

  function getFooterButton() {
    switch (step) {
      case 0: return null;
      case 1: return renderFooterButton('Continue', () => void handleLoanDetailsContinue());
      case 2: return renderFooterButton(
        borrowerType === 'INDIVIDUAL' && (profileSubStep as number) === 1 ? 'Next: Contact & Banking' : 'Continue',
        () => void handleProfileContinue(),
      );
      case 3: return renderFooterButton('Continue', () => void handleDocsContinue());
      case 4: return renderFooterButton('Submit Application', () => void handleSubmit(), !consented);
      default: return null;
    }
  }

  return (
    <PageScreen
      title="Apply for a Loan"
      showBackButton
      onBack={() => void handleBack()}
      stickyFooter={getFooterButton() ?? undefined}>
      <StepperBar currentStep={step} />
      {step === 0 && renderStep0()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
    </PageScreen>
  );
}

const stepperStyles = StyleSheet.create({
  wrapper: {
    paddingBottom: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepCol: {
    flex: 2,
    alignItems: 'center',
    gap: Spacing.one,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  stepLabel: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },
  connectorWrap: {
    flex: 1,
    paddingTop: 14,
  },
  connector: {
    width: '100%',
    height: 0,
    borderTopWidth: 1.5,
  },
});

const styles = StyleSheet.create({
  productCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  productCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewPanel: {
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 18,
  },
  footerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two + 4,
    borderRadius: 14,
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
    alignItems: 'center',
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
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.two + 2,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  directorRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  directorRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addDirectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
  },
  termHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  termChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  termChip: {
    minWidth: 64,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
});
