"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  IdentityCard,
  PersonalCard,
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

function InfoField({
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
    <div className={`space-y-1 ${className ?? ""}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
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

interface BorrowerDetailCardProps {
  onRefresh?: () => void;
}

export function BorrowerDetailCard({ onRefresh }: BorrowerDetailCardProps) {
  const [borrower, setBorrower] = useState<BorrowerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [noMonthlyIncome, setNoMonthlyIncome] = useState(false);

  const [individualForm, setIndividualForm] = useState<IndividualFormData | null>(null);
  const [corporateForm, setCorporateForm] = useState<CorporateFormData | null>(null);

  const isIndividual = borrower?.borrowerType === "INDIVIDUAL";

  const loadBorrower = async () => {
    setLoading(true);
    try {
      const res = await fetchBorrower();
      if (res.success) {
        const data = res.data;
        setBorrower(data);
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
  };

  useEffect(() => {
    loadBorrower();
  }, []);

  // Re-fetch when user switches borrower profile (e.g. Individual → Corporate)
  useEffect(() => {
    const handler = () => loadBorrower();
    window.addEventListener(BORROWER_PROFILE_SWITCHED_EVENT, handler);
    return () =>
      window.removeEventListener(BORROWER_PROFILE_SWITCHED_EVENT, handler);
  }, []);

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
        setEditing(false);
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

  const handleCancel = () => {
    if (borrower) {
      if (borrower.borrowerType === "INDIVIDUAL") {
        setIndividualForm(borrowerToIndividualForm(borrower));
      } else {
        setCorporateForm(borrowerToCorporateForm(borrower));
      }
    }
    setEditing(false);
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
          <h2 className="text-xl font-semibold">Edit Borrower</h2>
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
              <IdentityCard
                data={individualForm}
                onChange={(u) => setIndividualForm((prev) => (prev ? { ...prev, ...u } : null))}
                errors={errors}
                onErrorClear={clearError}
              />
              <PersonalCard
                data={individualForm}
                onChange={(u) => setIndividualForm((prev) => (prev ? { ...prev, ...u } : null))}
                errors={errors}
                onErrorClear={clearError}
                noMonthlyIncome={noMonthlyIncome}
                onNoMonthlyIncomeChange={setNoMonthlyIncome}
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
      </div>
    );
  }

  const form = isIndividual ? individualForm : corporateForm;
  if (!form) return null;

  return (
    <div className="space-y-6">
      {/* Header with summary */}
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
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </div>

      {/* View mode: Individual - matches admin borrowers [id] layout */}
      {isIndividual && isIndividualFormData(form) && (
        <div className="space-y-6">
          {/* 1. Personal Information (Identity + Personal combined) */}
          <SectionCard icon={User} title="Personal Information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Name" value={form.name} />
              <InfoField label="Document Type" value={getOptionLabel("documentType", form.documentType)} />
              <InfoField label="IC / Passport" value={form.documentType === "IC" ? formatICForDisplay(form.icNumber) : form.icNumber} />
              <InfoField label="Date of Birth" value={formatDate(form.dateOfBirth)} />
              <InfoField label="Gender" value={getOptionLabel("gender", form.gender)} />
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
            <SectionCard icon={Users} title="Emergency Contact">
              <div className="grid grid-cols-1 gap-4">
                <InfoField label="Name" value={form.emergencyContactName} />
                <InfoField label="Phone" value={form.emergencyContactPhone} />
                <InfoField label="Relationship" value={getOptionLabel("emergencyContactRelationship", form.emergencyContactRelationship)} />
              </div>
            </SectionCard>
            <SectionCard icon={Phone} title="Contact Information">
              <div className="grid grid-cols-1 gap-4">
                <PhoneDisplay label="Phone" value={form.phone} toastMessage="Phone number copied" />
                <CopyField label="Email" value={form.email} toastMessage="Email copied" />
              </div>
            </SectionCard>
          </div>

          {/* 5. Social Media Profiles */}
          <SectionCard icon={Share2} title="Social Media Profiles">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Instagram" value={form.instagram} />
              <InfoField label="TikTok" value={form.tiktok} />
              <InfoField label="Facebook" value={form.facebook} />
              <InfoField label="LinkedIn" value={form.linkedin} />
              <InfoField label="X (Twitter)" value={form.xTwitter} />
            </div>
          </SectionCard>

          {/* 6. Bank Information */}
          <SectionCard icon={Banknote} title="Bank Information">
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
            <SectionCard icon={Phone} title="Company Contact">
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
                    Director {i + 1}{i === 0 ? " (Authorized Representative)" : ""}
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

          <SectionCard icon={Banknote} title="Bank">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Bank" value={getOptionLabel("bankName", form.bankName)} />
              <InfoField label="Account No" value={form.bankAccountNo} />
            </div>
          </SectionCard>

          <SectionCard icon={Share2} title="Social Media">
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
}

function isIndividualFormData(d: IndividualFormData | CorporateFormData): d is IndividualFormData {
  return "documentType" in d && "dateOfBirth" in d;
}

function isCorporateFormData(d: IndividualFormData | CorporateFormData): d is CorporateFormData {
  return "companyName" in d && "directors" in d;
}
