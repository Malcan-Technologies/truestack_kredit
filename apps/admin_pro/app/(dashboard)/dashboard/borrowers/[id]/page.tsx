"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Fingerprint,
  ChartPie,
  AlertTriangle,
  Pencil,
  Plus,
  Trash2,
  Clock,
  X,
  Save,
  Upload,
  FileText,
  Image,
  Download,
  Briefcase,
  TrendingUp,
  Copy,
  Share2,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { api } from "@/lib/api";
import { formatDate, formatRelativeTime, formatCurrency } from "@/lib/utils";
import {
  DEFAULT_COUNTRY_CODE,
  formatFullAddress,
  getCountryFlag,
  getCountryName,
  getCountryOptions,
  getStateName,
  getStateOptions,
} from "@/lib/address-options";
import { CopyField } from "@/components/ui/copy-field";
import { PhoneDisplay } from "@/components/ui/phone-display";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TrueIdentityBox } from "@/components/trueidentity-box";
import { InternalStaffNotesPanel } from "@/components/internal-staff-notes-panel";
import { VerificationBadge } from "@/components/verification-badge";
import { RefreshButton } from "@/components/ui/refresh-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  InstagramIcon,
  TikTokIcon,
  FacebookIcon,
  LinkedInIcon,
  XTwitterIcon,
} from "@/components/ui/social-media-icons";

// ============================================
// Types
// ============================================

interface BorrowerDocument {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  category: string;
  uploadedAt: string;
}

interface Borrower {
  id: string;
  borrowerType: string;
  name: string;
  icNumber: string;
  documentType: string;
  documentVerified: boolean;
  verificationStatus?: "FULLY_VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED";
  verifiedAt: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  race: string | null;
  educationLevel: string | null;
  occupation: string | null;
  employmentStatus: string | null;
  bankName: string | null;
  bankNameOther: string | null;
  bankAccountNo: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  monthlyIncome: string | null;
  instagram: string | null;
  tiktok: string | null;
  facebook: string | null;
  linkedin: string | null;
  xTwitter: string | null;
  // Corporate fields
  companyName: string | null;
  ssmRegistrationNo: string | null;
  businessAddress: string | null;
  bumiStatus: string | null;
  authorizedRepName: string | null;
  authorizedRepIc: string | null;
  directors: Array<{
    id: string;
    name: string;
    icNumber: string;
    position: string | null;
    order: number;
    trueIdentityStatus?: string | null;
    trueIdentityResult?: string | null;
    trueIdentityDocumentUrls?: {
      icFrontUrl?: string | null;
      icBackUrl?: string | null;
      selfieUrl?: string | null;
      verificationDetailUrl?: string | null;
      updatedAt?: string;
    } | null;
  }>;
  companyPhone: string | null;
  companyEmail: string | null;
  natureOfBusiness: string | null;
  dateOfIncorporation: string | null;
  paidUpCapital: string | null;
  numberOfEmployees: number | null;
  performanceProjection: {
    riskLevel: BorrowerPerformanceRiskLevel;
    onTimeRate: string | null;
    tags: string[];
    totalLoans: number;
    activeLoans: number;
    inArrearsLoans: number;
    defaultedLoans: number;
    writtenOffLoans?: number;
    readyForDefaultLoans: number;
    completedLoans: number;
    pendingDisbursementLoans: number;
    paidOnTimeCount: number;
    paidLateCount: number;
    overdueCount: number;
    lastPaymentAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  loans: Array<{
    id: string;
    status: string;
    principalAmount: string;
    createdAt: string;
    product: { name: string } | null;
  }>;
  loanSummary?: {
    totalBorrowed: number;
    totalPaid: number;
  };
  guarantorCount?: number;
  documents: BorrowerDocument[];
  trueIdentitySessions?: Array<{
    verificationDocumentUrls: {
      icFrontUrl?: string | null;
      icBackUrl?: string | null;
      selfieUrl?: string | null;
      verificationDetailUrl?: string | null;
    } | null;
  }>;
}

interface TimelineEvent {
  id: string;
  action: string;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

type BorrowerPerformanceRiskLevel = "NO_HISTORY" | "GOOD" | "WATCH" | "HIGH_RISK" | "DEFAULTED";

type DataConsistencyLevel = "EXACT_MATCH" | "ALMOST_FULL_MATCH" | "PARTIAL_MATCH" | "NOT_MATCHING" | "NOT_AVAILABLE";

interface CrossTenantInsights {
  hasHistory: boolean;
  otherLenderCount: number;
  lenderNames: string[];
  totalLoans: number;
  activeLoans: number;
  completedLoans: number;
  defaultedLoans: number;
  latePaymentsCount?: number;
  totalBorrowedRange: string | null;
  paymentPerformance: {
    rating: BorrowerPerformanceRiskLevel;
    onTimeRateRange: string | null;
  };
  lastBorrowedAt: string | null;
  lastActivityAt: string | null;
  nameConsistency?: DataConsistencyLevel;
  phoneConsistency?: DataConsistencyLevel;
  addressConsistency?: DataConsistencyLevel;
  loanDetails?: CrossTenantLoanInsight[];
  recentLoans?: CrossTenantLoanInsight[];
  loans?: CrossTenantLoanInsight[];
}

interface CrossTenantLoanInsight {
  id?: string;
  lenderName?: string | null;
  tenantName?: string | null;
  loanAmountRange?: string | null;
  principalAmountRange?: string | null;
  amountRange?: string | null;
  status?: string | null;
  paymentPerformance?: {
    onTimeRateRange?: string | null;
  };
  agreementDate?: string | null;
  disbursementDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastActivityAt?: string | null;
}

interface FormData {
  // Common fields
  name: string;
  icNumber: string;
  documentType: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  bankName: string;
  bankNameOther: string;
  bankAccountNo: string;
  // Individual fields
  dateOfBirth: string;
  gender: string;
  race: string;
  educationLevel: string;
  occupation: string;
  employmentStatus: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  monthlyIncome: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  linkedin: string;
  xTwitter: string;
  // Corporate fields
  companyName: string;
  ssmRegistrationNo: string;
  bumiStatus: string;
  authorizedRepName: string;
  authorizedRepIc: string;
  directors: Array<{
    name: string;
    icNumber: string;
    position: string;
  }>;
  companyPhone: string;
  companyEmail: string;
  natureOfBusiness: string;
  dateOfIncorporation: string;
  paidUpCapital: string;
  numberOfEmployees: string;
}

// ============================================
// Helper Functions
// ============================================

function formatICForDisplay(icNumber: string): string {
  const cleanIC = icNumber.replace(/[-\s]/g, "");
  if (cleanIC.length === 12 && /^\d{12}$/.test(cleanIC)) {
    return `${cleanIC.substring(0, 6)}-${cleanIC.substring(6, 8)}-${cleanIC.substring(8, 12)}`;
  }
  return icNumber;
}

function extractDateFromIC(icNumber: string): string | null {
  const cleanIC = icNumber.replace(/[-\s]/g, "");
  if (cleanIC.length < 6 || !/^\d{6}/.test(cleanIC)) {
    return null;
  }
  const yearPart = cleanIC.substring(0, 2);
  const monthPart = cleanIC.substring(2, 4);
  const dayPart = cleanIC.substring(4, 6);
  const month = parseInt(monthPart, 10);
  const day = parseInt(dayPart, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const yearNum = parseInt(yearPart, 10);
  const fullYear = yearNum >= 0 && yearNum <= 30 ? 2000 + yearNum : 1900 + yearNum;
  return `${fullYear}-${monthPart}-${dayPart}`;
}

function extractGenderFromIC(icNumber: string): string | null {
  const cleanIC = icNumber.replace(/[-\s]/g, "");
  if (cleanIC.length < 12) return null;
  const lastDigit = parseInt(cleanIC.charAt(cleanIC.length - 1), 10);
  if (isNaN(lastDigit)) return null;
  return lastDigit % 2 === 1 ? "MALE" : "FEMALE";
}

function formatDateForInput(dateString: string | null): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return date.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function normalizeIdentityNumber(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "").trim();
}

// ============================================
// Option Constants
// ============================================

const DOCUMENT_TYPE_OPTIONS = [
  { value: "IC", label: "IC (MyKad)" },
  { value: "PASSPORT", label: "Passport" },
];

const BANK_OPTIONS = [
  { value: "MAYBANK", label: "Maybank" },
  { value: "CIMB", label: "CIMB Bank" },
  { value: "PUBLIC_BANK", label: "Public Bank" },
  { value: "RHB", label: "RHB Bank" },
  { value: "HONG_LEONG", label: "Hong Leong Bank" },
  { value: "AMBANK", label: "AmBank" },
  { value: "BANK_ISLAM", label: "Bank Islam" },
  { value: "BANK_RAKYAT", label: "Bank Rakyat" },
  { value: "BSN", label: "BSN" },
  { value: "AFFIN", label: "Affin Bank" },
  { value: "ALLIANCE", label: "Alliance Bank" },
  { value: "OCBC", label: "OCBC Bank" },
  { value: "UOB", label: "UOB" },
  { value: "HSBC", label: "HSBC" },
  { value: "STANDARD_CHARTERED", label: "Standard Chartered" },
  { value: "AGROBANK", label: "Agrobank" },
  { value: "MUAMALAT", label: "Bank Muamalat" },
  { value: "OTHER", label: "Lain-lain (Other)" },
];

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

const RACE_OPTIONS = [
  { value: "MELAYU", label: "Melayu" },
  { value: "CINA", label: "Cina" },
  { value: "INDIA", label: "India" },
  { value: "LAIN_LAIN", label: "Lain-lain" },
  { value: "BUMIPUTRA_SABAH_SARAWAK", label: "Bumiputra Sabah/Sarawak" },
  { value: "BUKAN_WARGANEGARA", label: "Bukan Warganegara" },
];

const EDUCATION_OPTIONS = [
  { value: "NO_FORMAL", label: "Tiada Pendidikan Formal" },
  { value: "PRIMARY", label: "Sekolah Rendah" },
  { value: "SECONDARY", label: "Sekolah Menengah" },
  { value: "DIPLOMA", label: "Diploma" },
  { value: "DEGREE", label: "Ijazah Sarjana Muda" },
  { value: "POSTGRADUATE", label: "Pasca Siswazah" },
];

const EMPLOYMENT_OPTIONS = [
  { value: "EMPLOYED", label: "Bekerja" },
  { value: "SELF_EMPLOYED", label: "Bekerja Sendiri" },
  { value: "UNEMPLOYED", label: "Tidak Bekerja" },
  { value: "RETIRED", label: "Bersara" },
  { value: "STUDENT", label: "Pelajar" },
];

const BUMI_STATUS_OPTIONS = [
  { value: "BUMI", label: "Bumiputera" },
  { value: "BUKAN_BUMI", label: "Bukan Bumiputera" },
  { value: "ASING", label: "Asing" },
];

const RELATIONSHIP_OPTIONS = [
  { value: "SPOUSE", label: "Spouse" },
  { value: "PARENT", label: "Parent" },
  { value: "SIBLING", label: "Sibling" },
  { value: "CHILD", label: "Child" },
  { value: "FRIEND", label: "Friend" },
  { value: "OTHER", label: "Other" },
];

/** Bank account: digits only, 8-17 digits */
const BANK_ACCOUNT_REGEX = /^\d{8,17}$/;

/** Postcode: digits only */
const POSTCODE_REGEX = /^\d+$/;

// Document categories
const INDIVIDUAL_DOCUMENT_OPTIONS = [
  { value: "IC_FRONT", label: "IC Front" },
  { value: "IC_BACK", label: "IC Back" },
  { value: "PASSPORT", label: "Passport" },
  { value: "WORK_PERMIT", label: "Work Permit" },
  { value: "SELFIE_LIVENESS", label: "Selfie (Liveness)" },
  { value: "OTHER", label: "Other" },
];

const CORPORATE_DOCUMENT_OPTIONS = [
  { value: "SSM_CERT", label: "SSM Certificate" },
  { value: "FORM_9", label: "Form 9" },
  { value: "FORM_13", label: "Form 13" },
  { value: "FORM_24", label: "Form 24" },
  { value: "FORM_49", label: "Form 49" },
  { value: "COMPANY_PROFILE", label: "Company Profile" },
  { value: "DIRECTOR_IC_FRONT", label: "Director IC Front" },
  { value: "DIRECTOR_IC_BACK", label: "Director IC Back" },
  { value: "DIRECTOR_PASSPORT", label: "Director Identification" },
  { value: "SELFIE_LIVENESS", label: "Selfie (Liveness)" },
  { value: "OTHER", label: "Other" },
];

const CORPORATE_HIDDEN_KYC_DOC_CATEGORIES = new Set([
  "DIRECTOR_IC_FRONT",
  "DIRECTOR_IC_BACK",
  "SELFIE_LIVENESS",
]);

const CORPORATE_BORROWER_DOCUMENT_OPTIONS = CORPORATE_DOCUMENT_OPTIONS.filter(
  (opt) => !CORPORATE_HIDDEN_KYC_DOC_CATEGORIES.has(opt.value)
);

const MAX_DOCUMENTS_PER_CATEGORY = 3;

function getDocumentLabel(category: string, borrowerType: string): string {
  const options = borrowerType === "CORPORATE" 
    ? CORPORATE_DOCUMENT_OPTIONS
    : INDIVIDUAL_DOCUMENT_OPTIONS;
  return options.find(o => o.value === category)?.label || category;
}

function sortDocumentsByCategory<T extends { category: string }>(
  documents: T[],
  borrowerType: string
): T[] {
  const options = borrowerType === "CORPORATE" 
    ? CORPORATE_DOCUMENT_OPTIONS
    : INDIVIDUAL_DOCUMENT_OPTIONS;
  const orderMap = new Map(options.map((o, i) => [o.value, i]));
  return [...documents].sort((a, b) => {
    const idxA = orderMap.get(a.category) ?? 999;
    const idxB = orderMap.get(b.category) ?? 999;
    return idxA - idxB;
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDocumentIcon(mimeType: string) {
  if (/^image\//i.test(mimeType)) return Image;
  if (mimeType === "application/pdf") return FileText;
  return FileText;
}

function resolveKycAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/proxy/")) return url;
  if (url.startsWith("/api/uploads/")) return `/api/proxy${url.replace("/api", "")}`;
  if (url.startsWith("/uploads/")) return `/api/proxy${url}`;
  return url;
}

function getPerformanceBadgeMeta(riskLevel: BorrowerPerformanceRiskLevel | null | undefined) {
  switch (riskLevel) {
    case "DEFAULTED":
      return { label: "Defaulted", variant: "destructive" as const };
    case "HIGH_RISK":
      return { label: "High Risk", variant: "warning" as const };
    case "WATCH":
      return { label: "Watch", variant: "info" as const };
    case "GOOD":
      return { label: "Good", variant: "success" as const };
    default:
      return { label: "No History", variant: "outline" as const };
  }
}

function formatLoanStatusLabel(status: string | null | undefined) {
  if (!status) return null;

  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCrossTenantLoanTimestamp(loan: CrossTenantLoanInsight) {
  const candidate =
    loan.disbursementDate ??
    loan.agreementDate ??
    loan.createdAt ??
    loan.updatedAt ??
    loan.lastActivityAt;

  if (!candidate) return null;

  const timestamp = new Date(candidate).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getCrossTenantLoanItems(insights: CrossTenantInsights | null | undefined) {
  const loanItems =
    insights?.loanDetails ??
    insights?.recentLoans ??
    insights?.loans ??
    [];

  return [...loanItems].sort((a, b) => {
    const aTime = getCrossTenantLoanTimestamp(a) ?? 0;
    const bTime = getCrossTenantLoanTimestamp(b) ?? 0;
    return bTime - aTime;
  });
}

function getCrossTenantLoanLenderName(loan: CrossTenantLoanInsight) {
  return loan.lenderName?.trim() || loan.tenantName?.trim() || "Other lender";
}

function getCrossTenantLoanAmountRange(loan: CrossTenantLoanInsight) {
  return (
    loan.loanAmountRange?.trim() ||
    loan.principalAmountRange?.trim() ||
    loan.amountRange?.trim() ||
    null
  );
}

function getConsistencyMeta(level: DataConsistencyLevel | null | undefined): {
  label: string;
  variant: "success" | "warning" | "destructive" | "outline" | "info";
  showAlert: boolean;
} {
  switch (level) {
    case "EXACT_MATCH":
      return { label: "Exact match", variant: "success", showAlert: false };
    case "ALMOST_FULL_MATCH":
      return { label: "Almost full match", variant: "success", showAlert: false };
    case "PARTIAL_MATCH":
      return { label: "Partial match", variant: "warning", showAlert: true };
    case "NOT_MATCHING":
      return { label: "Not matching", variant: "destructive", showAlert: true };
    default:
      return { label: "Not available", variant: "outline", showAlert: false };
  }
}

/** Maps on-time rate range (e.g. "80-90%") to Badge variant for color. */
function getPaymentPerformanceBadgeVariant(
  onTimeRateRange: string | null | undefined
): "success" | "warning" | "destructive" | "outline" {
  if (!onTimeRateRange?.trim()) return "outline";
  const match = onTimeRateRange.match(/^(\d+)/);
  const lower = match ? parseInt(match[1], 10) : NaN;
  if (Number.isNaN(lower)) return "outline";
  if (lower >= 80) return "success";
  if (lower >= 50) return "warning";
  return "destructive";
}

function getOnTimeRateDonutColor(rate: number): string {
  if (rate >= 80) return "text-emerald-500";
  if (rate >= 50) return "text-amber-500";
  return "text-red-500";
}

/** SVG donut chart for payment performance breakdown */
function PaymentDonutChart({
  paidOnTime,
  paidLate,
  overdue,
  onTimeRate,
}: {
  paidOnTime: number;
  paidLate: number;
  overdue: number;
  onTimeRate: number | null;
}) {
  const total = paidOnTime + paidLate + overdue;
  const size = 140;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  if (total === 0) {
    return (
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/30"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-medium text-muted-foreground">No data</span>
        </div>
      </div>
    );
  }

  const onTimeLen = (paidOnTime / total) * circumference;
  const lateLen = (paidLate / total) * circumference;
  const overdueLen = (overdue / total) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={`${onTimeLen} ${circumference}`}
          strokeDashoffset={0}
          className="text-emerald-500"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={`${lateLen} ${circumference}`}
          strokeDashoffset={-onTimeLen}
          className="text-amber-500"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={`${overdueLen} ${circumference}`}
          strokeDashoffset={-(onTimeLen + lateLen)}
          className="text-red-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {onTimeRate !== null ? (
          <>
            <span className={`text-2xl font-heading font-bold tabular-nums ${getOnTimeRateDonutColor(onTimeRate)}`}>
              {onTimeRate.toFixed(0)}%
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">On-time</span>
          </>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

// ============================================
// Field Component (outside main component to prevent re-creation)
// ============================================

interface FieldProps {
  label: string;
  value: string;
  editValue?: string;
  onChange?: (val: string) => void;
  type?: "text" | "email" | "date" | "select";
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  className?: string;
  isEditing: boolean;
  required?: boolean;
}

function Field({ 
  label, 
  value, 
  editValue, 
  onChange, 
  type = "text",
  error,
  disabled,
  placeholder,
  options,
  className,
  isEditing,
  required = true,
}: FieldProps) {
  if (!isEditing) {
    return (
      <div className={className}>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value || "-"}</p>
      </div>
    );
  }

  const inputValue = editValue ?? "";

  if (type === "select" && options) {
    return (
      <div className={className}>
        <label className="text-xs text-muted-foreground">{label} {required && "*"}</label>
        <Select value={inputValue} onValueChange={onChange || (() => {})} disabled={disabled}>
          <SelectTrigger className={error ? "border-red-500" : ""}>
            <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className={className}>
      <label className="text-xs text-muted-foreground">{label} {required && "*"}</label>
      <Input
        type={type}
        value={inputValue}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={error ? "border-red-500" : ""}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ============================================
// Timeline Component
// ============================================

function getKycDisplayName(
  event: TimelineEvent,
  borrower: Borrower | null
): string {
  if (!borrower) return "—";
  const newData = event.newData as { directorId?: string; directorName?: string | null } | null;
  if (newData?.directorId) {
    // Prefer directorName from audit log (always present for director events)
    if (newData.directorName) return newData.directorName;
    const director = borrower.directors?.find((d) => d.id === newData.directorId);
    return director?.name ?? borrower.companyName ?? borrower.name ?? "—";
  }
  return borrower.borrowerType === "CORPORATE"
    ? (borrower.companyName ?? borrower.name) ?? "—"
    : borrower.name ?? "—";
}

function getKycMessage(action: string, displayName: string): string {
  switch (action) {
    case "TRUEIDENTITY_VERIFICATION_STARTED":
      return `Trueidentity started to register KYC: ${displayName}`;
    case "TRUEIDENTITY_VERIFICATION_PROCESSING":
      return `Trueidentity is processing KYC for: ${displayName}`;
    case "TRUEIDENTITY_VERIFICATION_COMPLETED":
      return `Trueidentity completed KYC verification for: ${displayName}`;
    case "TRUEIDENTITY_VERIFICATION_EXPIRED":
      return `Trueidentity KYC session expired for: ${displayName}`;
    case "TRUEIDENTITY_VERIFICATION_FAILED":
      return `Trueidentity KYC verification failed for: ${displayName}`;
    case "TRUEIDENTITY_ALL_DIRECTORS_VERIFIED":
      return `Trueidentity completed e-KYC verification for all directors of: ${displayName}`;
    default:
      return `Trueidentity KYC update for: ${displayName}`;
  }
}

function TimelineItem({
  event,
  borrower,
}: {
  event: TimelineEvent;
  borrower: Borrower | null;
}) {
  const getActionInfo = (action: string) => {
    switch (action) {
      case "CREATE":
        return { icon: Plus, label: "Created" };
      case "UPDATE":
        return { icon: Pencil, label: "Updated" };
      case "DELETE":
        return { icon: Trash2, label: "Deleted" };
      case "DOCUMENT_UPLOAD":
        return { icon: Upload, label: "Document Uploaded" };
      case "DOCUMENT_DELETE":
        return { icon: Trash2, label: "Document Deleted" };
      case "BORROWER_MTSA_EMAIL_UPDATED":
        return { icon: Mail, label: "Signing Email Updated" };
      case "TRUEIDENTITY_VERIFICATION_STARTED":
      case "TRUEIDENTITY_VERIFICATION_PROCESSING":
      case "TRUEIDENTITY_VERIFICATION_COMPLETED":
      case "TRUEIDENTITY_VERIFICATION_EXPIRED":
      case "TRUEIDENTITY_VERIFICATION_FAILED":
      case "TRUEIDENTITY_ALL_DIRECTORS_VERIFIED":
      case "TRUEIDENTITY_WEBHOOK":
        return { icon: ShieldCheck, label: "True Identity" };
      default:
        return { icon: Clock, label: action };
    }
  };

  const actionInfo = getActionInfo(event.action);
  const Icon = actionInfo.icon;

  const formatAuditValue = (val: unknown, key: string): string => {
    if (val === null || val === undefined) return "(empty)";
    if (key === "directors" && Array.isArray(val)) {
      return val
        .map((d, i) => {
          const dir = d as { name?: string; icNumber?: string; position?: string };
          const parts = [dir.name || "—"];
          if (dir.icNumber) parts.push(`IC: ${formatICForDisplay(dir.icNumber)}`);
          if (dir.position) parts.push(dir.position);
          return `${i + 1}. ${parts.join(", ")}`;
        })
        .join("; ") || "(none)";
    }
    if (Array.isArray(val)) {
      return val.map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v))).join(", ");
    }
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  const FIELD_LABELS: Record<string, string> = {
    directors: "Company Directors",
    companyName: "Company Name",
    ssmRegistrationNo: "SSM Registration No",
    businessAddress: "Business Address",
    addressLine1: "Address Line 1",
    addressLine2: "Address Line 2",
    city: "City",
    state: "State",
    postcode: "Postcode",
    country: "Country",
    authorizedRepName: "Authorized Representative",
    authorizedRepIc: "Authorized Rep IC",
    companyPhone: "Company Phone",
    companyEmail: "Company Email",
    instagram: "Instagram",
    tiktok: "TikTok",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    xTwitter: "X (Twitter)",
  };

  const getChanges = () => {
    if (event.action !== "UPDATE" || !event.previousData || !event.newData) {
      return null;
    }
    const changes: { field: string; from: string; to: string }[] = [];
    const prev = event.previousData;
    const next = event.newData;
    for (const key of Object.keys(next)) {
      const prevVal = prev[key];
      const nextVal = next[key];
      if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
        const fieldLabel = FIELD_LABELS[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
        changes.push({
          field: fieldLabel,
          from: formatAuditValue(prevVal, key),
          to: formatAuditValue(nextVal, key),
        });
      }
    }
    return changes;
  };

  const changes = getChanges();

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center shrink-0">
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div className="w-px flex-1 bg-border mt-2" />
      </div>
      <div className="flex-1 min-w-0 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-foreground">{actionInfo.label}</span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(event.createdAt)}
          </span>
        </div>
        {event.user && (
          <p className="text-sm text-muted-foreground mb-2 break-words">
            by {event.user.name || event.user.email}
          </p>
        )}
        {changes && changes.length > 0 && (
          <div className="bg-secondary border border-border rounded-lg p-3 space-y-2 min-w-0">
            {changes.map((change, idx) => (
              <div key={idx} className="text-xs space-y-0.5 min-w-0">
                <span className="font-medium text-foreground">{change.field}</span>
                <div className="flex flex-wrap items-start gap-2 pl-2 min-w-0">
                  <span className="inline-block max-w-full px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground line-through break-words">
                    {change.from}
                  </span>
                  <span className="text-muted-foreground self-center shrink-0">→</span>
                  <span className="inline-block max-w-full px-1.5 py-0.5 rounded bg-foreground/10 text-foreground font-medium break-words">
                    {change.to}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {event.action === "CREATE" && event.newData && (
          <div className="bg-secondary border border-border rounded-lg p-3 min-w-0">
            <p className="text-xs text-muted-foreground break-words">
              Borrower record created with name: <span className="font-medium text-foreground">
                {event.newData.borrowerType === "CORPORATE" 
                  ? (event.newData.companyName as string) || (event.newData.name as string)
                  : (event.newData.name as string)}
              </span>
            </p>
          </div>
        )}
        {event.action === "DOCUMENT_UPLOAD" && event.newData && (
          <div className="bg-secondary border border-border rounded-lg p-3 min-w-0">
            <p className="text-xs text-muted-foreground break-words">
              Uploaded document: <span className="font-medium text-foreground">
                {String(event.newData.filename || event.newData.category || "")}
              </span>
              {Boolean(event.newData.category) && (
                <span className="text-muted-foreground"> ({String(event.newData.category)})</span>
              )}
            </p>
          </div>
        )}
        {event.action === "DOCUMENT_DELETE" && event.previousData && (
          <div className="bg-secondary border border-border rounded-lg p-3 min-w-0">
            <p className="text-xs text-muted-foreground break-words">
              Deleted document: <span className="font-medium text-foreground">
                {String(event.previousData.filename || event.previousData.category || "")}
              </span>
              {Boolean(event.previousData.category) && (
                <span className="text-muted-foreground"> ({String(event.previousData.category)})</span>
              )}
            </p>
          </div>
        )}
        {event.action === "BORROWER_MTSA_EMAIL_UPDATED" && event.previousData && event.newData && (
          <div className="bg-secondary border border-border rounded-lg p-3 min-w-0">
            <p className="text-xs text-muted-foreground break-words">
              Signing certificate email changed
            </p>
            <div className="flex flex-wrap items-start gap-2 pl-2 mt-1 min-w-0">
              <span className="inline-block max-w-full px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground line-through break-words text-xs">
                {String((event.previousData as Record<string, unknown>).email || "—")}
              </span>
              <span className="text-muted-foreground self-center shrink-0 text-xs">→</span>
              <span className="inline-block max-w-full px-1.5 py-0.5 rounded bg-foreground/10 text-foreground font-medium break-words text-xs">
                {String((event.newData as Record<string, unknown>).email || "—")}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              This is the email linked to the digital signing certificate, not the login email.
            </p>
          </div>
        )}
        {event.action.startsWith("TRUEIDENTITY_") && (() => {
          const displayName = getKycDisplayName(event, borrower);
          const msg = getKycMessage(event.action, displayName);
          const parts = msg.split(": ");
          const prefix = parts.slice(0, -1).join(": ");
          const namePart = parts[parts.length - 1] ?? displayName;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3 min-w-0">
              <p className="text-xs text-muted-foreground break-words">
                {prefix}
                {": "}
                <span className="font-medium text-foreground">{namePart}</span>
              </p>
            </div>
          );
        })()}
        <p className="text-xs text-muted-foreground mt-2">
          {formatDate(event.createdAt)}
        </p>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function BorrowerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const borrowerId = params.id as string;

  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(false);
  const [loadingMoreTimeline, setLoadingMoreTimeline] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    // Common fields
    name: "",
    icNumber: "",
    documentType: "IC",
    phone: "",
    email: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postcode: "",
    country: DEFAULT_COUNTRY_CODE,
    bankName: "",
    bankNameOther: "",
    bankAccountNo: "",
    // Individual fields
    dateOfBirth: "",
    gender: "",
    race: "",
    educationLevel: "",
    occupation: "",
    employmentStatus: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelationship: "",
    monthlyIncome: "",
    instagram: "",
    tiktok: "",
    facebook: "",
    linkedin: "",
    xTwitter: "",
    // Corporate fields
    companyName: "",
    ssmRegistrationNo: "",
    bumiStatus: "",
    authorizedRepName: "",
    authorizedRepIc: "",
    directors: [{ name: "", icNumber: "", position: "" }],
    companyPhone: "",
    companyEmail: "",
    natureOfBusiness: "",
    dateOfIncorporation: "",
    paidUpCapital: "",
    numberOfEmployees: "",
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [noMonthlyIncome, setNoMonthlyIncome] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [selectedDocCategory, setSelectedDocCategory] = useState("ALL");
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [expandedDirectorIndices, setExpandedDirectorIndices] = useState<number[]>([]);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [showKycInvalidationConfirm, setShowKycInvalidationConfirm] = useState(false);
  const [trueIdentityRefreshKey, setTrueIdentityRefreshKey] = useState(0);
  const [crossTenantInsights, setCrossTenantInsights] = useState<CrossTenantInsights | null>(null);
  const [crossTenantInsightsLoading, setCrossTenantInsightsLoading] = useState(true);

  const isIC = formData.documentType === "IC";
  const countryOptions = getCountryOptions();
  const stateOptions = getStateOptions(formData.country);

  const fetchBorrower = useCallback(async () => {
    try {
      const res = await api.get<Borrower>(`/api/borrowers/${borrowerId}`);
      if (res.success && res.data) {
        setBorrower(res.data);
        populateForm(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch borrower:", error);
    }
  }, [borrowerId]);

  const fetchTimeline = useCallback(async (cursor?: string, append = false) => {
    try {
      if (append) {
        setLoadingMoreTimeline(true);
      }
      // The API returns { success, data: TimelineEvent[], pagination: {...} }
      const res = await fetch(`/api/proxy/borrowers/${borrowerId}/timeline?limit=10${cursor ? `&cursor=${cursor}` : ''}`, {
        credentials: "include",
      });
      const json = await res.json() as { 
        success: boolean; 
        data: TimelineEvent[]; 
        pagination: { hasMore: boolean; nextCursor: string | null } 
      };
      
      if (json.success && json.data) {
        if (append) {
          setTimeline((prev) => [...prev, ...json.data]);
        } else {
          setTimeline(json.data);
        }
        setHasMoreTimeline(json.pagination?.hasMore ?? false);
        setTimelineCursor(json.pagination?.nextCursor ?? null);
      }
    } catch (error) {
      console.error("Failed to fetch timeline:", error);
    } finally {
      setLoadingMoreTimeline(false);
    }
  }, [borrowerId]);

  const fetchCrossTenantInsights = useCallback(async () => {
    try {
      setCrossTenantInsightsLoading(true);
      const res = await api.get<CrossTenantInsights>(`/api/borrowers/${borrowerId}/cross-tenant-insights`);
      if (res.success && res.data) {
        setCrossTenantInsights(res.data);
      } else {
        setCrossTenantInsights(null);
      }
    } catch (error) {
      console.error("Failed to fetch cross-tenant insights:", error);
      setCrossTenantInsights(null);
    } finally {
      setCrossTenantInsightsLoading(false);
    }
  }, [borrowerId]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([fetchBorrower(), fetchTimeline(), fetchCrossTenantInsights()]);
    setTrueIdentityRefreshKey((k) => k + 1);
  }, [fetchBorrower, fetchTimeline, fetchCrossTenantInsights]);

  const populateForm = (data: Borrower) => {
    const docType = data.documentType || "IC";
    const cleanIcNumber = data.borrowerType === "INDIVIDUAL" && docType === "IC" 
      ? data.icNumber.replace(/\D/g, "").substring(0, 12)
      : data.icNumber;
    
    // Detect if borrower has 0 income (no monthly income)
    const incomeValue = data.monthlyIncome != null ? Number(data.monthlyIncome) : null;
    setNoMonthlyIncome(incomeValue === 0);
    const fallbackAddressLine1 = data.borrowerType === "CORPORATE"
      ? data.businessAddress || data.address
      : data.address;

    setFormData({
      // Common fields
      name: data.name,
      icNumber: cleanIcNumber,
      documentType: docType,
      phone: data.phone || "",
      email: data.email || "",
      addressLine1: data.addressLine1 || fallbackAddressLine1 || "",
      addressLine2: data.addressLine2 || "",
      city: data.city || "",
      state: data.state || "",
      postcode: data.postcode || "",
      country: data.country || DEFAULT_COUNTRY_CODE,
      bankName: data.bankName || "",
      bankNameOther: data.bankNameOther || "",
      bankAccountNo: data.bankAccountNo || "",
      // Individual fields
      dateOfBirth: formatDateForInput(data.dateOfBirth),
      gender: data.gender || "",
      race: data.race || "",
      educationLevel: data.educationLevel || "",
      occupation: data.occupation || "",
      employmentStatus: data.employmentStatus || "",
      emergencyContactName: data.emergencyContactName || "",
      emergencyContactPhone: data.emergencyContactPhone || "",
      emergencyContactRelationship: data.emergencyContactRelationship || "",
      monthlyIncome: data.monthlyIncome?.toString() || "",
      instagram: data.instagram || "",
      tiktok: data.tiktok || "",
      facebook: data.facebook || "",
      linkedin: data.linkedin || "",
      xTwitter: data.xTwitter || "",
      // Corporate fields
      companyName: data.companyName || "",
      ssmRegistrationNo: data.ssmRegistrationNo || "",
      bumiStatus: data.bumiStatus || "",
      authorizedRepName: data.authorizedRepName || "",
      authorizedRepIc: data.authorizedRepIc || "",
      directors: data.borrowerType === "CORPORATE"
        ? (
            data.directors.length > 0
              ? data.directors
                  .sort((a, b) => a.order - b.order)
                  .map((director) => ({
                    id: director.id,
                    name: director.name || "",
                    icNumber: director.icNumber || "",
                    position: director.position || "",
                  }))
              : [{
                  name: data.authorizedRepName || data.name || "",
                  icNumber: data.authorizedRepIc || "",
                  position: "",
                }]
          )
        : [{ name: "", icNumber: "", position: "" }],
      companyPhone: data.companyPhone || "",
      companyEmail: data.companyEmail || "",
      natureOfBusiness: data.natureOfBusiness || "",
      dateOfIncorporation: formatDateForInput(data.dateOfIncorporation),
      paidUpCapital: data.paidUpCapital?.toString() || "",
      numberOfEmployees: data.numberOfEmployees?.toString() || "",
    });
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchBorrower(), fetchTimeline()]);
      setLoading(false);
    };
    loadData();
  }, [fetchBorrower, fetchTimeline]);

  useEffect(() => {
    void fetchCrossTenantInsights();
  }, [fetchCrossTenantInsights]);

  const handleIcNumberChange = (value: string) => {
    const currentIsIC = formData.documentType === "IC";
    const cleanValue = currentIsIC ? value.replace(/\D/g, "").substring(0, 12) : value;
    
    const updates: Partial<FormData> = { icNumber: cleanValue };
    
    if (currentIsIC) {
      const extractedDate = extractDateFromIC(cleanValue);
      if (extractedDate) {
        updates.dateOfBirth = extractedDate;
      }
      const extractedGender = extractGenderFromIC(cleanValue);
      if (extractedGender) {
        updates.gender = extractedGender;
      }
    }
    
    setFormData((prev) => ({ ...prev, ...updates }));
    if (validationErrors.icNumber) {
      setValidationErrors((prev) => ({ ...prev, icNumber: "" }));
    }
  };

  const validateForm = (): boolean => {
    if (!borrower) return false;
    
    const errors: Record<string, string> = {};
    
    if (borrower.borrowerType === "CORPORATE") {
      // Corporate validation
      if (!formData.companyName.trim()) errors.companyName = "Company name is required";
      if (!formData.ssmRegistrationNo.trim()) errors.ssmRegistrationNo = "SSM registration number is required";
      if (!formData.addressLine1.trim()) errors.addressLine1 = "Address line 1 is required";
      if (!formData.city.trim()) errors.city = "City is required";
      if (!formData.postcode.trim()) errors.postcode = "Postcode is required";
      else if (!POSTCODE_REGEX.test(formData.postcode)) errors.postcode = "Postcode must contain numbers only";
      if (!formData.country) errors.country = "Country is required";
      if (formData.country && getStateOptions(formData.country).length > 0 && !formData.state) errors.state = "State is required";
      if (!formData.bumiStatus) errors.bumiStatus = "Taraf (Bumi status) is required for compliance";
      if (!formData.companyPhone.trim()) errors.companyPhone = "Company phone is required";
      if (!formData.companyEmail.trim()) errors.companyEmail = "Company email is required";
      if (!formData.bankName) errors.bankName = "Bank is required";
      if (formData.bankName === "OTHER" && !formData.bankNameOther.trim()) {
        errors.bankNameOther = "Bank name is required";
      }
      if (!formData.bankAccountNo.trim()) errors.bankAccountNo = "Account number is required";
      else if (!BANK_ACCOUNT_REGEX.test(formData.bankAccountNo.replace(/\D/g, ""))) {
        errors.bankAccountNo = "Account number must be 8-17 digits only";
      }
      if (formData.directors.length < 1) {
        errors.directors = "At least 1 director is required";
      } else if (formData.directors.length > 10) {
        errors.directors = "Maximum 10 directors allowed";
      } else {
        formData.directors.forEach((director, index) => {
          if (!director.name.trim()) {
            errors[`directorName_${index}`] = `Director ${index + 1} name is required`;
          }
          if (!director.icNumber.trim()) {
            errors[`directorIc_${index}`] = `Director ${index + 1} IC number is required`;
          } else {
            const cleanIC = director.icNumber.replace(/\D/g, "");
            if (cleanIC.length !== 12) {
              errors[`directorIc_${index}`] = `Director ${index + 1} IC must be exactly 12 digits`;
            }
          }
        });
      }
    } else {
      // Individual validation
      if (!formData.name.trim()) errors.name = "Name is required";
      if (!formData.icNumber.trim()) errors.icNumber = "IC/Passport number is required";
      else if (formData.documentType === "IC") {
        const cleanIC = formData.icNumber.replace(/\D/g, "");
        if (cleanIC.length !== 12) errors.icNumber = "IC number must be exactly 12 digits";
      }
      if (!formData.phone.trim()) errors.phone = "Phone number is required";
      if (!formData.email.trim()) errors.email = "Email is required";
      if (!formData.addressLine1.trim()) errors.addressLine1 = "Address line 1 is required";
      if (!formData.city.trim()) errors.city = "City is required";
      if (!formData.postcode.trim()) errors.postcode = "Postcode is required";
      else if (!POSTCODE_REGEX.test(formData.postcode)) errors.postcode = "Postcode must contain numbers only";
      if (!formData.country) errors.country = "Country is required";
      if (formData.country && getStateOptions(formData.country).length > 0 && !formData.state) errors.state = "State is required";
      if (!formData.dateOfBirth) errors.dateOfBirth = "Date of birth is required";
      if (!formData.gender) errors.gender = "Gender is required";
      if (!formData.race) errors.race = "Race is required";
      if (!formData.educationLevel) errors.educationLevel = "Education level is required";
      if (!formData.occupation.trim()) errors.occupation = "Occupation is required";
      if (!formData.employmentStatus) errors.employmentStatus = "Employment status is required";
      if (!noMonthlyIncome) {
        if (!formData.monthlyIncome.trim()) errors.monthlyIncome = "Monthly income is required";
        else if (isNaN(parseFloat(formData.monthlyIncome)) || parseFloat(formData.monthlyIncome) < 0) errors.monthlyIncome = "Enter a valid income amount";
      }
      if (!formData.bankName) errors.bankName = "Bank is required";
      if (formData.bankName === "OTHER" && !formData.bankNameOther.trim()) {
        errors.bankNameOther = "Bank name is required";
      }
      if (!formData.bankAccountNo.trim()) errors.bankAccountNo = "Account number is required";
      else if (!BANK_ACCOUNT_REGEX.test(formData.bankAccountNo.replace(/\D/g, ""))) {
        errors.bankAccountNo = "Account number must be 8-17 digits only";
      }
    }
    
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Please fill in all required fields");
      return false;
    }
    return true;
  };

  const hasKycIdentityChange = useCallback((): boolean => {
    if (!borrower) return false;

    if (borrower.borrowerType === "CORPORATE") {
      const existingById = new Map((borrower.directors ?? []).map((d) => [d.id, d]));
      return formData.directors.some((director, index) => {
        const directorId =
          "id" in director && typeof director.id === "string"
            ? director.id
            : undefined;
        const existingDirector = directorId
          ? existingById.get(directorId)
          : borrower.directors?.[index];
        if (!existingDirector) return false;

        return (
          director.name.trim() !== existingDirector.name.trim() ||
          normalizeIdentityNumber(director.icNumber) !==
            normalizeIdentityNumber(existingDirector.icNumber)
        );
      });
    }

    return (
      formData.name.trim() !== borrower.name.trim() ||
      normalizeIdentityNumber(formData.icNumber) !==
        normalizeIdentityNumber(borrower.icNumber)
    );
  }, [borrower, formData]);

  const handleSave = async (skipKycInvalidationConfirm = false) => {
    if (!validateForm() || !borrower) return;
    if (!skipKycInvalidationConfirm && hasKycIdentityChange()) {
      setShowKycInvalidationConfirm(true);
      return;
    }
    
    setSaving(true);
    try {
      let payload: Record<string, unknown>;
      
      if (borrower.borrowerType === "CORPORATE") {
        const primaryDirector = formData.directors[0];
        // Corporate borrower payload
        // Note: icNumber is not updated during edit to avoid duplicate audit entries
        // ssmRegistrationNo is the canonical field for corporate registration
        payload = {
          name: primaryDirector?.name || formData.authorizedRepName || undefined, // Rep name as primary name
          phone: formData.companyPhone || undefined,
          email: formData.companyEmail || undefined,
          addressLine1: formData.addressLine1 || undefined,
          addressLine2: formData.addressLine2 || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          postcode: formData.postcode || undefined,
          country: formData.country || undefined,
          companyName: formData.companyName || undefined,
          ssmRegistrationNo: formData.ssmRegistrationNo || undefined,
          businessAddress: formData.addressLine1 || undefined,
          bumiStatus: formData.bumiStatus || undefined,
          authorizedRepName: primaryDirector?.name || formData.authorizedRepName || undefined,
          authorizedRepIc: primaryDirector?.icNumber || formData.authorizedRepIc || undefined,
          directors: formData.directors.map((director) => ({
            name: director.name.trim(),
            icNumber: director.icNumber.trim(),
            position: director.position.trim() || undefined,
          })),
          companyPhone: formData.companyPhone || undefined,
          companyEmail: formData.companyEmail || undefined,
          natureOfBusiness: formData.natureOfBusiness || undefined,
          dateOfIncorporation: formData.dateOfIncorporation ? new Date(formData.dateOfIncorporation).toISOString() : undefined,
          paidUpCapital: formData.paidUpCapital ? parseFloat(formData.paidUpCapital) : undefined,
          numberOfEmployees: formData.numberOfEmployees ? parseInt(formData.numberOfEmployees) : undefined,
          bankName: formData.bankName || undefined,
          bankNameOther: formData.bankName === "OTHER" ? (formData.bankNameOther || undefined) : undefined,
          bankAccountNo: formData.bankAccountNo || undefined,
          instagram: formData.instagram?.trim() || undefined,
          tiktok: formData.tiktok?.trim() || undefined,
          facebook: formData.facebook?.trim() || undefined,
          linkedin: formData.linkedin?.trim() || undefined,
          xTwitter: formData.xTwitter?.trim() || undefined,
        };
      } else {
        // Individual borrower payload
        payload = {
          name: formData.name,
          icNumber: formData.icNumber,
          documentType: formData.documentType,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
          addressLine1: formData.addressLine1 || undefined,
          addressLine2: formData.addressLine2 || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          postcode: formData.postcode || undefined,
          country: formData.country || undefined,
          dateOfBirth: formData.dateOfBirth ? new Date(formData.dateOfBirth).toISOString() : undefined,
          gender: formData.gender || undefined,
          race: formData.race || undefined,
          educationLevel: formData.educationLevel || undefined,
          occupation: formData.occupation || undefined,
          employmentStatus: formData.employmentStatus || undefined,
          bankName: formData.bankName || undefined,
          bankNameOther: formData.bankName === "OTHER" ? (formData.bankNameOther || undefined) : undefined,
          bankAccountNo: formData.bankAccountNo || undefined,
          emergencyContactName: formData.emergencyContactName || undefined,
          emergencyContactPhone: formData.emergencyContactPhone || undefined,
          emergencyContactRelationship: formData.emergencyContactRelationship || undefined,
          monthlyIncome: noMonthlyIncome ? 0 : (formData.monthlyIncome.trim() !== "" ? parseFloat(formData.monthlyIncome) : undefined),
          instagram: formData.instagram?.trim() || undefined,
          tiktok: formData.tiktok?.trim() || undefined,
          facebook: formData.facebook?.trim() || undefined,
          linkedin: formData.linkedin?.trim() || undefined,
          xTwitter: formData.xTwitter?.trim() || undefined,
        };
      }

      const res = await api.patch<Borrower>(`/api/borrowers/${borrowerId}`, payload);
      if (res.success) {
        toast.success("Borrower updated successfully");
        setIsEditing(false);
        // Refetch full borrower data (including loans, loanSummary, directors)
        await fetchBorrower();
        fetchTimeline(); // Refresh timeline to show new update
      } else {
        toast.error(res.error || "Failed to update borrower");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (borrower) {
      populateForm(borrower);
    }
    setIsEditing(false);
    setValidationErrors({});
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDocCategory || selectedDocCategory === "ALL") {
      toast.error("Please select a document category first");
      return;
    }

    const docsInCategory = (borrower?.documents ?? []).filter(
      (d) => d.category === selectedDocCategory
    ).length;
    if (docsInCategory >= MAX_DOCUMENTS_PER_CATEGORY) {
      toast.error(
        `Maximum ${MAX_DOCUMENTS_PER_CATEGORY} documents per category. This category already has ${docsInCategory} document(s).`
      );
      e.target.value = "";
      return;
    }

    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", selectedDocCategory);

      const response = await fetch(`/api/proxy/borrowers/${borrowerId}/documents`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        toast.success("Document uploaded successfully");
        setSelectedDocCategory("ALL");
        // Reset file input
        e.target.value = "";
        // Refresh borrower data to get updated documents and timeline
        await fetchBorrower();
        fetchTimeline();
      } else {
        toast.error(result.error || "Failed to upload document");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload document");
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!deleteDocId) return;

    setDeletingDoc(true);
    try {
      const response = await fetch(`/api/proxy/borrowers/${borrowerId}/documents/${deleteDocId}`, {
        method: "DELETE",
        credentials: "include",
      });

      const result = await response.json();
      if (result.success) {
        toast.success("Document deleted");
        // Refresh borrower data and timeline
        await fetchBorrower();
        fetchTimeline();
      } else {
        toast.error(result.error || "Failed to delete document");
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete document");
    } finally {
      setDeletingDoc(false);
      setDeleteDocId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (!borrower) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="text-center py-8 text-muted">Borrower not found</div>
      </div>
    );
  }

  const getBankLabel = (value: string | null) => {
    if (!value) return "-";
    if (value === "OTHER" && borrower.bankNameOther) return borrower.bankNameOther;
    return BANK_OPTIONS.find((b) => b.value === value)?.label || value;
  };

  const getOptionLabel = (options: { value: string; label: string }[], value: string | null) => {
    if (!value) return "-";
    return options.find((o) => o.value === value)?.label || value;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-heading font-bold text-gradient">
                {borrower.borrowerType === "CORPORATE" && borrower.companyName
                  ? borrower.companyName
                  : isEditing ? formData.name || "Edit Borrower" : borrower.name}
              </h1>
              <VerificationBadge
                verificationStatus={borrower.verificationStatus}
                documentVerified={borrower.documentVerified}
                size="full"
              />
            </div>
            <p className="text-muted-foreground">
              {borrower.borrowerType === "CORPORATE" 
                ? `SSM: ${borrower.ssmRegistrationNo || borrower.icNumber}`
                : `${borrower.documentType === "IC" ? "IC" : "Passport"}: ${borrower.documentType === "IC" ? formatICForDisplay(borrower.icNumber) : borrower.icNumber}`}
              {borrower.borrowerType === "CORPORATE" && (
                <span> • Directors: {borrower.directors?.length || 1}</span>
              )}
              <span className="mx-2">•</span>
              Created {formatDate(borrower.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <RefreshButton
            onRefresh={handleRefresh}
            showToast
            showLabel
            successMessage="Borrower refreshed"
          />
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Borrower
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Borrower Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Borrower Type</span>
                  <Badge variant={borrower.borrowerType === "CORPORATE" ? "secondary" : "outline"}>
                    {borrower.borrowerType === "CORPORATE" ? (
                      <Building2 className="h-3 w-3 mr-1" />
                    ) : (
                      <User className="h-3 w-3 mr-1" />
                    )}
                    {borrower.borrowerType === "CORPORATE" ? "Corporate" : "Individual"}
                  </Badge>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Loans</span>
                  <Badge variant="outline">{borrower.loans.length}</Badge>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Guarantor For</span>
                  <Badge variant="outline">{borrower.guarantorCount ?? 0}</Badge>
                </div>
                {(borrower.performanceProjection?.completedLoans ?? 0) > 0 && (
                  <>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Completed</span>
                      <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                        {borrower.performanceProjection?.completedLoans ?? 0}
                      </Badge>
                    </div>
                  </>
                )}
                {borrower.loanSummary && (
                  <>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Total Borrowed</span>
                      <span className="text-sm font-medium">{formatCurrency(borrower.loanSummary.totalBorrowed)}</span>
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Total Paid</span>
                      <span className="text-sm font-medium">{formatCurrency(borrower.loanSummary.totalPaid)}</span>
                    </div>
                  </>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-border flex items-center gap-3 text-xs text-muted-foreground">
                <span>Added {formatDate(borrower.createdAt)}</span>
                <span className="opacity-50">·</span>
                <span title={formatDate(borrower.updatedAt)}>Updated {formatRelativeTime(borrower.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Payment Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                Payment Performance
              </CardTitle>
              <CardDescription>
                Borrower repayment behavior aggregated across all loans
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const projection = borrower.performanceProjection;
                const performanceMeta = getPerformanceBadgeMeta(projection?.riskLevel);
                const onTimeRate = projection?.onTimeRate ? Number(projection.onTimeRate) : null;
                const paidOnTimeCount = projection?.paidOnTimeCount ?? 0;
                const paidLateCount = projection?.paidLateCount ?? 0;
                const overdueCount = projection?.overdueCount ?? 0;
                const sampleSize = paidOnTimeCount + paidLateCount + overdueCount;
                const lastPaymentAt = projection?.lastPaymentAt ?? null;
                const tags = (projection?.tags || []).slice(0, 4);
                const guarantorCount = borrower.guarantorCount ?? 0;
                const signalItems = [
                  guarantorCount > 0 ? `${guarantorCount} as guarantor` : null,
                  projection?.defaultedLoans ? `${projection.defaultedLoans} defaulted` : null,
                  projection?.writtenOffLoans ? `${projection.writtenOffLoans} written off` : null,
                  projection?.inArrearsLoans ? `${projection.inArrearsLoans} in arrears` : null,
                  projection?.readyForDefaultLoans ? `${projection.readyForDefaultLoans} default ready` : null,
                ].filter(Boolean) as string[];

                return (
                  <div className="space-y-6">
                    {/* Main row: Donut + Risk + Summary */}
                    <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
                      {/* Donut chart */}
                      <div className="flex flex-col items-center shrink-0">
                        <PaymentDonutChart
                          paidOnTime={paidOnTimeCount}
                          paidLate={paidLateCount}
                          overdue={overdueCount}
                          onTimeRate={onTimeRate}
                        />
                        <div className="mt-3 flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            On-time
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            Late
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            Overdue
                          </span>
                        </div>
                      </div>

                      {/* Risk & info */}
                      <div className="flex-1 min-w-0 space-y-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Risk Profile</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={performanceMeta.variant} className="text-sm">
                              {performanceMeta.label}
                            </Badge>
                            {tags.length > 0 &&
                              tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            {tags.length === 0 && sampleSize === 0 && (
                              <Badge variant="outline" className="text-xs">
                                No repayment track record
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-lg border border-border bg-emerald-500/10 px-3 py-2.5 text-center">
                            <p className="text-lg font-heading font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                              {paidOnTimeCount}
                            </p>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">On-time</p>
                          </div>
                          <div className="rounded-lg border border-border bg-amber-500/10 px-3 py-2.5 text-center">
                            <p className="text-lg font-heading font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                              {paidLateCount}
                            </p>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Late</p>
                          </div>
                          <div className="rounded-lg border border-border bg-red-500/10 px-3 py-2.5 text-center">
                            <p className="text-lg font-heading font-semibold text-red-600 dark:text-red-400 tabular-nums">
                              {overdueCount}
                            </p>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Overdue</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4 shrink-0" />
                          <span>
                            {sampleSize > 0 ? (
                              <>
                                {sampleSize} repayment{sampleSize === 1 ? "" : "s"} analyzed
                                {lastPaymentAt && (
                                  <> · Last payment {formatRelativeTime(lastPaymentAt)}</>
                                )}
                              </>
                            ) : (
                              "No payments recorded"
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {signalItems.length > 0 && (
                      <div className="rounded-lg border border-border px-4 py-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <p className="text-xs font-medium text-muted-foreground">Signals</p>
                        </div>
                        <p className="text-sm text-muted-foreground">{signalItems.join(" · ")}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
          <Card className="border-purple-500/60 shadow-[0_0_25px_rgba(139,92,246,0.35)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
                TrueSight™ - Cross-Tenant Insights
              </CardTitle>
              <CardDescription>
                Aggregated borrower profile across other lenders on the platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              {crossTenantInsightsLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 w-1/2 rounded bg-muted" />
                  <div className="h-16 w-full rounded-lg bg-muted" />
                  <div className="grid grid-cols-3 gap-3">
                    <div className="h-14 rounded-lg bg-muted" />
                    <div className="h-14 rounded-lg bg-muted" />
                    <div className="h-14 rounded-lg bg-muted" />
                  </div>
                </div>
              ) : !crossTenantInsights ? (
                <p className="text-sm text-muted-foreground">
                  Unable to load cross-tenant insights right now.
                </p>
              ) : !crossTenantInsights.hasHistory ? (
                <div className="rounded-lg border border-border px-4 py-3">
                  <p className="text-sm font-medium">No borrowing history with other lenders</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    We could not find disbursed loans for this borrower outside your tenant.
                  </p>
                </div>
              ) : (() => {
                const ratingMeta = getPerformanceBadgeMeta(crossTenantInsights.paymentPerformance.rating);
                const rangeLabel = crossTenantInsights.totalBorrowedRange ?? "Not available";
                const crossTenantLoanItems = getCrossTenantLoanItems(crossTenantInsights);
                const visibleCrossTenantLoanItems = crossTenantLoanItems.slice(0, 5);

                const nameMeta = getConsistencyMeta(crossTenantInsights.nameConsistency);
                const phoneMeta = getConsistencyMeta(crossTenantInsights.phoneConsistency);
                const addressMeta = getConsistencyMeta(crossTenantInsights.addressConsistency);
                const showConsistencyAlert = nameMeta.showAlert || phoneMeta.showAlert || addressMeta.showAlert;

                return (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border px-4 py-3">
                      <p className="text-sm font-medium">
                        Borrowed from {crossTenantInsights.otherLenderCount} other lender
                        {crossTenantInsights.otherLenderCount === 1 ? "" : "s"}
                      </p>
                      {crossTenantInsights.lenderNames.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Lenders: {crossTenantInsights.lenderNames.join(", ")}
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border border-border px-4 py-3">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">
                        Data consistency with other lenders
                      </p>
                      <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-2">
                          {nameMeta.variant === "success" ? (
                            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          )}
                          <div className="flex items-center gap-2 text-sm">
                            <span>Name:</span>
                            <Badge variant={nameMeta.variant} className="text-xs">{nameMeta.label}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {phoneMeta.variant === "success" ? (
                            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          )}
                          <div className="flex items-center gap-2 text-sm">
                            <span>Phone (exact):</span>
                            <Badge variant={phoneMeta.variant} className="text-xs">{phoneMeta.label}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {addressMeta.variant === "success" ? (
                            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          )}
                          <div className="flex items-center gap-2 text-sm">
                            <span>Address:</span>
                            <Badge variant={addressMeta.variant} className="text-xs">{addressMeta.label}</Badge>
                          </div>
                        </div>
                      </div>
                      {showConsistencyAlert && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Name and address allow partial/almost-full matching. Phone requires an exact match. Verify if
                          needed.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border px-3 py-2.5">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Total Borrowed Range</p>
                        <p className="text-sm font-medium mt-1">{rangeLabel}</p>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2.5">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Overall risk (all-time)</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Includes defaults and late payments across all matched loans. Recent behaviour may differ.
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={ratingMeta.variant}>{ratingMeta.label}</Badge>
                          {crossTenantInsights.paymentPerformance.onTimeRateRange && (
                            <span className="text-sm text-muted-foreground">
                              On-time {crossTenantInsights.paymentPerformance.onTimeRateRange} (all loans)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">
                      Loan status across other lenders
                    </p>
                    <p className="text-sm">
                      <span className="font-medium tabular-nums text-foreground">{crossTenantInsights.activeLoans}</span>
                      <span className="text-muted-foreground"> Active</span>
                      <span className="text-muted-foreground/60 mx-2">·</span>
                      <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                        {crossTenantInsights.completedLoans}
                      </span>
                      <span className="text-muted-foreground"> Completed</span>
                      <span className="text-muted-foreground/60 mx-2">·</span>
                      <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                        {crossTenantInsights.defaultedLoans}
                      </span>
                      <span className="text-muted-foreground"> Defaulted</span>
                      <span className="text-muted-foreground/60 mx-2">·</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {crossTenantInsights.latePaymentsCount ?? 0}
                      </span>
                      <span className="text-muted-foreground"> Late payments</span>
                    </p>

                    {visibleCrossTenantLoanItems.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                            Latest loans across other lenders
                          </p>
                          {crossTenantLoanItems.length > visibleCrossTenantLoanItems.length && (
                            <p className="text-xs text-muted-foreground">
                              Showing latest {visibleCrossTenantLoanItems.length} of {crossTenantLoanItems.length}
                            </p>
                          )}
                        </div>
                        <div className="rounded-lg border border-border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Lender</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Borrowed</TableHead>
                                <TableHead>Loan Amount</TableHead>
                                <TableHead>On-time (this loan)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {visibleCrossTenantLoanItems.map((loan, index) => {
                                const loanDate =
                                  loan.disbursementDate ??
                                  loan.agreementDate ??
                                  loan.createdAt ??
                                  loan.updatedAt;
                                const statusLabel = formatLoanStatusLabel(loan.status);

                                return (
                                  <TableRow
                                    key={loan.id ?? `${getCrossTenantLoanLenderName(loan)}-${loanDate ?? "unknown"}-${index}`}
                                  >
                                    <TableCell className="font-medium">
                                      {getCrossTenantLoanLenderName(loan)}
                                    </TableCell>
                                    <TableCell>
                                      {statusLabel ? (
                                        <Badge variant="outline" className="text-xs">
                                          {statusLabel}
                                        </Badge>
                                      ) : (
                                        <span className="text-muted-foreground">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {loanDate ? formatRelativeTime(loanDate) : "Not available"}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {getCrossTenantLoanAmountRange(loan) ?? "Not available"}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {loan.paymentPerformance?.onTimeRateRange ? (
                                        <Badge
                                          variant={getPaymentPerformanceBadgeVariant(loan.paymentPerformance.onTimeRateRange)}
                                          className="text-xs"
                                        >
                                          {loan.paymentPerformance.onTimeRateRange}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs">
                                          Not available
                                        </Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        {crossTenantInsights.lastBorrowedAt
                          ? `Last borrowed ${formatRelativeTime(crossTenantInsights.lastBorrowedAt)}`
                          : "No agreement date found on matched loans"}
                      </p>
                      <p>
                        {crossTenantInsights.lastActivityAt
                          ? `Last payment ${formatRelativeTime(crossTenantInsights.lastActivityAt)}`
                          : "No recent payment activity"}
                      </p>
                    </div>

                    <div className="rounded-lg border border-dashed border-border px-3 py-2.5 space-y-1.5">
                      <p className="text-xs text-muted-foreground">
                        <strong className="text-foreground/80">Match criteria:</strong> Borrowers matched by{" "}
                        {borrower.borrowerType === "CORPORATE" ? "SSM" : "IC"} number only.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Data is aggregated across the platform. Loan amounts remain bucketed into
                        ranges, and TrueSight may show only the latest 5 matched loans.
                      </p>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
          {/* Conditional rendering based on borrower type */}
          {borrower.borrowerType === "CORPORATE" ? (
            <>
              {/* Company Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    Company Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field
                      label="Company Name"
                      value={borrower.companyName || "-"}
                      editValue={formData.companyName}
                      onChange={(val) => {
                        setFormData((prev) => ({ ...prev, companyName: val }));
                        if (validationErrors.companyName) setValidationErrors((prev) => ({ ...prev, companyName: "" }));
                      }}
                      error={validationErrors.companyName}
                      placeholder="Company Sdn Bhd"
                      isEditing={isEditing}
                    />
                    {!isEditing ? (
                      <CopyField
                        label="SSM Registration No"
                        value={borrower.ssmRegistrationNo || borrower.icNumber}
                      />
                    ) : (
                      <Field
                        label="SSM Registration No"
                        value={borrower.ssmRegistrationNo || borrower.icNumber || "-"}
                        editValue={formData.ssmRegistrationNo}
                        onChange={(val) => {
                          setFormData((prev) => ({ ...prev, ssmRegistrationNo: val }));
                          if (validationErrors.ssmRegistrationNo) setValidationErrors((prev) => ({ ...prev, ssmRegistrationNo: "" }));
                        }}
                        error={validationErrors.ssmRegistrationNo}
                        placeholder="202001012345"
                        isEditing={isEditing}
                      />
                    )}
                    <Field
                      label="Taraf (Bumi Status)"
                      value={getOptionLabel(BUMI_STATUS_OPTIONS, borrower.bumiStatus)}
                      editValue={formData.bumiStatus}
                      onChange={(val) => {
                        setFormData((prev) => ({ ...prev, bumiStatus: val }));
                        if (validationErrors.bumiStatus) setValidationErrors((prev) => ({ ...prev, bumiStatus: "" }));
                      }}
                      type="select"
                      options={BUMI_STATUS_OPTIONS}
                      error={validationErrors.bumiStatus}
                      isEditing={isEditing}
                    />
                    <Field
                      label="Nature of Business"
                      value={borrower.natureOfBusiness || "-"}
                      editValue={formData.natureOfBusiness}
                      onChange={(val) => setFormData((prev) => ({ ...prev, natureOfBusiness: val }))}
                      placeholder="e.g., Retail"
                      isEditing={isEditing}
                    />
                    <Field
                      label="Date of Incorporation"
                      value={borrower.dateOfIncorporation ? formatDate(borrower.dateOfIncorporation) : "-"}
                      editValue={formData.dateOfIncorporation}
                      onChange={(val) => setFormData((prev) => ({ ...prev, dateOfIncorporation: val }))}
                      type="date"
                      isEditing={isEditing}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Address - Full Width */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    Address
                  </CardTitle>
                  {!isEditing && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const full = formatFullAddress(borrower);
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
                  )}
                </CardHeader>
                <CardContent>
                  {!isEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <CopyField
                        label="Address Line 1"
                        value={borrower.addressLine1 || borrower.businessAddress || borrower.address}
                      />
                      <CopyField label="Address Line 2 (optional)" value={borrower.addressLine2} />
                      <CopyField label="City" value={borrower.city} />
                      <CopyField
                        label="State"
                        value={getStateName(borrower.country, borrower.state)}
                      />
                      <CopyField label="Postcode" value={borrower.postcode} />
                      <CopyField
                        label="Country"
                        value={borrower.country ? `${getCountryFlag(borrower.country)} ${getCountryName(borrower.country) || ""}`.trim() : undefined}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field
                        label="Address Line 1"
                        value={borrower.addressLine1 || borrower.businessAddress || borrower.address || "-"}
                        editValue={formData.addressLine1}
                        onChange={(val) => {
                          setFormData((prev) => ({ ...prev, addressLine1: val }));
                          if (validationErrors.addressLine1) setValidationErrors((prev) => ({ ...prev, addressLine1: "" }));
                        }}
                        error={validationErrors.addressLine1}
                        placeholder="Street, building, unit"
                        isEditing={isEditing}
                      />
                      <Field
                        label="Address Line 2 (optional)"
                        value={borrower.addressLine2 || "-"}
                        editValue={formData.addressLine2}
                        onChange={(val) => setFormData((prev) => ({ ...prev, addressLine2: val }))}
                        placeholder="Suite, floor, building"
                        isEditing={isEditing}
                        required={false}
                      />
                      <Field
                        label="City"
                        value={borrower.city || "-"}
                        editValue={formData.city}
                        onChange={(val) => {
                          setFormData((prev) => ({ ...prev, city: val }));
                          if (validationErrors.city) setValidationErrors((prev) => ({ ...prev, city: "" }));
                        }}
                        error={validationErrors.city}
                        placeholder="City"
                        isEditing={isEditing}
                      />
                      <Field
                        label="Postcode"
                        value={borrower.postcode || "-"}
                        editValue={formData.postcode}
                        onChange={(val) => {
                          const digitsOnly = val.replace(/\D/g, "");
                          setFormData((prev) => ({ ...prev, postcode: digitsOnly }));
                          if (validationErrors.postcode) setValidationErrors((prev) => ({ ...prev, postcode: "" }));
                        }}
                        error={validationErrors.postcode}
                        placeholder="Postal code (numbers only)"
                        isEditing={isEditing}
                      />
                      <Field
                        label="Country"
                        value={getCountryName(borrower.country) || "-"}
                        editValue={formData.country}
                        onChange={(val) => {
                          const nextStateOptions = getStateOptions(val);
                          setFormData((prev) => ({
                            ...prev,
                            country: val,
                            state: nextStateOptions.some((option) => option.value === prev.state) ? prev.state : "",
                          }));
                          if (validationErrors.country || validationErrors.state) {
                            setValidationErrors((prev) => ({ ...prev, country: "", state: "" }));
                          }
                        }}
                        type="select"
                        options={countryOptions}
                        error={validationErrors.country}
                        isEditing={isEditing}
                      />
                      <Field
                        label="State"
                        value={getStateName(borrower.country, borrower.state) || "-"}
                        editValue={formData.state}
                        onChange={(val) => {
                          setFormData((prev) => ({ ...prev, state: val }));
                          if (validationErrors.state) setValidationErrors((prev) => ({ ...prev, state: "" }));
                        }}
                        type="select"
                        options={stateOptions}
                        error={validationErrors.state}
                        disabled={!formData.country || stateOptions.length === 0}
                        isEditing={isEditing}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Additional Details & Company Contact - Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Additional Company Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5 text-muted-foreground" />
                      Additional Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <Field
                        label="Paid-up Capital (RM)"
                        value={borrower.paidUpCapital ? `RM ${Number(borrower.paidUpCapital).toLocaleString()}` : "-"}
                        editValue={formData.paidUpCapital}
                        onChange={(val) => setFormData((prev) => ({ ...prev, paidUpCapital: val }))}
                        placeholder="100000"
                        isEditing={isEditing}
                      />
                      <Field
                        label="Number of Employees"
                        value={borrower.numberOfEmployees?.toString() || "-"}
                        editValue={formData.numberOfEmployees}
                        onChange={(val) => setFormData((prev) => ({ ...prev, numberOfEmployees: val }))}
                        placeholder="10"
                        isEditing={isEditing}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Company Contact */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      Company Contact
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      {!isEditing ? (
                        <>
                          <PhoneDisplay label="Phone" value={borrower.companyPhone || borrower.phone} />
                          <CopyField label="Email" value={borrower.companyEmail || borrower.email} />
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="text-xs text-muted-foreground">Company Phone *</label>
                            <PhoneInput
                              value={formData.companyPhone || undefined}
                              onChange={(val: string | undefined) => {
                                setFormData((prev) => ({ ...prev, companyPhone: val ?? "" }));
                                if (validationErrors.companyPhone) setValidationErrors((prev) => ({ ...prev, companyPhone: "" }));
                              }}
                              error={!!validationErrors.companyPhone}
                              placeholder="3-12345678"
                            />
                            {validationErrors.companyPhone && (
                              <p className="text-xs text-red-500 mt-1">{validationErrors.companyPhone}</p>
                            )}
                          </div>
                          <Field
                            label="Company Email"
                            value={borrower.companyEmail || borrower.email || "-"}
                            editValue={formData.companyEmail}
                            onChange={(val) => {
                              setFormData((prev) => ({ ...prev, companyEmail: val }));
                              if (validationErrors.companyEmail) setValidationErrors((prev) => ({ ...prev, companyEmail: "" }));
                            }}
                            type="email"
                            error={validationErrors.companyEmail}
                            placeholder="info@company.com"
                            isEditing={isEditing}
                          />
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Company Directors - Full Width */}
              <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-muted-foreground" />
                      Company Directors
                    </CardTitle>
                    <CardDescription>Minimum 1, maximum 10 directors</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {formData.directors.map((director, index) => {
                        const apiDirector = "id" in director && director.id
                          ? borrower.directors?.find((d) => d.id === director.id)
                          : borrower.directors?.[index];
                        const directorStatus = apiDirector?.trueIdentityStatus ?? null;
                        const directorResult = apiDirector?.trueIdentityResult ?? null;
                        const docUrls = apiDirector?.trueIdentityDocumentUrls as {
                          icFrontUrl?: string | null;
                          icBackUrl?: string | null;
                          selfieUrl?: string | null;
                          verificationDetailUrl?: string | null;
                        } | null | undefined;
                        const hasDocs = docUrls && (docUrls.icFrontUrl ?? docUrls.icBackUrl ?? docUrls.selfieUrl ?? docUrls.verificationDetailUrl);
                        const isExpanded = expandedDirectorIndices.includes(index);
                        return (
                        <div key={`director-${index}`} className="rounded-lg border p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-sm font-medium">
                                Director {index + 1}{index === 0 ? " (Authorized Representative)" : ""}
                              </p>
                              {directorStatus === "completed" && directorResult === "approved" ? (
                                <Badge variant="verified" className="text-[10px]">
                                  <Fingerprint className="h-3 w-3 mr-1" />
                                  e-KYC Verified
                                </Badge>
                              ) : directorStatus === "completed" && directorResult === "rejected" ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  Rejected
                                </Badge>
                              ) : directorStatus === "failed" ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  Failed
                                </Badge>
                              ) : directorStatus === "completed" && directorResult !== "approved" ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-300 dark:border-cyan-700"
                                >
                                  <ChartPie className="h-3 w-3 mr-1" />
                                  Partially verified
                                </Badge>
                              ) : directorStatus === "processing" || directorStatus === "pending" ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  <Clock className="h-3 w-3 mr-1" />
                                  In Progress
                                </Badge>
                              ) : directorStatus === "expired" ? (
                                <Badge variant="outline" className="text-[10px]">
                                  Expired
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30"
                                >
                                  Unverified
                                </Badge>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="shrink-0 h-8 w-8 p-0"
                                onClick={() =>
                                  setExpandedDirectorIndices((prev) =>
                                    prev.includes(index)
                                      ? prev.filter((i) => i !== index)
                                      : [...prev, index]
                                  )
                                }
                                title={isExpanded ? "Collapse e-KYC documents" : "Expand e-KYC documents"}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            {isEditing && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={formData.directors.length <= 1}
                                onClick={() => {
                                  if (formData.directors.length <= 1) return;
                                  setFormData((prev) => {
                                    const nextDirectors = prev.directors.filter((_, i) => i !== index);
                                    const firstDirector = nextDirectors[0];
                                    return {
                                      ...prev,
                                      directors: nextDirectors,
                                      authorizedRepName: firstDirector?.name || "",
                                      authorizedRepIc: firstDirector?.icNumber || "",
                                      name: firstDirector?.name || prev.name,
                                    };
                                  });
                                  setExpandedDirectorIndices((prev) =>
                                    prev
                                      .filter((i) => i !== index)
                                      .map((i) => (i > index ? i - 1 : i))
                                  );
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Remove
                              </Button>
                            )}
                          </div>

                          {!isEditing ? (
                            <div className="space-y-1 text-sm">
                              <p><span className="text-muted-foreground">Name:</span> {director.name || "-"}</p>
                              <p><span className="text-muted-foreground">IC:</span> {director.icNumber ? formatICForDisplay(director.icNumber) : "-"}</p>
                              <p><span className="text-muted-foreground">Position:</span> {director.position || "-"}</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs text-muted-foreground">Director Name *</label>
                                <Input
                                  value={director.name}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setFormData((prev) => {
                                      const nextDirectors = [...prev.directors];
                                      nextDirectors[index] = { ...nextDirectors[index], name: val };
                                      return {
                                        ...prev,
                                        directors: nextDirectors,
                                        authorizedRepName: index === 0 ? val : prev.authorizedRepName,
                                        name: index === 0 ? val : prev.name,
                                      };
                                    });
                                    if (validationErrors[`directorName_${index}`]) {
                                      setValidationErrors((prev) => ({ ...prev, [`directorName_${index}`]: "" }));
                                    }
                                  }}
                                  className={validationErrors[`directorName_${index}`] ? "border-red-500" : ""}
                                />
                                {validationErrors[`directorName_${index}`] && (
                                  <p className="text-xs text-red-500 mt-1">{validationErrors[`directorName_${index}`]}</p>
                                )}
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Director IC *</label>
                                <Input
                                  value={director.icNumber}
                                  onChange={(e) => {
                                    const cleanVal = e.target.value.replace(/\D/g, "").substring(0, 12);
                                    setFormData((prev) => {
                                      const nextDirectors = [...prev.directors];
                                      nextDirectors[index] = { ...nextDirectors[index], icNumber: cleanVal };
                                      return {
                                        ...prev,
                                        directors: nextDirectors,
                                        authorizedRepIc: index === 0 ? cleanVal : prev.authorizedRepIc,
                                      };
                                    });
                                    if (validationErrors[`directorIc_${index}`]) {
                                      setValidationErrors((prev) => ({ ...prev, [`directorIc_${index}`]: "" }));
                                    }
                                  }}
                                  className={validationErrors[`directorIc_${index}`] ? "border-red-500" : ""}
                                />
                                {validationErrors[`directorIc_${index}`] && (
                                  <p className="text-xs text-red-500 mt-1">{validationErrors[`directorIc_${index}`]}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  Enter 12 digits only (e.g., 880101011234)
                                </p>
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Position</label>
                                <Input
                                  value={director.position}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setFormData((prev) => {
                                      const nextDirectors = [...prev.directors];
                                      nextDirectors[index] = { ...nextDirectors[index], position: val };
                                      return { ...prev, directors: nextDirectors };
                                    });
                                  }}
                                  placeholder="e.g., Director"
                                />
                              </div>
                            </div>
                          )}

                          {isExpanded && (
                            <div className="pt-3 mt-3 border-t space-y-3">
                              <p className="text-xs font-medium text-muted-foreground">e-KYC Documents</p>
                              {hasDocs && docUrls ? (
                                <div className="space-y-3">
                                  {[
                                    { url: resolveKycAssetUrl(docUrls.icFrontUrl), label: "IC Front" },
                                    { url: resolveKycAssetUrl(docUrls.icBackUrl), label: "IC Back" },
                                    { url: resolveKycAssetUrl(docUrls.selfieUrl), label: "Selfie Liveness" },
                                  ].filter((d): d is { url: string; label: string } => Boolean(d.url)).map(({ url, label }) => (
                                    <div
                                      key={label}
                                      className="flex items-start gap-4 p-3 border rounded-lg"
                                    >
                                      <div className="relative shrink-0 w-20 h-20 rounded-md overflow-hidden bg-muted border">
                                        <img
                                          src={url}
                                          alt={label}
                                          className="w-full h-full object-cover"
                                          referrerPolicy="no-referrer"
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = "none";
                                            const fallback = target.nextElementSibling as HTMLElement | null;
                                            if (fallback) {
                                              fallback.classList.remove("hidden");
                                              fallback.classList.add("flex", "items-center", "justify-center");
                                            }
                                          }}
                                        />
                                        <div className="absolute inset-0 hidden bg-muted">
                                          <FileText className="h-8 w-8 text-muted-foreground" />
                                        </div>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">{label}</p>
                                        <a
                                          href={url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-2 text-xs text-primary hover:underline mt-1"
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                          Open Full Size
                                        </a>
                                      </div>
                                    </div>
                                  ))}
                                  {docUrls.verificationDetailUrl && (
                                    <a
                                      href={docUrls.verificationDetailUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                      View in Admin
                                    </a>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No e-KYC documents available for this director yet.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                      })}

                      {validationErrors.directors && (
                        <p className="text-xs text-red-500">{validationErrors.directors}</p>
                      )}

                      {isEditing && (
                        <div className="space-y-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={formData.directors.length >= 10}
                            onClick={() => {
                              if (formData.directors.length >= 10) return;
                              setFormData((prev) => ({
                                ...prev,
                                directors: [...prev.directors, { name: "", icNumber: "", position: "" }],
                              }));
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Director
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            {formData.directors.length}/10 directors
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
            </>
          ) : (
            <>
              {/* Individual: Identity Information (only in edit mode) */}
              {isEditing && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                      Identity Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field
                        label="Name"
                        value={borrower.name}
                        editValue={formData.name}
                        onChange={(val) => {
                          setFormData((prev) => ({ ...prev, name: val }));
                          if (validationErrors.name) setValidationErrors((prev) => ({ ...prev, name: "" }));
                        }}
                        error={validationErrors.name}
                        placeholder="Full name"
                        isEditing={isEditing}
                      />
                      <div>
                        <label className="text-xs text-muted-foreground">Document Type *</label>
                        <Select 
                          value={formData.documentType} 
                          onValueChange={(val) => setFormData((prev) => ({ ...prev, documentType: val }))}
                          disabled={borrower.documentVerified}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Individual: Personal Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-muted-foreground" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {!isEditing ? (
                      <CopyField
                        label={borrower.documentType === "IC" ? "IC Number" : "Passport Number"}
                        value={
                          borrower.documentType === "IC"
                            ? formatICForDisplay(borrower.icNumber) || borrower.icNumber
                            : borrower.icNumber
                        }
                        toastMessage="IC number copied"
                      />
                    ) : (
                      <div>
                        <label className="text-xs text-muted-foreground">
                          {isIC ? "IC Number" : "Passport Number"} *
                        </label>
                        <Input
                          value={formData.icNumber}
                          onChange={(e) => handleIcNumberChange(e.target.value)}
                          placeholder={isIC ? "880101011234" : "A12345678"}
                          disabled={borrower.documentVerified}
                          className={validationErrors.icNumber ? "border-red-500" : ""}
                        />
                        {validationErrors.icNumber && (
                          <p className="text-xs text-red-500 mt-1">{validationErrors.icNumber}</p>
                        )}
                        {isIC && !borrower.documentVerified && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Enter 12 digits only. DOB and gender auto-extracted.
                          </p>
                        )}
                      </div>
                    )}
                    <Field
                      label="Date of Birth"
                      value={borrower.dateOfBirth ? formatDate(borrower.dateOfBirth) : "-"}
                      editValue={formData.dateOfBirth}
                      onChange={(val) => {
                        setFormData((prev) => ({ ...prev, dateOfBirth: val }));
                        if (validationErrors.dateOfBirth) setValidationErrors((prev) => ({ ...prev, dateOfBirth: "" }));
                      }}
                      type="date"
                      error={validationErrors.dateOfBirth}
                      disabled={isIC && !!extractDateFromIC(formData.icNumber)}
                      isEditing={isEditing}
                    />
                    <Field
                      label="Gender"
                      value={getOptionLabel(GENDER_OPTIONS, borrower.gender)}
                      editValue={formData.gender}
                      onChange={(val) => {
                        setFormData((prev) => ({ ...prev, gender: val }));
                        if (validationErrors.gender) setValidationErrors((prev) => ({ ...prev, gender: "" }));
                      }}
                      type="select"
                      options={GENDER_OPTIONS}
                      error={validationErrors.gender}
                      disabled={isIC && !!extractGenderFromIC(formData.icNumber)}
                      isEditing={isEditing}
                    />
                    <Field
                      label="Race"
                      value={getOptionLabel(RACE_OPTIONS, borrower.race)}
                      editValue={formData.race}
                      onChange={(val) => {
                        setFormData((prev) => ({ ...prev, race: val }));
                        if (validationErrors.race) setValidationErrors((prev) => ({ ...prev, race: "" }));
                      }}
                      type="select"
                      options={RACE_OPTIONS}
                      error={validationErrors.race}
                      isEditing={isEditing}
                    />
                    <Field
                      label="Education"
                      value={getOptionLabel(EDUCATION_OPTIONS, borrower.educationLevel)}
                      editValue={formData.educationLevel}
                      onChange={(val) => {
                        setFormData((prev) => ({ ...prev, educationLevel: val }));
                        if (validationErrors.educationLevel) setValidationErrors((prev) => ({ ...prev, educationLevel: "" }));
                      }}
                      type="select"
                      options={EDUCATION_OPTIONS}
                      error={validationErrors.educationLevel}
                      isEditing={isEditing}
                    />
                    <Field
                      label="Occupation"
                      value={borrower.occupation || "-"}
                      editValue={formData.occupation}
                      onChange={(val) => {
                        setFormData((prev) => ({ ...prev, occupation: val }));
                        if (validationErrors.occupation) setValidationErrors((prev) => ({ ...prev, occupation: "" }));
                      }}
                      error={validationErrors.occupation}
                      placeholder="e.g., Accountant"
                      isEditing={isEditing}
                    />
                    <Field
                      label="Employment Status"
                      value={getOptionLabel(EMPLOYMENT_OPTIONS, borrower.employmentStatus)}
                      editValue={formData.employmentStatus}
                      onChange={(val) => {
                        setFormData((prev) => ({ ...prev, employmentStatus: val }));
                        if (validationErrors.employmentStatus) setValidationErrors((prev) => ({ ...prev, employmentStatus: "" }));
                      }}
                      type="select"
                      options={EMPLOYMENT_OPTIONS}
                      error={validationErrors.employmentStatus}
                      isEditing={isEditing}
                    />
                    {!isEditing ? (
                      <div>
                        <p className="text-xs text-muted-foreground">Monthly Income</p>
                        <p className="font-medium">
                          {borrower.monthlyIncome != null
                            ? Number(borrower.monthlyIncome) === 0
                              ? "Tiada Pendapatan (RM 0)"
                              : `RM ${Number(borrower.monthlyIncome).toLocaleString()}`
                            : "-"}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs text-muted-foreground">Monthly Income (RM) *</label>
                        <NumericInput
                          mode="float"
                          value={noMonthlyIncome ? 0 : (formData.monthlyIncome === "" ? "" : (parseFloat(formData.monthlyIncome) || 0))}
                          onChange={(v: number | "" | string) => {
                            setFormData((prev) => ({ ...prev, monthlyIncome: v === "" ? "" : String(v) }));
                            if (validationErrors.monthlyIncome) setValidationErrors((prev) => ({ ...prev, monthlyIncome: "" }));
                          }}
                          placeholder="e.g., 3500"
                          disabled={noMonthlyIncome}
                          className={validationErrors.monthlyIncome ? "border-red-500" : ""}
                        />
                        {validationErrors.monthlyIncome && (
                          <p className="text-xs text-red-500 mt-1">{validationErrors.monthlyIncome}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Checkbox
                            id="no-monthly-income-edit"
                            checked={noMonthlyIncome}
                            onCheckedChange={(checked) => {
                              setNoMonthlyIncome(checked === true);
                              if (checked) {
                                setFormData((prev) => ({ ...prev, monthlyIncome: "0" }));
                                if (validationErrors.monthlyIncome) setValidationErrors((prev) => ({ ...prev, monthlyIncome: "" }));
                              } else {
                                setFormData((prev) => ({ ...prev, monthlyIncome: "" }));
                              }
                            }}
                          />
                          <label htmlFor="no-monthly-income-edit" className="text-xs text-muted-foreground cursor-pointer">
                            No monthly income (Tiada Pendapatan)
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Address - Full Width */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    Address
                  </CardTitle>
                  {!isEditing && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const full = formatFullAddress(borrower);
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
                  )}
                </CardHeader>
                <CardContent>
                  {!isEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <CopyField
                        label="Address Line 1"
                        value={borrower.addressLine1 || borrower.address}
                      />
                      <CopyField label="Address Line 2 (optional)" value={borrower.addressLine2} />
                      <CopyField label="City" value={borrower.city} />
                      <CopyField
                        label="State"
                        value={getStateName(borrower.country, borrower.state)}
                      />
                      <CopyField label="Postcode" value={borrower.postcode} />
                      <CopyField
                        label="Country"
                        value={borrower.country ? `${getCountryFlag(borrower.country)} ${getCountryName(borrower.country) || ""}`.trim() : undefined}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field
                        label="Address Line 1"
                        value={borrower.addressLine1 || borrower.address || "-"}
                        editValue={formData.addressLine1}
                        onChange={(val) => {
                          setFormData((prev) => ({ ...prev, addressLine1: val }));
                          if (validationErrors.addressLine1) setValidationErrors((prev) => ({ ...prev, addressLine1: "" }));
                        }}
                        error={validationErrors.addressLine1}
                        placeholder="Street, building, unit"
                        isEditing={isEditing}
                      />
                      <Field
                        label="Address Line 2 (optional)"
                        value={borrower.addressLine2 || "-"}
                        editValue={formData.addressLine2}
                        onChange={(val) => setFormData((prev) => ({ ...prev, addressLine2: val }))}
                        placeholder="Apartment, suite, floor"
                        isEditing={isEditing}
                        required={false}
                      />
                      <Field
                        label="City"
                        value={borrower.city || "-"}
                        editValue={formData.city}
                        onChange={(val) => {
                          setFormData((prev) => ({ ...prev, city: val }));
                          if (validationErrors.city) setValidationErrors((prev) => ({ ...prev, city: "" }));
                        }}
                        error={validationErrors.city}
                        placeholder="City"
                        isEditing={isEditing}
                      />
                      <Field
                        label="Postcode"
                        value={borrower.postcode || "-"}
                        editValue={formData.postcode}
                        onChange={(val) => {
                          const digitsOnly = val.replace(/\D/g, "");
                          setFormData((prev) => ({ ...prev, postcode: digitsOnly }));
                          if (validationErrors.postcode) setValidationErrors((prev) => ({ ...prev, postcode: "" }));
                        }}
                        error={validationErrors.postcode}
                        placeholder="Postal code (numbers only)"
                        isEditing={isEditing}
                      />
                      <Field
                        label="Country"
                        value={getCountryName(borrower.country) || "-"}
                        editValue={formData.country}
                        onChange={(val) => {
                          const nextStateOptions = getStateOptions(val);
                          setFormData((prev) => ({
                            ...prev,
                            country: val,
                            state: nextStateOptions.some((option) => option.value === prev.state) ? prev.state : "",
                          }));
                          if (validationErrors.country || validationErrors.state) {
                            setValidationErrors((prev) => ({ ...prev, country: "", state: "" }));
                          }
                        }}
                        type="select"
                        options={countryOptions}
                        error={validationErrors.country}
                        isEditing={isEditing}
                      />
                      <Field
                        label="State"
                        value={getStateName(borrower.country, borrower.state) || "-"}
                        editValue={formData.state}
                        onChange={(val) => {
                          setFormData((prev) => ({ ...prev, state: val }));
                          if (validationErrors.state) setValidationErrors((prev) => ({ ...prev, state: "" }));
                        }}
                        type="select"
                        options={stateOptions}
                        error={validationErrors.state}
                        disabled={!formData.country || stateOptions.length === 0}
                        isEditing={isEditing}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Individual: Contact & Emergency Contact Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Emergency Contact */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-muted-foreground" />
                      Emergency Contact
                    </CardTitle>
                    {isEditing && <CardDescription>Optional</CardDescription>}
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      {!isEditing ? (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground">Name</p>
                            <p className="font-medium">{borrower.emergencyContactName || "-"}</p>
                          </div>
                          <PhoneDisplay label="Phone" value={borrower.emergencyContactPhone} />
                          <div>
                            <p className="text-xs text-muted-foreground">Relationship</p>
                            <p className="font-medium">
                              {getOptionLabel(RELATIONSHIP_OPTIONS, borrower.emergencyContactRelationship)}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="text-xs text-muted-foreground">Name</label>
                            <Input
                              value={formData.emergencyContactName}
                              onChange={(e) => setFormData((prev) => ({ ...prev, emergencyContactName: e.target.value }))}
                              placeholder="Contact name"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Phone</label>
                            <PhoneInput
                              value={formData.emergencyContactPhone || undefined}
                              onChange={(val: string | undefined) => setFormData((prev) => ({ ...prev, emergencyContactPhone: val ?? "" }))}
                              placeholder="16 2487680"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Relationship</label>
                            <Select 
                              value={formData.emergencyContactRelationship} 
                              onValueChange={(val) => setFormData((prev) => ({ ...prev, emergencyContactRelationship: val }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {RELATIONSHIP_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Contact Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      Contact Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      {!isEditing ? (
                        <>
                          <PhoneDisplay label="Phone" value={borrower.phone} />
                          <CopyField label="Email" value={borrower.email} />
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="text-xs text-muted-foreground">Phone *</label>
                            <PhoneInput
                              value={formData.phone || undefined}
                              onChange={(val: string | undefined) => {
                                setFormData((prev) => ({ ...prev, phone: val ?? "" }));
                                if (validationErrors.phone) setValidationErrors((prev) => ({ ...prev, phone: "" }));
                              }}
                              error={!!validationErrors.phone}
                              placeholder="16 2487680"
                            />
                            {validationErrors.phone && (
                              <p className="text-xs text-red-500 mt-1">{validationErrors.phone}</p>
                            )}
                          </div>
                          <Field
                            label="Email"
                            value={borrower.email || "-"}
                            editValue={formData.email}
                            onChange={(val) => {
                              setFormData((prev) => ({ ...prev, email: val }));
                              if (validationErrors.email) setValidationErrors((prev) => ({ ...prev, email: "" }));
                            }}
                            type="email"
                            error={validationErrors.email}
                            placeholder="email@example.com"
                            isEditing={isEditing}
                          />
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Social Media Profiles - Full Width */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-muted-foreground" />
                Social Media Profiles
              </CardTitle>
              <CardDescription>Optional profile links</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {!isEditing ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-2 mb-1">
                        <InstagramIcon className="h-4 w-4" />
                        Instagram
                      </p>
                      <p className="font-medium">
                        {borrower.instagram ? (
                          <a
                            href={borrower.instagram.startsWith("http") ? borrower.instagram : `https://${borrower.instagram}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline break-all cursor-pointer inline-flex items-center gap-1"
                          >
                            {borrower.instagram}
                            <ExternalLink className="h-4 w-4 shrink-0 opacity-70" />
                          </a>
                        ) : (
                          "-"
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-2 mb-1">
                        <TikTokIcon className="h-4 w-4" />
                        TikTok
                      </p>
                      <p className="font-medium">
                        {borrower.tiktok ? (
                          <a
                            href={borrower.tiktok.startsWith("http") ? borrower.tiktok : `https://${borrower.tiktok}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline break-all cursor-pointer inline-flex items-center gap-1"
                          >
                            {borrower.tiktok}
                            <ExternalLink className="h-4 w-4 shrink-0 opacity-70" />
                          </a>
                        ) : (
                          "-"
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-2 mb-1">
                        <FacebookIcon className="h-4 w-4" />
                        Facebook
                      </p>
                      <p className="font-medium">
                        {borrower.facebook ? (
                          <a
                            href={borrower.facebook.startsWith("http") ? borrower.facebook : `https://${borrower.facebook}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline break-all cursor-pointer inline-flex items-center gap-1"
                          >
                            {borrower.facebook}
                            <ExternalLink className="h-4 w-4 shrink-0 opacity-70" />
                          </a>
                        ) : (
                          "-"
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-2 mb-1">
                        <LinkedInIcon className="h-4 w-4" />
                        LinkedIn
                      </p>
                      <p className="font-medium">
                        {borrower.linkedin ? (
                          <a
                            href={borrower.linkedin.startsWith("http") ? borrower.linkedin : `https://${borrower.linkedin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline break-all cursor-pointer inline-flex items-center gap-1"
                          >
                            {borrower.linkedin}
                            <ExternalLink className="h-4 w-4 shrink-0 opacity-70" />
                          </a>
                        ) : (
                          "-"
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-2 mb-1">
                        <XTwitterIcon className="h-4 w-4" />
                        X (Twitter)
                      </p>
                      <p className="font-medium">
                        {borrower.xTwitter ? (
                          <a
                            href={borrower.xTwitter.startsWith("http") ? borrower.xTwitter : `https://${borrower.xTwitter}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline break-all cursor-pointer inline-flex items-center gap-1"
                          >
                            {borrower.xTwitter}
                            <ExternalLink className="h-4 w-4 shrink-0 opacity-70" />
                          </a>
                        ) : (
                          "-"
                        )}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-2">
                        <InstagramIcon className="h-4 w-4" />
                        Instagram
                      </Label>
                      <div className="mt-1 flex gap-2">
                        <Input
                          value={formData.instagram}
                          onChange={(e) => setFormData((prev) => ({ ...prev, instagram: e.target.value }))}
                          placeholder="https://instagram.com/username"
                          className="flex-1"
                        />
                        {formData.instagram?.trim() && (
                          <a
                            href={formData.instagram.trim().startsWith("http") ? formData.instagram.trim() : `https://${formData.instagram.trim()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 p-2 rounded-md border border-input bg-background hover:bg-accent"
                            title="Open link"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-2">
                        <TikTokIcon className="h-4 w-4" />
                        TikTok
                      </Label>
                      <div className="mt-1 flex gap-2">
                        <Input
                          value={formData.tiktok}
                          onChange={(e) => setFormData((prev) => ({ ...prev, tiktok: e.target.value }))}
                          placeholder="https://tiktok.com/@username"
                          className="flex-1"
                        />
                        {formData.tiktok?.trim() && (
                          <a
                            href={formData.tiktok.trim().startsWith("http") ? formData.tiktok.trim() : `https://${formData.tiktok.trim()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 p-2 rounded-md border border-input bg-background hover:bg-accent"
                            title="Open link"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-2">
                        <FacebookIcon className="h-4 w-4" />
                        Facebook
                      </Label>
                      <div className="mt-1 flex gap-2">
                        <Input
                          value={formData.facebook}
                          onChange={(e) => setFormData((prev) => ({ ...prev, facebook: e.target.value }))}
                          placeholder="https://facebook.com/username"
                          className="flex-1"
                        />
                        {formData.facebook?.trim() && (
                          <a
                            href={formData.facebook.trim().startsWith("http") ? formData.facebook.trim() : `https://${formData.facebook.trim()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 p-2 rounded-md border border-input bg-background hover:bg-accent"
                            title="Open link"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-2">
                        <LinkedInIcon className="h-4 w-4" />
                        LinkedIn
                      </Label>
                      <div className="mt-1 flex gap-2">
                        <Input
                          value={formData.linkedin}
                          onChange={(e) => setFormData((prev) => ({ ...prev, linkedin: e.target.value }))}
                          placeholder="https://linkedin.com/in/username"
                          className="flex-1"
                        />
                        {formData.linkedin?.trim() && (
                          <a
                            href={formData.linkedin.trim().startsWith("http") ? formData.linkedin.trim() : `https://${formData.linkedin.trim()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 p-2 rounded-md border border-input bg-background hover:bg-accent"
                            title="Open link"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-2">
                        <XTwitterIcon className="h-4 w-4" />
                        X (Twitter)
                      </Label>
                      <div className="mt-1 flex gap-2">
                        <Input
                          value={formData.xTwitter}
                          onChange={(e) => setFormData((prev) => ({ ...prev, xTwitter: e.target.value }))}
                          placeholder="https://x.com/username"
                          className="flex-1"
                        />
                        {formData.xTwitter?.trim() && (
                          <a
                            href={formData.xTwitter.trim().startsWith("http") ? formData.xTwitter.trim() : `https://${formData.xTwitter.trim()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 p-2 rounded-md border border-input bg-background hover:bg-accent"
                            title="Open link"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Bank Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Bank Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {!isEditing ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">Bank</p>
                      <p className="font-medium">{getBankLabel(borrower.bankName)}</p>
                    </div>
                    <CopyField
                      label="Account Number"
                      value={borrower.bankAccountNo}
                      toastMessage="Account number copied"
                    />
                  </>
                ) : (
                  <>
                    <Field
                      label="Bank"
                      value={getBankLabel(borrower.bankName)}
                      editValue={formData.bankName}
                      onChange={(val) => {
                        setFormData((prev) => ({ 
                          ...prev, 
                          bankName: val,
                          bankNameOther: val === "OTHER" ? prev.bankNameOther : ""
                        }));
                        if (validationErrors.bankName) setValidationErrors((prev) => ({ ...prev, bankName: "" }));
                      }}
                      type="select"
                      options={BANK_OPTIONS}
                      error={validationErrors.bankName}
                      isEditing={isEditing}
                    />
                    {formData.bankName === "OTHER" && (
                      <Field
                        label="Bank Name"
                        value=""
                        editValue={formData.bankNameOther}
                        onChange={(val) => {
                          setFormData((prev) => ({ ...prev, bankNameOther: val }));
                          if (validationErrors.bankNameOther) setValidationErrors((prev) => ({ ...prev, bankNameOther: "" }));
                        }}
                        error={validationErrors.bankNameOther}
                        placeholder="Enter bank name"
                        isEditing={isEditing}
                      />
                    )}
                    <Field
                      label="Account Number"
                      value={borrower.bankAccountNo || "-"}
                      editValue={formData.bankAccountNo}
                      onChange={(val) => {
                        const clean = val.replace(/\D/g, "").substring(0, 17);
                        setFormData((prev) => ({ ...prev, bankAccountNo: clean }));
                        if (validationErrors.bankAccountNo) setValidationErrors((prev) => ({ ...prev, bankAccountNo: "" }));
                      }}
                      error={validationErrors.bankAccountNo}
                      placeholder="8-17 digits"
                      isEditing={isEditing}
                    />
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Bottom Save/Cancel when editing */}
          {isEditing && (
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}

        </div>

        {/* Right Column - Documents & Activity Timeline */}
        <div className="space-y-6">
          {/* TrueIdentity e-KYC */}
          <TrueIdentityBox
              borrowerId={borrower.id}
              borrowerType={borrower.borrowerType}
              borrowerName={borrower.name}
              borrowerIcNumber={borrower.icNumber}
              borrowerVerificationStatus={borrower.verificationStatus}
              borrowerDocumentVerified={borrower.documentVerified}
              directors={borrower.directors}
              refreshKey={trueIdentityRefreshKey}
            />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Borrower Documents
              </CardTitle>
              <div className="space-y-0.5">
                <CardDescription>
                  Upload and manage documents for this borrower.
                </CardDescription>
                <p className="text-[10px] text-muted-foreground">
                  Allowed: PDF, PNG, JPG (max 5MB per file).
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Upload Section */}
              {(() => {
                const docsInSelectedCategory =
                  selectedDocCategory !== "ALL"
                    ? (borrower.documents ?? []).filter((d) => d.category === selectedDocCategory).length
                    : 0;
                const categoryLimitReached =
                  selectedDocCategory !== "ALL" && docsInSelectedCategory >= MAX_DOCUMENTS_PER_CATEGORY;
                return (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Document Category</label>
                        <Select value={selectedDocCategory} onValueChange={setSelectedDocCategory}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select document type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">All categories</SelectItem>
                            {(borrower.borrowerType === "CORPORATE"
                              ? CORPORATE_BORROWER_DOCUMENT_OPTIONS
                              : INDIVIDUAL_DOCUMENT_OPTIONS
                            ).map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <input
                          type="file"
                          id="doc-upload"
                          className="hidden"
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={handleDocumentUpload}
                          disabled={uploadingDoc || selectedDocCategory === "ALL" || categoryLimitReached}
                        />
                        <Button
                          variant="outline"
                          disabled={uploadingDoc || selectedDocCategory === "ALL" || categoryLimitReached}
                          onClick={() => document.getElementById("doc-upload")?.click()}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {uploadingDoc ? "Uploading..." : "Upload"}
                        </Button>
                      </div>
                    </div>
                    {categoryLimitReached && (
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        Maximum {MAX_DOCUMENTS_PER_CATEGORY} documents per category. This category has reached its limit.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Documents List */}
              {borrower.documents && borrower.documents.length > 0 ? (
                <div className="space-y-4">
                  {(() => {
                    const visibleDocs = borrower.borrowerType === "CORPORATE"
                      ? borrower.documents.filter((d) => !CORPORATE_HIDDEN_KYC_DOC_CATEGORIES.has(d.category))
                      : borrower.documents;
                    const filtered =
                      selectedDocCategory === "ALL"
                        ? visibleDocs
                        : visibleDocs.filter((d) => {
                            if (d.category === selectedDocCategory) return true;
                            const filename = (d.originalName || d.filename || "").toUpperCase();
                            const categoryInFilename = selectedDocCategory.replace(/-/g, "_");
                            return filename.includes(categoryInFilename) || filename.includes(`KYC-${categoryInFilename}`);
                          });
                    const sorted = sortDocumentsByCategory(filtered, borrower.borrowerType);
                    if (sorted.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          No documents in this category
                        </p>
                      );
                    }
                    return sorted.map((doc) => {
                    const isImage = /^image\/(jpeg|jpg|png|webp)$/i.test(doc.mimeType);
                    const docUrl = doc.path.startsWith("/") ? `/api/proxy${doc.path}` : doc.path;
                    const DocIcon = getDocumentIcon(doc.mimeType);
                    const displayName = doc.originalName || doc.filename || "Document";
                    return (
                      <div
                        key={doc.id}
                        className="flex items-start gap-4 p-3 border rounded-lg min-w-0 overflow-hidden"
                      >
                        {isImage ? (
                          <div className="shrink-0 w-20 h-20 rounded-md overflow-hidden bg-muted/15 border border-border/30">
                            <img
                              src={docUrl}
                              alt={getDocumentLabel(doc.category, borrower.borrowerType)}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="shrink-0 w-10 h-10 rounded-md bg-muted/15 border border-border/30 flex items-center justify-center">
                            <DocIcon className="h-5 w-5 text-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-sm font-medium truncate" title={getDocumentLabel(doc.category, borrower.borrowerType)}>
                            {getDocumentLabel(doc.category, borrower.borrowerType)}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0" title={displayName}>
                            <span className="truncate">{displayName}</span>
                            <span className="shrink-0">• {formatFileSize(doc.size)}</span>
                          </p>
                          <a
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline mt-1 inline-block"
                          >
                            Open Full Size
                          </a>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteDocId(doc.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    );
                  });
                  })()}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No documents uploaded yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* TrueIdentity IC Documents (from Admin) - individual only; corporate shows per-director */}
          {borrower.borrowerType !== "CORPORATE" && borrower.trueIdentitySessions?.[0]?.verificationDocumentUrls && (() => {
            const urls = borrower.trueIdentitySessions[0].verificationDocumentUrls as {
              icFrontUrl?: string | null;
              icBackUrl?: string | null;
              selfieUrl?: string | null;
              verificationDetailUrl?: string | null;
            } | null;
            if (!urls) return null;
            const links = [
              urls.icFrontUrl && { label: "IC Front", url: urls.icFrontUrl },
              urls.icBackUrl && { label: "IC Back", url: urls.icBackUrl },
              urls.selfieUrl && { label: "Selfie", url: urls.selfieUrl },
              urls.verificationDetailUrl && { label: "View in Admin", url: urls.verificationDetailUrl },
            ].filter(Boolean) as { label: string; url: string }[];
            if (links.length === 0) return null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Fingerprint className="h-5 w-5 text-muted-foreground" />
                    IC Documents (from TrueIdentity)
                  </CardTitle>
                  <CardDescription>
                    Document images from e-KYC verification, stored in Admin
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {links.map(({ label, url }) => (
                      <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {label}
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <InternalStaffNotesPanel apiPath={`borrowers/${borrowerId}/staff-notes`} />

          {/* Activity Timeline */}
          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setTimelineExpanded((p) => !p)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    Activity Timeline
                  </CardTitle>
                  <CardDescription>Changes and events for this borrower</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTimelineExpanded((p) => !p);
                  }}
                >
                  {timelineExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            {timelineExpanded && (
              <CardContent>
                {timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No activity recorded yet
                  </p>
                ) : (
                  <div className="space-y-0 min-w-0">
                    {timeline.map((event) => (
                      <TimelineItem key={event.id} event={event} borrower={borrower} />
                    ))}
                    {hasMoreTimeline && (
                      <div className="pt-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchTimeline(timelineCursor || undefined, true);
                          }}
                          disabled={loadingMoreTimeline}
                        >
                          {loadingMoreTimeline ? "Loading..." : "Load More"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      {/* Delete Document Confirmation Dialog */}
      <AlertDialog open={!!deleteDocId} onOpenChange={(open) => !open && setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDoc}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDocument}
              disabled={deletingDoc}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deletingDoc ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* KYC Invalidation Warning Dialog */}
      <AlertDialog
        open={showKycInvalidationConfirm}
        onOpenChange={setShowKycInvalidationConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invalidate e-KYC Verification?</AlertDialogTitle>
            <AlertDialogDescription>
              {borrower?.borrowerType === "CORPORATE"
                ? "Changing any director name or IC number will invalidate e-KYC verification for the affected director(s). Re-verification will be required."
                : "Changing borrower name or IC number will invalidate e-KYC verification. Re-verification will be required."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={() => {
                setShowKycInvalidationConfirm(false);
                void handleSave(true);
              }}
            >
              {saving ? "Saving..." : "Proceed and Save"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
