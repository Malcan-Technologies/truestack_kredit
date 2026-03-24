"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  FolderOpen,
  Loader2,
  Package,
  User,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { NumericInput } from "../ui/numeric-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { cn } from "../../lib/utils";
import { formatCurrency } from "../../lib/borrower-form-display";
import type { BorrowerProduct, LoanPreviewData, ApplicationStep } from "../../lib/application-form-types";
import {
  fetchBorrowerProducts,
  previewBorrowerApplication,
  createBorrowerApplication,
  updateBorrowerApplication,
  getBorrowerApplication,
  submitBorrowerApplication,
} from "../../lib/borrower-applications-client";
import {
  validateLoanDetailsStep,
  toAmountNumber,
  requiredDocumentsSatisfied,
  allDocumentsOptional,
} from "../../lib/application-form-validation";
import { BORROWER_PROFILE_SWITCHED_EVENT } from "../../lib/borrower-auth-client";
import { fetchBorrower, updateBorrower } from "../../lib/borrower-api-client";
import {
  borrowerToIndividualForm,
  borrowerToCorporateForm,
  individualFormToPayload,
  corporateFormToPayload,
} from "../../lib/borrower-to-form";
import type { IndividualFormData, CorporateFormData } from "../../lib/borrower-form-types";
import { initialIndividualFormData, initialCorporateFormData } from "../../lib/borrower-form-initial";
import { validateIndividualForm, validateCorporateForm } from "../../lib/borrower-form-validation";
import {
  IdentityCard,
  PersonalCard,
  ContactCard,
  BankCard,
  CompanyCard,
  CompanyContactCard,
  CompanyAdditionalCard,
  DirectorsCard,
} from "../borrower-form";
import { ApplicationDocumentsCard } from "./application-documents-card";

const STEPS: {
  id: ApplicationStep;
  label: string;
  short: string;
  icon: typeof Package;
}[] = [
  { id: "product", label: "Select Product", short: "Product", icon: Package },
  { id: "loan_details", label: "Application Details", short: "Details", icon: FileText },
  { id: "personal", label: "Personal Information", short: "Your details", icon: User },
  { id: "documents", label: "Supporting Documents", short: "Documents", icon: FolderOpen },
  { id: "review", label: "Review & Submit", short: "Review", icon: ClipboardCheck },
];

export function ApplicationFlowWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeHandledRef = useRef(false);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<BorrowerProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | "">("");
  const [term, setTerm] = useState<number | "">("");
  const [collateralType, setCollateralType] = useState("");
  const [collateralValue, setCollateralValue] = useState<number | "">("");
  const [preview, setPreview] = useState<LoanPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [borrowerType, setBorrowerType] = useState<"INDIVIDUAL" | "CORPORATE" | null>(null);
  const [individualForm, setIndividualForm] = useState<IndividualFormData>(initialIndividualFormData);
  const [corporateForm, setCorporateForm] = useState<CorporateFormData>(initialCorporateFormData);
  const [noMonthlyIncome, setNoMonthlyIncome] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [loanErrors, setLoanErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [reviewApp, setReviewApp] = useState<Awaited<
    ReturnType<typeof getBorrowerApplication>
  >["data"] | null>(null);
  const [reviewPreview, setReviewPreview] = useState<LoanPreviewData | null>(null);

  const [docDialog, setDocDialog] = useState<"none" | "optional">("none");

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchBorrowerProducts();
      if (res.success) setProducts(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  /** Clear in-progress application state — required when active borrower changes. */
  const resetWizardForProfileSwitch = useCallback(() => {
    setStep(0);
    setSelectedProductId(null);
    setApplicationId(null);
    setAmount("");
    setTerm("");
    setCollateralType("");
    setCollateralValue("");
    setPreview(null);
    setReviewApp(null);
    setReviewPreview(null);
    setConsent(false);
    setDocDialog("none");
    resumeHandledRef.current = false;
    setLoanErrors({});
    setFormErrors({});
    setBorrowerType(null);
    setIndividualForm(initialIndividualFormData);
    setCorporateForm(initialCorporateFormData);
    setNoMonthlyIncome(false);
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const appId = searchParams.get("applicationId");
    if (!appId || loading || products.length === 0) return;
    if (resumeHandledRef.current) return;
    resumeHandledRef.current = true;

    void (async () => {
      let r: Awaited<ReturnType<typeof getBorrowerApplication>>;
      try {
        r = await getBorrowerApplication(appId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load application");
        return;
      }
      if (!r.success) {
        toast.error("Could not load application");
        return;
      }
      const app = r.data;
      if (app.status !== "DRAFT") {
        router.replace(`/applications/${appId}/documents`);
        return;
      }
      setApplicationId(app.id);
      setSelectedProductId(app.productId);
      setAmount(toAmountNumber(app.amount));
      setTerm(app.term);
      setCollateralType(app.collateralType ?? "");
      setCollateralValue(
        app.collateralValue != null && app.collateralValue !== ""
          ? toAmountNumber(app.collateralValue as number | string)
          : ""
      );
      setReviewApp(app);
      const focus = searchParams.get("focus");
      if (focus === "documents") {
        setStep(3);
      } else {
        setStep(1);
      }
    })();
  }, [loading, products.length, searchParams, router]);

  useEffect(() => {
    const onProfileSwitch = () => {
      resetWizardForProfileSwitch();
      void loadProducts();
      toast.info("Borrower profile switched. Product list updated for this profile.");
    };
    window.addEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onProfileSwitch);
    return () => window.removeEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onProfileSwitch);
  }, [loadProducts, resetWizardForProfileSwitch]);

  useEffect(() => {
    if (!selectedProduct || amount === "" || term === "" || Number(amount) <= 0 || Number(term) <= 0) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      setPreviewLoading(true);
      previewBorrowerApplication({
        productId: selectedProduct.id,
        amount: Number(amount),
        term: Number(term),
      })
        .then((r) => setPreview(r.data))
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [selectedProduct, amount, term]);

  const loadBorrowerForPersonal = useCallback(async () => {
    const res = await fetchBorrower();
    if (!res.success) throw new Error("Failed to load borrower");
    const bt = res.data.borrowerType as "INDIVIDUAL" | "CORPORATE";
    setBorrowerType(bt);
    if (bt === "INDIVIDUAL") {
      setIndividualForm(borrowerToIndividualForm(res.data));
      const inc = res.data.monthlyIncome;
      if (inc === null || inc === undefined) {
        setNoMonthlyIncome(false);
      } else if (Number(inc) === 0) {
        setNoMonthlyIncome(true);
      } else {
        setNoMonthlyIncome(false);
      }
    } else {
      setCorporateForm(borrowerToCorporateForm(res.data));
    }
  }, []);

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    (async () => {
      try {
        await loadBorrowerForPersonal();
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load profile");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, loadBorrowerForPersonal]);

  const termOptions = useMemo(() => {
    if (!selectedProduct) return [];
    const opts: number[] = [];
    for (let m = selectedProduct.minTerm; m <= selectedProduct.maxTerm; m += 1) {
      opts.push(m);
    }
    return opts;
  }, [selectedProduct]);

  const handleNextFromLoanDetails = async () => {
    if (!selectedProduct) {
      toast.error("Select a product");
      return;
    }
    const errs = validateLoanDetailsStep({
      product: selectedProduct,
      amount,
      term,
      collateralType,
      collateralValue,
    });
    setLoanErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = {
      productId: selectedProduct.id,
      amount: Number(amount),
      term: Number(term),
      ...(selectedProduct.loanScheduleType === "JADUAL_K"
        ? {
            collateralType: collateralType.trim(),
            collateralValue:
              collateralValue === "" ? undefined : Number(collateralValue),
          }
        : {}),
    };

    setSaving(true);
    try {
      if (!applicationId) {
        const created = await createBorrowerApplication(payload);
        setApplicationId(created.data.id);
      } else {
        await updateBorrowerApplication(applicationId, {
          productId: payload.productId,
          amount: payload.amount,
          term: payload.term,
          collateralType: payload.collateralType ?? null,
          collateralValue: payload.collateralValue ?? null,
        });
      }
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save application");
    } finally {
      setSaving(false);
    }
  };

  const handleNextFromPersonal = async () => {
    if (borrowerType === "INDIVIDUAL") {
      const errs = validateIndividualForm(individualForm, noMonthlyIncome);
      setFormErrors(errs);
      if (Object.keys(errs).length > 0) {
        toast.error("Please fix the highlighted fields");
        return;
      }
      setSaving(true);
      try {
        await updateBorrower(individualFormToPayload(individualForm));
        setStep(3);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save profile");
      } finally {
        setSaving(false);
      }
    } else if (borrowerType === "CORPORATE") {
      const errs = validateCorporateForm(corporateForm);
      setFormErrors(errs);
      if (Object.keys(errs).length > 0) {
        toast.error("Please fix the highlighted fields");
        return;
      }
      setSaving(true);
      try {
        await updateBorrower(corporateFormToPayload(corporateForm));
        setStep(3);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save profile");
      } finally {
        setSaving(false);
      }
    } else {
      toast.error("Borrower type not loaded");
    }
  };

  const refreshApplication = useCallback(async () => {
    if (!applicationId) return;
    const r = await getBorrowerApplication(applicationId);
    if (r.success) setReviewApp(r.data);
  }, [applicationId]);

  useEffect(() => {
    if (step >= 3 && applicationId) {
      refreshApplication().catch(() => {});
    }
  }, [step, applicationId, refreshApplication]);

  useEffect(() => {
    if (step !== 4 || !reviewApp) {
      setReviewPreview(null);
      return;
    }
    let cancelled = false;
    previewBorrowerApplication({
      productId: reviewApp.productId,
      amount: toAmountNumber(reviewApp.amount),
      term: reviewApp.term,
    })
      .then((r) => {
        if (!cancelled) setReviewPreview(r.data);
      })
      .catch(() => {
        if (!cancelled) setReviewPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [step, reviewApp]);

  const requiredDocs = selectedProduct?.requiredDocuments ?? [];

  const uploadedCategories = useMemo(
    () => new Set((reviewApp?.documents ?? []).map((d) => d.category)),
    [reviewApp?.documents]
  );

  const requiredDocsMissing = useMemo(
    () =>
      requiredDocs.some((d) => d.required) &&
      !requiredDocumentsSatisfied(requiredDocs, uploadedCategories),
    [requiredDocs, uploadedCategories]
  );

  const documentsStepContinueLabel = useMemo(() => {
    if (!reviewApp) return "Continue";
    const cats = new Set((reviewApp.documents ?? []).map((d) => d.category));
    const uploadedCount = reviewApp.documents?.length ?? 0;
    if (
      requiredDocs.length > 0 &&
      allDocumentsOptional(requiredDocs) &&
      uploadedCount === 0
    ) {
      return "Continue without uploading";
    }
    return "Continue";
  }, [reviewApp, requiredDocs]);

  const handleNextFromDocuments = async () => {
    if (!applicationId || !reviewApp) return;
    const cats = new Set((reviewApp.documents ?? []).map((d) => d.category));
    const hasRequired = requiredDocs.some((d) => d.required);
    const uploadedCount = reviewApp.documents?.length ?? 0;

    if (hasRequired && !requiredDocumentsSatisfied(requiredDocs, cats)) {
      toast.error("Upload all required documents (marked with *) before continuing.");
      return;
    }
    if (requiredDocumentsSatisfied(requiredDocs, cats)) {
      setStep(4);
      return;
    }
    if (uploadedCount === 0) {
      setDocDialog("optional");
      return;
    }
    setStep(4);
  };

  const handleConfirmDeferOptional = () => {
    setDocDialog("none");
    setStep(4);
  };

  const handleSubmitFinal = async () => {
    if (!applicationId || !consent) {
      toast.error("Please accept the terms to submit");
      return;
    }
    if (requiredDocsMissing) {
      toast.error("Upload all required documents before submitting.");
      return;
    }
    setSaving(true);
    try {
      await submitBorrowerApplication(applicationId);
      toast.success("Application submitted");
      router.push("/applications");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSaving(false);
    }
  };

  const clearFieldError = (key: string) => {
    setFormErrors((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Apply for a Loan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete the steps below to submit your loan application.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex flex-wrap gap-2 justify-between items-start border-b border-border pb-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const done = i < step;
          return (
            <div
              key={s.id}
              className={cn(
                "flex flex-col items-center gap-1 min-w-[100px] max-w-[140px] text-center",
                active && "text-primary",
                done && "text-foreground",
                !active && !done && "text-muted-foreground"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm",
                  active && "border-primary bg-primary/10",
                  done && "border-primary bg-primary text-primary-foreground",
                  !active && !done && "border-dashed border-muted-foreground/40"
                )}
              >
                {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <span className="text-xs font-medium leading-tight">{s.label}</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {step === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Choose a loan product</CardTitle>
                <CardDescription>
                  Select the product that fits your needs. You can review full terms on the right.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground col-span-full">
                    No products are available yet. Please check back later.
                  </p>
                ) : (
                  products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProductId(p.id)}
                      className={cn(
                        "text-left rounded-lg border p-4 transition-colors hover:border-primary/50",
                        selectedProductId === p.id && "border-primary ring-2 ring-primary/20"
                      )}
                    >
                      <div className="font-medium">{p.name}</div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {p.description ?? "—"}
                      </p>
                      <div className="mt-2 text-xs text-muted-foreground">
                        RM {toAmountNumber(p.minAmount).toLocaleString()} – RM{" "}
                        {toAmountNumber(p.maxAmount).toLocaleString()}
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {step === 1 && selectedProduct && (
            <Card>
              <CardHeader>
                <CardTitle>Loan details — {selectedProduct.name}</CardTitle>
                <CardDescription>
                  Enter amount and term. We&apos;ll show your estimated repayment and fees.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Loan amount (RM)</Label>
                  <NumericInput
                    className="mt-1"
                    value={amount}
                    onChange={(v) => setAmount(v === "" ? "" : typeof v === "number" ? v : 0)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Between RM {toAmountNumber(selectedProduct.minAmount).toLocaleString()} and RM{" "}
                    {toAmountNumber(selectedProduct.maxAmount).toLocaleString()}
                  </p>
                  {loanErrors.amount && (
                    <p className="text-xs text-destructive mt-1">{loanErrors.amount}</p>
                  )}
                </div>
                <div>
                  <Label>Loan term (months)</Label>
                  <Select
                    value={term === "" ? "" : String(term)}
                    onValueChange={(v) => setTerm(parseInt(v, 10))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select term" />
                    </SelectTrigger>
                    <SelectContent>
                      {termOptions.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m} months
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {loanErrors.term && (
                    <p className="text-xs text-destructive mt-1">{loanErrors.term}</p>
                  )}
                </div>

                {selectedProduct.loanScheduleType === "JADUAL_K" && (
                  <div className="space-y-3 border-t pt-4">
                    <p className="text-sm font-medium">Collateral (Jadual K)</p>
                    <div>
                      <Label>Collateral type</Label>
                      <Input
                        className="mt-1"
                        value={collateralType}
                        onChange={(e) => setCollateralType(e.target.value)}
                      />
                      {loanErrors.collateralType && (
                        <p className="text-xs text-destructive mt-1">{loanErrors.collateralType}</p>
                      )}
                    </div>
                    <div>
                      <Label>Collateral value (RM)</Label>
                      <NumericInput
                        mode="float"
                        className="mt-1"
                        value={collateralValue}
                        onChange={(v) =>
                          setCollateralValue(v === "" ? "" : typeof v === "number" ? v : 0)
                        }
                      />
                      {loanErrors.collateralValue && (
                        <p className="text-xs text-destructive mt-1">{loanErrors.collateralValue}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border bg-primary/5 p-4">
                  <p className="text-sm font-medium text-muted-foreground">Estimated monthly payment</p>
                  {previewLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin mt-2 text-primary" />
                  ) : preview ? (
                    <p className="text-2xl font-bold text-primary mt-1">
                      {formatCurrency(preview.monthlyPayment)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">Enter amount and term</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {step === 2 && borrowerType === "INDIVIDUAL" && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Verify your details</CardTitle>
                  <CardDescription>
                    Update your profile information. This will be used for your application.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <IdentityCard
                    data={individualForm}
                    onChange={(u) => setIndividualForm((prev) => ({ ...prev, ...u }))}
                    errors={formErrors}
                    onErrorClear={clearFieldError}
                  />
                  <PersonalCard
                    data={individualForm}
                    onChange={(u) => setIndividualForm((prev) => ({ ...prev, ...u }))}
                    errors={formErrors}
                    onErrorClear={clearFieldError}
                    noMonthlyIncome={noMonthlyIncome}
                    onNoMonthlyIncomeChange={setNoMonthlyIncome}
                  />
                  <ContactCard
                    data={individualForm}
                    onChange={(u) => setIndividualForm((prev) => ({ ...prev, ...u }))}
                    errors={formErrors}
                    onErrorClear={clearFieldError}
                  />
                  <BankCard
                    data={individualForm}
                    onChange={(u) => setIndividualForm((prev) => ({ ...prev, ...u }))}
                    errors={formErrors}
                    onErrorClear={clearFieldError}
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {step === 2 && borrowerType === "CORPORATE" && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Company details</CardTitle>
                  <CardDescription>Confirm or update your business profile for this application.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <CompanyCard
                    data={corporateForm}
                    onChange={(u) => setCorporateForm((prev) => ({ ...prev, ...u }))}
                    errors={formErrors}
                    onErrorClear={clearFieldError}
                  />
                  <CompanyContactCard
                    data={corporateForm}
                    onChange={(u) => setCorporateForm((prev) => ({ ...prev, ...u }))}
                    errors={formErrors}
                    onErrorClear={clearFieldError}
                  />
                  <CompanyAdditionalCard
                    data={corporateForm}
                    onChange={(u) => setCorporateForm((prev) => ({ ...prev, ...u }))}
                  />
                  <DirectorsCard
                    data={corporateForm}
                    onChange={(u) => setCorporateForm((prev) => ({ ...prev, ...u }))}
                    errors={formErrors}
                    onErrorClear={clearFieldError}
                  />
                  <BankCard
                    data={corporateForm}
                    onChange={(u) => setCorporateForm((prev) => ({ ...prev, ...u }))}
                    errors={formErrors}
                    onErrorClear={clearFieldError}
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {step === 3 && applicationId && reviewApp && selectedProduct && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Required items are marked with * (set by your lender). You must upload every required
                document before you can continue to review and submit. Optional items can be added
                later from{" "}
                <Link href="/applications" className="text-primary underline font-medium">
                  Applications
                </Link>
                .
              </p>
              <ApplicationDocumentsCard
                applicationId={applicationId}
                requiredDocs={requiredDocs}
                documents={reviewApp.documents ?? []}
                onDocumentsChange={refreshApplication}
                showOptionalBadge={requiredDocs.length > 0 && allDocumentsOptional(requiredDocs)}
              />
            </div>
          )}

          {step === 4 && reviewApp && reviewPreview && (
            <Card>
              <CardHeader>
                <CardTitle>Review application</CardTitle>
                <CardDescription>Check everything before you submit.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {requiredDocsMissing && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    Required documents are still missing. Go back to the documents step and upload
                    every item marked * (set by your lender for this product).
                  </div>
                )}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold border-b pb-2">Loan</h3>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Product</span>
                      <p>{reviewApp.product.name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Amount</span>
                      <p>{formatCurrency(toAmountNumber(reviewApp.amount))}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Term</span>
                      <p>{reviewApp.term} months</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Interest</span>
                      <p>
                        {Number(reviewPreview.interestRate).toFixed(2)}% p.a. (
                        {reviewPreview.interestModel})
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Legal fee</span>
                      <p>{formatCurrency(reviewPreview.legalFee)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Stamping fee</span>
                      <p>{formatCurrency(reviewPreview.stampingFee)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Net disbursement</span>
                      <p className="font-medium text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(reviewPreview.netDisbursement)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Monthly payment</span>
                      <p className="font-medium">{formatCurrency(reviewPreview.monthlyPayment)}</p>
                    </div>
                  </div>
                </div>

                {reviewApp.borrower && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold border-b pb-2">Borrower</h3>
                    <div className="grid sm:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Name</span>
                        <p>{String(reviewApp.borrower.name ?? "—")}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">IC / ID</span>
                        <p>{String(reviewApp.borrower.icNumber ?? "—")}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Phone</span>
                        <p>{String(reviewApp.borrower.phone ?? "—")}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Email</span>
                        <p>{String(reviewApp.borrower.email ?? "—")}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold border-b pb-2">Documents</h3>
                  <ul className="text-sm space-y-1">
                    {requiredDocs.map((d) => {
                      const ok = (reviewApp.documents ?? []).some((x) => x.category === d.key);
                      return (
                        <li key={d.key} className="flex justify-between gap-2">
                          <span>{d.label}</span>
                          <span className={ok ? "text-emerald-600" : "text-amber-600"}>
                            {ok ? "Uploaded" : "Not uploaded"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="consent"
                    checked={consent}
                    onCheckedChange={(c) => setConsent(c === true)}
                  />
                  <label htmlFor="consent" className="text-sm leading-tight cursor-pointer">
                    I have read and agree to the{" "}
                    <Link href="/legal/terms" className="text-primary underline">
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link href="/legal/privacy" className="text-primary underline">
                      Privacy Policy
                    </Link>
                    .
                  </label>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar: product terms */}
        {selectedProduct && (
          <Card className="lg:sticky lg:top-24 lg:self-start z-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{selectedProduct.name}</CardTitle>
              <CardDescription>
                RM {toAmountNumber(selectedProduct.minAmount).toLocaleString()} – RM{" "}
                {toAmountNumber(selectedProduct.maxAmount).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              {selectedProduct.description && (
                <p className="text-muted-foreground">{selectedProduct.description}</p>
              )}
              <div>
                <p className="font-medium text-xs text-muted-foreground">Fees</p>
                <p>
                  Legal:{" "}
                  {selectedProduct.legalFeeType === "PERCENTAGE"
                    ? `${toAmountNumber(selectedProduct.legalFeeValue)}%`
                    : formatCurrency(toAmountNumber(selectedProduct.legalFeeValue))}
                </p>
                <p>
                  Stamping:{" "}
                  {selectedProduct.stampingFeeType === "PERCENTAGE"
                    ? `${toAmountNumber(selectedProduct.stampingFeeValue)}%`
                    : formatCurrency(toAmountNumber(selectedProduct.stampingFeeValue))}
                </p>
              </div>
              <div>
                <p className="font-medium text-xs text-muted-foreground">Late payment</p>
                <p>{toAmountNumber(selectedProduct.latePaymentRate)}% p.a. after arrears period</p>
              </div>
              <div>
                <p className="font-medium text-xs text-muted-foreground">Schedule</p>
                <p>{selectedProduct.loanScheduleType === "JADUAL_K" ? "Jadual K" : "Jadual J"}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex justify-between gap-4 pt-2">
        <Button
          type="button"
          variant="outline"
          disabled={step === 0 || saving}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          {step === 0 && (
            <Button
              type="button"
              disabled={!selectedProductId || saving}
              onClick={() => {
                setStep(1);
                if (selectedProduct && amount === "") {
                  setAmount(toAmountNumber(selectedProduct.minAmount));
                  setTerm(selectedProduct.minTerm);
                }
              }}
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
          {step === 1 && (
            <Button type="button" disabled={saving} onClick={() => void handleNextFromLoanDetails()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
          {step === 2 && (
            <Button type="button" disabled={saving} onClick={() => void handleNextFromPersonal()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
          {step === 3 && (
            <Button type="button" disabled={saving} onClick={() => void handleNextFromDocuments()}>
              {documentsStepContinueLabel}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
          {step === 4 && (
            <Button
              type="button"
              disabled={saving || !consent || requiredDocsMissing}
              onClick={() => void handleSubmitFinal()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit application"}
            </Button>
          )}
        </div>
      </div>

      {docDialog === "optional" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle>Continue without documents?</CardTitle>
              <CardDescription>
                Uploading documents now helps us process your application faster. You can add files
                anytime from your Applications list — before or after you submit — while the
                application is still under review.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDocDialog("none")}>
                Go back
              </Button>
              <Button type="button" onClick={handleConfirmDeferOptional}>
                Continue
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
