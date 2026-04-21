"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import {
  Pencil,
  Save,
  X,
  User,
  Building2,
  MapPin,
  Phone,
  Banknote,
  Users,
  Share2,
  Briefcase,
  Copy,
  Loader2,
  Mail,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  IndividualPersonalInformationEdit,
  AddressCard,
  ContactCard,
  BankCard,
  EmergencyContactCard,
  SocialMediaCard,
  CompanyCard,
  CompanyContactCard,
  CompanyAdditionalCard,
  DirectorsCard,
} from "./borrower-form";
import {
  fetchBorrower,
  updateBorrower,
  type BorrowerDetail,
} from "../lib/borrower-api-client";
import {
  checkEmailChange,
  confirmEmailChange,
} from "../lib/borrower-signing-client";
import { BORROWER_PROFILE_SWITCHED_EVENT } from "../lib/borrower-auth-client";
import {
  borrowerToIndividualForm,
  borrowerToCorporateForm,
  individualFormToPayload,
  corporateFormToPayload,
} from "../lib/borrower-to-form";
import {
  validateIndividualForm,
  validateCorporateForm,
  isIndividualAddressComplete,
  isIndividualContactComplete,
  isIndividualBankComplete,
  isIndividualEmergencyContactComplete,
  isIndividualSocialFullyComplete,
  isCorporateAddressComplete,
  isCorporateCompanyContactComplete,
  isCorporateBankComplete,
  isCorporateSocialFullyComplete,
} from "../lib/borrower-form-validation";
import type { IndividualFormData, CorporateFormData } from "../lib/borrower-form-types";
import {
  getOptionLabel,
  formatDate,
  formatCurrency,
  formatICForDisplay,
} from "../lib/borrower-form-display";
import {
  formatFullAddress,
  getCountryFlag,
  getCountryName,
  getStateName,
} from "../lib/address-options";
import { CopyField } from "./ui/copy-field";
import { PhoneDisplay } from "./ui/phone-display";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import { isIndividualIdentityLocked } from "../lib/borrower-verification";
import { SectionCompleteBadge, SectionOptionalBadge, VerifiedBadge } from "./ui/status-row";

function InfoField({
  label,
  value,
  className,
  verified,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
  verified?: boolean;
}) {
  const display = value?.trim() || "—";
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
        {label}
        {verified ? <VerifiedBadge /> : null}
      </p>
      <p className="text-sm font-medium text-foreground break-words">{display}</p>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  headerAction,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className={cn("pb-3", headerAction && "flex flex-row items-start justify-between space-y-0")}>
        <div>
          <CardTitle className="flex items-center gap-2 text-lg font-heading font-semibold">
            <Icon className="h-5 w-5 text-muted-foreground" />
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {headerAction}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export interface BorrowerDetailCardHandle {
  refresh: () => Promise<void>;
  startEdit: () => void;
}

interface BorrowerDetailCardProps {
  onRefresh?: () => void;
  /** Hide the inline "Edit" in the card header when the page provides its own Edit Borrower button */
  hideInlineEditButton?: boolean;
  /** Hide the view-mode title row (name, badge, ID line) when the host page shows it above the card */
  hideViewHeader?: boolean;
  /** Called after borrower data is loaded or refreshed (e.g. to sync a page-level header) */
  onBorrowerLoaded?: (data: BorrowerDetail) => void;
  onEditingChange?: (editing: boolean) => void;
}

export const BorrowerDetailCard = forwardRef<
  BorrowerDetailCardHandle,
  BorrowerDetailCardProps
>(function BorrowerDetailCard(
  { onRefresh, hideInlineEditButton, hideViewHeader, onBorrowerLoaded, onEditingChange },
  ref
) {
  const [borrower, setBorrower] = useState<BorrowerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [noMonthlyIncome, setNoMonthlyIncome] = useState(false);

  const [individualForm, setIndividualForm] = useState<IndividualFormData | null>(null);
  const [corporateForm, setCorporateForm] = useState<CorporateFormData | null>(null);

  const [emailOtpDialog, setEmailOtpDialog] = useState(false);
  const [emailOtpValue, setEmailOtpValue] = useState("");
  const [emailOtpBusy, setEmailOtpBusy] = useState(false);
  const [emailOtpError, setEmailOtpError] = useState<string | null>(null);
  const pendingNewEmailRef = useRef<string | null>(null);

  const isIndividual = borrower?.borrowerType === "INDIVIDUAL";
  const identityLocked =
    Boolean(borrower && isIndividual && isIndividualIdentityLocked(borrower));

  const individualSectionBadges = useMemo(() => {
    if (!individualForm) return null;
    return {
      address: isIndividualAddressComplete(individualForm),
      emergency: isIndividualEmergencyContactComplete(individualForm),
      contact: isIndividualContactComplete(individualForm),
      social: isIndividualSocialFullyComplete(individualForm),
      bank: isIndividualBankComplete(individualForm),
    };
  }, [individualForm]);

  const corporateSectionBadges = useMemo(() => {
    if (!corporateForm) return null;
    return {
      address: isCorporateAddressComplete(corporateForm),
      companyContact: isCorporateCompanyContactComplete(corporateForm),
      social: isCorporateSocialFullyComplete(corporateForm),
      bank: isCorporateBankComplete(corporateForm),
    };
  }, [corporateForm]);

  const onBorrowerLoadedRef = useRef(onBorrowerLoaded);
  useEffect(() => {
    onBorrowerLoadedRef.current = onBorrowerLoaded;
  });

  const loadBorrower = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchBorrower();
      if (res.success) {
        const data = res.data;
        setBorrower(data);
        onBorrowerLoadedRef.current?.(data);
        if (data.borrowerType === "INDIVIDUAL") {
          setIndividualForm(borrowerToIndividualForm(data));
        } else {
          setCorporateForm(borrowerToCorporateForm(data));
        }
      }
    } catch {
      toast.error("Failed to load borrower");
    } finally {
      setLoading(false);
    }
  }, []);

  const updateEditing = useCallback(
    (next: boolean) => {
      setEditing(next);
      onEditingChange?.(next);
    },
    [onEditingChange]
  );

  useImperativeHandle(
    ref,
    () => ({
      refresh: () => loadBorrower(),
      startEdit: () => updateEditing(true),
    }),
    [loadBorrower, updateEditing]
  );

  useEffect(() => {
    void loadBorrower();
  }, [loadBorrower]);

  // Re-fetch when user switches borrower profile (e.g. Individual → Corporate)
  useEffect(() => {
    const handler = () => void loadBorrower();
    window.addEventListener(BORROWER_PROFILE_SWITCHED_EVENT, handler);
    return () =>
      window.removeEventListener(BORROWER_PROFILE_SWITCHED_EVENT, handler);
  }, [loadBorrower]);

  useEffect(() => {
    if (borrower) {
      if (borrower.borrowerType === "INDIVIDUAL") {
        setIndividualForm(borrowerToIndividualForm(borrower));
      } else {
        setCorporateForm(borrowerToCorporateForm(borrower));
      }
    }
  }, [borrower?.id]);

  const clearError = (key: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const getFormEmail = (): string | null => {
    if (isIndividual && individualForm) return individualForm.email?.trim() || null;
    if (!isIndividual && corporateForm) return corporateForm.email?.trim() || null;
    return null;
  };

  const finishSave = async () => {
    if (!borrower) return;
    setSaving(true);
    try {
      const payload = isIndividual && individualForm
        ? individualFormToPayload(individualForm)
        : !isIndividual && corporateForm
        ? corporateFormToPayload(corporateForm)
        : {};
      const res = await updateBorrower(payload);
      if (res.success) {
        setBorrower(res.data);
        updateEditing(false);
        setErrors({});
        onRefresh?.();
        toast.success("Borrower updated");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!borrower) return;
    const validationErrors = isIndividual && individualForm
      ? validateIndividualForm(individualForm, noMonthlyIncome)
      : !isIndividual && corporateForm
      ? validateCorporateForm(corporateForm)
      : {};
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      toast.error("Please fix the errors before saving");
      return;
    }

    const newEmail = getFormEmail();
    const oldEmail = borrower.email?.trim() || null;
    const emailChanged = newEmail && newEmail !== oldEmail;

    if (emailChanged) {
      setSaving(true);
      try {
        const check = await checkEmailChange(newEmail);
        if (check.requiresOtp) {
          if (!check.success) {
            toast.error(check.error || "Failed to initiate email change verification");
            setSaving(false);
            return;
          }
          pendingNewEmailRef.current = newEmail;
          setEmailOtpValue("");
          setEmailOtpError(null);
          setEmailOtpDialog(true);
          setSaving(false);
          return;
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to check email");
        setSaving(false);
        return;
      }
    }

    await finishSave();
  };

  const handleConfirmEmailOtp = async () => {
    const newEmail = pendingNewEmailRef.current;
    if (!newEmail || !emailOtpValue.trim()) return;
    setEmailOtpBusy(true);
    setEmailOtpError(null);
    try {
      const result = await confirmEmailChange(newEmail, emailOtpValue.trim());
      if (!result.success) {
        setEmailOtpError(
          result.errorDescription || result.statusMsg || "Invalid OTP. Please try again."
        );
        setEmailOtpValue("");
        setEmailOtpBusy(false);
        return;
      }
      setEmailOtpDialog(false);
      pendingNewEmailRef.current = null;
      toast.success("Email updated in certificate system");
      await finishSave();
    } catch (err) {
      setEmailOtpError(err instanceof Error ? err.message : "Failed to confirm email change");
      setEmailOtpValue("");
    } finally {
      setEmailOtpBusy(false);
    }
  };

  const handleResendEmailOtp = async () => {
    const newEmail = pendingNewEmailRef.current;
    if (!newEmail) return;
    setEmailOtpBusy(true);
    setEmailOtpError(null);
    try {
      const check = await checkEmailChange(newEmail);
      if (check.success && check.otpSent) {
        toast.success("OTP resent to " + newEmail);
      } else {
        setEmailOtpError(check.error || "Failed to resend OTP");
      }
    } catch (err) {
      setEmailOtpError(err instanceof Error ? err.message : "Failed to resend OTP");
    } finally {
      setEmailOtpBusy(false);
    }
  };

  const handleCancel = () => {
    if (borrower) {
      if (borrower.borrowerType === "INDIVIDUAL") {
        setIndividualForm(borrowerToIndividualForm(borrower));
      } else {
        setCorporateForm(borrowerToCorporateForm(borrower));
      }
    }
    updateEditing(false);
    setErrors({});
  };

  if (loading || !borrower) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground text-center">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-heading font-bold">
              {isIndividual && individualForm
                ? individualForm.name
                : corporateForm?.companyName ?? "Borrower"}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant={isIndividual ? "outline" : "secondary"}>
                {isIndividual ? (
                  <User className="h-3 w-3 mr-1" />
                ) : (
                  <Building2 className="h-3 w-3 mr-1" />
                )}
                {isIndividual ? "Individual" : "Corporate"}
              </Badge>
              {isIndividual && individualForm && (
                <span className="text-sm text-muted-foreground">
                  {individualForm.documentType === "IC"
                    ? formatICForDisplay(individualForm.icNumber)
                    : individualForm.icNumber}
                </span>
              )}
              {!isIndividual && corporateForm && (
                <span className="text-sm text-muted-foreground">
                  SSM: {corporateForm.ssmRegistrationNo || "—"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Update your details below, then save.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={saving}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
        <div className="space-y-6">
          {isIndividual && individualForm ? (
            <>
              <IndividualPersonalInformationEdit
                data={individualForm}
                onChange={(u) => setIndividualForm((prev) => (prev ? { ...prev, ...u } : null))}
                errors={errors}
                onErrorClear={clearError}
                noMonthlyIncome={noMonthlyIncome}
                onNoMonthlyIncomeChange={setNoMonthlyIncome}
                identityLocked={identityLocked}
              />
              <AddressCard
                data={individualForm}
                onChange={(u) => setIndividualForm((prev) => (prev ? { ...prev, ...u } : null))}
                errors={errors}
                onErrorClear={clearError}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <EmergencyContactCard
                  data={individualForm}
                  onChange={(u) => setIndividualForm((prev) => (prev ? { ...prev, ...u } : null))}
                />
                <ContactCard
                  data={individualForm}
                  onChange={(u) => setIndividualForm((prev) => (prev ? { ...prev, ...u } : null))}
                  errors={errors}
                  onErrorClear={clearError}
                  includeAddress={false}
                />
              </div>
              <SocialMediaCard
                data={individualForm}
                onChange={(u) => setIndividualForm((prev) => (prev ? { ...prev, ...u } : null))}
              />
              <BankCard
                data={individualForm}
                onChange={(u) => setIndividualForm((prev) => (prev ? { ...prev, ...u } : null))}
                errors={errors}
                onErrorClear={clearError}
              />
            </>
          ) : corporateForm ? (
            <>
              <CompanyCard
                data={corporateForm}
                onChange={(u) => setCorporateForm((prev) => (prev ? { ...prev, ...u } : null))}
                errors={errors}
                onErrorClear={clearError}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <CompanyAdditionalCard
                  data={corporateForm}
                  onChange={(u) => setCorporateForm((prev) => (prev ? { ...prev, ...u } : null))}
                />
                <CompanyContactCard
                  data={corporateForm}
                  onChange={(u) => setCorporateForm((prev) => (prev ? { ...prev, ...u } : null))}
                  errors={errors}
                  onErrorClear={clearError}
                />
              </div>
              <DirectorsCard
                data={corporateForm}
                onChange={(u) => setCorporateForm((prev) => (prev ? { ...prev, ...u } : null))}
                errors={errors}
                onErrorClear={clearError}
              />
              <BankCard
                data={corporateForm}
                onChange={(u) => setCorporateForm((prev) => (prev ? { ...prev, ...u } : null))}
                errors={errors}
                onErrorClear={clearError}
              />
              <SocialMediaCard
                data={corporateForm}
                onChange={(u) => setCorporateForm((prev) => (prev ? { ...prev, ...u } : null))}
              />
            </>
          ) : null}
        </div>

        <Dialog open={emailOtpDialog} onOpenChange={(open) => {
          if (!open && !emailOtpBusy) {
            setEmailOtpDialog(false);
            pendingNewEmailRef.current = null;
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Verify new email
              </DialogTitle>
              <DialogDescription>
                Your email is linked to your digital signing certificate. An OTP
                has been sent to{" "}
                <span className="font-medium text-foreground break-all">
                  {pendingNewEmailRef.current}
                </span>{" "}
                to verify the change.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {emailOtpError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                  {emailOtpError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email-change-otp">Email OTP</Label>
                <Input
                  id="email-change-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter 6-digit code"
                  maxLength={8}
                  value={emailOtpValue}
                  onChange={(e) =>
                    setEmailOtpValue(e.target.value.replace(/\D/g, ""))
                  }
                  disabled={emailOtpBusy}
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleResendEmailOtp()}
                disabled={emailOtpBusy}
              >
                Resend OTP
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirmEmailOtp()}
                disabled={emailOtpBusy || !emailOtpValue.trim()}
              >
                {emailOtpBusy ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Confirm email change
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const form = isIndividual ? individualForm : corporateForm;
  if (!form) return null;

  return (
    <div className="space-y-6">
      {!hideViewHeader ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-2xl font-heading font-bold">
                {isIndividual && isIndividualFormData(form)
                  ? form.name
                  : isCorporateFormData(form)
                  ? form.companyName
                  : "Borrower"}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={isIndividual ? "outline" : "secondary"}>
                  {isIndividual ? (
                    <User className="h-3 w-3 mr-1" />
                  ) : (
                    <Building2 className="h-3 w-3 mr-1" />
                  )}
                  {isIndividual ? "Individual" : "Corporate"}
                </Badge>
                {isIndividual && isIndividualFormData(form) && (
                  <span className="text-sm text-muted-foreground">
                    {form.documentType === "IC"
                      ? formatICForDisplay(form.icNumber)
                      : form.icNumber}
                  </span>
                )}
                {isCorporateFormData(form) && (
                  <span className="text-sm text-muted-foreground">
                    SSM: {form.ssmRegistrationNo || "—"}
                  </span>
                )}
              </div>
            </div>
          </div>
          {!hideInlineEditButton ? (
            <Button variant="outline" onClick={() => updateEditing(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* View mode: Individual - matches admin borrowers [id] layout */}
      {isIndividual && isIndividualFormData(form) && (
        <div className="space-y-6">
          {/* 1. Personal Information (Identity + Personal combined) */}
          <SectionCard
            icon={User}
            title="Personal information"
            description={
              identityLocked
                ? "Your identity has been verified by e-KYC. Your name, IC, date of birth and gender are locked. Contact support if any of these need updating."
                : undefined
            }
            headerAction={identityLocked ? <SectionCompleteBadge complete /> : undefined}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Full name" value={form.name} verified={identityLocked} />
              <InfoField label="Document type" value={getOptionLabel("documentType", form.documentType)} verified={identityLocked} />
              <InfoField
                label="IC / Passport number"
                value={form.documentType === "IC" ? formatICForDisplay(form.icNumber) : form.icNumber}
                verified={identityLocked}
              />
              <InfoField label="Date of birth" value={formatDate(form.dateOfBirth)} verified={identityLocked} />
              <InfoField label="Gender" value={getOptionLabel("gender", form.gender)} verified={identityLocked} />
              <InfoField label="Race" value={getOptionLabel("race", form.race)} />
              <InfoField label="Education" value={getOptionLabel("educationLevel", form.educationLevel)} />
              <InfoField label="Occupation" value={form.occupation} />
              <InfoField label="Employment" value={getOptionLabel("employmentStatus", form.employmentStatus)} />
              <InfoField label="Monthly Income" value={formatCurrency(form.monthlyIncome)} />
            </div>
          </SectionCard>

          {/* 2. Address */}
          <SectionCard
            icon={MapPin}
            title="Address"
            headerAction={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {individualSectionBadges ? (
                  <SectionCompleteBadge complete={individualSectionBadges.address} />
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const full = formatFullAddress(form);
                    if (!full) {
                      toast.error("No address to copy");
                      return;
                    }
                    try {
                      await navigator.clipboard.writeText(full);
                      toast.success("Full address copied to clipboard");
                    } catch {
                      toast.error("Failed to copy to clipboard");
                    }
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy full address
                </Button>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CopyField label="Address Line 1" value={form.addressLine1} className="md:col-span-2" />
              <CopyField label="Address Line 2 (optional)" value={form.addressLine2} className="md:col-span-2" />
              <CopyField label="City" value={form.city} />
              <CopyField
                label="State"
                value={form.state ? getStateName(form.country, form.state) : null}
              />
              <CopyField label="Postcode" value={form.postcode} />
              <CopyField
                label="Country"
                value={form.country ? `${getCountryFlag(form.country)} ${getCountryName(form.country) || ""}`.trim() : null}
              />
            </div>
          </SectionCard>

          {/* 3 & 4. Emergency Contact + Contact Information side by side (stack on mobile) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SectionCard
              icon={Users}
              title="Emergency Contact"
              headerAction={
                individualSectionBadges ? (
                  <SectionOptionalBadge complete={individualSectionBadges.emergency} />
                ) : null
              }
            >
              <div className="grid grid-cols-1 gap-4">
                <InfoField label="Name" value={form.emergencyContactName} />
                <InfoField label="Phone" value={form.emergencyContactPhone} />
                <InfoField label="Relationship" value={getOptionLabel("emergencyContactRelationship", form.emergencyContactRelationship)} />
              </div>
            </SectionCard>
            <SectionCard
              icon={Phone}
              title="Contact Information"
              headerAction={
                individualSectionBadges ? (
                  <SectionCompleteBadge complete={individualSectionBadges.contact} />
                ) : null
              }
            >
              <div className="grid grid-cols-1 gap-4">
                <PhoneDisplay label="Phone" value={form.phone} toastMessage="Phone number copied" />
                <CopyField label="Email" value={form.email} toastMessage="Email copied" />
              </div>
            </SectionCard>
          </div>

          {/* 5. Social Media Profiles */}
          <SectionCard
            icon={Share2}
            title="Social Media Profiles"
            headerAction={
              individualSectionBadges ? (
                <SectionOptionalBadge complete={individualSectionBadges.social} />
              ) : null
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Instagram" value={form.instagram} />
              <InfoField label="TikTok" value={form.tiktok} />
              <InfoField label="Facebook" value={form.facebook} />
              <InfoField label="LinkedIn" value={form.linkedin} />
              <InfoField label="X (Twitter)" value={form.xTwitter} />
            </div>
          </SectionCard>

          {/* 6. Bank Information */}
          <SectionCard
            icon={Banknote}
            title="Bank Information"
            headerAction={
              individualSectionBadges ? (
                <SectionCompleteBadge complete={individualSectionBadges.bank} />
              ) : null
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Bank" value={getOptionLabel("bankName", form.bankName)} />
              <InfoField label="Account No" value={form.bankAccountNo} />
            </div>
          </SectionCard>
        </div>
      )}

      {/* View mode: Corporate - matches admin borrowers [id] layout */}
      {form && isCorporateFormData(form) && (
        <div className="space-y-6">
          <SectionCard icon={Building2} title="Company Information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Company Name" value={form.companyName} />
              <InfoField label="SSM Registration No" value={form.ssmRegistrationNo} />
              <InfoField label="Taraf (Bumi Status)" value={getOptionLabel("bumiStatus", form.bumiStatus)} />
              <InfoField label="Nature of Business" value={form.natureOfBusiness} />
              <InfoField label="Date of Incorporation" value={formatDate(form.dateOfIncorporation)} />
            </div>
          </SectionCard>

          <SectionCard
            icon={MapPin}
            title="Address"
            headerAction={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {corporateSectionBadges ? (
                  <SectionCompleteBadge complete={corporateSectionBadges.address} />
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const full = formatFullAddress(form);
                    if (!full) {
                      toast.error("No address to copy");
                      return;
                    }
                    try {
                      await navigator.clipboard.writeText(full);
                      toast.success("Full address copied to clipboard");
                    } catch {
                      toast.error("Failed to copy to clipboard");
                    }
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy full address
                </Button>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CopyField label="Address Line 1" value={form.addressLine1} className="md:col-span-2" />
              <CopyField label="Address Line 2 (optional)" value={form.addressLine2} className="md:col-span-2" />
              <CopyField label="City" value={form.city} />
              <CopyField
                label="State"
                value={form.state ? getStateName(form.country, form.state) : null}
              />
              <CopyField label="Postcode" value={form.postcode} />
              <CopyField
                label="Country"
                value={form.country ? `${getCountryFlag(form.country)} ${getCountryName(form.country) || ""}`.trim() : null}
              />
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SectionCard icon={Briefcase} title="Additional Details">
              <div className="grid grid-cols-1 gap-4">
                <InfoField label="Paid-up Capital (RM)" value={formatCurrency(form.paidUpCapital)} />
                <InfoField label="Number of Employees" value={form.numberOfEmployees} />
              </div>
            </SectionCard>
            <SectionCard
              icon={Phone}
              title="Company Contact"
              headerAction={
                corporateSectionBadges ? (
                  <SectionCompleteBadge complete={corporateSectionBadges.companyContact} />
                ) : null
              }
            >
              <div className="grid grid-cols-1 gap-4">
                <InfoField label="Phone" value={form.companyPhone} />
                <InfoField label="Email" value={form.companyEmail} />
              </div>
            </SectionCard>
          </div>

          <SectionCard icon={User} title="Company Directors" description="Minimum 1, maximum 10 directors">
            <div className="space-y-3">
              {form.directors.map((d, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-medium">
                    Director {i + 1}
                    {d.isAuthorizedRepresentative ? (
                      <span className="ml-2 text-xs font-normal text-primary">(Authorized representative)</span>
                    ) : null}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InfoField label="Name" value={d.name} />
                    <InfoField label="IC" value={d.icNumber ? formatICForDisplay(d.icNumber) : null} />
                    <InfoField label="Position" value={d.position} className="md:col-span-2" />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            icon={Banknote}
            title="Bank"
            headerAction={
              corporateSectionBadges ? (
                <SectionCompleteBadge complete={corporateSectionBadges.bank} />
              ) : null
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Bank" value={getOptionLabel("bankName", form.bankName)} />
              <InfoField label="Account No" value={form.bankAccountNo} />
            </div>
          </SectionCard>

          <SectionCard
            icon={Share2}
            title="Social Media"
            headerAction={
              corporateSectionBadges ? (
                <SectionOptionalBadge complete={corporateSectionBadges.social} />
              ) : null
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Instagram" value={form.instagram} />
              <InfoField label="TikTok" value={form.tiktok} />
              <InfoField label="Facebook" value={form.facebook} />
              <InfoField label="LinkedIn" value={form.linkedin} />
              <InfoField label="X (Twitter)" value={form.xTwitter} />
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
});

function isIndividualFormData(d: IndividualFormData | CorporateFormData): d is IndividualFormData {
  return "documentType" in d && "dateOfBirth" in d;
}

function isCorporateFormData(d: IndividualFormData | CorporateFormData): d is CorporateFormData {
  return "companyName" in d && "directors" in d;
}
