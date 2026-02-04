"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Package,
  Percent,
  Settings,
  FileText,
  CheckCircle,
  User,
  Building2,
  Users,
  Shield,
  ShieldCheck,
  Plus,
  Trash2,
  Sparkles,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { formatCurrency, toSafeNumber } from "@/lib/utils";

// ============================================
// Types
// ============================================

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
  isActive: boolean;
  legalFeeType: string;
  legalFeeValue: string;
  stampingFeeType: string;
  stampingFeeValue: string;
  requiredDocuments: RequiredDocument[];
  eligibleBorrowerTypes: string;
  loanScheduleType: string;
}

interface ProductFormData {
  name: string;
  description: string;
  interestModel: string;
  interestRate: number;
  latePaymentRate: number;
  arrearsPeriod: number;
  defaultPeriod: number;
  minAmount: number;
  maxAmount: number;
  minTerm: number;
  maxTerm: number;
  isActive: boolean;
  legalFeeType: string;
  legalFeeValue: number;
  stampingFeeType: string;
  stampingFeeValue: number;
  requiredDocuments: RequiredDocument[];
  eligibleBorrowerTypes: string;
  loanScheduleType: string;
}

// ============================================
// Constants
// ============================================

// Document recommendations based on borrower type and loan schedule
interface DocumentRecommendation {
  key: string;
  label: string;
  defaultRequired: boolean;
  forBorrowerTypes: ("INDIVIDUAL" | "CORPORATE" | "BOTH")[];
  forScheduleTypes: ("JADUAL_J" | "JADUAL_K")[];
  description?: string;
}

const DOCUMENT_RECOMMENDATIONS: DocumentRecommendation[] = [
  // Individual documents
  { key: "IC_FRONT", label: "IC Front", defaultRequired: true, forBorrowerTypes: ["INDIVIDUAL", "BOTH"], forScheduleTypes: ["JADUAL_J", "JADUAL_K"], description: "Identity verification" },
  { key: "IC_BACK", label: "IC Back", defaultRequired: true, forBorrowerTypes: ["INDIVIDUAL", "BOTH"], forScheduleTypes: ["JADUAL_J", "JADUAL_K"], description: "Identity verification" },
  { key: "PAYSLIP", label: "Payslip (3 months)", defaultRequired: true, forBorrowerTypes: ["INDIVIDUAL", "BOTH"], forScheduleTypes: ["JADUAL_J", "JADUAL_K"], description: "Income verification" },
  { key: "BANK_STATEMENT", label: "Bank Statement (3 months)", defaultRequired: true, forBorrowerTypes: ["INDIVIDUAL", "CORPORATE", "BOTH"], forScheduleTypes: ["JADUAL_J", "JADUAL_K"], description: "Financial history" },
  { key: "EMPLOYMENT_LETTER", label: "Employment Letter", defaultRequired: false, forBorrowerTypes: ["INDIVIDUAL", "BOTH"], forScheduleTypes: ["JADUAL_J", "JADUAL_K"], description: "Employment verification" },
  
  // Corporate documents
  { key: "SSM_REGISTRATION", label: "SSM Registration (Form 9/24/49)", defaultRequired: true, forBorrowerTypes: ["CORPORATE", "BOTH"], forScheduleTypes: ["JADUAL_J", "JADUAL_K"], description: "Business registration" },
  { key: "COMPANY_PROFILE", label: "Company Profile", defaultRequired: false, forBorrowerTypes: ["CORPORATE", "BOTH"], forScheduleTypes: ["JADUAL_J", "JADUAL_K"], description: "Business overview" },
  { key: "DIRECTOR_IC", label: "Director IC", defaultRequired: true, forBorrowerTypes: ["CORPORATE", "BOTH"], forScheduleTypes: ["JADUAL_J", "JADUAL_K"], description: "Director verification" },
  { key: "BOARD_RESOLUTION", label: "Board Resolution", defaultRequired: false, forBorrowerTypes: ["CORPORATE", "BOTH"], forScheduleTypes: ["JADUAL_J", "JADUAL_K"], description: "Authorization" },
  
  // Jadual K specific (collateral)
  { key: "COLLATERAL_DOCS", label: "Collateral Documents", defaultRequired: true, forBorrowerTypes: ["INDIVIDUAL", "CORPORATE", "BOTH"], forScheduleTypes: ["JADUAL_K"], description: "Security documentation" },
  { key: "PROPERTY_TITLE", label: "Property Title / Grant", defaultRequired: false, forBorrowerTypes: ["INDIVIDUAL", "CORPORATE", "BOTH"], forScheduleTypes: ["JADUAL_K"], description: "Property ownership" },
  { key: "VEHICLE_GRANT", label: "Vehicle Registration Card", defaultRequired: false, forBorrowerTypes: ["INDIVIDUAL", "CORPORATE", "BOTH"], forScheduleTypes: ["JADUAL_K"], description: "Vehicle ownership" },
  { key: "VALUATION_REPORT", label: "Valuation Report", defaultRequired: false, forBorrowerTypes: ["INDIVIDUAL", "CORPORATE", "BOTH"], forScheduleTypes: ["JADUAL_K"], description: "Asset valuation" },
];

const BORROWER_ELIGIBILITY_OPTIONS = [
  { value: "INDIVIDUAL", label: "Individual Only", icon: User },
  { value: "CORPORATE", label: "Corporate Only", icon: Building2 },
  { value: "BOTH", label: "Both", icon: Users },
];

const LOAN_SCHEDULE_TYPE_OPTIONS = [
  { value: "JADUAL_J", label: "Jadual J - No Collateral", icon: Shield },
  { value: "JADUAL_K", label: "Jadual K - With Collateral", icon: ShieldCheck },
];

const interestModelDescriptions: Record<string, string> = {
  FLAT: "Interest is calculated on the original principal for the entire loan term.",
  DECLINING_BALANCE: "Interest is calculated on the outstanding balance each month.",
  EFFECTIVE_RATE: "Same calculation as Declining Balance. Used for regulatory compliance.",
};

// ============================================
// Step Components
// ============================================

const STEPS = [
  { id: 1, name: "Basic Info", icon: Package },
  { id: 2, name: "Rates & Fees", icon: Percent },
  { id: 3, name: "Limits", icon: Settings },
  { id: 4, name: "Documents & Review", icon: FileText },
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

// Helper to generate key from label
function generateKey(label: string): string {
  return label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// ============================================
// Main Component
// ============================================

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    description: "",
    interestModel: "FLAT",
    interestRate: 18,
    latePaymentRate: 8,
    arrearsPeriod: 14,
    defaultPeriod: 28,
    minAmount: 1000,
    maxAmount: 50000,
    minTerm: 6,
    maxTerm: 60,
    isActive: true,
    legalFeeType: "FIXED",
    legalFeeValue: 0,
    stampingFeeType: "FIXED",
    stampingFeeValue: 0,
    requiredDocuments: [],
    eligibleBorrowerTypes: "BOTH",
    loanScheduleType: "JADUAL_J",
  });
  const [newDocLabel, setNewDocLabel] = useState("");

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      try {
        const res = await api.get<Product>(`/api/products/${productId}`);
        if (res.success && res.data) {
          const product = res.data;
          setFormData({
            name: product.name,
            description: product.description || "",
            interestModel: product.interestModel,
            interestRate: toSafeNumber(product.interestRate),
            latePaymentRate: toSafeNumber(product.latePaymentRate),
            arrearsPeriod: product.arrearsPeriod,
            defaultPeriod: product.defaultPeriod,
            minAmount: toSafeNumber(product.minAmount),
            maxAmount: toSafeNumber(product.maxAmount),
            minTerm: product.minTerm,
            maxTerm: product.maxTerm,
            isActive: product.isActive,
            legalFeeType: product.legalFeeType || "FIXED",
            legalFeeValue: toSafeNumber(product.legalFeeValue),
            stampingFeeType: product.stampingFeeType || "FIXED",
            stampingFeeValue: toSafeNumber(product.stampingFeeValue),
            requiredDocuments: product.requiredDocuments || [],
            eligibleBorrowerTypes: product.eligibleBorrowerTypes || "BOTH",
            loanScheduleType: product.loanScheduleType || "JADUAL_J",
          });
        }
      } catch (error) {
        console.error("Failed to fetch product:", error);
        toast.error("Failed to load product");
      }
      setLoading(false);
    };
    fetchProduct();
  }, [productId]);

  const handleNext = () => {
    // Validation for each step
    if (currentStep === 1) {
      if (!formData.name.trim()) {
        toast.error("Please enter a product name");
        return;
      }
      if (!formData.description.trim()) {
        toast.error("Please enter a description");
        return;
      }
    }
    if (currentStep === 2) {
      if (formData.interestRate < 0 || formData.interestRate > 100) {
        toast.error("Interest rate must be between 0 and 100");
        return;
      }
      if (formData.latePaymentRate < 0 || formData.latePaymentRate > 100) {
        toast.error("Late payment rate must be between 0 and 100");
        return;
      }
    }
    if (currentStep === 3) {
      if (formData.minAmount <= 0) {
        toast.error("Minimum amount must be greater than 0");
        return;
      }
      if (formData.maxAmount < formData.minAmount) {
        toast.error("Maximum amount must be greater than or equal to minimum amount");
        return;
      }
      if (formData.minTerm <= 0) {
        toast.error("Minimum term must be greater than 0");
        return;
      }
      if (formData.maxTerm < formData.minTerm) {
        toast.error("Maximum term must be greater than or equal to minimum term");
        return;
      }
      if (formData.arrearsPeriod > formData.defaultPeriod) {
        toast.error("Arrears period must be less than or equal to default period");
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.patch<Product>(`/api/products/${productId}`, formData);
      if (res.success) {
        toast.success("Product updated successfully");
        router.push(`/dashboard/products/${productId}`);
      } else {
        toast.error(res.error || "Failed to update product");
      }
    } catch {
      toast.error("Failed to update product");
    }
    setSaving(false);
  };

  const handleAddDocument = () => {
    if (!newDocLabel.trim()) return;
    const key = generateKey(newDocLabel);
    if (formData.requiredDocuments.some((d) => d.key === key)) {
      toast.error("Document category already exists");
      return;
    }
    setFormData({
      ...formData,
      requiredDocuments: [
        ...formData.requiredDocuments,
        { key, label: newDocLabel.trim(), required: false },
      ],
    });
    setNewDocLabel("");
  };

  const handleRemoveDocument = (key: string) => {
    setFormData({
      ...formData,
      requiredDocuments: formData.requiredDocuments.filter((d) => d.key !== key),
    });
  };

  const handleToggleDocumentRequired = (key: string) => {
    setFormData({
      ...formData,
      requiredDocuments: formData.requiredDocuments.map((d) =>
        d.key === key ? { ...d, required: !d.required } : d
      ),
    });
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
            Edit Product
          </h1>
          <p className="text-muted-foreground">
            Update loan product configuration
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={currentStep} />

      {/* Step Content */}
      <Card>
        <CardContent className="pt-6">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Basic Information</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Update the basic details for this loan product
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Product Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Personal Loan"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Interest Model *</Label>
                  <select
                    value={formData.interestModel}
                    onChange={(e) => setFormData({ ...formData, interestModel: e.target.value })}
                    className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="FLAT">Flat Rate</option>
                    <option value="DECLINING_BALANCE">Declining Balance</option>
                    <option value="EFFECTIVE_RATE">Effective Rate</option>
                  </select>
                  <p className="text-xs text-muted-foreground">{interestModelDescriptions[formData.interestModel]}</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Description *</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of this loan product"
                  />
                </div>
              </div>

              {/* Borrower Eligibility */}
              <div className="space-y-3 p-4 border rounded-lg">
                <Label>Borrower Eligibility *</Label>
                <p className="text-xs text-muted-foreground">Which types of borrowers can use this product?</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {BORROWER_ELIGIBILITY_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                      <label
                        key={option.value}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          formData.eligibleBorrowerTypes === option.value
                            ? "border-accent bg-accent/10"
                            : "border-border hover:border-accent/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="eligibleBorrowerTypes"
                          value={option.value}
                          checked={formData.eligibleBorrowerTypes === option.value}
                          onChange={(e) =>
                            setFormData({ ...formData, eligibleBorrowerTypes: e.target.value })
                          }
                          className="sr-only"
                        />
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Loan Schedule Type */}
              <div className="space-y-3 p-4 border rounded-lg">
                <Label>Loan Schedule Type *</Label>
                <p className="text-xs text-muted-foreground">Per KPKT regulations</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {LOAN_SCHEDULE_TYPE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                      <label
                        key={option.value}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          formData.loanScheduleType === option.value
                            ? "border-accent bg-accent/10"
                            : "border-border hover:border-accent/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="loanScheduleType"
                          value={option.value}
                          checked={formData.loanScheduleType === option.value}
                          onChange={(e) => {
                            const newType = e.target.value;
                            if (newType === "JADUAL_K") {
                              setFormData({
                                ...formData,
                                loanScheduleType: newType,
                                interestRate: 12,
                              });
                            } else {
                              setFormData({ ...formData, loanScheduleType: newType });
                            }
                          }}
                          className="sr-only"
                        />
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1">
                          <span className="text-sm">{option.label}</span>
                          {option.value === "JADUAL_K" && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Requires collateral, max 12% p.a.
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Rates & Fees */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Rates & Fees</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure interest rates and fees for this product
                </p>
              </div>

              {/* Interest Rates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Interest Rate (% per annum) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.interestRate}
                    onChange={(e) => setFormData({ ...formData, interestRate: parseFloat(e.target.value) || 0 })}
                  />
                  {formData.loanScheduleType === "JADUAL_K" && formData.interestRate !== 12 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Note: Jadual K loans typically have a maximum rate of 12% p.a.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Late Payment Rate (% per annum) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.latePaymentRate}
                    onChange={(e) => setFormData({ ...formData, latePaymentRate: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              {/* Fee Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Legal Fee */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label>Legal Fee</Label>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${formData.legalFeeType === "FIXED" ? "text-foreground" : "text-muted-foreground"}`}>
                        Fixed
                      </span>
                      <Switch
                        checked={formData.legalFeeType === "PERCENTAGE"}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, legalFeeType: checked ? "PERCENTAGE" : "FIXED" })
                        }
                      />
                      <span className={`text-xs ${formData.legalFeeType === "PERCENTAGE" ? "text-foreground" : "text-muted-foreground"}`}>
                        Percentage
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.legalFeeValue}
                      onChange={(e) => setFormData({ ...formData, legalFeeValue: parseFloat(e.target.value) || 0 })}
                    />
                    <span className="text-sm text-muted-foreground">
                      {formData.legalFeeType === "PERCENTAGE" ? "%" : "RM"}
                    </span>
                  </div>
                </div>

                {/* Stamping Fee */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label>Stamping Fee</Label>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${formData.stampingFeeType === "FIXED" ? "text-foreground" : "text-muted-foreground"}`}>
                        Fixed
                      </span>
                      <Switch
                        checked={formData.stampingFeeType === "PERCENTAGE"}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, stampingFeeType: checked ? "PERCENTAGE" : "FIXED" })
                        }
                      />
                      <span className={`text-xs ${formData.stampingFeeType === "PERCENTAGE" ? "text-foreground" : "text-muted-foreground"}`}>
                        Percentage
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.stampingFeeValue}
                      onChange={(e) => setFormData({ ...formData, stampingFeeValue: parseFloat(e.target.value) || 0 })}
                    />
                    <span className="text-sm text-muted-foreground">
                      {formData.stampingFeeType === "PERCENTAGE" ? "%" : "RM"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Limits */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Limits & Collection Settings</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Set amount and term limits, and collection parameters
                </p>
              </div>

              {/* Amount Limits */}
              <div>
                <h3 className="text-sm font-medium mb-3 text-muted-foreground">Amount Limits</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Minimum Amount (RM) *</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.minAmount}
                      onChange={(e) => setFormData({ ...formData, minAmount: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Maximum Amount (RM) *</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.maxAmount}
                      onChange={(e) => setFormData({ ...formData, maxAmount: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              {/* Term Limits */}
              <div>
                <h3 className="text-sm font-medium mb-3 text-muted-foreground">Term Limits</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Minimum Term (months) *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.minTerm}
                      onChange={(e) => setFormData({ ...formData, minTerm: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Maximum Term (months) *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.maxTerm}
                      onChange={(e) => setFormData({ ...formData, maxTerm: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>
              </div>

              {/* Collection Settings */}
              <div>
                <h3 className="text-sm font-medium mb-3 text-muted-foreground">Collection Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Arrears Period (days) *</Label>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={formData.arrearsPeriod}
                      onChange={(e) => setFormData({ ...formData, arrearsPeriod: parseInt(e.target.value) || 14 })}
                    />
                    <p className="text-xs text-muted-foreground">Days after missed payment before loan is flagged as at-risk</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Default Period (days) *</Label>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={formData.defaultPeriod}
                      onChange={(e) => setFormData({ ...formData, defaultPeriod: parseInt(e.target.value) || 28 })}
                    />
                    <p className="text-xs text-muted-foreground">Days after missed payment before loan is marked as defaulted</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Documents & Review */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Documents & Review</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure required documents and review your changes
                </p>
              </div>

              {/* Status Toggle */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Product Status</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.isActive 
                        ? "Product is active and available for new loans"
                        : "Product is inactive and hidden from new applications"}
                    </p>
                  </div>
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                </div>
              </div>

              {/* Document Recommendations */}
              {(() => {
                // Filter recommendations based on current product configuration
                const relevantRecommendations = DOCUMENT_RECOMMENDATIONS.filter(rec => {
                  const matchesBorrowerType = rec.forBorrowerTypes.includes(formData.eligibleBorrowerTypes as "INDIVIDUAL" | "CORPORATE" | "BOTH");
                  const matchesScheduleType = rec.forScheduleTypes.includes(formData.loanScheduleType as "JADUAL_J" | "JADUAL_K");
                  const notAlreadyAdded = !formData.requiredDocuments.some(doc => doc.key === rec.key);
                  return matchesBorrowerType && matchesScheduleType && notAlreadyAdded;
                });

                const handleAddRecommendation = (rec: DocumentRecommendation) => {
                  setFormData({
                    ...formData,
                    requiredDocuments: [
                      ...formData.requiredDocuments,
                      { key: rec.key, label: rec.label, required: rec.defaultRequired },
                    ],
                  });
                };

                const handleAddAllRecommendations = () => {
                  const newDocs = relevantRecommendations.map(rec => ({
                    key: rec.key,
                    label: rec.label,
                    required: rec.defaultRequired,
                  }));
                  setFormData({
                    ...formData,
                    requiredDocuments: [...formData.requiredDocuments, ...newDocs],
                  });
                };

                return (
                  <>
                    {/* Recommendations Section */}
                    {relevantRecommendations.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-amber-500" />
                            <h3 className="text-sm font-medium">Recommended Documents</h3>
                            <Badge variant="outline" className="text-xs">
                              {formData.loanScheduleType === "JADUAL_K" ? "Jadual K" : "Jadual J"}
                              {" • "}
                              {formData.eligibleBorrowerTypes === "INDIVIDUAL" ? "Individual" : 
                               formData.eligibleBorrowerTypes === "CORPORATE" ? "Corporate" : "All Borrowers"}
                            </Badge>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddAllRecommendations}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add All ({relevantRecommendations.length})
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Based on your product configuration, we recommend these documents. Click to add.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {relevantRecommendations.map((rec) => (
                            <button
                              key={rec.key}
                              type="button"
                              onClick={() => handleAddRecommendation(rec)}
                              className="flex items-center gap-3 p-3 border border-dashed border-border rounded-lg hover:border-accent hover:bg-accent/5 transition-colors text-left group"
                            >
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-accent/10">
                                <Plus className="h-4 w-4 text-muted-foreground group-hover:text-accent" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{rec.label}</span>
                                  {rec.defaultRequired && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Required</Badge>
                                  )}
                                </div>
                                {rec.description && (
                                  <p className="text-xs text-muted-foreground truncate">{rec.description}</p>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Added Documents */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Added Documents ({formData.requiredDocuments.length})
                  </h3>
                </div>
                {formData.requiredDocuments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 border border-dashed rounded-lg text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No documents added yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add from recommendations above or create custom documents below
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formData.requiredDocuments.map((doc) => (
                      <div
                        key={doc.key}
                        className="flex items-center justify-between p-3 border rounded-lg bg-card"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          </div>
                          <span className="text-sm">{doc.label}</span>
                          <Badge variant={doc.required ? "default" : "outline"} className="text-xs">
                            {doc.required ? "Required" : "Optional"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleDocumentRequired(doc.key)}
                          >
                            {doc.required ? "Make Optional" : "Make Required"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveDocument(doc.key)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Custom document input */}
                <div className="flex gap-2 pt-2">
                  <Input
                    placeholder="Add custom document category..."
                    value={newDocLabel}
                    onChange={(e) => setNewDocLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddDocument();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={handleAddDocument}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Custom
                  </Button>
                </div>
              </div>

              {/* Review Summary */}
              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="text-sm font-medium text-muted-foreground">Product Summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Basic Info
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Name</span>
                        <span className="font-medium">{formData.name || "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Interest Model</span>
                        <span className="font-medium">{formData.interestModel.replace("_", " ")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Eligibility</span>
                        <span className="font-medium">{formData.eligibleBorrowerTypes}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Schedule Type</span>
                        <span className="font-medium">{formData.loanScheduleType === "JADUAL_K" ? "Jadual K" : "Jadual J"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant={formData.isActive ? "success" : "secondary"}>
                          {formData.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Percent className="h-4 w-4" />
                        Rates & Fees
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Interest Rate</span>
                        <span className="font-medium">{formData.interestRate}% p.a.</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Late Payment Rate</span>
                        <span className="font-medium">{formData.latePaymentRate}% p.a.</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Legal Fee</span>
                        <span className="font-medium">
                          {formData.legalFeeType === "PERCENTAGE"
                            ? `${formData.legalFeeValue}%`
                            : formatCurrency(formData.legalFeeValue)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Stamping Fee</span>
                        <span className="font-medium">
                          {formData.stampingFeeType === "PERCENTAGE"
                            ? `${formData.stampingFeeValue}%`
                            : formatCurrency(formData.stampingFeeValue)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Limits
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount Range</span>
                        <span className="font-medium">
                          {formatCurrency(formData.minAmount)} - {formatCurrency(formData.maxAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Term Range</span>
                        <span className="font-medium">{formData.minTerm} - {formData.maxTerm} months</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Arrears Period</span>
                        <span className="font-medium">{formData.arrearsPeriod} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Default Period</span>
                        <span className="font-medium">{formData.defaultPeriod} days</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Documents
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1">
                        {formData.requiredDocuments.map((doc) => (
                          <Badge
                            key={doc.key}
                            variant={doc.required ? "default" : "outline"}
                            className="text-xs"
                          >
                            {doc.label}
                            {doc.required && " *"}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
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

        {currentStep < 4 ? (
          <Button onClick={handleNext}>
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            <CheckCircle className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </div>
    </div>
  );
}
