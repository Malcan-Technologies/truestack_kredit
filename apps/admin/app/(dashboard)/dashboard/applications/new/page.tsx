"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  User,
  Package,
  Calculator,
  FileText,
  CheckCircle,
  Search,
  Plus,
  UserPlus,
  Building2,
  Users,
  Shield,
  ShieldCheck,
  ChartPie,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CopyField } from "@/components/ui/copy-field";
import { VerificationBadge } from "@/components/verification-badge";
import { api } from "@/lib/api";
import {
  cn,
  formatCurrency,
  formatNumber,
  toSafeNumber,
  safeMultiply,
  safeDivide,
  safeAdd,
  safeSubtract,
  safeRound,
} from "@/lib/utils";

// ============================================
// Types
// ============================================

interface Borrower {
  id: string;
  name: string;
  borrowerType: string;
  icNumber: string;
  documentType: string;
  phone: string | null;
  email: string | null;
  documentVerified: boolean;
  verificationStatus?: "FULLY_VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED";
  companyName: string | null;
}

interface RequiredDocument {
  key: string;
  label: string;
  required: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  interestModel: string;
  interestRate: string;
  latePaymentRate: string;
  arrearsPeriod: number;
  defaultPeriod: number;
  minAmount: string;
  maxAmount: string;
  minTerm: number;
  maxTerm: number;
  /** Months between allowed terms when `allowedTerms` is empty (equal steps). */
  termInterval?: number;
  /** Explicit allowed tenures (months); when set, only these values are valid. */
  allowedTerms?: unknown;
  legalFeeType: string;
  legalFeeValue: string;
  stampingFeeType: string;
  stampingFeeValue: string;
  requiredDocuments: RequiredDocument[];
  eligibleBorrowerTypes: string;
  loanScheduleType: string;
}

interface LoanPreview {
  loanAmount: number;
  term: number;
  interestRate: number;
  interestModel: string;
  legalFee: number;
  stampingFee: number;
  totalFees: number;
  netDisbursement: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPayable: number;
}

function parseProductAllowedTerms(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is number => typeof v === "number" && Number.isInteger(v));
}

function buildSteppedTermOptions(minTerm: number, maxTerm: number, interval: number): number[] {
  const step = interval > 0 ? interval : 1;
  const out: number[] = [];
  for (let t = minTerm; t <= maxTerm; t += step) {
    out.push(t);
  }
  return out;
}

function defaultTermForProduct(product: Product): number {
  const explicit = parseProductAllowedTerms(product.allowedTerms);
  if (explicit.length > 0) {
    const sorted = [...new Set(explicit)].sort((a, b) => a - b);
    return sorted[0] ?? product.minTerm;
  }
  return product.minTerm;
}

function formatProductTermSummary(p: Product): string {
  const explicit = parseProductAllowedTerms(p.allowedTerms);
  if (explicit.length > 0) {
    return `${[...new Set(explicit)].sort((a, b) => a - b).join(", ")} mo`;
  }
  const step = p.termInterval && p.termInterval > 0 ? p.termInterval : 1;
  if (step > 1) {
    return `${p.minTerm}–${p.maxTerm} mo (every ${step} mo)`;
  }
  return `${p.minTerm} - ${p.maxTerm} months`;
}

function termMatchesProductRules(product: Product, termMonths: number): boolean {
  if (termMonths < product.minTerm || termMonths > product.maxTerm) return false;
  const explicit = parseProductAllowedTerms(product.allowedTerms);
  if (explicit.length > 0) {
    return explicit.includes(termMonths);
  }
  const interval = product.termInterval && product.termInterval > 0 ? product.termInterval : 1;
  return (termMonths - product.minTerm) % interval === 0;
}

function supportsInternalScheduleOptions(interestModel: string): boolean {
  return interestModel === "FLAT" || interestModel === "RULE_78";
}

function annualizeRiskLevel(monthlyRiskLevel: number): number {
  return safeRound(safeMultiply(monthlyRiskLevel, 12, 8), 2);
}

function formatRiskCodeNumber(value: number, decimals = 2): string {
  return safeRound(value, decimals).toFixed(decimals);
}

function deriveCompliantStructure(params: {
  principal: number;
  compliantRateCap: number;
  internalInterestRate: number;
  internalTerm: number;
}): {
  compliantInterestRate: number;
  compliantTerm: number;
} | null {
  const { principal, compliantRateCap, internalInterestRate, internalTerm } = params;
  if (principal <= 0 || compliantRateCap <= 0) return null;

  const normalizedInternalRate = safeRound(internalInterestRate, 2);
  const normalizedRateCap = safeRound(compliantRateCap, 2);
  const targetTotalInterest = safeRound(
    safeMultiply(
      safeMultiply(principal, safeDivide(normalizedInternalRate, 100, 8), 8),
      safeDivide(internalTerm, 12, 8),
      8,
    ),
    2,
  );
  const targetTotalPayable = safeAdd(principal, targetTotalInterest);
  const minCompliantTerm = Math.max(
    1,
    Math.ceil(
      safeDivide(
        safeMultiply(targetTotalInterest, 1200, 8),
        safeMultiply(principal, normalizedRateCap, 8),
        8,
      ),
    ),
  );

  for (let compliantTerm = minCompliantTerm; compliantTerm <= 600; compliantTerm += 1) {
    const compliantInterestRate = safeRound(
      safeDivide(
        safeMultiply(targetTotalInterest, 1200, 8),
        safeMultiply(principal, compliantTerm, 8),
        8,
      ),
      2,
    );

    if (compliantInterestRate <= 0 || compliantInterestRate > normalizedRateCap) {
      continue;
    }

    const compliantTotalInterest = safeRound(
      safeMultiply(
        safeMultiply(principal, safeDivide(compliantInterestRate, 100, 8), 8),
        safeDivide(compliantTerm, 12, 8),
        8,
      ),
      2,
    );

    if (Math.abs(compliantTotalInterest - targetTotalInterest) <= 0.001) {
      return {
        compliantInterestRate,
        compliantTerm,
      };
    }
  }

  return null;
}

function getPreview(params: {
  product: Product;
  amount: number;
  term: number;
  interestRate?: number;
}): LoanPreview {
  const { product, amount, term, interestRate = toSafeNumber(product.interestRate) } = params;
  const loanAmount = amount;

  const legalFeeValue = toSafeNumber(product.legalFeeValue);
  const stampingFeeValue = toSafeNumber(product.stampingFeeValue);

  const legalFee =
    product.legalFeeType === "PERCENTAGE"
      ? safeMultiply(loanAmount, safeDivide(legalFeeValue, 100))
      : legalFeeValue;

  const stampingFee =
    product.stampingFeeType === "PERCENTAGE"
      ? safeMultiply(loanAmount, safeDivide(stampingFeeValue, 100))
      : stampingFeeValue;

  const totalFees = safeAdd(legalFee, stampingFee);
  const netDisbursement = safeSubtract(loanAmount, totalFees);

  let monthlyPayment: number;
  let totalInterest: number;
  let totalPayable: number;

  if (product.interestModel === "FLAT" || product.interestModel === "RULE_78") {
    const annualRate = safeDivide(interestRate, 100, 8);
    totalInterest = safeRound(
      safeMultiply(
        safeMultiply(loanAmount, annualRate, 8),
        safeDivide(term, 12, 8),
        8,
      ),
      2,
    );
    totalPayable = safeAdd(loanAmount, totalInterest);
    monthlyPayment = safeDivide(totalPayable, term);
  } else {
    const monthlyRate = safeDivide(interestRate, 12 * 100);
    if (monthlyRate === 0) {
      monthlyPayment = safeDivide(loanAmount, term);
    } else {
      const factor = Math.pow(1 + monthlyRate, term);
      monthlyPayment = safeMultiply(
        loanAmount,
        safeDivide(safeMultiply(monthlyRate, factor), factor - 1)
      );
    }
    totalPayable = safeMultiply(monthlyPayment, term);
    totalInterest = safeSubtract(totalPayable, loanAmount);
  }

  return {
    loanAmount,
    term,
    interestRate,
    interestModel: product.interestModel,
    legalFee,
    stampingFee,
    totalFees,
    netDisbursement,
    monthlyPayment,
    totalInterest,
    totalPayable,
  };
}

// ============================================
// Step Components
// ============================================

const STEPS = [
  { id: 1, name: "Borrower", icon: User },
  { id: 2, name: "Guarantors", icon: Users },
  { id: 3, name: "Product", icon: Package },
  { id: 4, name: "Details", icon: Calculator },
  { id: 5, name: "Review", icon: CheckCircle },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isCompleted = step.id < currentStep;
        const isPending = step.id > currentStep;

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isCompleted
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : isPending
                  ? "bg-transparent border-2 border-dashed border-border text-foreground/60"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Icon className={`h-4 w-4 ${isPending ? "opacity-50" : ""}`} />
              <span className="text-sm font-medium hidden sm:inline">{step.name}</span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`w-8 h-px mx-2 ${
                  isCompleted ? "bg-emerald-400 dark:bg-emerald-600" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function NewApplicationPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Data
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [preview, setPreview] = useState<LoanPreview | null>(null);

  // Form state
  const [borrowerSearch, setBorrowerSearch] = useState("");
  const [guarantorSearch, setGuarantorSearch] = useState("");
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);
  const [selectedGuarantors, setSelectedGuarantors] = useState<Borrower[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [amount, setAmount] = useState<number | "">(0);
  const [term, setTerm] = useState<number | "">(12);
  const [notes, setNotes] = useState("");
  const [collateralType, setCollateralType] = useState("");
  const [collateralValue, setCollateralValue] = useState<number | "">(0);
  const [useInternalSchedule, setUseInternalSchedule] = useState(false);
  const [internalInterestRate, setInternalInterestRate] = useState<number | "" | string>("");
  const [internalTerm, setInternalTerm] = useState<number | "">("");

  // Fetch borrowers and products on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [borrowerRes, productRes] = await Promise.all([
          api.get<Borrower[]>("/api/borrowers?pageSize=100"),
          api.get<Product[]>("/api/products?activeOnly=true"),
        ]);

        if (borrowerRes.success && borrowerRes.data) {
          setBorrowers(Array.isArray(borrowerRes.data) ? borrowerRes.data : []);
        }
        if (productRes.success && productRes.data) {
          setProducts(Array.isArray(productRes.data) ? productRes.data : []);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
        toast.error("Failed to load data");
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  // Calculate preview when amount/term/product changes
  useEffect(() => {
    const numAmount = amount === "" ? 0 : amount;
    const numTerm = term === "" ? 0 : term;
    if (!selectedProduct || numAmount <= 0 || numTerm <= 0) {
      setPreview(null);
      return;
    }
    setPreview(getPreview({
      product: selectedProduct,
      amount: numAmount,
      term: numTerm,
    }));
  }, [selectedProduct, amount, term]);

  // Filter borrowers by search
  const filteredBorrowers = borrowers.filter(
    (b) =>
      b.name.toLowerCase().includes(borrowerSearch.toLowerCase()) ||
      b.icNumber.includes(borrowerSearch)
  );

  const availableGuarantors = borrowers.filter(
    (borrower) => borrower.id !== selectedBorrower?.id && borrower.borrowerType === "INDIVIDUAL"
  );
  const filteredGuarantors = availableGuarantors.filter(
    (b) =>
      b.name.toLowerCase().includes(guarantorSearch.toLowerCase()) ||
      b.icNumber.includes(guarantorSearch)
  );

  const toggleGuarantor = (guarantor: Borrower) => {
    const exists = selectedGuarantors.some((item) => item.id === guarantor.id);
    if (exists) {
      setSelectedGuarantors((prev) => prev.filter((item) => item.id !== guarantor.id));
      return;
    }

    if (selectedGuarantors.length >= 5) {
      toast.error("You can add up to 5 guarantors only");
      return;
    }

    setSelectedGuarantors((prev) => [...prev, guarantor]);
  };

  useEffect(() => {
    if (!selectedBorrower) return;
    setSelectedGuarantors((prev) => prev.filter((guarantor) => guarantor.id !== selectedBorrower.id));
  }, [selectedBorrower]);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setAmount(toSafeNumber(product.minAmount));
    const initialTerm = defaultTermForProduct(product);
    setTerm(initialTerm);
    setUseInternalSchedule(false);
    setInternalInterestRate("");
    setInternalTerm(initialTerm);
  };

  const supportsInternalOptions = selectedProduct
    ? supportsInternalScheduleOptions(selectedProduct.interestModel)
    : false;
  const hasInternalInputs =
    !!selectedProduct &&
    useInternalSchedule &&
    internalInterestRate !== "" &&
    Number(internalInterestRate) > 0 &&
    internalTerm !== "" &&
    internalTerm > 0;
  const annualizedInternalInterestRate = hasInternalInputs
    ? annualizeRiskLevel(Number(internalInterestRate))
    : null;
  const compliantStructure = selectedProduct && hasInternalInputs && amount !== ""
    ? deriveCompliantStructure({
        principal: amount,
        compliantRateCap: toSafeNumber(selectedProduct.interestRate),
        internalInterestRate: annualizedInternalInterestRate ?? 0,
        internalTerm: Number(internalTerm),
      })
    : null;
  const compliantPreview = selectedProduct && compliantStructure && amount !== ""
    ? getPreview({
        product: selectedProduct,
        amount,
        term: compliantStructure.compliantTerm,
        interestRate: compliantStructure.compliantInterestRate,
      })
    : null;
  const internalPreview = selectedProduct && hasInternalInputs && amount !== ""
    ? getPreview({
        product: selectedProduct,
        amount,
        term: Number(internalTerm),
        interestRate: annualizedInternalInterestRate ?? 0,
      })
    : null;
  const summaryPreview = compliantPreview ?? preview;
  const displayedCompliantTerm = useInternalSchedule
    ? (compliantStructure?.compliantTerm ?? "")
    : term;
  const loanIdCodePreview = hasInternalInputs && internalPreview
    ? `XXXXXXXX00${Number(internalTerm)}00${formatRiskCodeNumber(Number(internalInterestRate), 1)}00${formatRiskCodeNumber(internalPreview.monthlyPayment)}`
    : null;

  const handleNext = () => {
    if (currentStep === 1 && !selectedBorrower) {
      toast.error("Please select a borrower");
      return;
    }
    if (currentStep === 3 && !selectedProduct) {
      toast.error("Please select a product");
      return;
    }
    if (currentStep === 4 && selectedProduct) {
      const minAmount = toSafeNumber(selectedProduct.minAmount);
      const maxAmount = toSafeNumber(selectedProduct.maxAmount);
      const minTerm = selectedProduct.minTerm;
      const maxTerm = selectedProduct.maxTerm;
      const numAmount = amount === "" ? 0 : amount;
      const numTerm = useInternalSchedule
        ? (compliantStructure?.compliantTerm ?? 0)
        : (term === "" ? 0 : term);
      const numCollateral = collateralValue === "" ? 0 : collateralValue;

      if (numAmount <= 0) {
        toast.error("Please enter a valid amount");
        return;
      }
      if (numAmount < minAmount) {
        toast.error(`Loan amount must be at least ${formatCurrency(minAmount)}`);
        return;
      }
      if (numAmount > maxAmount) {
        toast.error(`Loan amount cannot exceed ${formatCurrency(maxAmount)}`);
        return;
      }
      if (numTerm <= 0) {
        toast.error("Please enter a valid term");
        return;
      }
      if (!useInternalSchedule && numTerm < minTerm) {
        toast.error(`Term must be at least ${minTerm} months`);
        return;
      }
      if (!useInternalSchedule && numTerm > maxTerm) {
        toast.error(`Term cannot exceed ${maxTerm} months`);
        return;
      }
      if (!useInternalSchedule && !termMatchesProductRules(selectedProduct, numTerm)) {
        const explicit = parseProductAllowedTerms(selectedProduct.allowedTerms);
        if (explicit.length > 0) {
          toast.error(
            `Term must be one of: ${[...new Set(explicit)].sort((a, b) => a - b).join(", ")} months`
          );
        } else {
          const interval =
            selectedProduct.termInterval && selectedProduct.termInterval > 0
              ? selectedProduct.termInterval
              : 1;
          toast.error(
            `Term must increase in steps of ${interval} month(s) from ${minTerm} (up to ${maxTerm})`
          );
        }
        return;
      }
      // Validate collateral fields for Jadual K products
      if (selectedProduct.loanScheduleType === "JADUAL_K") {
        if (!collateralType.trim()) {
          toast.error("Please enter the collateral type for Jadual K loan");
          return;
        }
        if (numCollateral <= 0) {
          toast.error("Please enter the collateral value for Jadual K loan");
          return;
        }
      }
      if (useInternalSchedule) {
        if (!supportsInternalOptions) {
          toast.error("Additional schedule options are only available for flat-structured products");
          return;
        }
        if (internalInterestRate === "" || Number(internalInterestRate) <= 0 || Number.isNaN(Number(internalInterestRate))) {
          toast.error("Please enter a valid risk index");
          return;
        }
        if (internalTerm === "" || internalTerm <= 0) {
          toast.error("Please enter a valid risk term");
          return;
        }
        if (!compliantStructure) {
          toast.error("Unable to derive a schedule that matches the risk-adjusted total payable within the product rate cap");
          return;
        }
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleCreate = async () => {
    if (!selectedBorrower || !selectedProduct) return;

    setCreating(true);
    try {
      const numAmount = amount === "" ? 0 : amount;
      const numTerm = useInternalSchedule
        ? (compliantStructure?.compliantTerm ?? 0)
        : (term === "" ? 0 : term);
      const numCollateral = collateralValue === "" ? 0 : collateralValue;
      const res = await api.post<{ id: string }>("/api/loans/applications", {
        borrowerId: selectedBorrower.id,
        ...(selectedGuarantors.length > 0 ? { guarantorIds: selectedGuarantors.map((guarantor) => guarantor.id) } : {}),
        productId: selectedProduct.id,
        amount: numAmount,
        term: numTerm,
        notes: notes || undefined,
        ...(useInternalSchedule
          ? {
              enableInternalSchedule: true,
              actualInterestRate: annualizedInternalInterestRate,
              actualTerm: Number(internalTerm),
            }
          : {}),
        ...(selectedProduct.loanScheduleType === "JADUAL_K" && collateralType.trim() ? {
          collateralType: collateralType.trim(),
          collateralValue: numCollateral > 0 ? numCollateral : undefined,
        } : {}),
      });

      if (res.success && res.data) {
        toast.success("Application created successfully");
        router.push(`/dashboard/applications/${res.data.id}`);
      } else {
        toast.error(res.error || "Failed to create application");
      }
    } catch (error) {
      toast.error("Failed to create application");
    }
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">
            New Loan Application
          </h1>
          <p className="text-muted-foreground">
            Create a new loan application for a borrower
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={currentStep} />

      {/* Step Content */}
      <Card>
        <CardContent className="pt-6">
          {/* Step 1: Select Borrower */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold mb-2">Select Borrower</h2>
                  <p className="text-sm text-muted-foreground">
                    Search and select an existing borrower for this application
                  </p>
                </div>
                <Link href="/dashboard/borrowers/new">
                  <Button variant="outline" size="sm">
                    <UserPlus className="h-4 w-4 mr-2" />
                    New Borrower
                  </Button>
                </Link>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or IC number..."
                  value={borrowerSearch}
                  onChange={(e) => setBorrowerSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="grid gap-2 max-h-[50rem] overflow-y-auto">
                {filteredBorrowers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <User className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      {borrowerSearch
                        ? `No borrowers found matching "${borrowerSearch}"`
                        : "No borrowers registered yet"}
                    </p>
                    <Link href="/dashboard/borrowers/new">
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Borrower
                      </Button>
                    </Link>
                  </div>
                ) : (
                  filteredBorrowers.map((borrower) => {
                    const isCorporate = borrower.borrowerType === "CORPORATE";
                    const displayName = isCorporate && borrower.companyName 
                      ? borrower.companyName 
                      : borrower.name;
                    const identityLabel = isCorporate 
                      ? "SSM" 
                      : borrower.documentType === "IC" ? "IC" : "Passport";
                    
                    return (
                      <div
                        key={borrower.id}
                        onClick={() => setSelectedBorrower(borrower)}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          selectedBorrower?.id === borrower.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${isCorporate ? "bg-blue-100 dark:bg-blue-900/40" : "bg-slate-100 dark:bg-slate-800"}`}>
                              {isCorporate ? (
                                <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              ) : (
                                <User className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{displayName}</p>
                              {isCorporate && borrower.companyName && (
                                <p className="text-xs text-muted-foreground">Rep: {borrower.name}</p>
                              )}
                              <p className="text-sm text-muted-foreground">
                                {identityLabel}: {borrower.icNumber}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isCorporate ? (
                              <Badge variant="secondary" className="text-xs">
                                <Building2 className="h-3 w-3 mr-1" />
                                Corporate
                              </Badge>
                            ) : (
                              <VerificationBadge
                                verificationStatus={borrower.verificationStatus}
                                documentVerified={borrower.documentVerified}
                                size="compact"
                              />
                            )}
                            {selectedBorrower?.id === borrower.id && (
                              <CheckCircle className="h-5 w-5 text-foreground" />
                            )}
                          </div>
                        </div>
                        {(borrower.phone || borrower.email) && (
                          <p className="text-xs text-muted-foreground mt-2 ml-11">
                            {[borrower.phone, borrower.email].filter(Boolean).join(" • ")}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Step 2: Select Guarantors */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-2">Select Guarantors (Optional)</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Select up to 5 guarantors from your personal borrower list. You can skip this step.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border bg-secondary/50 px-3 py-2">
                <p className="text-sm text-muted-foreground">
                  Selected guarantors: <span className="font-medium text-foreground">{selectedGuarantors.length}</span>/5
                </p>
                {selectedGuarantors.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedGuarantors([])}
                  >
                    Clear all
                  </Button>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search guarantors by name or IC number..."
                  value={guarantorSearch}
                  onChange={(e) => setGuarantorSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="grid gap-2 max-h-[50rem] overflow-y-auto">
                {filteredGuarantors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      {guarantorSearch
                        ? `No guarantors found matching "${guarantorSearch}"`
                        : "No personal borrower candidates available"}
                    </p>
                  </div>
                ) : (
                  filteredGuarantors.map((guarantor) => {
                    const isCorporate = guarantor.borrowerType === "CORPORATE";
                    const displayName = isCorporate && guarantor.companyName
                      ? guarantor.companyName
                      : guarantor.name;
                    const identityLabel = isCorporate
                      ? "SSM"
                      : guarantor.documentType === "IC" ? "IC" : "Passport";
                    const isSelected = selectedGuarantors.some((item) => item.id === guarantor.id);

                    return (
                      <div
                        key={guarantor.id}
                        onClick={() => toggleGuarantor(guarantor)}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${isCorporate ? "bg-blue-100 dark:bg-blue-900/40" : "bg-slate-100 dark:bg-slate-800"}`}>
                              {isCorporate ? (
                                <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              ) : (
                                <User className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{displayName}</p>
                              {isCorporate && guarantor.companyName && (
                                <p className="text-xs text-muted-foreground">Rep: {guarantor.name}</p>
                              )}
                              <p className="text-sm text-muted-foreground">
                                {identityLabel}: {guarantor.icNumber}
                              </p>
                            </div>
                          </div>
                          {isSelected && <CheckCircle className="h-5 w-5 text-foreground" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Step 3: Select Product */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-2">Select Loan Product</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose the loan product for this application
                  {selectedBorrower && (
                    <span className="ml-1">
                      (showing products for{" "}
                      <span className="font-medium">
                        {selectedBorrower.borrowerType === "CORPORATE" ? "corporate" : "individual"}
                      </span>{" "}
                      borrowers)
                    </span>
                  )}
                </p>
              </div>

              {(() => {
                // Filter products based on selected borrower type
                const eligibleProducts = products.filter((product) => {
                  if (!selectedBorrower) return true;
                  const borrowerType = selectedBorrower.borrowerType;
                  const eligibility = product.eligibleBorrowerTypes || "BOTH";
                  return eligibility === "BOTH" || eligibility === borrowerType;
                });

                if (eligibleProducts.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Package className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium mb-2">No eligible products</p>
                      <p className="text-sm text-muted-foreground">
                        No loan products are configured for{" "}
                        {selectedBorrower?.borrowerType === "CORPORATE" ? "corporate" : "individual"}{" "}
                        borrowers.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="grid gap-4 md:grid-cols-2">
                    {eligibleProducts.map((product) => (
                      <div
                        key={product.id}
                        onClick={() => handleSelectProduct(product)}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          selectedProduct?.id === product.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {product.interestModel === "RULE_78" ? "Rule 78" : product.interestModel.replace("_", " ")}
                              </Badge>
                              <Badge
                                variant={product.loanScheduleType === "JADUAL_K" ? "default" : "outline"}
                                className="text-xs flex items-center gap-1"
                              >
                                {product.loanScheduleType === "JADUAL_K" ? (
                                  <ShieldCheck className="h-3 w-3" />
                                ) : (
                                  <Shield className="h-3 w-3" />
                                )}
                                {product.loanScheduleType === "JADUAL_K" ? "Jadual K" : "Jadual J"}
                              </Badge>
                            </div>
                          </div>
                          {selectedProduct?.id === product.id && (
                            <CheckCircle className="h-5 w-5 text-foreground" />
                          )}
                        </div>
                        {product.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {product.description}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Interest:</span>{" "}
                            <span className="font-medium">{product.interestRate}% p.a.</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Amount:</span>{" "}
                            <span className="font-medium">
                              {formatCurrency(toSafeNumber(product.minAmount))} -{" "}
                              {formatCurrency(toSafeNumber(product.maxAmount))}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Term:</span>{" "}
                            <span className="font-medium">{formatProductTermSummary(product)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Legal Fee:</span>{" "}
                            <span className="font-medium">
                              {product.legalFeeType === "PERCENTAGE"
                                ? `${product.legalFeeValue}%`
                                : formatCurrency(toSafeNumber(product.legalFeeValue))}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Step 4: Loan Details */}
          {currentStep === 4 && selectedProduct && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Loan Details</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter the loan amount, term, and any optional risk-adjusted schedule settings
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Left: Inputs */}
                <div className="space-y-4">
                  {(() => {
                    const minAmount = toSafeNumber(selectedProduct.minAmount);
                    const maxAmount = toSafeNumber(selectedProduct.maxAmount);
                    const numAmount = amount === "" ? 0 : amount;
                    const isAmountInvalid = numAmount > 0 && (numAmount < minAmount || numAmount > maxAmount);
                    return (
                      <div>
                        <label className="text-sm font-medium">
                          Loan Amount (RM)
                          <span className="text-muted-foreground ml-2">
                            ({formatCurrency(minAmount)} - {formatCurrency(maxAmount)})
                          </span>
                        </label>
                        <NumericInput
                          value={amount}
                          onChange={(v: number | "" | string) => setAmount(v === "" ? "" : typeof v === "number" ? v : 0)}
                          min={minAmount}
                          max={maxAmount}
                          className={`mt-1 ${isAmountInvalid ? "border-red-500 focus:ring-red-500" : ""}`}
                        />
                        {isAmountInvalid && (
                          <p className="text-xs text-red-500 mt-1">
                            {numAmount < minAmount
                              ? `Minimum amount is ${formatCurrency(minAmount)}`
                              : `Maximum amount is ${formatCurrency(maxAmount)}`}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {(() => {
                    const minTerm = selectedProduct.minTerm;
                    const maxTerm = selectedProduct.maxTerm;
                    const numTerm = useInternalSchedule ? 0 : term === "" ? 0 : term;
                    const explicit = parseProductAllowedTerms(selectedProduct.allowedTerms);
                    const allowedList =
                      explicit.length > 0 ? [...new Set(explicit)].sort((a, b) => a - b) : null;
                    const interval =
                      selectedProduct.termInterval && selectedProduct.termInterval > 0
                        ? selectedProduct.termInterval
                        : 1;
                    const steppedOptions =
                      !allowedList && !useInternalSchedule
                        ? buildSteppedTermOptions(minTerm, maxTerm, interval)
                        : null;
                    const isTermInvalid =
                      !useInternalSchedule &&
                      numTerm > 0 &&
                      !termMatchesProductRules(selectedProduct, numTerm);
                    const termHint = useInternalSchedule
                      ? null
                      : allowedList
                        ? `Only: ${allowedList.join(", ")}`
                        : interval > 1
                          ? `Every ${interval} mo from ${minTerm} to ${maxTerm}`
                          : `(${minTerm} - ${maxTerm})`;

                    return (
                      <div>
                        <label className="text-sm font-medium">
                          Term (months)
                          {termHint && (
                            <span className="text-muted-foreground ml-2 font-normal">{termHint}</span>
                          )}
                        </label>
                        {useInternalSchedule ? (
                          <>
                            <NumericInput
                              value={displayedCompliantTerm}
                              onChange={(v: number | "" | string) =>
                                setTerm(v === "" ? "" : typeof v === "number" ? v : 0)
                              }
                              min={minTerm}
                              max={maxTerm}
                              disabled
                              placeholder="Auto-derived from risk term"
                              className="mt-1"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              This term is auto-derived from the risk-adjusted schedule.
                            </p>
                          </>
                        ) : allowedList ? (
                          <>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {allowedList.map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => setTerm(m)}
                                  className={cn(
                                    "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                                    term === m
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-border bg-background hover:bg-muted"
                                  )}
                                >
                                  {m} mo
                                </button>
                              ))}
                            </div>
                          </>
                        ) : steppedOptions && steppedOptions.length > 0 ? (
                          <>
                            <Select
                              value={String(term === "" ? steppedOptions[0] : term)}
                              onValueChange={(v) => setTerm(Number(v))}
                            >
                              <SelectTrigger
                                className={cn("mt-1", isTermInvalid && "border-red-500 focus:ring-red-500")}
                              >
                                <SelectValue placeholder="Select term" />
                              </SelectTrigger>
                              <SelectContent>
                                {steppedOptions.map((m) => (
                                  <SelectItem key={m} value={String(m)}>
                                    {m} months
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {interval > 1 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Equal steps of {interval} month(s) between {minTerm} and {maxTerm}.
                              </p>
                            )}
                          </>
                        ) : null}
                        {isTermInvalid && (
                          <p className="text-xs text-red-500 mt-1">
                            {numTerm < minTerm
                              ? `Minimum term is ${minTerm} months`
                              : numTerm > maxTerm
                                ? `Maximum term is ${maxTerm} months`
                                : allowedList
                                  ? `Choose one of the listed terms`
                                  : `Term must align with the product step (${interval} mo from ${minTerm})`}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  <div>
                    <label className="text-sm font-medium">Notes (optional)</label>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Additional notes..."
                      className="mt-1"
                    />
                  </div>

                  {/* Collateral fields for Jadual K products */}
                  {selectedProduct.loanScheduleType === "JADUAL_K" && (
                    <div className="border-t pt-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        <label className="text-sm font-semibold">Collateral Details (Jadual K)</label>
                      </div>
                      <div>
                        <label className="text-sm font-medium">
                          Collateral Type *
                        </label>
                        <Input
                          value={collateralType}
                          onChange={(e) => setCollateralType(e.target.value)}
                          placeholder="e.g., Kenderaan, Hartanah, Mesin..."
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Description of the collateral securing this loan
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium">
                          Collateral Value (RM) *
                        </label>
                        <NumericInput
                          mode="float"
                          value={collateralValue}
                          onChange={(v: number | "" | string) => setCollateralValue(v === "" ? "" : typeof v === "number" ? v : 0)}
                          placeholder="0.00"
                          min={0}
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Estimated value of the collateral in Ringgit Malaysia
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-4 space-y-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <ChartPie className="h-4 w-4 text-muted-foreground" />
                        <label className="text-sm font-semibold">Schedule Options</label>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Optional risk-adjusted schedule settings captured during the details step.
                      </p>
                    </div>

                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">
                        This risk-adjusted schedule is provided solely for internal reference and scenario analysis. Risk index and risk term are for internal planning purposes only; their meaning and interpretation are determined by the lender. Under applicable KPKT limits, the maximum permitted interest rate is 18% p.a. for Jadual J financing and 12% p.a. for Jadual K financing; lenders are not permitted to charge above the applicable cap. The lender remains solely responsible for ensuring that all pricing, documentation, and recoveries comply with applicable law and regulatory requirements. This risk-adjusted view does not amend, replace, validate, or supersede the approved repayment schedule, contractual terms, or compliance record.
                      </p>
                    </div>

                    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                      <div className="space-y-1">
                        <Label htmlFor="new-application-internal-schedule-toggle">Enable Risk-Adjusted Schedule</Label>
                        <p className="text-xs text-muted-foreground">
                          Add a risk-adjusted schedule while preserving the loan schedule within the product rate cap.
                        </p>
                      </div>
                      <Switch
                        id="new-application-internal-schedule-toggle"
                        checked={useInternalSchedule}
                        onCheckedChange={(checked) => {
                          setUseInternalSchedule(checked);
                          if (checked && internalTerm === "") {
                            setInternalTerm(term === "" ? selectedProduct.minTerm : term);
                          }
                        }}
                        disabled={!supportsInternalOptions}
                      />
                    </div>

                    {!supportsInternalOptions && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        Additional schedule options are currently available for flat-structured products only.
                      </div>
                    )}

                    {useInternalSchedule && supportsInternalOptions && (
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="new-application-internal-rate">Risk Index (1-100)</Label>
                            <NumericInput
                              id="new-application-internal-rate"
                              mode="float"
                              maxDecimals={1}
                              value={internalInterestRate}
                              onChange={setInternalInterestRate}
                              placeholder="e.g. 5.5"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="new-application-internal-term">Risk Term (1-36)</Label>
                            <NumericInput
                              id="new-application-internal-term"
                              mode="int"
                              value={internalTerm}
                              onChange={(v: number | "" | string) => setInternalTerm(v === "" ? "" : typeof v === "number" ? v : Number(v))}
                              placeholder="e.g. 12"
                            />
                          </div>
                        </div>

                        <div className="rounded-lg border bg-secondary/30 p-3 text-sm">
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Derived Term</span>
                            <span className="font-medium">
                              {compliantStructure ? `${compliantStructure.compliantTerm} months` : "Enter risk index and risk term"}
                            </span>
                          </div>
                        </div>

                        {hasInternalInputs && !compliantStructure && (
                          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                            Unable to derive a schedule that matches the risk-adjusted total payable within the product rate cap.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Preview */}
                {summaryPreview && (
                  <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/5 via-card to-primary/10 dark:from-primary/10 dark:via-card dark:to-primary/5 p-5 space-y-3">
                    {/* Subtle accent glow */}
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-foreground/10 rounded-full blur-3xl" />
                    <h3 className="relative font-semibold flex items-center gap-2 text-foreground">
                      <div className="p-1.5 rounded-md bg-foreground/10">
                        <Calculator className="h-4 w-4 text-muted-foreground" />
                      </div>
                      Loan Summary
                    </h3>
                    <div className="relative space-y-2.5 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Loan Amount</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(summaryPreview.loanAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Term</span>
                        <span className="font-medium text-foreground">
                          {summaryPreview.term} months
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Legal Fee</span>
                        <span className="text-foreground">{formatCurrency(summaryPreview.legalFee)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Stamping Fee</span>
                        <span className="text-foreground">{formatCurrency(summaryPreview.stampingFee)}</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-border/50 pt-2.5">
                        <span className="text-muted-foreground">Total Fees</span>
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          {formatCurrency(summaryPreview.totalFees)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Net Disbursement</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(summaryPreview.netDisbursement)}
                        </span>
                      </div>
                      <div className="border-t border-border/50 pt-2.5" />
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Interest Rate</span>
                        <span className="text-foreground">{formatNumber(summaryPreview.interestRate, 2)}% p.a.</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total Interest</span>
                        <span className="text-foreground">{formatCurrency(summaryPreview.totalInterest)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total Payable</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(summaryPreview.totalPayable)}
                        </span>
                      </div>
                      {/* Monthly Payment Highlight */}
                      <div className="flex justify-between items-center bg-foreground/10 dark:bg-primary/20 -mx-5 px-5 py-3 mt-3 rounded-b-xl border-t border-primary/20">
                        <span className="font-semibold text-foreground">
                          Monthly Payment
                        </span>
                        <span className="font-bold text-xl text-foreground">
                          {formatCurrency(summaryPreview.monthlyPayment)}
                        </span>
                      </div>
                    </div>
                    {loanIdCodePreview && (
                      <div className="relative pt-4 border-t border-border/50">
                        <CopyField label="Loan ID Preview" value={loanIdCodePreview} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 5: Review */}
          {currentStep === 5 && selectedBorrower && selectedProduct && summaryPreview && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Review Application</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Review the application details before creating
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Borrower */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {selectedBorrower.borrowerType === "CORPORATE" ? (
                        <Building2 className="h-4 w-4" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                      Borrower
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-lg">
                          {selectedBorrower.borrowerType === "CORPORATE" && selectedBorrower.companyName
                            ? selectedBorrower.companyName
                            : selectedBorrower.name}
                        </p>
                        {selectedBorrower.borrowerType === "CORPORATE" && selectedBorrower.companyName && (
                          <p className="text-sm text-muted-foreground">Rep: {selectedBorrower.name}</p>
                        )}
                      </div>
                      {selectedBorrower.borrowerType === "CORPORATE" ? (
                        <Badge variant="secondary" className="text-xs">
                          <Building2 className="h-3 w-3 mr-1" />
                          Corporate
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <User className="h-3 w-3 mr-1" />
                          Individual
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {selectedBorrower.borrowerType === "CORPORATE" 
                            ? "SSM" 
                            : selectedBorrower.documentType === "IC" ? "IC Number" : "Passport"}
                        </p>
                        <p className="font-mono">{selectedBorrower.icNumber}</p>
                      </div>
                      {selectedBorrower.phone && (
                        <div>
                          <p className="text-xs text-muted-foreground">Phone</p>
                          <p>{selectedBorrower.phone}</p>
                        </div>
                      )}
                      {selectedBorrower.email && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Email</p>
                          <p>{selectedBorrower.email}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Guarantors */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Guarantors
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selectedGuarantors.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No guarantors selected</p>
                    ) : (
                      selectedGuarantors.map((guarantor) => {
                        const displayName =
                          guarantor.borrowerType === "CORPORATE" && guarantor.companyName
                            ? guarantor.companyName
                            : guarantor.name;
                        const identityLabel =
                          guarantor.borrowerType === "CORPORATE"
                            ? "SSM"
                            : guarantor.documentType === "IC"
                              ? "IC Number"
                              : "Passport";
                        return (
                          <div key={guarantor.id} className="rounded-md border p-2">
                            <p className="font-medium">{displayName}</p>
                            <p className="text-xs text-muted-foreground">
                              {identityLabel}: {guarantor.icNumber}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>

                {/* Product */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Product
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="font-medium text-lg">{selectedProduct.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedProduct.interestModel === "RULE_78" ? "Rule 78" : selectedProduct.interestModel.replace("_", " ")}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Interest Rate</p>
                        <p className="font-medium">{selectedProduct.interestRate}% p.a.</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Late Payment Rate</p>
                        <p className="font-medium">{selectedProduct.latePaymentRate}% p.a.</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Arrears Period</p>
                        <p className="font-medium">{selectedProduct.arrearsPeriod} days</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Default Period</p>
                        <p className="font-medium">{selectedProduct.defaultPeriod} days</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Loan Details */}
                <div className="md:col-span-2 relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/5 via-card to-primary/10 dark:from-primary/10 dark:via-card dark:to-primary/5 p-5 space-y-3">
                  {/* Subtle accent glow */}
                  <div className="absolute -top-12 -right-12 w-32 h-32 bg-foreground/10 rounded-full blur-3xl" />
                  <h3 className="relative font-semibold flex items-center gap-2 text-foreground">
                    <div className="p-1.5 rounded-md bg-foreground/10">
                      <Calculator className="h-4 w-4 text-muted-foreground" />
                    </div>
                    Loan Summary
                  </h3>
                  <div className="relative space-y-2.5 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Loan Amount</span>
                      <span className="font-medium text-foreground">
                          {formatCurrency(summaryPreview.loanAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Term</span>
                        <span className="font-medium text-foreground">{summaryPreview.term} months</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Legal Fee</span>
                        <span className="text-foreground">{formatCurrency(summaryPreview.legalFee)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Stamping Fee</span>
                        <span className="text-foreground">{formatCurrency(summaryPreview.stampingFee)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-border/50 pt-2.5">
                      <span className="text-muted-foreground">Total Fees</span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                          {formatCurrency(summaryPreview.totalFees)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Net Disbursement</span>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(summaryPreview.netDisbursement)}
                      </span>
                    </div>
                    <div className="border-t border-border/50 pt-2.5" />
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Interest Rate</span>
                      <span className="text-foreground">{formatNumber(summaryPreview.interestRate, 2)}% p.a.</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Interest</span>
                        <span className="text-foreground">{formatCurrency(summaryPreview.totalInterest)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Payable</span>
                      <span className="font-medium text-foreground">
                          {formatCurrency(summaryPreview.totalPayable)}
                      </span>
                    </div>
                    {/* Monthly Payment Highlight */}
                    <div className="flex justify-between items-center bg-foreground/10 dark:bg-primary/20 -mx-5 px-5 py-3 mt-3 rounded-b-xl border-t border-primary/20">
                      <span className="font-semibold text-foreground">Monthly Payment</span>
                      <span className="font-bold text-xl text-foreground">
                        {formatCurrency(summaryPreview.monthlyPayment)}
                      </span>
                    </div>
                  </div>
                  {useInternalSchedule && hasInternalInputs && compliantStructure && (
                    <div className="relative pt-4 border-t border-border/50 space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Schedule View</span>
                        <span className="font-medium text-foreground">Loan + Risk-Adjusted</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Term</span>
                        <span className="font-medium text-foreground">{compliantStructure.compliantTerm} months</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Risk Index</span>
                        <span className="font-medium text-foreground">{formatNumber(Number(internalInterestRate), 2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Risk Term</span>
                        <span className="font-medium text-foreground">{internalTerm}</span>
                      </div>
                    </div>
                  )}
                  {loanIdCodePreview && (
                    <div className="relative pt-4 border-t border-border/50">
                      <CopyField label="Loan ID Preview" value={loanIdCodePreview} />
                    </div>
                  )}
                  {/* Collateral Details for Jadual K */}
                  {selectedProduct.loanScheduleType === "JADUAL_K" && collateralType && (
                    <div className="relative pt-4 border-t border-border/50 space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground">Collateral</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium text-foreground">{collateralType}</span>
                      </div>
                      {(collateralValue === "" ? 0 : collateralValue) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Value</span>
                          <span className="font-medium text-foreground">
                            {formatCurrency(collateralValue === "" ? 0 : collateralValue)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {notes && (
                    <div className="relative pt-4 border-t border-border/50">
                      <p className="text-xs text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm text-foreground">{notes}</p>
                    </div>
                  )}
                </div>

                {/* Required Documents Info */}
                {selectedProduct.requiredDocuments?.length > 0 && (
                  <Card className="md:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Required Documents
                      </CardTitle>
                      <CardDescription>
                        Documents can be uploaded after creating the application
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {selectedProduct.requiredDocuments.map((doc) => (
                          <Badge
                            key={doc.key}
                            variant={doc.required ? "default" : "outline"}
                          >
                            {doc.label}
                            {doc.required && " *"}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 1}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {currentStep < 5 ? (
          <Button onClick={handleNext}>
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Creating..." : "Create Application"}
          </Button>
        )}
      </div>
    </div>
  );
}
