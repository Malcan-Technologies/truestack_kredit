import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import {
  DatePickerField,
  Field,
  FormSwitchRow,
  OptionChipGroup,
  ReadOnlyField,
  SelectField,
} from "@/components/borrower-form-fields";
import { PageScreen } from "@/components/page-screen";
import { SectionCard } from "@/components/section-card";
import {
  SectionCompleteStatusRow,
  SectionOptionalStatusRow,
} from "@/components/verified-status-row";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { borrowerAuthClient } from "@/lib/api/borrower";
import { getCountryOptions, getStateOptions } from "@/lib/address-options";
import {
  bankOptions,
  borrowerTypeCards,
  buildOnboardingPayload,
  bumiStatusOptions,
  clearOnboardingDraft,
  documentTypeOptions,
  educationOptions,
  employmentOptions,
  extractDateFromIC,
  extractGenderFromIC,
  genderOptions,
  getOnboardingTotalSteps,
  getSavedDraftProgressLabel,
  initialCorporateFormData,
  initialIndividualFormData,
  isCorporateSocialMediaComplete,
  isIndividualEmergencyContactComplete,
  isIndividualSocialMediaComplete,
  loadOnboardingDraft,
  raceOptions,
  relationshipOptions,
  saveOnboardingDraft,
  setOnboardingDismissed,
  type BorrowerDetailSubStep,
  type BorrowerType,
  type CorporateDirector,
  type CorporateFormData,
  type CorporateSubStep,
  type IndividualFormData,
  type IndividualSubStep,
  type OnboardingMainStep,
  validateCorporateForm,
  validateCorporateFormStep,
  validateIndividualForm,
  validateIndividualFormStep,
} from "@/lib/onboarding";
import {
  formatAddressValue,
  formatBankLabel,
  formatCurrency,
  formatOptionLabel,
  normalizeDisplayValue,
} from "@/lib/format/borrower";
import { formatDate } from "@/lib/format/date";

type ButtonVariant = "primary" | "outline" | "ghost";

type ReviewRowProps = {
  label: string;
  value: string;
};

const GUIDED_TITLES: Record<
  BorrowerType,
  Record<number, { title: string; description: string }>
> = {
  INDIVIDUAL: {
    1: {
      title: "Tell us about yourself",
      description:
        "We'll need your identity and personal details to get started.",
    },
    2: {
      title: "How can we reach you?",
      description: "Add your contact information and bank account details.",
    },
    3: {
      title: "A few more details",
      description:
        "Emergency contact and social media are optional but helpful.",
    },
  },
  CORPORATE: {
    1: {
      title: "Tell us about your company",
      description: "Basic company registration and address details.",
    },
    2: {
      title: "A bit more about the business",
      description: "Additional company details and contact information.",
    },
    3: {
      title: "Who runs the show?",
      description: "Add your company directors and authorized representative.",
    },
    4: {
      title: "Where should funds go?",
      description: "Your company's bank account details.",
    },
    5: {
      title: "Stay connected",
      description: "Social media profiles are optional but help build trust.",
    },
  },
};

function ActionButton({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
}) {
  const theme = useTheme();

  const palette = useMemo(() => {
    if (variant === "outline") {
      return {
        backgroundColor: theme.background,
        borderColor: theme.border,
        textColor: theme.text,
      };
    }

    if (variant === "ghost") {
      return {
        backgroundColor: theme.backgroundElement,
        borderColor: "transparent",
        textColor: theme.textSecondary,
      };
    }

    return {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
      textColor: theme.primaryForeground,
    };
  }, [theme, variant]);

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => void onPress()}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          opacity: pressed || disabled || loading ? 0.7 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.textColor} size="small" />
      ) : (
        <ThemedText type="smallBold" style={{ color: palette.textColor }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

function ProgressBar({
  borrowerType,
  step,
  subStep,
}: {
  borrowerType: BorrowerType;
  step: OnboardingMainStep;
  subStep: BorrowerDetailSubStep;
}) {
  const theme = useTheme();
  const totalSteps = getOnboardingTotalSteps(borrowerType);
  const activeIndex = step === 3 ? totalSteps - 1 : step === 2 ? subStep : 0;
  const percent =
    totalSteps > 1 ? Math.round((activeIndex / (totalSteps - 1)) * 100) : 0;

  return (
    <View style={styles.progressWrap}>
      <View style={styles.rowBetween}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          {`Step ${activeIndex + 1} of ${totalSteps}`}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {step === 1
            ? "Choose type"
            : step === 3
              ? "Review & confirm"
              : GUIDED_TITLES[borrowerType][subStep].title}
        </ThemedText>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${percent}%`,
              backgroundColor: theme.primary,
            },
          ]}
        />
      </View>
    </View>
  );
}

function ReviewRow({ label, value }: ReviewRowProps) {
  return (
    <View style={styles.reviewRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default">{value}</ThemedText>
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profileCount, setProfileCount] = useState(0);
  const [hasIndividual, setHasIndividual] = useState(false);
  const [step, setStep] = useState<OnboardingMainStep>(0);
  const [resumeStep, setResumeStep] = useState<1 | 2 | 3>(1);
  const [borrowerType, setBorrowerType] = useState<BorrowerType>("INDIVIDUAL");
  const [borrowerDetailSubStep, setBorrowerDetailSubStep] =
    useState<BorrowerDetailSubStep>(1);
  const [individualFormData, setIndividualFormData] =
    useState<IndividualFormData>(initialIndividualFormData);
  const [corporateFormData, setCorporateFormData] = useState<CorporateFormData>(
    initialCorporateFormData,
  );
  const [noMonthlyIncome, setNoMonthlyIncome] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const countryOptions = useMemo(() => getCountryOptions(), []);
  const individualStateOptions = useMemo(
    () => getStateOptions(individualFormData.country),
    [individualFormData.country],
  );
  const corporateStateOptions = useMemo(
    () => getStateOptions(corporateFormData.country),
    [corporateFormData.country],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const [draft, meResult] = await Promise.all([
        loadOnboardingDraft(),
        borrowerAuthClient.fetchBorrowerMe().catch(() => null),
      ]);

      if (cancelled) {
        return;
      }

      if (draft) {
        const nextResumeStep = draft.step === 0 ? 1 : (draft.step as 1 | 2 | 3);
        setResumeStep(nextResumeStep);
        setStep(draft.step);
        setBorrowerType(draft.borrowerType);
        setBorrowerDetailSubStep(draft.borrowerDetailSubStep);
        setIndividualFormData(draft.individualFormData);
        setCorporateFormData(draft.corporateFormData);
        setNoMonthlyIncome(draft.noMonthlyIncome);
      }

      if (meResult?.success) {
        setProfileCount(meResult.data.profileCount);
        setHasIndividual(
          meResult.data.profiles.some(
            (profile) => profile.borrowerType === "INDIVIDUAL",
          ),
        );
      }

      setHydrated(true);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const timer = setTimeout(() => {
      void saveOnboardingDraft({
        step,
        borrowerType,
        borrowerDetailSubStep,
        individualFormData,
        corporateFormData,
        noMonthlyIncome,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [
    borrowerDetailSubStep,
    borrowerType,
    corporateFormData,
    hydrated,
    individualFormData,
    noMonthlyIncome,
    step,
  ]);

  const clearError = useCallback((key: string) => {
    setValidationErrors((current) => {
      if (!(key in current)) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const handleBorrowerTypeChange = useCallback((type: BorrowerType) => {
    setBorrowerType(type);
    setBorrowerDetailSubStep(1);
    setValidationErrors({});
    if (type === "INDIVIDUAL") {
      setNoMonthlyIncome(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const errors =
      borrowerType === "INDIVIDUAL"
        ? validateIndividualForm(individualFormData, noMonthlyIncome)
        : validateCorporateForm(corporateFormData);

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      Alert.alert(
        "Missing required fields",
        "Please complete the required onboarding fields.",
      );
      return;
    }

    setLoading(true);

    try {
      await borrowerAuthClient.submitOnboarding(
        buildOnboardingPayload({
          borrowerType,
          individualFormData,
          corporateFormData,
          noMonthlyIncome,
        }),
      );
      await clearOnboardingDraft();
      await setOnboardingDismissed(false);
      router.replace("/borrower-profile");
    } catch (error) {
      Alert.alert(
        "Unable to create profile",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    borrowerType,
    corporateFormData,
    individualFormData,
    noMonthlyIncome,
    router,
  ]);

  const currentGuide =
    step === 2 ? GUIDED_TITLES[borrowerType][borrowerDetailSubStep] : null;
  const totalSubSteps = borrowerType === "INDIVIDUAL" ? 3 : 5;
  const isOptionalSubStep =
    step === 2 &&
    !!currentGuide &&
    ((borrowerType === "INDIVIDUAL" && borrowerDetailSubStep === 3) ||
      (borrowerType === "CORPORATE" && borrowerDetailSubStep === 5));
  const subStepComplete = (() => {
    if (step !== 2 || !currentGuide) return false;
    if (borrowerType === "INDIVIDUAL") {
      if (borrowerDetailSubStep === 3) {
        return (
          isIndividualEmergencyContactComplete(individualFormData) &&
          isIndividualSocialMediaComplete(individualFormData)
        );
      }
      return (
        Object.keys(
          validateIndividualFormStep(
            individualFormData,
            borrowerDetailSubStep as IndividualSubStep,
            noMonthlyIncome,
          ),
        ).length === 0
      );
    }
    if (borrowerDetailSubStep === 5) {
      return isCorporateSocialMediaComplete(corporateFormData);
    }
    return (
      Object.keys(
        validateCorporateFormStep(
          corporateFormData,
          borrowerDetailSubStep as CorporateSubStep,
        ),
      ).length === 0
    );
  })();
  const draftProgress = useMemo(
    () =>
      getSavedDraftProgressLabel({
        step,
        borrowerType,
        borrowerDetailSubStep,
        individualFormData,
        corporateFormData,
        noMonthlyIncome,
      }),
    [
      borrowerDetailSubStep,
      borrowerType,
      corporateFormData,
      individualFormData,
      noMonthlyIncome,
      step,
    ],
  );
  const isIndividualIC = individualFormData.documentType === "IC";
  const derivedDateOfBirth = isIndividualIC
    ? extractDateFromIC(individualFormData.icNumber)
    : null;
  const derivedGender = isIndividualIC
    ? extractGenderFromIC(individualFormData.icNumber)
    : null;
  const dateOfBirthValue =
    individualFormData.dateOfBirth ||
    (isIndividualIC && derivedDateOfBirth ? derivedDateOfBirth : "");
  const genderValue =
    individualFormData.gender ||
    (isIndividualIC && derivedGender ? derivedGender : "");

  const reviewSections = useMemo(() => {
    if (borrowerType === "INDIVIDUAL") {
      return [
        {
          title: "Identity information",
          rows: [
            {
              label: "Name",
              value: normalizeDisplayValue(individualFormData.name),
            },
            {
              label: "Document type",
              value: formatOptionLabel(
                "documentType",
                individualFormData.documentType,
              ),
            },
            {
              label: "IC / Passport",
              value: normalizeDisplayValue(individualFormData.icNumber),
            },
          ],
        },
        {
          title: "Personal information",
          rows: [
            {
              label: "Date of birth",
              value: formatDate(individualFormData.dateOfBirth),
            },
            {
              label: "Gender",
              value: formatOptionLabel("gender", individualFormData.gender),
            },
            {
              label: "Race",
              value: formatOptionLabel("race", individualFormData.race),
            },
            {
              label: "Education",
              value: formatOptionLabel(
                "educationLevel",
                individualFormData.educationLevel,
              ),
            },
            {
              label: "Occupation",
              value: normalizeDisplayValue(individualFormData.occupation),
            },
            {
              label: "Employment status",
              value: formatOptionLabel(
                "employmentStatus",
                individualFormData.employmentStatus,
              ),
            },
            {
              label: "Monthly income",
              value: noMonthlyIncome
                ? "No monthly income"
                : formatCurrency(individualFormData.monthlyIncome),
            },
          ],
        },
        {
          title: "Contact information",
          rows: [
            {
              label: "Phone",
              value: normalizeDisplayValue(individualFormData.phone),
            },
            {
              label: "Email",
              value: normalizeDisplayValue(individualFormData.email),
            },
            { label: "Address", value: formatAddressValue(individualFormData) },
          ],
        },
        {
          title: "Bank information",
          rows: [
            {
              label: "Bank",
              value: formatBankLabel(
                individualFormData.bankName,
                individualFormData.bankNameOther,
              ),
            },
            {
              label: "Account number",
              value: normalizeDisplayValue(individualFormData.bankAccountNo),
            },
          ],
        },
        {
          title: "Emergency contact",
          rows: [
            {
              label: "Name",
              value: normalizeDisplayValue(
                individualFormData.emergencyContactName,
              ),
            },
            {
              label: "Phone",
              value: normalizeDisplayValue(
                individualFormData.emergencyContactPhone,
              ),
            },
            {
              label: "Relationship",
              value: formatOptionLabel(
                "emergencyContactRelationship",
                individualFormData.emergencyContactRelationship,
              ),
            },
          ],
        },
        {
          title: "Social media",
          rows: [
            {
              label: "Instagram",
              value: normalizeDisplayValue(individualFormData.instagram),
            },
            {
              label: "TikTok",
              value: normalizeDisplayValue(individualFormData.tiktok),
            },
            {
              label: "Facebook",
              value: normalizeDisplayValue(individualFormData.facebook),
            },
            {
              label: "LinkedIn",
              value: normalizeDisplayValue(individualFormData.linkedin),
            },
            {
              label: "X (Twitter)",
              value: normalizeDisplayValue(individualFormData.xTwitter),
            },
          ],
        },
      ];
    }

    return [
      {
        title: "Company information",
        rows: [
          {
            label: "Company name",
            value: normalizeDisplayValue(corporateFormData.companyName),
          },
          {
            label: "SSM registration no",
            value: normalizeDisplayValue(corporateFormData.ssmRegistrationNo),
          },
          {
            label: "Taraf (Bumi status)",
            value: formatOptionLabel(
              "bumiStatus",
              corporateFormData.bumiStatus,
            ),
          },
          {
            label: "Nature of business",
            value: normalizeDisplayValue(corporateFormData.natureOfBusiness),
          },
          {
            label: "Date of incorporation",
            value: formatDate(corporateFormData.dateOfIncorporation),
          },
          { label: "Address", value: formatAddressValue(corporateFormData) },
        ],
      },
      {
        title: "Company contact",
        rows: [
          {
            label: "Phone",
            value: normalizeDisplayValue(corporateFormData.companyPhone),
          },
          {
            label: "Email",
            value: normalizeDisplayValue(corporateFormData.companyEmail),
          },
          {
            label: "Paid-up capital",
            value: formatCurrency(corporateFormData.paidUpCapital),
          },
          {
            label: "Employees",
            value: normalizeDisplayValue(corporateFormData.numberOfEmployees),
          },
        ],
      },
      {
        title: "Bank information",
        rows: [
          {
            label: "Bank",
            value: formatBankLabel(
              corporateFormData.bankName,
              corporateFormData.bankNameOther,
            ),
          },
          {
            label: "Account number",
            value: normalizeDisplayValue(corporateFormData.bankAccountNo),
          },
        ],
      },
      {
        title: "Social media",
        rows: [
          {
            label: "Instagram",
            value: normalizeDisplayValue(corporateFormData.instagram),
          },
          {
            label: "TikTok",
            value: normalizeDisplayValue(corporateFormData.tiktok),
          },
          {
            label: "Facebook",
            value: normalizeDisplayValue(corporateFormData.facebook),
          },
          {
            label: "LinkedIn",
            value: normalizeDisplayValue(corporateFormData.linkedin),
          },
          {
            label: "X (Twitter)",
            value: normalizeDisplayValue(corporateFormData.xTwitter),
          },
        ],
      },
    ];
  }, [borrowerType, corporateFormData, individualFormData, noMonthlyIncome]);

  if (!hydrated) {
    return (
      <PageScreen
        title="Onboarding"
        subtitle="Preparing your borrower onboarding flow..."
        showBackButton
        showBottomNav
        backFallbackHref="/"
      >
        <SectionCard title="Loading">
          <View style={styles.centeredState}>
            <ActivityIndicator />
          </View>
        </SectionCard>
      </PageScreen>
    );
  }

  return (
    <PageScreen
      title={
        step === 0
          ? "Welcome to your borrower account"
          : "Let's set up your borrower profile"
      }
      subtitle={
        step === 0
          ? "Set up your borrower details so you can use applications, loans, and the rest of the app."
          : "We'll walk you through a few steps. You can save and come back anytime."
      }
      showBackButton
      showBottomNav
      backFallbackHref="/"
      stickyFooter={
        step === 0 ? (
          profileCount > 0 ? (
            <View style={styles.footerRow}>
              <View style={styles.footerSecondary}>
                <ActionButton
                  label="Back to dashboard"
                  variant="outline"
                  onPress={() => router.replace("/")}
                />
              </View>
              <View style={styles.footerPrimary}>
                <ActionButton
                  label="Continue"
                  onPress={() => setStep(resumeStep)}
                />
              </View>
            </View>
          ) : (
            <ActionButton
              label="Continue"
              onPress={() => setStep(resumeStep)}
            />
          )
        ) : step === 1 ? (
          profileCount > 0 ? (
            <View style={styles.footerRow}>
              <View style={styles.footerSecondary}>
                <ActionButton
                  label="Back"
                  variant="outline"
                  onPress={() => setStep(0)}
                />
              </View>
              <View style={styles.footerPrimary}>
                <ActionButton
                  label="Continue"
                  disabled={borrowerType === "INDIVIDUAL" && hasIndividual}
                  onPress={() => {
                    setBorrowerDetailSubStep(1);
                    setStep(2);
                  }}
                />
              </View>
            </View>
          ) : (
            <ActionButton
              label="Continue"
              disabled={borrowerType === "INDIVIDUAL" && hasIndividual}
              onPress={() => {
                setBorrowerDetailSubStep(1);
                setStep(2);
              }}
            />
          )
        ) : step === 2 && currentGuide ? (
          <View style={styles.footerRow}>
            <View style={styles.footerSecondary}>
              <ActionButton
                label="Back"
                variant="outline"
                onPress={() => {
                  if (borrowerDetailSubStep > 1) {
                    setBorrowerDetailSubStep(
                      (current) => (current - 1) as BorrowerDetailSubStep,
                    );
                  } else {
                    setStep(1);
                  }
                }}
              />
            </View>
            <View style={styles.footerPrimary}>
              <ActionButton
                label="Continue"
                onPress={() => {
                  const errors =
                    borrowerType === "INDIVIDUAL"
                      ? validateIndividualFormStep(
                          individualFormData,
                          borrowerDetailSubStep as IndividualSubStep,
                          noMonthlyIncome,
                        )
                      : validateCorporateFormStep(
                          corporateFormData,
                          borrowerDetailSubStep as CorporateSubStep,
                        );

                  if (Object.keys(errors).length > 0) {
                    setValidationErrors(errors);
                    Alert.alert(
                      "Missing required fields",
                      "Please complete the required fields before continuing.",
                    );
                    return;
                  }

                  setValidationErrors({});
                  if (borrowerDetailSubStep < totalSubSteps) {
                    setBorrowerDetailSubStep(
                      (current) => (current + 1) as BorrowerDetailSubStep,
                    );
                  } else {
                    setStep(3);
                  }
                }}
              />
            </View>
          </View>
        ) : (
          <View style={styles.footerRow}>
            <View style={styles.footerSecondary}>
              <ActionButton
                label="Back"
                variant="outline"
                onPress={() => setStep(2)}
              />
            </View>
            <View style={styles.footerPrimary}>
              <ActionButton
                label="Confirm & Create Profile"
                onPress={handleSubmit}
                loading={loading}
              />
            </View>
          </View>
        )
      }
    >
      {step !== 0 ? (
        <SectionCard
          title="Onboarding progress"
          description={
            draftProgress
              ? `${draftProgress} saved on this device.`
              : "Progress saves automatically as you go."
          }
        >
          <ProgressBar
            borrowerType={borrowerType}
            step={step}
            subStep={borrowerDetailSubStep}
          />
        </SectionCard>
      ) : null}

      {step === 0 ? (
        <SectionCard
          title={
            profileCount > 0
              ? "Let's get your next borrower profile ready"
              : "Before you jump in"
          }
          description={
            profileCount > 0
              ? "We'll guide you through the details needed to create another borrower profile. This part is quick, and we'll walk you through it step by step."
              : "You need to complete borrower onboarding before the rest of the app unlocks. It only takes a few minutes, and we will guide you one step at a time."
          }
        >
          <ThemedText type="small" themeColor="textSecondary">
            We will ask for borrower type, identity or company details, contact
            information, bank details, and a few optional extras like emergency
            contact or social profiles.
          </ThemedText>
        </SectionCard>
      ) : null}

      {step === 1 ? (
        <SectionCard
          title="What type of borrower are you?"
          description="Choose individual for personal borrowing or corporate for business needs."
        >
          <View style={styles.stack}>
            {borrowerTypeCards.map((card) => {
              const selected = borrowerType === card.id;
              const disabled = card.id === "INDIVIDUAL" && hasIndividual;

              return (
                <Pressable
                  key={card.id}
                  disabled={disabled}
                  onPress={() => {
                    if (!disabled) {
                      handleBorrowerTypeChange(card.id);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.typeCard,
                    {
                      borderColor: selected ? theme.primary : theme.border,
                      backgroundColor: selected
                        ? theme.backgroundSelected
                        : theme.backgroundElement,
                      opacity: pressed || disabled ? 0.8 : 1,
                    },
                  ]}
                >
                  <View style={styles.stackTight}>
                    <ThemedText type="smallBold">{card.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {card.description}
                    </ThemedText>
                    {disabled ? (
                      <ThemedText type="small" style={{ color: theme.warning }}>
                        You already have one individual profile.
                      </ThemedText>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>
      ) : null}

      {step === 2 && currentGuide ? (
        <>
          <SectionCard
            title={currentGuide.title}
            description={currentGuide.description}
            action={
              isOptionalSubStep ? (
                <SectionOptionalStatusRow complete={subStepComplete} />
              ) : (
                <SectionCompleteStatusRow complete={subStepComplete} />
              )
            }
          >
            <View style={styles.stack}>
              {Object.keys(validationErrors).length > 0 ? (
                <View
                  style={[
                    styles.errorBanner,
                    {
                      borderColor: theme.error,
                      backgroundColor: theme.background,
                    },
                  ]}
                >
                  <ThemedText type="smallBold" style={{ color: theme.error }}>
                    Please complete the required fields before continuing.
                  </ThemedText>
                </View>
              ) : null}

              {borrowerType === "INDIVIDUAL" ? (
                <>
                  {borrowerDetailSubStep === 1 ? (
                    <>
                      <OptionChipGroup
                        label="Document type"
                        value={individualFormData.documentType}
                        onChange={(value) => {
                          clearError("documentType");
                          if (value === "PASSPORT") {
                            setIndividualFormData((current) => ({
                              ...current,
                              documentType: value,
                              dateOfBirth: "",
                              gender: "",
                            }));
                            return;
                          }

                          const extractedDate = extractDateFromIC(
                            individualFormData.icNumber,
                          );
                          const extractedGender = extractGenderFromIC(
                            individualFormData.icNumber,
                          );

                          if (extractedDate) {
                            clearError("dateOfBirth");
                          }

                          if (extractedGender) {
                            clearError("gender");
                          }

                          setIndividualFormData((current) => ({
                            ...current,
                            documentType: value,
                            dateOfBirth: extractedDate || "",
                            gender: extractedGender || "",
                          }));
                        }}
                        options={documentTypeOptions}
                        error={validationErrors.documentType}
                      />
                      <Field
                        label="Full name"
                        value={individualFormData.name}
                        onChangeText={(value) => {
                          clearError("name");
                          setIndividualFormData((current) => ({
                            ...current,
                            name: value,
                          }));
                        }}
                        placeholder="As per your document"
                        autoCapitalize="words"
                        error={validationErrors.name}
                      />
                      <Field
                        label="IC / Passport number"
                        value={individualFormData.icNumber}
                        onChangeText={(value) => {
                          const cleanValue = isIndividualIC
                            ? value.replace(/\D/g, "").substring(0, 12)
                            : value;
                          const extractedDate = isIndividualIC
                            ? extractDateFromIC(cleanValue)
                            : null;
                          const extractedGender = isIndividualIC
                            ? extractGenderFromIC(cleanValue)
                            : null;

                          clearError("icNumber");

                          if (extractedDate) {
                            clearError("dateOfBirth");
                          }

                          if (extractedGender) {
                            clearError("gender");
                          }

                          setIndividualFormData((current) => ({
                            ...current,
                            icNumber: cleanValue,
                            ...(isIndividualIC
                              ? {
                                  dateOfBirth: extractedDate || "",
                                  gender: extractedGender || "",
                                }
                              : {}),
                          }));
                        }}
                        placeholder="12 digits for IC"
                        autoCapitalize="characters"
                        error={validationErrors.icNumber}
                        helperText={
                          isIndividualIC
                            ? "Enter a complete 12-digit IC number. Date of birth and gender are auto-extracted."
                            : undefined
                        }
                      />
                      {isIndividualIC ? (
                        <>
                          <ReadOnlyField
                            autoFilled
                            label="Date of birth"
                            value={dateOfBirthValue ? formatDate(dateOfBirthValue) : ""}
                            placeholder="Enter your IC number to auto-fill"
                            helperText="Derived from your IC number."
                          />
                          <ReadOnlyField
                            autoFilled
                            label="Gender"
                            value={
                              genderValue
                                ? formatOptionLabel("gender", genderValue)
                                : ""
                            }
                            placeholder="Enter your IC number to auto-fill"
                            helperText="Derived from your IC number."
                          />
                        </>
                      ) : (
                        <>
                          <DatePickerField
                            label="Date of birth"
                            value={dateOfBirthValue}
                            onChange={(value) => {
                              clearError("dateOfBirth");
                              setIndividualFormData((current) => ({
                                ...current,
                                dateOfBirth: value,
                              }));
                            }}
                            error={validationErrors.dateOfBirth}
                          />
                          <OptionChipGroup
                            label="Gender"
                            value={genderValue}
                            onChange={(value) => {
                              clearError("gender");
                              setIndividualFormData((current) => ({
                                ...current,
                                gender: value,
                              }));
                            }}
                            options={genderOptions}
                            error={validationErrors.gender}
                          />
                        </>
                      )}
                      <SelectField
                        label="Race"
                        value={individualFormData.race}
                        onChange={(value) => {
                          clearError("race");
                          setIndividualFormData((current) => ({
                            ...current,
                            race: value,
                          }));
                        }}
                        options={raceOptions}
                        placeholder="Select race"
                        error={validationErrors.race}
                      />
                      <SelectField
                        label="Education level"
                        value={individualFormData.educationLevel}
                        onChange={(value) => {
                          clearError("educationLevel");
                          setIndividualFormData((current) => ({
                            ...current,
                            educationLevel: value,
                          }));
                        }}
                        options={educationOptions}
                        placeholder="Select education level"
                        error={validationErrors.educationLevel}
                      />
                      <Field
                        label="Occupation"
                        value={individualFormData.occupation}
                        onChangeText={(value) => {
                          clearError("occupation");
                          setIndividualFormData((current) => ({
                            ...current,
                            occupation: value,
                          }));
                        }}
                        placeholder="Your job or role"
                        autoCapitalize="words"
                        error={validationErrors.occupation}
                      />
                      <SelectField
                        label="Employment status"
                        value={individualFormData.employmentStatus}
                        onChange={(value) => {
                          clearError("employmentStatus");
                          setIndividualFormData((current) => ({
                            ...current,
                            employmentStatus: value,
                          }));
                        }}
                        options={employmentOptions}
                        placeholder="Select employment status"
                        error={validationErrors.employmentStatus}
                      />
                      <FormSwitchRow
                        title="No monthly income"
                        description="Toggle this if you do not currently earn a monthly income."
                        value={noMonthlyIncome}
                        onValueChange={(value) => {
                          clearError("monthlyIncome");
                          setNoMonthlyIncome(value);
                        }}
                      />
                      {!noMonthlyIncome ? (
                        <Field
                          label="Monthly income"
                          value={individualFormData.monthlyIncome}
                          onChangeText={(value) => {
                            clearError("monthlyIncome");
                            setIndividualFormData((current) => ({
                              ...current,
                              monthlyIncome: value,
                            }));
                          }}
                          placeholder="0.00"
                          keyboardType="numeric"
                          autoCapitalize="none"
                          error={validationErrors.monthlyIncome}
                        />
                      ) : null}
                    </>
                  ) : null}

                  {borrowerDetailSubStep === 2 ? (
                    <>
                      <Field
                        label="Phone number"
                        value={individualFormData.phone}
                        onChangeText={(value) => {
                          clearError("phone");
                          setIndividualFormData((current) => ({
                            ...current,
                            phone: value,
                          }));
                        }}
                        placeholder="+60..."
                        keyboardType="phone-pad"
                        autoCapitalize="none"
                        error={validationErrors.phone}
                      />
                      <Field
                        label="Email"
                        value={individualFormData.email}
                        onChangeText={(value) => {
                          clearError("email");
                          setIndividualFormData((current) => ({
                            ...current,
                            email: value,
                          }));
                        }}
                        placeholder="name@email.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        error={validationErrors.email}
                      />
                      <Field
                        label="Address line 1"
                        value={individualFormData.addressLine1}
                        onChangeText={(value) => {
                          clearError("addressLine1");
                          setIndividualFormData((current) => ({
                            ...current,
                            addressLine1: value,
                          }));
                        }}
                        placeholder="House / street"
                        error={validationErrors.addressLine1}
                      />
                      <Field
                        label="Address line 2"
                        value={individualFormData.addressLine2}
                        onChangeText={(value) =>
                          setIndividualFormData((current) => ({
                            ...current,
                            addressLine2: value,
                          }))
                        }
                        placeholder="Apartment / unit"
                      />
                      <Field
                        label="City"
                        value={individualFormData.city}
                        onChangeText={(value) => {
                          clearError("city");
                          setIndividualFormData((current) => ({
                            ...current,
                            city: value,
                          }));
                        }}
                        placeholder="City"
                        error={validationErrors.city}
                      />
                      <SelectField
                        label="State"
                        value={individualFormData.state}
                        onChange={(value) => {
                          clearError("state");
                          setIndividualFormData((current) => ({
                            ...current,
                            state: value,
                          }));
                        }}
                        options={individualStateOptions}
                        placeholder="Select state"
                        error={validationErrors.state}
                        disabled={
                          !individualFormData.country ||
                          individualStateOptions.length === 0
                        }
                        searchable
                        helperText={
                          !individualFormData.country ||
                          individualStateOptions.length === 0
                            ? "Select a country first."
                            : undefined
                        }
                      />
                      <Field
                        label="Postcode"
                        value={individualFormData.postcode}
                        onChangeText={(value) => {
                          clearError("postcode");
                          setIndividualFormData((current) => ({
                            ...current,
                            postcode: value,
                          }));
                        }}
                        placeholder="Postcode"
                        keyboardType="numeric"
                        autoCapitalize="none"
                        error={validationErrors.postcode}
                      />
                      <SelectField
                        label="Country"
                        value={individualFormData.country}
                        onChange={(value) => {
                          const nextStateOptions = getStateOptions(value);
                          clearError("country");
                          clearError("state");
                          setIndividualFormData((current) => ({
                            ...current,
                            country: value,
                            state: nextStateOptions.some(
                              (option) => option.value === current.state,
                            )
                              ? current.state
                              : "",
                          }));
                        }}
                        options={countryOptions}
                        placeholder="Select country"
                        error={validationErrors.country}
                        searchable
                      />
                      <SelectField
                        label="Bank"
                        value={individualFormData.bankName}
                        onChange={(value) => {
                          clearError("bankName");
                          setIndividualFormData((current) => ({
                            ...current,
                            bankName: value,
                          }));
                        }}
                        options={bankOptions}
                        placeholder="Select bank"
                        error={validationErrors.bankName}
                        searchable
                      />
                      {individualFormData.bankName === "OTHER" ? (
                        <Field
                          label="Bank name"
                          value={individualFormData.bankNameOther}
                          onChangeText={(value) => {
                            clearError("bankNameOther");
                            setIndividualFormData((current) => ({
                              ...current,
                              bankNameOther: value,
                            }));
                          }}
                          placeholder="Enter bank name"
                          error={validationErrors.bankNameOther}
                        />
                      ) : null}
                      <Field
                        label="Bank account number"
                        value={individualFormData.bankAccountNo}
                        onChangeText={(value) => {
                          clearError("bankAccountNo");
                          setIndividualFormData((current) => ({
                            ...current,
                            bankAccountNo: value,
                          }));
                        }}
                        placeholder="Digits only"
                        keyboardType="numeric"
                        autoCapitalize="none"
                        error={validationErrors.bankAccountNo}
                      />
                    </>
                  ) : null}

                  {borrowerDetailSubStep === 3 ? (
                    <>
                      <Field
                        label="Emergency contact name"
                        value={individualFormData.emergencyContactName}
                        onChangeText={(value) =>
                          setIndividualFormData((current) => ({
                            ...current,
                            emergencyContactName: value,
                          }))
                        }
                        placeholder="Optional"
                        autoCapitalize="words"
                      />
                      <Field
                        label="Emergency contact phone"
                        value={individualFormData.emergencyContactPhone}
                        onChangeText={(value) =>
                          setIndividualFormData((current) => ({
                            ...current,
                            emergencyContactPhone: value,
                          }))
                        }
                        placeholder="Optional"
                        keyboardType="phone-pad"
                        autoCapitalize="none"
                      />
                      <OptionChipGroup
                        label="Relationship"
                        value={individualFormData.emergencyContactRelationship}
                        onChange={(value) =>
                          setIndividualFormData((current) => ({
                            ...current,
                            emergencyContactRelationship: value,
                          }))
                        }
                        options={relationshipOptions}
                      />
                      <Field
                        label="Instagram"
                        value={individualFormData.instagram}
                        onChangeText={(value) =>
                          setIndividualFormData((current) => ({
                            ...current,
                            instagram: value,
                          }))
                        }
                        placeholder="@handle"
                        autoCapitalize="none"
                      />
                      <Field
                        label="TikTok"
                        value={individualFormData.tiktok}
                        onChangeText={(value) =>
                          setIndividualFormData((current) => ({
                            ...current,
                            tiktok: value,
                          }))
                        }
                        placeholder="@handle"
                        autoCapitalize="none"
                      />
                      <Field
                        label="Facebook"
                        value={individualFormData.facebook}
                        onChangeText={(value) =>
                          setIndividualFormData((current) => ({
                            ...current,
                            facebook: value,
                          }))
                        }
                        placeholder="Profile URL or handle"
                        autoCapitalize="none"
                      />
                      <Field
                        label="LinkedIn"
                        value={individualFormData.linkedin}
                        onChangeText={(value) =>
                          setIndividualFormData((current) => ({
                            ...current,
                            linkedin: value,
                          }))
                        }
                        placeholder="Profile URL"
                        autoCapitalize="none"
                      />
                      <Field
                        label="X (Twitter)"
                        value={individualFormData.xTwitter}
                        onChangeText={(value) =>
                          setIndividualFormData((current) => ({
                            ...current,
                            xTwitter: value,
                          }))
                        }
                        placeholder="@handle"
                        autoCapitalize="none"
                      />
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  {borrowerDetailSubStep === 1 ? (
                    <>
                      <Field
                        label="Company name"
                        value={corporateFormData.companyName}
                        onChangeText={(value) => {
                          clearError("companyName");
                          setCorporateFormData((current) => ({
                            ...current,
                            companyName: value,
                          }));
                        }}
                        placeholder="Registered company name"
                        autoCapitalize="words"
                        error={validationErrors.companyName}
                      />
                      <Field
                        label="SSM registration number"
                        value={corporateFormData.ssmRegistrationNo}
                        onChangeText={(value) => {
                          clearError("ssmRegistrationNo");
                          setCorporateFormData((current) => ({
                            ...current,
                            ssmRegistrationNo: value,
                          }));
                        }}
                        placeholder="Company registration number"
                        autoCapitalize="characters"
                        error={validationErrors.ssmRegistrationNo}
                      />
                      <OptionChipGroup
                        label="Taraf (Bumi status)"
                        value={corporateFormData.bumiStatus}
                        onChange={(value) => {
                          clearError("bumiStatus");
                          setCorporateFormData((current) => ({
                            ...current,
                            bumiStatus: value,
                          }));
                        }}
                        options={bumiStatusOptions}
                        error={validationErrors.bumiStatus}
                      />
                      <Field
                        label="Nature of business"
                        value={corporateFormData.natureOfBusiness}
                        onChangeText={(value) =>
                          setCorporateFormData((current) => ({
                            ...current,
                            natureOfBusiness: value,
                          }))
                        }
                        placeholder="Optional"
                        autoCapitalize="words"
                      />
                      <DatePickerField
                        label="Date of incorporation"
                        value={corporateFormData.dateOfIncorporation}
                        onChange={(value) =>
                          setCorporateFormData((current) => ({
                            ...current,
                            dateOfIncorporation: value,
                          }))
                        }
                      />
                      <Field
                        label="Address line 1"
                        value={corporateFormData.addressLine1}
                        onChangeText={(value) => {
                          clearError("addressLine1");
                          setCorporateFormData((current) => ({
                            ...current,
                            addressLine1: value,
                          }));
                        }}
                        placeholder="Registered address"
                        error={validationErrors.addressLine1}
                      />
                      <Field
                        label="Address line 2"
                        value={corporateFormData.addressLine2}
                        onChangeText={(value) =>
                          setCorporateFormData((current) => ({
                            ...current,
                            addressLine2: value,
                          }))
                        }
                        placeholder="Optional"
                      />
                      <Field
                        label="City"
                        value={corporateFormData.city}
                        onChangeText={(value) => {
                          clearError("city");
                          setCorporateFormData((current) => ({
                            ...current,
                            city: value,
                          }));
                        }}
                        placeholder="City"
                        error={validationErrors.city}
                      />
                      <SelectField
                        label="State"
                        value={corporateFormData.state}
                        onChange={(value) => {
                          clearError("state");
                          setCorporateFormData((current) => ({
                            ...current,
                            state: value,
                          }));
                        }}
                        options={corporateStateOptions}
                        placeholder="Select state"
                        error={validationErrors.state}
                        disabled={
                          !corporateFormData.country ||
                          corporateStateOptions.length === 0
                        }
                        searchable
                        helperText={
                          !corporateFormData.country ||
                          corporateStateOptions.length === 0
                            ? "Select a country first."
                            : undefined
                        }
                      />
                      <Field
                        label="Postcode"
                        value={corporateFormData.postcode}
                        onChangeText={(value) => {
                          clearError("postcode");
                          setCorporateFormData((current) => ({
                            ...current,
                            postcode: value,
                          }));
                        }}
                        placeholder="Postcode"
                        keyboardType="numeric"
                        autoCapitalize="none"
                        error={validationErrors.postcode}
                      />
                      <SelectField
                        label="Country"
                        value={corporateFormData.country}
                        onChange={(value) => {
                          const nextStateOptions = getStateOptions(value);
                          clearError("country");
                          clearError("state");
                          setCorporateFormData((current) => ({
                            ...current,
                            country: value,
                            state: nextStateOptions.some(
                              (option) => option.value === current.state,
                            )
                              ? current.state
                              : "",
                          }));
                        }}
                        options={countryOptions}
                        placeholder="Select country"
                        error={validationErrors.country}
                        searchable
                      />
                    </>
                  ) : null}

                  {borrowerDetailSubStep === 2 ? (
                    <>
                      <Field
                        label="Company phone"
                        value={corporateFormData.companyPhone}
                        onChangeText={(value) => {
                          clearError("companyPhone");
                          setCorporateFormData((current) => ({
                            ...current,
                            companyPhone: value,
                          }));
                        }}
                        placeholder="+60..."
                        keyboardType="phone-pad"
                        autoCapitalize="none"
                        error={validationErrors.companyPhone}
                      />
                      <Field
                        label="Company email"
                        value={corporateFormData.companyEmail}
                        onChangeText={(value) => {
                          clearError("companyEmail");
                          setCorporateFormData((current) => ({
                            ...current,
                            companyEmail: value,
                          }));
                        }}
                        placeholder="accounts@company.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        error={validationErrors.companyEmail}
                      />
                      <Field
                        label="Paid-up capital"
                        value={corporateFormData.paidUpCapital}
                        onChangeText={(value) =>
                          setCorporateFormData((current) => ({
                            ...current,
                            paidUpCapital: value,
                          }))
                        }
                        placeholder="Optional"
                        keyboardType="numeric"
                        autoCapitalize="none"
                      />
                      <Field
                        label="Number of employees"
                        value={corporateFormData.numberOfEmployees}
                        onChangeText={(value) =>
                          setCorporateFormData((current) => ({
                            ...current,
                            numberOfEmployees: value,
                          }))
                        }
                        placeholder="Optional"
                        keyboardType="numeric"
                        autoCapitalize="none"
                      />
                    </>
                  ) : null}

                  {borrowerDetailSubStep === 3 ? (
                    <>
                      {validationErrors.authorizedRepresentative ? (
                        <ThemedText type="small" style={{ color: theme.error }}>
                          {validationErrors.authorizedRepresentative}
                        </ThemedText>
                      ) : null}
                      {corporateFormData.directors.map((director, index) => (
                        <View
                          key={`director-${index}`}
                          style={[
                            styles.directorCard,
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.background,
                            },
                          ]}
                        >
                          <View style={styles.rowBetween}>
                            <ThemedText type="smallBold">{`Director ${index + 1}`}</ThemedText>
                            {corporateFormData.directors.length > 1 ? (
                              <ActionButton
                                label="Remove"
                                variant="ghost"
                                onPress={() =>
                                  setCorporateFormData((current) => ({
                                    ...current,
                                    directors: current.directors.filter(
                                      (_, itemIndex) => itemIndex !== index,
                                    ),
                                  }))
                                }
                              />
                            ) : null}
                          </View>
                          <Field
                            label="Director name"
                            value={director.name}
                            onChangeText={(value) => {
                              clearError(`directorName_${index}`);
                              setCorporateFormData((current) => ({
                                ...current,
                                directors: current.directors.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, name: value }
                                      : item,
                                ),
                              }));
                            }}
                            autoCapitalize="words"
                            error={validationErrors[`directorName_${index}`]}
                          />
                          <Field
                            label="Director IC number"
                            value={director.icNumber}
                            onChangeText={(value) => {
                              clearError(`directorIc_${index}`);
                              setCorporateFormData((current) => ({
                                ...current,
                                directors: current.directors.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, icNumber: value }
                                      : item,
                                ),
                              }));
                            }}
                            autoCapitalize="characters"
                            error={validationErrors[`directorIc_${index}`]}
                          />
                          <Field
                            label="Position"
                            value={director.position}
                            onChangeText={(value) =>
                              setCorporateFormData((current) => ({
                                ...current,
                                directors: current.directors.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, position: value }
                                      : item,
                                ),
                              }))
                            }
                            autoCapitalize="words"
                          />
                          <Pressable
                            onPress={() =>
                              setCorporateFormData((current) => ({
                                ...current,
                                directors: current.directors.map(
                                  (item, itemIndex) => ({
                                    ...item,
                                    isAuthorizedRepresentative:
                                      itemIndex === index,
                                  }),
                                ),
                              }))
                            }
                            style={[
                              styles.authorizedRow,
                              {
                                borderColor: director.isAuthorizedRepresentative
                                  ? theme.primary
                                  : theme.border,
                                backgroundColor:
                                  director.isAuthorizedRepresentative
                                    ? theme.backgroundSelected
                                    : theme.backgroundElement,
                              },
                            ]}
                          >
                            <ThemedText
                              type="smallBold"
                              style={{
                                color: director.isAuthorizedRepresentative
                                  ? theme.primary
                                  : theme.text,
                              }}
                            >
                              Authorized representative
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {director.isAuthorizedRepresentative
                                ? "Selected"
                                : "Tap to select"}
                            </ThemedText>
                          </Pressable>
                        </View>
                      ))}
                      <ActionButton
                        label="Add director"
                        variant="outline"
                        onPress={() =>
                          setCorporateFormData((current) => ({
                            ...current,
                            directors: [
                              ...current.directors,
                              {
                                name: "",
                                icNumber: "",
                                position: "",
                                isAuthorizedRepresentative: false,
                              } as CorporateDirector,
                            ],
                          }))
                        }
                      />
                    </>
                  ) : null}

                  {borrowerDetailSubStep === 4 ? (
                    <>
                      <SelectField
                        label="Bank"
                        value={corporateFormData.bankName}
                        onChange={(value) => {
                          clearError("bankName");
                          setCorporateFormData((current) => ({
                            ...current,
                            bankName: value,
                          }));
                        }}
                        options={bankOptions}
                        placeholder="Select bank"
                        error={validationErrors.bankName}
                        searchable
                      />
                      {corporateFormData.bankName === "OTHER" ? (
                        <Field
                          label="Bank name"
                          value={corporateFormData.bankNameOther}
                          onChangeText={(value) => {
                            clearError("bankNameOther");
                            setCorporateFormData((current) => ({
                              ...current,
                              bankNameOther: value,
                            }));
                          }}
                          error={validationErrors.bankNameOther}
                        />
                      ) : null}
                      <Field
                        label="Bank account number"
                        value={corporateFormData.bankAccountNo}
                        onChangeText={(value) => {
                          clearError("bankAccountNo");
                          setCorporateFormData((current) => ({
                            ...current,
                            bankAccountNo: value,
                          }));
                        }}
                        keyboardType="numeric"
                        autoCapitalize="none"
                        error={validationErrors.bankAccountNo}
                      />
                    </>
                  ) : null}

                  {borrowerDetailSubStep === 5 ? (
                    <>
                      <Field
                        label="Instagram"
                        value={corporateFormData.instagram}
                        onChangeText={(value) =>
                          setCorporateFormData((current) => ({
                            ...current,
                            instagram: value,
                          }))
                        }
                        placeholder="@handle"
                        autoCapitalize="none"
                      />
                      <Field
                        label="TikTok"
                        value={corporateFormData.tiktok}
                        onChangeText={(value) =>
                          setCorporateFormData((current) => ({
                            ...current,
                            tiktok: value,
                          }))
                        }
                        placeholder="@handle"
                        autoCapitalize="none"
                      />
                      <Field
                        label="Facebook"
                        value={corporateFormData.facebook}
                        onChangeText={(value) =>
                          setCorporateFormData((current) => ({
                            ...current,
                            facebook: value,
                          }))
                        }
                        placeholder="Profile URL or handle"
                        autoCapitalize="none"
                      />
                      <Field
                        label="LinkedIn"
                        value={corporateFormData.linkedin}
                        onChangeText={(value) =>
                          setCorporateFormData((current) => ({
                            ...current,
                            linkedin: value,
                          }))
                        }
                        placeholder="Profile URL"
                        autoCapitalize="none"
                      />
                      <Field
                        label="X (Twitter)"
                        value={corporateFormData.xTwitter}
                        onChangeText={(value) =>
                          setCorporateFormData((current) => ({
                            ...current,
                            xTwitter: value,
                          }))
                        }
                        placeholder="@handle"
                        autoCapitalize="none"
                      />
                    </>
                  ) : null}
                </>
              )}
            </View>
          </SectionCard>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <SectionCard
            title="Review your profile"
            description="Everything look good? Once you confirm, the borrower profile will be created and linked to this account."
          >
            <View style={styles.stack}>
              {reviewSections.map((section) => (
                <View key={section.title} style={styles.reviewSection}>
                  <ThemedText type="smallBold">{section.title}</ThemedText>
                  <View style={styles.stackTight}>
                    {section.rows.map((row) => (
                      <ReviewRow
                        key={`${section.title}-${row.label}`}
                        label={row.label}
                        value={row.value}
                      />
                    ))}
                  </View>
                </View>
              ))}

              {borrowerType === "CORPORATE" ? (
                <View style={styles.reviewSection}>
                  <ThemedText type="smallBold">Directors</ThemedText>
                  <View style={styles.stack}>
                    {corporateFormData.directors.map((director, index) => (
                      <View
                        key={`review-director-${index}`}
                        style={[
                          styles.directorCard,
                          {
                            borderColor: theme.border,
                            backgroundColor: theme.background,
                          },
                        ]}
                      >
                        <ThemedText type="smallBold">{`Director ${index + 1}`}</ThemedText>
                        <ReviewRow
                          label="Name"
                          value={normalizeDisplayValue(director.name)}
                        />
                        <ReviewRow
                          label="IC"
                          value={normalizeDisplayValue(director.icNumber)}
                        />
                        <ReviewRow
                          label="Position"
                          value={normalizeDisplayValue(director.position)}
                        />
                        <ReviewRow
                          label="Authorized representative"
                          value={
                            director.isAuthorizedRepresentative ? "Yes" : "No"
                          }
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          </SectionCard>
        </>
      ) : null}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  centeredState: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  progressWrap: {
    gap: Spacing.two,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
    flexWrap: "wrap",
  },
  stack: {
    gap: Spacing.three,
  },
  stackTight: {
    gap: Spacing.one,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
    flexWrap: "wrap",
  },
  typeCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.three,
  },
  errorBanner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.three,
  },
  fieldWrap: {
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  selectTrigger: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  modalOverlay: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: "center",
  },
  selectModal: {
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.three,
    gap: Spacing.two,
    maxHeight: 560,
  },
  selectModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  searchInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  selectList: {
    maxHeight: 420,
  },
  selectListContent: {
    gap: Spacing.two,
  },
  selectOption: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  switchRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
  },
  switchCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  directorCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  authorizedRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  reviewSection: {
    gap: Spacing.two,
  },
  reviewRow: {
    gap: Spacing.one,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: Spacing.two,
  },
  footerSecondary: {
    minWidth: 100,
  },
  footerPrimary: {
    flex: 1,
  },
});
