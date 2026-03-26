"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Button } from "@borrower_pro/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@borrower_pro/components/ui/card";
import { OnboardingProgress } from "@borrower_pro/components/onboarding-progress";
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
} from "@borrower_pro/components/borrower-form";
import type { BorrowerDetailsSubStep } from "@borrower_pro/components/borrower-details-sub-stepper";
import {
  fetchBorrowerMe,
  submitOnboarding,
  type OnboardingPayload,
} from "@borrower_pro/lib/borrower-auth-client";
import {
  initialIndividualFormData,
  initialCorporateFormData,
} from "@borrower_pro/lib/borrower-form-initial";
import {
  validateIndividualForm,
  validateCorporateForm,
  validateIndividualFormStep,
  validateCorporateFormStep,
} from "@borrower_pro/lib/borrower-form-validation";
import type {
  IndividualFormData,
  CorporateFormData,
} from "@borrower_pro/lib/borrower-form-types";
import {
  getOptionLabel,
  formatDate,
  formatAddress,
  formatCurrency,
} from "@borrower_pro/lib/borrower-form-display";
import { cn } from "@borrower_pro/lib/utils";

const DRAFT_KEY = "onboarding_draft";
const DISMISSED_KEY = "onboarding_dismissed";

interface OnboardingDraft {
  step: number;
  borrowerDetailSubStep: BorrowerDetailsSubStep;
  borrowerType: "INDIVIDUAL" | "CORPORATE";
  individualFormData: IndividualFormData;
  corporateFormData: CorporateFormData;
  noMonthlyIncome: boolean;
}

function loadDraft(): OnboardingDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingDraft;
  } catch {
    return null;
  }
}

function saveDraft(draft: OnboardingDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {}
}

export function clearOnboardingDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DISMISSED_KEY);
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

export function OnboardingWizard() {
  const router = useRouter();

  const [hydrated, setHydrated] = useState(false);

  const [step, setStep] = useState(1);
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
      setStep(saved.step);
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
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {}
    toast.success("Your progress has been saved. Continue anytime.");
    router.push("/dashboard");
  }, [router]);

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
    const primaryDirector = d.directors[0];
    return {
      borrowerType: "CORPORATE",
      name: primaryDirector?.name.trim() || d.authorizedRepName.trim(),
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
        primaryDirector?.name.trim() || d.authorizedRepName.trim() || undefined,
      authorizedRepIc:
        primaryDirector?.icNumber.trim() || d.authorizedRepIc.trim() || undefined,
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

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="pb-10 w-full min-w-0 space-y-6">
      {/* Welcome header + save & exit */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">
            Let&apos;s set up your borrower profile
          </h1>
          <p className="text-muted text-base mt-1">
            We&apos;ll walk you through a few steps. You can save and come back anytime.
          </p>
        </div>
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
      </div>

      {/* Horizontal progress bar */}
      <OnboardingProgress
        mainStep={step as 1 | 2 | 3}
        borrowerType={borrowerType}
        subStep={borrowerDetailSubStep}
        className="mb-8"
      />

      <div className="space-y-6">
          {/* Step heading */}
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
                      <EmergencyContactCard
                        data={individualFormData}
                        onChange={(u) =>
                          setIndividualFormData((prev) => ({ ...prev, ...u }))
                        }
                      />
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
                              {i === 0 && " (Authorized Representative)"}
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
