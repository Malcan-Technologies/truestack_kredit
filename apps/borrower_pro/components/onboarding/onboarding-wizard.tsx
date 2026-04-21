"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  Building2,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
  X,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../ui/card";
import { OnboardingProgress } from "../onboarding-progress";
import {
  IdentityCard,
  PersonalCard,
  ContactCard,
  BankCard,
  EmergencyContactCard,
  SocialMediaCard,
  CompanyCard,
  CompanyContactCard,
  CompanyAdditionalCard,
  DirectorsCard,
} from "../borrower-form";
import type { BorrowerDetailsSubStep } from "../borrower-details-sub-stepper";
import {
  fetchBorrowerMe,
  submitOnboarding,
  type OnboardingPayload,
} from "../../lib/borrower-auth-client";
import {
  initialIndividualFormData,
  initialCorporateFormData,
} from "../../lib/borrower-form-initial";
import {
  validateIndividualForm,
  validateCorporateForm,
  validateIndividualFormStep,
  validateCorporateFormStep,
  isIndividualEmergencyContactComplete,
  isIndividualSocialComplete,
} from "../../lib/borrower-form-validation";
import { SectionCompleteBadge, SectionOptionalBadge } from "../ui/status-row";
import type {
  IndividualFormData,
  CorporateFormData,
  CorporateDirector,
} from "../../lib/borrower-form-types";
import {
  getOptionLabel,
  formatDate,
  formatAddress,
  formatCurrency,
} from "../../lib/borrower-form-display";
import { cn } from "../../lib/utils";
import {
  ONBOARDING_DRAFT_KEY,
  ONBOARDING_DISMISSED_KEY,
} from "../../lib/onboarding-storage-keys";

interface OnboardingDraft {
  step: number;
  borrowerDetailSubStep: BorrowerDetailsSubStep;
  borrowerType: "INDIVIDUAL" | "CORPORATE";
  individualFormData: IndividualFormData;
  corporateFormData: CorporateFormData;
  noMonthlyIncome: boolean;
}

function normalizeCorporateDraftData(data: CorporateFormData): CorporateFormData {
  const directors: CorporateDirector[] = (data.directors ?? []).map((d, i) => ({
    name: d.name ?? "",
    icNumber: d.icNumber ?? "",
    position: d.position ?? "",
    isAuthorizedRepresentative:
      typeof d.isAuthorizedRepresentative === "boolean"
        ? d.isAuthorizedRepresentative
        : i === 0,
  }));
  let next = directors;
  if (next.length === 0) {
    next = [{ name: "", icNumber: "", position: "", isAuthorizedRepresentative: true }];
  } else if (!next.some((d) => d.isAuthorizedRepresentative)) {
    next = next.map((d, i) => ({ ...d, isAuthorizedRepresentative: i === 0 }));
  }
  return { ...data, directors: next };
}

function loadDraft(): OnboardingDraft | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingDraft;
    if (parsed.corporateFormData) {
      parsed.corporateFormData = normalizeCorporateDraftData(parsed.corporateFormData);
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(draft: OnboardingDraft) {
  try {
    localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
  } catch {}
}

export function clearOnboardingDraft() {
  try {
    localStorage.removeItem(ONBOARDING_DRAFT_KEY);
    localStorage.removeItem(ONBOARDING_DISMISSED_KEY);
  } catch {}
}

function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3 pb-2 border-b border-border">
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
        {children}
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  const display = value?.trim() || "—";
  return (
    <div className={cn("flex flex-col gap-0.5 min-w-0", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-foreground break-words">{display}</span>
    </div>
  );
}

const BORROWER_TYPES = [
  {
    id: "INDIVIDUAL" as const,
    label: "Individual",
    desc: "For personal borrowing — one profile per account.",
    icon: User,
  },
  {
    id: "CORPORATE" as const,
    label: "Corporate",
    desc: "For business borrowing — you can add multiple companies.",
    icon: Building2,
  },
];

const GUIDED_TITLES: Record<
  "INDIVIDUAL" | "CORPORATE",
  Record<number, { title: string; desc: string }>
> = {
  INDIVIDUAL: {
    1: {
      title: "Tell us about yourself",
      desc: "We'll need your identity and personal details to get started.",
    },
    2: {
      title: "How can we reach you?",
      desc: "Add your contact information and bank account details.",
    },
    3: {
      title: "A few more details",
      desc: "Emergency contact and social media are optional but helpful.",
    },
  },
  CORPORATE: {
    1: {
      title: "Tell us about your company",
      desc: "Basic company registration and address details.",
    },
    2: {
      title: "A bit more about the business",
      desc: "Additional company details and contact information.",
    },
    3: {
      title: "Who runs the show?",
      desc: "Add your company directors and authorized representative.",
    },
    4: {
      title: "Where should funds go?",
      desc: "Your company's bank account details.",
    },
    5: {
      title: "Stay connected",
      desc: "Social media profiles are optional but help build trust.",
    },
  },
};

type OnboardingStep = 0 | 1 | 2 | 3;

function normalizeStep(value: number): OnboardingStep {
  if (value === 1 || value === 2 || value === 3) return value;
  return 0;
}

export function OnboardingWizard() {
  const router = useRouter();

  const [hydrated, setHydrated] = useState(false);

  const [step, setStep] = useState<OnboardingStep>(0);
  const [resumeStep, setResumeStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [hasIndividual, setHasIndividual] = useState(false);
  const [profileCount, setProfileCount] = useState(0);
  const [borrowerType, setBorrowerType] = useState<"INDIVIDUAL" | "CORPORATE">(
    "INDIVIDUAL"
  );
  const [individualFormData, setIndividualFormData] =
    useState<IndividualFormData>(initialIndividualFormData);
  const [corporateFormData, setCorporateFormData] =
    useState<CorporateFormData>(initialCorporateFormData);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [noMonthlyIncome, setNoMonthlyIncome] = useState(false);
  const [borrowerDetailSubStep, setBorrowerDetailSubStep] =
    useState<BorrowerDetailsSubStep>(1);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const saved = loadDraft();
    if (saved) {
      const savedStep = normalizeStep(saved.step);
      setResumeStep(savedStep === 0 ? 1 : savedStep);
      setBorrowerDetailSubStep(saved.borrowerDetailSubStep);
      setBorrowerType(saved.borrowerType);
      setIndividualFormData(saved.individualFormData);
      setCorporateFormData(saved.corporateFormData);
      setNoMonthlyIncome(saved.noMonthlyIncome);
    }
    setHydrated(true);
  }, []);

  // Persist to localStorage on any form state change (debounced)
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      saveDraft({
        step,
        borrowerDetailSubStep,
        borrowerType,
        individualFormData,
        corporateFormData,
        noMonthlyIncome,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [
    hydrated,
    step,
    borrowerDetailSubStep,
    borrowerType,
    individualFormData,
    corporateFormData,
    noMonthlyIncome,
  ]);

  useEffect(() => {
    fetchBorrowerMe()
      .then((res) => {
        if (res.success && res.data) {
          setProfileCount(res.data.profileCount);
          if (res.data.profiles.some((p) => p.borrowerType === "INDIVIDUAL")) {
            setHasIndividual(true);
          }
        }
      })
      .catch(() => {});
  }, []);

  const clearError = (key: string) => {
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSaveAndExit = useCallback(() => {
    // Only the "no profiles yet" flow uses dismissed-key to allow dashboard without completing wizard.
    if (profileCount === 0) {
      try {
        localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
      } catch {}
    }
    toast.success("Your progress has been saved. Continue anytime.");
    router.push("/dashboard");
  }, [router, profileCount]);

  const buildPayload = (): OnboardingPayload => {
    if (borrowerType === "INDIVIDUAL") {
      const d = individualFormData;
      return {
        borrowerType: "INDIVIDUAL",
        name: d.name.trim(),
        icNumber: d.icNumber.trim(),
        documentType: d.documentType,
        phone: d.phone.trim() || undefined,
        email: d.email.trim() || undefined,
        addressLine1: d.addressLine1.trim() || undefined,
        addressLine2: d.addressLine2.trim() || undefined,
        city: d.city.trim() || undefined,
        state: d.state.trim() || undefined,
        postcode: d.postcode.trim() || undefined,
        country: d.country.trim() || undefined,
        dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth).toISOString() : undefined,
        gender: d.gender.trim() || undefined,
        race: d.race.trim() || undefined,
        educationLevel: d.educationLevel.trim() || undefined,
        occupation: d.occupation.trim() || undefined,
        employmentStatus: d.employmentStatus.trim() || undefined,
        bankName: d.bankName.trim() || undefined,
        bankNameOther:
          d.bankName === "OTHER" ? d.bankNameOther.trim() || undefined : undefined,
        bankAccountNo: d.bankAccountNo.trim() || undefined,
        monthlyIncome: noMonthlyIncome
          ? 0
          : d.monthlyIncome.trim() !== ""
            ? parseFloat(d.monthlyIncome)
            : null,
        emergencyContactName: d.emergencyContactName.trim() || undefined,
        emergencyContactPhone: d.emergencyContactPhone.trim() || undefined,
        emergencyContactRelationship:
          d.emergencyContactRelationship.trim() || undefined,
        instagram: d.instagram?.trim() || undefined,
        tiktok: d.tiktok?.trim() || undefined,
        facebook: d.facebook?.trim() || undefined,
        linkedin: d.linkedin?.trim() || undefined,
        xTwitter: d.xTwitter?.trim() || undefined,
      };
    }

    const d = corporateFormData;
    const arDirector =
      d.directors.find((dir) => dir.isAuthorizedRepresentative) ?? d.directors[0];
    return {
      borrowerType: "CORPORATE",
      name: arDirector?.name.trim() || d.authorizedRepName.trim(),
      icNumber: d.ssmRegistrationNo.trim(),
      documentType: "IC",
      phone: d.companyPhone.trim() || undefined,
      email: d.companyEmail.trim() || undefined,
      addressLine1: d.addressLine1.trim() || undefined,
      addressLine2: d.addressLine2.trim() || undefined,
      city: d.city.trim() || undefined,
      state: d.state.trim() || undefined,
      postcode: d.postcode.trim() || undefined,
      country: d.country.trim() || undefined,
      companyName: d.companyName.trim() || undefined,
      ssmRegistrationNo: d.ssmRegistrationNo.trim() || undefined,
      businessAddress: d.addressLine1.trim() || undefined,
      bumiStatus: d.bumiStatus.trim() || undefined,
      authorizedRepName:
        arDirector?.name.trim() || d.authorizedRepName.trim() || undefined,
      authorizedRepIc:
        arDirector?.icNumber.trim() || d.authorizedRepIc.trim() || undefined,
      companyPhone: d.companyPhone.trim() || undefined,
      companyEmail: d.companyEmail.trim() || undefined,
      natureOfBusiness: d.natureOfBusiness.trim() || undefined,
      dateOfIncorporation: d.dateOfIncorporation
        ? new Date(d.dateOfIncorporation).toISOString()
        : undefined,
      paidUpCapital: d.paidUpCapital
        ? parseFloat(d.paidUpCapital)
        : undefined,
      numberOfEmployees: d.numberOfEmployees
        ? parseInt(d.numberOfEmployees, 10)
        : undefined,
      bankName: d.bankName.trim() || undefined,
      bankNameOther:
        d.bankName === "OTHER" ? d.bankNameOther.trim() || undefined : undefined,
      bankAccountNo: d.bankAccountNo.trim() || undefined,
      directors: d.directors
        .filter((dir) => dir.name.trim() && dir.icNumber.trim())
        .map((dir) => ({
          name: dir.name.trim(),
          icNumber: dir.icNumber.replace(/\D/g, ""),
          position: dir.position.trim() || undefined,
          isAuthorizedRepresentative: dir.isAuthorizedRepresentative === true,
        })),
      instagram: d.instagram?.trim() || undefined,
      tiktok: d.tiktok?.trim() || undefined,
      facebook: d.facebook?.trim() || undefined,
      linkedin: d.linkedin?.trim() || undefined,
      xTwitter: d.xTwitter?.trim() || undefined,
    };
  };

  const handleSubmit = async () => {
    if (borrowerType === "INDIVIDUAL") {
      const errors = validateIndividualForm(individualFormData, noMonthlyIncome);
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        toast.error("Please fill in all required fields");
        return;
      }
    } else {
      const errors = validateCorporateForm(corporateFormData);
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        toast.error("Please fill in all required fields");
        return;
      }
    }

    const payload = buildPayload();
    setLoading(true);
    try {
      await submitOnboarding(payload);
      clearOnboardingDraft();
      toast.success("Borrower profile created successfully!");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to create borrower"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBorrowerTypeChange = (type: "INDIVIDUAL" | "CORPORATE") => {
    setBorrowerType(type);
    setBorrowerDetailSubStep(1);
    setValidationErrors({});
    setNoMonthlyIncome(false);
  };

  const maxBorrowerDetailSubStep =
    borrowerType === "INDIVIDUAL" ? 3 : 5;

  const getCurrentTitle = (): { title: string; desc: string } => {
    if (step === 0) {
      return profileCount > 0
        ? {
            title: "Let's get your next borrower profile ready",
            desc: "We'll ask for a few details so you can create another borrower profile with confidence.",
          }
        : {
            title: "Before you jump in",
            desc: "You'll need to complete a quick onboarding so we can set up your account before you access the rest of the app.",
          };
    }
    if (step === 1) {
      return {
        title: "What type of borrower are you?",
        desc: "Choose individual for personal borrowing or corporate for business needs.",
      };
    }
    if (step === 3) {
      return {
        title: "Almost done — let's review everything",
        desc: "Take a moment to verify your details before submitting.",
      };
    }
    return (
      GUIDED_TITLES[borrowerType][borrowerDetailSubStep] ?? {
        title: "Borrower Details",
        desc: "",
      }
    );
  };

  const { title: currentTitle, desc: currentDesc } = getCurrentTitle();
  const isIntroStep = step === 0;

  const individualStep2Complete = useMemo(
    () =>
      Object.keys(validateIndividualFormStep(individualFormData, 2, noMonthlyIncome)).length === 0,
    [individualFormData, noMonthlyIncome]
  );
  const individualEmergencyComplete = useMemo(
    () => isIndividualEmergencyContactComplete(individualFormData),
    [individualFormData]
  );
  const individualSocialComplete = useMemo(
    () => isIndividualSocialComplete(individualFormData),
    [individualFormData]
  );

  const corporateStep1Complete = useMemo(
    () => Object.keys(validateCorporateFormStep(corporateFormData, 1)).length === 0,
    [corporateFormData]
  );
  const corporateStep2Complete = useMemo(
    () => Object.keys(validateCorporateFormStep(corporateFormData, 2)).length === 0,
    [corporateFormData]
  );
  const corporateStep3Complete = useMemo(
    () => Object.keys(validateCorporateFormStep(corporateFormData, 3)).length === 0,
    [corporateFormData]
  );
  const corporateStep4Complete = useMemo(
    () => Object.keys(validateCorporateFormStep(corporateFormData, 4)).length === 0,
    [corporateFormData]
  );
  const corporateSocialComplete = useMemo(
    () => isIndividualSocialComplete(corporateFormData as unknown as IndividualFormData),
    [corporateFormData]
  );

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="pb-10 w-full min-w-0 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">
            {isIntroStep
              ? profileCount > 0
                ? "Add another borrower profile"
                : "Welcome to your borrower account"
              : "Let's set up your borrower profile"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isIntroStep
              ? profileCount > 0
                ? "You're in a focused setup flow — the sidebar only opens Dashboard and Help until you're done."
                : "A quick onboarding is all it takes before you can start using everything in the app."
              : "We'll walk you through a few steps. You can save and come back anytime."}
          </p>
        </div>
        {!isIntroStep ? (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-foreground gap-2"
            onClick={handleSaveAndExit}
          >
            <X className="h-4 w-4 sm:hidden" />
            <Save className="h-4 w-4 hidden sm:block" />
            <span className="hidden sm:inline">Save & Exit</span>
          </Button>
        ) : null}
      </div>

      {!isIntroStep ? (
        <OnboardingProgress
          mainStep={step as 1 | 2 | 3}
          borrowerType={borrowerType}
          subStep={borrowerDetailSubStep}
          className="mb-8"
        />
      ) : null}

      <div className="space-y-6">
          {!isIntroStep ? (
            <div className="flex items-center gap-3">
              {step === 1 && profileCount > 0 ? (
                <Button variant="ghost" size="icon" asChild>
                  <Link href="/dashboard">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
              <div>
                <h2 className="text-xl font-heading font-bold">
                  {currentTitle}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {currentDesc}
                </p>
              </div>
            </div>
          ) : null}

          {step === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{currentTitle}</CardTitle>
                <CardDescription>{currentDesc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-sm text-foreground">
                    {profileCount > 0
                      ? "The good news: this part is quick, and we'll guide you through it step by step."
                      : "The good news: it only takes a few minutes, and we'll guide you through it one step at a time."}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    We'll ask for your borrower type, identity or company details,
                    contact and address information, bank details, and a few optional
                    extras like emergency contact or social profiles.
                  </p>
                </div>
                <div className="flex justify-between">
                  {profileCount > 0 ? (
                    <Button variant="outline" asChild>
                      <Link href="/dashboard">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to dashboard
                      </Link>
                    </Button>
                  ) : (
                    <div />
                  )}
                  <Button onClick={() => setStep(resumeStep)}>
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 1: Type selection */}
          {step === 1 && (
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-2">
                  {BORROWER_TYPES.map(({ id, label, desc, icon: Icon }) => {
                    const isSelected = borrowerType === id;
                    const isDisabled = id === "INDIVIDUAL" && hasIndividual;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          if (isDisabled) return;
                          handleBorrowerTypeChange(id);
                        }}
                        disabled={isDisabled}
                        className={cn(
                          "relative flex flex-col items-start gap-3 rounded-xl border-2 p-5 text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/50 hover:bg-muted/30",
                          isDisabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {isSelected && (
                          <div className="absolute top-4 right-4 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-4 w-4" />
                          </div>
                        )}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold">{label}</h3>
                            <p className="text-sm text-muted-foreground">
                              {desc}
                            </p>
                          </div>
                        </div>
                        {isDisabled && (
                          <p className="text-xs text-warning">
                            You already have one individual profile
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-6 flex justify-end">
                  <Button
                    disabled={borrowerType === "INDIVIDUAL" && hasIndividual}
                    onClick={() => {
                      setBorrowerDetailSubStep(1);
                      setStep(2);
                    }}
                  >
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Form sub-steps */}
          {step === 2 && (
            <div className="space-y-6">
              {Object.keys(validationErrors).length > 0 && (
                <div className="rounded-lg border-2 border-error bg-error/10 px-4 py-3">
                  <p className="text-sm font-medium text-error">
                    Please fill in all required fields marked with *
                  </p>
                  <p className="text-xs text-error/80 mt-1">
                    Complete the required fields below before proceeding.
                  </p>
                </div>
              )}
              {borrowerType === "INDIVIDUAL" ? (
                <>
                  {borrowerDetailSubStep === 1 && (
                    <div className="space-y-6">
                      <IdentityCard
                        data={individualFormData}
                        onChange={(u) =>
                          setIndividualFormData((prev) => ({ ...prev, ...u }))
                        }
                        errors={validationErrors}
                        onErrorClear={clearError}
                      />
                      <PersonalCard
                        data={individualFormData}
                        onChange={(u) =>
                          setIndividualFormData((prev) => ({ ...prev, ...u }))
                        }
                        errors={validationErrors}
                        onErrorClear={clearError}
                        noMonthlyIncome={noMonthlyIncome}
                        onNoMonthlyIncomeChange={setNoMonthlyIncome}
                      />
                    </div>
                  )}
                  {borrowerDetailSubStep === 2 && (
                    <div className="space-y-6">
                      <div className="flex justify-end -mb-2">
                        <SectionCompleteBadge complete={individualStep2Complete} />
                      </div>
                      <ContactCard
                        data={individualFormData}
                        onChange={(u) =>
                          setIndividualFormData((prev) => ({ ...prev, ...u }))
                        }
                        errors={validationErrors}
                        onErrorClear={clearError}
                      />
                      <BankCard
                        data={individualFormData}
                        onChange={(u) =>
                          setIndividualFormData((prev) => ({ ...prev, ...u }))
                        }
                        errors={validationErrors}
                        onErrorClear={clearError}
                      />
                    </div>
                  )}
                  {borrowerDetailSubStep === 3 && (
                    <div className="space-y-6">
                      <div className="flex justify-end -mb-2">
                        <SectionCompleteBadge complete={individualEmergencyComplete} />
                      </div>
                      <EmergencyContactCard
                        data={individualFormData}
                        onChange={(u) =>
                          setIndividualFormData((prev) => ({ ...prev, ...u }))
                        }
                      />
                      <div className="flex justify-end -mb-2">
                        <SectionOptionalBadge complete={individualSocialComplete} />
                      </div>
                      <SocialMediaCard
                        data={individualFormData}
                        onChange={(u) =>
                          setIndividualFormData((prev) => ({ ...prev, ...u }))
                        }
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  {borrowerDetailSubStep === 1 && (
                    <div className="space-y-6">
                      <div className="flex justify-end -mb-2">
                        <SectionCompleteBadge complete={corporateStep1Complete} />
                      </div>
                      <CompanyCard
                        data={corporateFormData}
                        onChange={(u) =>
                          setCorporateFormData((prev) => ({ ...prev, ...u }))
                        }
                        errors={validationErrors}
                        onErrorClear={clearError}
                      />
                    </div>
                  )}
                  {borrowerDetailSubStep === 2 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="col-span-full flex justify-end -mb-2">
                        <SectionCompleteBadge complete={corporateStep2Complete} />
                      </div>
                      <CompanyAdditionalCard
                        data={corporateFormData}
                        onChange={(u) =>
                          setCorporateFormData((prev) => ({ ...prev, ...u }))
                        }
                      />
                      <CompanyContactCard
                        data={corporateFormData}
                        onChange={(u) =>
                          setCorporateFormData((prev) => ({ ...prev, ...u }))
                        }
                        errors={validationErrors}
                        onErrorClear={clearError}
                      />
                    </div>
                  )}
                  {borrowerDetailSubStep === 3 && (
                    <div className="space-y-6">
                      <div className="flex justify-end -mb-2">
                        <SectionCompleteBadge complete={corporateStep3Complete} />
                      </div>
                      <DirectorsCard
                        data={corporateFormData}
                        onChange={(u) =>
                          setCorporateFormData((prev) => ({ ...prev, ...u }))
                        }
                        errors={validationErrors}
                        onErrorClear={clearError}
                      />
                    </div>
                  )}
                  {borrowerDetailSubStep === 4 && (
                    <div className="space-y-6">
                      <div className="flex justify-end -mb-2">
                        <SectionCompleteBadge complete={corporateStep4Complete} />
                      </div>
                      <BankCard
                        data={corporateFormData}
                        onChange={(u) =>
                          setCorporateFormData((prev) => ({ ...prev, ...u }))
                        }
                        errors={validationErrors}
                        onErrorClear={clearError}
                      />
                    </div>
                  )}
                  {borrowerDetailSubStep === 5 && (
                    <div className="space-y-6">
                      <div className="flex justify-end -mb-2">
                        <SectionOptionalBadge complete={corporateSocialComplete} />
                      </div>
                      <SocialMediaCard
                        data={corporateFormData}
                        onChange={(u) =>
                          setCorporateFormData((prev) => ({ ...prev, ...u }))
                        }
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (borrowerDetailSubStep > 1) {
                      setBorrowerDetailSubStep(
                        (s) => (s - 1) as BorrowerDetailsSubStep
                      );
                    } else {
                      setStep(1);
                    }
                  }}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={() => {
                    const errors =
                      borrowerType === "INDIVIDUAL"
                        ? validateIndividualFormStep(
                            individualFormData,
                            borrowerDetailSubStep as 1 | 2 | 3,
                            noMonthlyIncome
                          )
                        : validateCorporateFormStep(
                            corporateFormData,
                            borrowerDetailSubStep as 1 | 2 | 3 | 4 | 5
                          );
                    if (Object.keys(errors).length > 0) {
                      setValidationErrors(errors);
                      toast.error(
                        "Please fill in all required fields marked with *"
                      );
                      return;
                    }
                    setValidationErrors({});
                    if (borrowerDetailSubStep < maxBorrowerDetailSubStep) {
                      setBorrowerDetailSubStep(
                        (s) => (s + 1) as BorrowerDetailsSubStep
                      );
                    } else {
                      setStep(3);
                    }
                  }}
                >
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Review your profile</CardTitle>
                <CardDescription>
                  Everything look good? Once you confirm, your borrower profile
                  will be created and linked to your account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {borrowerType === "INDIVIDUAL" ? (
                  <>
                    <ReviewSection title="Identity Information">
                      <ReviewRow label="Name" value={individualFormData.name} />
                      <ReviewRow
                        label="Document Type"
                        value={getOptionLabel(
                          "documentType",
                          individualFormData.documentType
                        )}
                      />
                      <ReviewRow
                        label="IC / Passport"
                        value={individualFormData.icNumber}
                      />
                    </ReviewSection>
                    <ReviewSection title="Personal Information">
                      <ReviewRow
                        label="Date of Birth"
                        value={formatDate(individualFormData.dateOfBirth)}
                      />
                      <ReviewRow
                        label="Gender"
                        value={getOptionLabel(
                          "gender",
                          individualFormData.gender
                        )}
                      />
                      <ReviewRow
                        label="Race"
                        value={getOptionLabel("race", individualFormData.race)}
                      />
                      <ReviewRow
                        label="Education"
                        value={getOptionLabel(
                          "educationLevel",
                          individualFormData.educationLevel
                        )}
                      />
                      <ReviewRow
                        label="Occupation"
                        value={individualFormData.occupation}
                      />
                      <ReviewRow
                        label="Employment Status"
                        value={getOptionLabel(
                          "employmentStatus",
                          individualFormData.employmentStatus
                        )}
                      />
                      <ReviewRow
                        label="Monthly Income"
                        value={formatCurrency(individualFormData.monthlyIncome)}
                      />
                    </ReviewSection>
                    <ReviewSection title="Contact Information">
                      <ReviewRow
                        label="Phone"
                        value={individualFormData.phone}
                      />
                      <ReviewRow
                        label="Email"
                        value={individualFormData.email}
                      />
                      <ReviewRow
                        label="Address"
                        value={formatAddress(individualFormData)}
                      />
                    </ReviewSection>
                    <ReviewSection title="Bank Information">
                      <ReviewRow
                        label="Bank"
                        value={
                          individualFormData.bankName === "OTHER"
                            ? individualFormData.bankNameOther
                            : getOptionLabel(
                                "bankName",
                                individualFormData.bankName
                              )
                        }
                      />
                      <ReviewRow
                        label="Account Number"
                        value={individualFormData.bankAccountNo}
                      />
                    </ReviewSection>
                    <ReviewSection title="Emergency Contact">
                      <ReviewRow
                        label="Name"
                        value={individualFormData.emergencyContactName}
                      />
                      <ReviewRow
                        label="Phone"
                        value={individualFormData.emergencyContactPhone}
                      />
                      <ReviewRow
                        label="Relationship"
                        value={getOptionLabel(
                          "emergencyContactRelationship",
                          individualFormData.emergencyContactRelationship
                        )}
                      />
                    </ReviewSection>
                    <ReviewSection title="Social Media Profiles">
                      <ReviewRow
                        label="Instagram"
                        value={individualFormData.instagram}
                      />
                      <ReviewRow
                        label="TikTok"
                        value={individualFormData.tiktok}
                      />
                      <ReviewRow
                        label="Facebook"
                        value={individualFormData.facebook}
                      />
                      <ReviewRow
                        label="LinkedIn"
                        value={individualFormData.linkedin}
                      />
                      <ReviewRow
                        label="X (Twitter)"
                        value={individualFormData.xTwitter}
                      />
                    </ReviewSection>
                  </>
                ) : (
                  <>
                    <ReviewSection title="Company Information">
                      <ReviewRow
                        label="Company Name"
                        value={corporateFormData.companyName}
                      />
                      <ReviewRow
                        label="SSM Registration No"
                        value={corporateFormData.ssmRegistrationNo}
                      />
                      <ReviewRow
                        label="Taraf (Bumi Status)"
                        value={getOptionLabel(
                          "bumiStatus",
                          corporateFormData.bumiStatus
                        )}
                      />
                      <ReviewRow
                        label="Nature of Business"
                        value={corporateFormData.natureOfBusiness}
                      />
                      <ReviewRow
                        label="Date of Incorporation"
                        value={formatDate(
                          corporateFormData.dateOfIncorporation
                        )}
                      />
                      <ReviewRow
                        label="Address"
                        value={formatAddress(corporateFormData)}
                      />
                    </ReviewSection>
                    <ReviewSection title="Company Contact">
                      <ReviewRow
                        label="Phone"
                        value={corporateFormData.companyPhone}
                      />
                      <ReviewRow
                        label="Email"
                        value={corporateFormData.companyEmail}
                      />
                    </ReviewSection>
                    {(corporateFormData.paidUpCapital ||
                      corporateFormData.numberOfEmployees) && (
                      <ReviewSection title="Additional Details">
                        {corporateFormData.paidUpCapital && (
                          <ReviewRow
                            label="Paid-up Capital"
                            value={formatCurrency(
                              corporateFormData.paidUpCapital
                            )}
                          />
                        )}
                        {corporateFormData.numberOfEmployees && (
                          <ReviewRow
                            label="Number of Employees"
                            value={corporateFormData.numberOfEmployees}
                          />
                        )}
                      </ReviewSection>
                    )}
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3 pb-2 border-b border-border">
                        Directors
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {corporateFormData.directors.map((d, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2"
                          >
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Director {i + 1}
                              {d.isAuthorizedRepresentative ? " (Authorized Representative)" : ""}
                            </p>
                            <div className="space-y-1 text-sm">
                              <ReviewRow label="Name" value={d.name} />
                              <ReviewRow label="IC Number" value={d.icNumber} />
                              <ReviewRow label="Position" value={d.position} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <ReviewSection title="Bank Information">
                      <ReviewRow
                        label="Bank"
                        value={
                          corporateFormData.bankName === "OTHER"
                            ? corporateFormData.bankNameOther
                            : getOptionLabel(
                                "bankName",
                                corporateFormData.bankName
                              )
                        }
                      />
                      <ReviewRow
                        label="Account Number"
                        value={corporateFormData.bankAccountNo}
                      />
                    </ReviewSection>
                    <ReviewSection title="Social Media Profiles">
                      <ReviewRow
                        label="Instagram"
                        value={corporateFormData.instagram}
                      />
                      <ReviewRow
                        label="TikTok"
                        value={corporateFormData.tiktok}
                      />
                      <ReviewRow
                        label="Facebook"
                        value={corporateFormData.facebook}
                      />
                      <ReviewRow
                        label="LinkedIn"
                        value={corporateFormData.linkedin}
                      />
                      <ReviewRow
                        label="X (Twitter)"
                        value={corporateFormData.xTwitter}
                      />
                    </ReviewSection>
                  </>
                )}
                <div className="flex justify-between pt-4 border-t border-border">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={handleSubmit} disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Confirm & Create Profile
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}
