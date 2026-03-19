"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  Building2,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../../components/ui/card";
import { OnboardingStepper } from "../../../components/onboarding-stepper";
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
} from "../../../components/borrower-form";
import { BorrowerDetailsSubStepper } from "../../../components/borrower-details-sub-stepper";
import type { BorrowerDetailsSubStep } from "../../../components/borrower-details-sub-stepper";
import {
  fetchBorrowerMe,
  submitOnboarding,
  type OnboardingPayload,
} from "../../../lib/borrower-auth-client";
import {
  initialIndividualFormData,
  initialCorporateFormData,
} from "../../../lib/borrower-form-initial";
import {
  validateIndividualForm,
  validateCorporateForm,
  validateIndividualFormStep,
  validateCorporateFormStep,
} from "../../../lib/borrower-form-validation";
import type {
  IndividualFormData,
  CorporateFormData,
} from "../../../lib/borrower-form-types";
import {
  getOptionLabel,
  formatDate,
  formatAddress,
  formatCurrency,
} from "../../../lib/borrower-form-display";
import { cn } from "@/lib/utils";

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
    desc: "Personal borrowing",
    icon: User,
  },
  {
    id: "CORPORATE" as const,
    label: "Corporate",
    desc: "Business borrowing",
    icon: Building2,
  },
];

export function OnboardingWizard() {
  const router = useRouter();
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
      toast.success("Borrower profile created successfully");
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

  const stepTitles: Record<number, { title: string; desc: string }> = {
    1: { title: "Choose Borrower Type", desc: "Select Individual or Corporate profile." },
    2: {
      title: "Borrower Details",
      desc: `${borrowerType === "INDIVIDUAL" ? "Individual" : "Corporate"} profile information.`,
    },
    3: { title: "Review & Confirm", desc: "Verify your details before submitting." },
  };

  const getSubStepTitle = (subStep: BorrowerDetailsSubStep): string => {
    if (borrowerType === "INDIVIDUAL") {
      const titles: Record<1 | 2 | 3, string> = {
        1: "Identity & Personal Information",
        2: "Contact & Bank Information",
        3: "Emergency Contact & Social Media",
      };
      return titles[subStep as 1 | 2 | 3] ?? "";
    }
    const titles: Record<1 | 2 | 3 | 4 | 5, string> = {
      1: "Company Information",
      2: "Additional Company Details & Company Contact",
      3: "Company Directors",
      4: "Bank Information",
      5: "Social Media Profiles",
    };
    return titles[subStep] ?? "";
  };

  return (
    <div className="space-y-6 pb-10">
      <OnboardingStepper currentStep={step as 1 | 2 | 3} />
      {step === 2 && (
        <BorrowerDetailsSubStepper
          borrowerType={borrowerType}
          currentSubStep={borrowerDetailSubStep}
        />
      )}

      <div className="flex items-center gap-3">
        {step === 1 && profileCount > 0 ? (
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        ) : step === 2 && borrowerDetailSubStep > 1 ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setBorrowerDetailSubStep((s) => (s - 1) as BorrowerDetailsSubStep)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : step > 1 ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (step === 3) setBorrowerDetailSubStep(maxBorrowerDetailSubStep as BorrowerDetailsSubStep);
              setStep((s) => s - 1);
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <div>
          <h1 className="text-2xl font-heading font-bold">
            {step === 2 ? getSubStepTitle(borrowerDetailSubStep) : stepTitles[step].title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === 2 ? stepTitles[2].desc : stepTitles[step].desc}
          </p>
        </div>
      </div>

      {/* Step 1: Type selection */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Choose borrower type</CardTitle>
            <CardDescription>
              Select your borrowing profile type. Individual allows one profile per account;
              Corporate allows multiple.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{label}</h3>
                        <p className="text-sm text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                    {isDisabled && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
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
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Form - split into sub-steps for mobile-friendly flow */}
      {step === 2 && (
        <div className="space-y-6">
          {Object.keys(validationErrors).length > 0 && (
            <div className="rounded-lg border-2 border-red-500 bg-red-500/10 px-4 py-3">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                Please fill in all required fields marked with *
              </p>
              <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
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
                    onChange={(u) => setIndividualFormData((prev) => ({ ...prev, ...u }))}
                    errors={validationErrors}
                    onErrorClear={clearError}
                  />
                  <PersonalCard
                    data={individualFormData}
                    onChange={(u) => setIndividualFormData((prev) => ({ ...prev, ...u }))}
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
                    onChange={(u) => setIndividualFormData((prev) => ({ ...prev, ...u }))}
                    errors={validationErrors}
                    onErrorClear={clearError}
                  />
                  <BankCard
                    data={individualFormData}
                    onChange={(u) => setIndividualFormData((prev) => ({ ...prev, ...u }))}
                    errors={validationErrors}
                    onErrorClear={clearError}
                  />
                </div>
              )}
              {borrowerDetailSubStep === 3 && (
                <div className="space-y-6">
                  <EmergencyContactCard
                    data={individualFormData}
                    onChange={(u) => setIndividualFormData((prev) => ({ ...prev, ...u }))}
                  />
                  <SocialMediaCard
                    data={individualFormData}
                    onChange={(u) => setIndividualFormData((prev) => ({ ...prev, ...u }))}
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
                    onChange={(u) => setCorporateFormData((prev) => ({ ...prev, ...u }))}
                    errors={validationErrors}
                    onErrorClear={clearError}
                  />
                </div>
              )}
              {borrowerDetailSubStep === 2 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <CompanyAdditionalCard
                    data={corporateFormData}
                    onChange={(u) => setCorporateFormData((prev) => ({ ...prev, ...u }))}
                  />
                  <CompanyContactCard
                    data={corporateFormData}
                    onChange={(u) => setCorporateFormData((prev) => ({ ...prev, ...u }))}
                    errors={validationErrors}
                    onErrorClear={clearError}
                  />
                </div>
              )}
              {borrowerDetailSubStep === 3 && (
                <div className="space-y-6">
                  <DirectorsCard
                    data={corporateFormData}
                    onChange={(u) => setCorporateFormData((prev) => ({ ...prev, ...u }))}
                    errors={validationErrors}
                    onErrorClear={clearError}
                  />
                </div>
              )}
              {borrowerDetailSubStep === 4 && (
                <div className="space-y-6">
                  <BankCard
                    data={corporateFormData}
                    onChange={(u) => setCorporateFormData((prev) => ({ ...prev, ...u }))}
                    errors={validationErrors}
                    onErrorClear={clearError}
                  />
                </div>
              )}
              {borrowerDetailSubStep === 5 && (
                <div className="space-y-6">
                  <SocialMediaCard
                    data={corporateFormData}
                    onChange={(u) => setCorporateFormData((prev) => ({ ...prev, ...u }))}
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
                  setBorrowerDetailSubStep((s) => (s - 1) as BorrowerDetailsSubStep);
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
                  toast.error("Please fill in all required fields marked with *");
                  return;
                }
                setValidationErrors({});
                if (borrowerDetailSubStep < maxBorrowerDetailSubStep) {
                  setBorrowerDetailSubStep((s) => (s + 1) as BorrowerDetailsSubStep);
                } else {
                  setStep(3);
                }
              }}
            >
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Confirm</CardTitle>
            <CardDescription>
              Verify your details before submitting. Your borrower profile will be created and
              linked to your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {borrowerType === "INDIVIDUAL" ? (
              <>
                <ReviewSection title="Identity Information">
                  <ReviewRow label="Name" value={individualFormData.name} />
                  <ReviewRow
                    label="Document Type"
                    value={getOptionLabel("documentType", individualFormData.documentType)}
                  />
                  <ReviewRow label="IC / Passport" value={individualFormData.icNumber} />
                </ReviewSection>
                <ReviewSection title="Personal Information">
                  <ReviewRow label="Date of Birth" value={formatDate(individualFormData.dateOfBirth)} />
                  <ReviewRow label="Gender" value={getOptionLabel("gender", individualFormData.gender)} />
                  <ReviewRow label="Race" value={getOptionLabel("race", individualFormData.race)} />
                  <ReviewRow
                    label="Education"
                    value={getOptionLabel("educationLevel", individualFormData.educationLevel)}
                  />
                  <ReviewRow label="Occupation" value={individualFormData.occupation} />
                  <ReviewRow
                    label="Employment Status"
                    value={getOptionLabel("employmentStatus", individualFormData.employmentStatus)}
                  />
                  <ReviewRow
                    label="Monthly Income"
                    value={formatCurrency(individualFormData.monthlyIncome)}
                  />
                </ReviewSection>
                <ReviewSection title="Contact Information">
                  <ReviewRow label="Phone" value={individualFormData.phone} />
                  <ReviewRow label="Email" value={individualFormData.email} />
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
                        : getOptionLabel("bankName", individualFormData.bankName)
                    }
                  />
                  <ReviewRow label="Account Number" value={individualFormData.bankAccountNo} />
                </ReviewSection>
                <ReviewSection title="Emergency Contact">
                  <ReviewRow label="Name" value={individualFormData.emergencyContactName} />
                  <ReviewRow label="Phone" value={individualFormData.emergencyContactPhone} />
                  <ReviewRow
                    label="Relationship"
                    value={getOptionLabel(
                      "emergencyContactRelationship",
                      individualFormData.emergencyContactRelationship
                    )}
                  />
                </ReviewSection>
                <ReviewSection title="Social Media Profiles">
                  <ReviewRow label="Instagram" value={individualFormData.instagram} />
                  <ReviewRow label="TikTok" value={individualFormData.tiktok} />
                  <ReviewRow label="Facebook" value={individualFormData.facebook} />
                  <ReviewRow label="LinkedIn" value={individualFormData.linkedin} />
                  <ReviewRow label="X (Twitter)" value={individualFormData.xTwitter} />
                </ReviewSection>
              </>
            ) : (
              <>
                <ReviewSection title="Company Information">
                  <ReviewRow label="Company Name" value={corporateFormData.companyName} />
                  <ReviewRow label="SSM Registration No" value={corporateFormData.ssmRegistrationNo} />
                  <ReviewRow
                    label="Taraf (Bumi Status)"
                    value={getOptionLabel("bumiStatus", corporateFormData.bumiStatus)}
                  />
                  <ReviewRow label="Nature of Business" value={corporateFormData.natureOfBusiness} />
                  <ReviewRow
                    label="Date of Incorporation"
                    value={formatDate(corporateFormData.dateOfIncorporation)}
                  />
                  <ReviewRow
                    label="Address"
                    value={formatAddress(corporateFormData)}
                  />
                </ReviewSection>
                <ReviewSection title="Company Contact">
                  <ReviewRow label="Phone" value={corporateFormData.companyPhone} />
                  <ReviewRow label="Email" value={corporateFormData.companyEmail} />
                </ReviewSection>
                {(corporateFormData.paidUpCapital || corporateFormData.numberOfEmployees) && (
                  <ReviewSection title="Additional Details">
                    {corporateFormData.paidUpCapital && (
                      <ReviewRow
                        label="Paid-up Capital"
                        value={formatCurrency(corporateFormData.paidUpCapital)}
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
                <ReviewSection title="Directors">
                  {corporateFormData.directors.map((d, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2"
                      >
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Director {i + 1}
                          {i === 0 && " (Authorized Representative)"}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          <ReviewRow label="Name" value={d.name} />
                          <ReviewRow label="IC Number" value={d.icNumber} />
                          <ReviewRow label="Position" value={d.position} className="sm:col-span-2" />
                        </div>
                      </div>
                    ))}
                </ReviewSection>
                <ReviewSection title="Bank Information">
                  <ReviewRow
                    label="Bank"
                    value={
                      corporateFormData.bankName === "OTHER"
                        ? corporateFormData.bankNameOther
                        : getOptionLabel("bankName", corporateFormData.bankName)
                    }
                  />
                  <ReviewRow label="Account Number" value={corporateFormData.bankAccountNo} />
                </ReviewSection>
                <ReviewSection title="Social Media Profiles">
                  <ReviewRow label="Instagram" value={corporateFormData.instagram} />
                  <ReviewRow label="TikTok" value={corporateFormData.tiktok} />
                  <ReviewRow label="Facebook" value={corporateFormData.facebook} />
                  <ReviewRow label="LinkedIn" value={corporateFormData.linkedin} />
                  <ReviewRow label="X (Twitter)" value={corporateFormData.xTwitter} />
                </ReviewSection>
              </>
            )}
            <div className="flex justify-between pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirm
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
