"use client";

import { useState, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { Building2, Info, Loader2, Pencil, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  IndividualPersonalInformationEdit,
  CompanyCard,
  DirectorsCard,
} from "../borrower-form";
import {
  updateBorrower,
  type BorrowerDetail,
} from "../../lib/borrower-api-client";
import {
  formatCurrency,
  formatDate,
  formatICForDisplay,
  getOptionLabel,
} from "../../lib/borrower-form-display";
import { getCountryName, getStateName } from "../../lib/address-options";
import {
  borrowerToIndividualForm,
  borrowerToCorporateForm,
  individualFormToPayload,
  corporateFormToPayload,
} from "../../lib/borrower-to-form";
import {
  validateIndividualFormStep,
  validateCorporateFormStep,
} from "../../lib/borrower-form-validation";
import type { IndividualFormData, CorporateFormData } from "../../lib/borrower-form-types";
import { isIndividualIdentityLocked } from "../../lib/borrower-verification";

/** Matches `InfoCell` in `IndividualPersonalInformationEdit` (read-only grid cells). */
function EkycReadonlyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="text-sm font-medium text-foreground break-words">{children}</div>
    </div>
  );
}

function displayMonthlyIncome(borrower: BorrowerDetail): ReactNode {
  const raw = borrower.monthlyIncome;
  if (raw === null || raw === undefined || raw === "") {
    return (
      <>
        <span>—</span>
        <p className="text-xs text-muted-foreground font-normal mt-1">
          No monthly income (Tiada Pendapatan)
        </p>
      </>
    );
  }
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (Number.isNaN(n) || n === 0) {
    return (
      <>
        <span>—</span>
        <p className="text-xs text-muted-foreground font-normal mt-1">
          No monthly income (Tiada Pendapatan)
        </p>
      </>
    );
  }
  return formatCurrency(raw);
}

function IndividualPersonalInformationReadonly({ borrower }: { borrower: BorrowerDetail }) {
  const isIC = borrower.documentType === "IC";
  const icOrPassportDisplay = isIC ? formatICForDisplay(borrower.icNumber) : borrower.icNumber || "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          Personal Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EkycReadonlyField label="Name">{borrower.name?.trim() || "—"}</EkycReadonlyField>
          <EkycReadonlyField label="Document Type">
            {getOptionLabel("documentType", borrower.documentType)}
          </EkycReadonlyField>
          <EkycReadonlyField label="IC / Passport">{icOrPassportDisplay}</EkycReadonlyField>
          <EkycReadonlyField label="Date of Birth">{formatDate(borrower.dateOfBirth)}</EkycReadonlyField>
          <EkycReadonlyField label="Gender">{getOptionLabel("gender", borrower.gender)}</EkycReadonlyField>
          <EkycReadonlyField label="Race">{getOptionLabel("race", borrower.race)}</EkycReadonlyField>
          <EkycReadonlyField label="Education">
            {getOptionLabel("educationLevel", borrower.educationLevel)}
          </EkycReadonlyField>
          <EkycReadonlyField label="Occupation">{borrower.occupation?.trim() || "—"}</EkycReadonlyField>
          <EkycReadonlyField label="Employment">
            {getOptionLabel("employmentStatus", borrower.employmentStatus)}
          </EkycReadonlyField>
          <EkycReadonlyField label="Monthly Income (RM)">{displayMonthlyIncome(borrower)}</EkycReadonlyField>
        </div>
      </CardContent>
    </Card>
  );
}

function CorporateCompanyInformationReadonly({ borrower }: { borrower: BorrowerDetail }) {
  const c = borrowerToCorporateForm(borrower);
  const countryName = getCountryName(c.country) || c.country?.trim() || "—";
  const stateName = c.state ? getStateName(c.country, c.state) || c.state : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          Company Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EkycReadonlyField label="Company Name">{c.companyName?.trim() || "—"}</EkycReadonlyField>
          <EkycReadonlyField label="SSM Registration No">{c.ssmRegistrationNo?.trim() || "—"}</EkycReadonlyField>
          <EkycReadonlyField label="Taraf (Bumi Status)">
            {getOptionLabel("bumiStatus", c.bumiStatus)}
          </EkycReadonlyField>
          <EkycReadonlyField label="Nature of Business">{c.natureOfBusiness?.trim() || "—"}</EkycReadonlyField>
          <EkycReadonlyField label="Date of Incorporation">{formatDate(c.dateOfIncorporation)}</EkycReadonlyField>
          <div className="md:col-span-2">
            <EkycReadonlyField label="Address Line 1">{c.addressLine1?.trim() || "—"}</EkycReadonlyField>
          </div>
          <div className="md:col-span-2">
            <EkycReadonlyField label="Address Line 2 (optional)">{c.addressLine2?.trim() || "—"}</EkycReadonlyField>
          </div>
          <EkycReadonlyField label="City">{c.city?.trim() || "—"}</EkycReadonlyField>
          <EkycReadonlyField label="Postcode">{c.postcode?.trim() || "—"}</EkycReadonlyField>
          <EkycReadonlyField label="Country">{countryName}</EkycReadonlyField>
          <EkycReadonlyField label="State">{stateName}</EkycReadonlyField>
        </div>
      </CardContent>
    </Card>
  );
}

function CorporateDirectorsReadonly({ borrower }: { borrower: BorrowerDetail }) {
  const c = borrowerToCorporateForm(borrower);
  const directors = c.directors ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          Company Directors
        </CardTitle>
        <CardDescription>
          Add 1 to 10 directors. Choose exactly one authorized representative for e-KYC and loan agreements.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {directors.map((director, index) => (
            <div key={`dir-view-${index}`} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium">Director {index + 1}</p>
                {director.isAuthorizedRepresentative ? (
                  <span className="text-xs font-medium rounded-full bg-primary/15 text-primary px-2 py-0.5">
                    Authorized representative
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <EkycReadonlyField label="Director Name">{director.name?.trim() || "—"}</EkycReadonlyField>
                <EkycReadonlyField label="Director IC Number">
                  {formatICForDisplay(director.icNumber)}
                </EkycReadonlyField>
                <EkycReadonlyField label="Position">{director.position?.trim() || "—"}</EkycReadonlyField>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{directors.length}/10 directors</p>
        </div>
      </CardContent>
    </Card>
  );
}

type Props = {
  borrower: BorrowerDetail;
  onProfileSaved: () => void;
};

/** Left column on loan e-KYC step: profile TrueStack will use, with inline edit. */
export function LoanEkycProfileSummary({ borrower, onProfileSaved }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [individualForm, setIndividualForm] = useState<IndividualFormData | null>(null);
  const [corporateForm, setCorporateForm] = useState<CorporateFormData | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [noMonthlyIncome, setNoMonthlyIncome] = useState(false);
  const [saving, setSaving] = useState(false);

  const isCorporate = borrower.borrowerType === "CORPORATE";
  const identityLocked = !isCorporate && isIndividualIdentityLocked(borrower);

  const openEdit = useCallback(() => {
    setErrors({});
    if (borrower.borrowerType === "INDIVIDUAL") {
      const ind = borrowerToIndividualForm(borrower);
      setIndividualForm(ind);
      setCorporateForm(null);
      const inc = ind.monthlyIncome?.trim() ?? "";
      setNoMonthlyIncome(inc === "" || inc === "0" || parseFloat(inc) === 0);
    } else {
      setCorporateForm(borrowerToCorporateForm(borrower));
      setIndividualForm(null);
    }
    setEditOpen(true);
  }, [borrower]);

  const clearError = (key: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSave = async () => {
    if (individualForm) {
      const e = validateIndividualFormStep(individualForm, 1, noMonthlyIncome);
      if (Object.keys(e).length > 0) {
        setErrors(e);
        toast.error("Please fix the highlighted fields");
        return;
      }
      setSaving(true);
      try {
        const res = await updateBorrower(individualFormToPayload(individualForm));
        if (res.success) {
          toast.success("Profile updated");
          setEditOpen(false);
          onProfileSaved();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (corporateForm) {
      const e = {
        ...validateCorporateFormStep(corporateForm, 1),
        ...validateCorporateFormStep(corporateForm, 3),
      };
      if (Object.keys(e).length > 0) {
        setErrors(e);
        toast.error("Please fix the highlighted fields");
        return;
      }
      setSaving(true);
      try {
        const res = await updateBorrower(corporateFormToPayload(corporateForm));
        if (res.success) {
          toast.success("Profile updated");
          setEditOpen(false);
          onProfileSaved();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground min-w-0 flex-1">
          <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
          <p>
            <span className="font-medium text-foreground">Check these details match your ID.</span> TrueStack receives
            your <strong className="font-medium text-foreground">full name</strong>,{" "}
            <strong className="font-medium text-foreground">ID number</strong>, and{" "}
            <strong className="font-medium text-foreground">document type</strong> from your profile. Use{" "}
            <span className="font-medium text-foreground">Edit details</span> below or{" "}
            <Link href="/profile" className="text-primary underline-offset-4 hover:underline">
              Your Profile
            </Link>{" "}
            for other fields before you scan the QR code.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={openEdit}>
          <Pencil className="h-4 w-4 mr-2" />
          Edit details
        </Button>
      </div>

      {isCorporate ? (
        <div className="space-y-4">
          <CorporateCompanyInformationReadonly borrower={borrower} />
          <CorporateDirectorsReadonly borrower={borrower} />
        </div>
      ) : (
        <IndividualPersonalInformationReadonly borrower={borrower} />
      )}

      <p className="text-xs text-muted-foreground">
        For the scan step you need your physical ID, a working camera, and good lighting — use the panel on the right
        when you are ready.
      </p>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit details for e-KYC</DialogTitle>
            <DialogDescription>
              Changes here update your borrower profile. TrueStack uses your name, ID number, and document type
              (individual) or the authorized representative&apos;s name and IC (corporate).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {individualForm ? (
              <IndividualPersonalInformationEdit
                data={individualForm}
                onChange={(u) => setIndividualForm((prev) => (prev ? { ...prev, ...u } : null))}
                errors={errors}
                onErrorClear={clearError}
                noMonthlyIncome={noMonthlyIncome}
                onNoMonthlyIncomeChange={setNoMonthlyIncome}
                identityLocked={identityLocked}
              />
            ) : null}
            {corporateForm ? (
              <>
                <CompanyCard
                  data={corporateForm}
                  onChange={(u) => setCorporateForm((prev) => (prev ? { ...prev, ...u } : null))}
                  errors={errors}
                  onErrorClear={clearError}
                />
                <DirectorsCard
                  data={corporateForm}
                  onChange={(u) => setCorporateForm((prev) => (prev ? { ...prev, ...u } : null))}
                  errors={errors}
                  onErrorClear={clearError}
                />
              </>
            ) : null}
            <p className="text-xs text-muted-foreground">
              More profile sections and documents are on{" "}
              <Link href="/profile" className="text-primary underline-offset-4 hover:underline">
                Your Profile
              </Link>
              .
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
