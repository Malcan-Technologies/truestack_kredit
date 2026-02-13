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
  ShieldCheck,
  Fingerprint,
  AlertTriangle,
  Pencil,
  Plus,
  Trash2,
  Clock,
  X,
  Save,
  Upload,
  FileText,
  Download,
  Briefcase,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { CopyField } from "@/components/ui/copy-field";
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
  verifiedAt: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
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
  // Corporate fields
  companyName: string | null;
  ssmRegistrationNo: string | null;
  businessAddress: string | null;
  bumiStatus: string | null;
  authorizedRepName: string | null;
  authorizedRepIc: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  natureOfBusiness: string | null;
  dateOfIncorporation: string | null;
  paidUpCapital: string | null;
  numberOfEmployees: number | null;
  createdAt: string;
  updatedAt: string;
  loans: Array<{
    id: string;
    status: string;
    principalAmount: string;
    createdAt: string;
    product: { name: string } | null;
  }>;
  applications: Array<{
    id: string;
    status: string;
    requestedAmount: string;
    createdAt: string;
    product: { name: string } | null;
  }>;
  documents: BorrowerDocument[];
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

interface FormData {
  // Common fields
  name: string;
  icNumber: string;
  documentType: string;
  phone: string;
  email: string;
  address: string;
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
  // Corporate fields
  companyName: string;
  ssmRegistrationNo: string;
  businessAddress: string;
  bumiStatus: string;
  authorizedRepName: string;
  authorizedRepIc: string;
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

// Document categories
const INDIVIDUAL_DOCUMENT_OPTIONS = [
  { value: "IC_FRONT", label: "IC Front" },
  { value: "IC_BACK", label: "IC Back" },
  { value: "PASSPORT", label: "Passport" },
  { value: "WORK_PERMIT", label: "Work Permit" },
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
  { value: "DIRECTOR_PASSPORT", label: "Director Passport" },
];

function getDocumentLabel(category: string, borrowerType: string): string {
  const options = borrowerType === "CORPORATE" 
    ? CORPORATE_DOCUMENT_OPTIONS
    : INDIVIDUAL_DOCUMENT_OPTIONS;
  return options.find(o => o.value === category)?.label || category;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        <label className="text-xs text-muted-foreground">{label} *</label>
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
      <label className="text-xs text-muted-foreground">{label} *</label>
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

function TimelineItem({ event }: { event: TimelineEvent }) {
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
      default:
        return { icon: Clock, label: action };
    }
  };

  const actionInfo = getActionInfo(event.action);
  const Icon = actionInfo.icon;

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
        const fromDisplay = prevVal === null || prevVal === undefined ? "(empty)" : String(prevVal);
        const toDisplay = nextVal === null || nextVal === undefined ? "(empty)" : String(nextVal);
        changes.push({ field: key, from: fromDisplay, to: toDisplay });
      }
    }
    return changes;
  };

  const changes = getChanges();

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div className="w-px flex-1 bg-border mt-2" />
      </div>
      <div className="flex-1 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-foreground">{actionInfo.label}</span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(event.createdAt)}
          </span>
        </div>
        {event.user && (
          <p className="text-sm text-muted-foreground mb-2">
            by {event.user.name || event.user.email}
          </p>
        )}
        {changes && changes.length > 0 && (
          <div className="bg-secondary border border-border rounded-lg p-3 space-y-2">
            {changes.map((change, idx) => (
              <div key={idx} className="text-xs space-y-0.5">
                <span className="font-medium text-foreground">{change.field}</span>
                <div className="flex items-start gap-2 pl-2">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground line-through">
                    {change.from}
                  </span>
                  <span className="text-muted-foreground self-center">→</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-foreground/10 text-foreground font-medium">
                    {change.to}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {event.action === "CREATE" && event.newData && (
          <div className="bg-secondary border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              Borrower record created with name: <span className="font-medium text-foreground">
                {event.newData.borrowerType === "CORPORATE" 
                  ? (event.newData.companyName as string) || (event.newData.name as string)
                  : (event.newData.name as string)}
              </span>
            </p>
          </div>
        )}
        {event.action === "DOCUMENT_UPLOAD" && event.newData && (
          <div className="bg-secondary border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
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
          <div className="bg-secondary border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              Deleted document: <span className="font-medium text-foreground">
                {String(event.previousData.filename || event.previousData.category || "")}
              </span>
              {Boolean(event.previousData.category) && (
                <span className="text-muted-foreground"> ({String(event.previousData.category)})</span>
              )}
            </p>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          {formatDate(event.createdAt)} {event.ipAddress && `• IP: ${event.ipAddress}`}
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
    address: "",
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
    // Corporate fields
    companyName: "",
    ssmRegistrationNo: "",
    businessAddress: "",
    bumiStatus: "",
    authorizedRepName: "",
    authorizedRepIc: "",
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
  const [selectedDocCategory, setSelectedDocCategory] = useState("");
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);

  const isIC = formData.documentType === "IC";

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

  const populateForm = (data: Borrower) => {
    const docType = data.documentType || "IC";
    const cleanIcNumber = data.borrowerType === "INDIVIDUAL" && docType === "IC" 
      ? data.icNumber.replace(/\D/g, "").substring(0, 12)
      : data.icNumber;
    
    // Detect if borrower has 0 income (no monthly income)
    const incomeValue = data.monthlyIncome != null ? Number(data.monthlyIncome) : null;
    setNoMonthlyIncome(incomeValue === 0);

    setFormData({
      // Common fields
      name: data.name,
      icNumber: cleanIcNumber,
      documentType: docType,
      phone: data.phone || "",
      email: data.email || "",
      address: data.address || "",
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
      // Corporate fields
      companyName: data.companyName || "",
      ssmRegistrationNo: data.ssmRegistrationNo || "",
      businessAddress: data.businessAddress || "",
      bumiStatus: data.bumiStatus || "",
      authorizedRepName: data.authorizedRepName || "",
      authorizedRepIc: data.authorizedRepIc || "",
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
      if (!formData.businessAddress.trim()) errors.businessAddress = "Business address is required";
      if (!formData.bumiStatus) errors.bumiStatus = "Taraf (Bumi status) is required for compliance";
      if (!formData.authorizedRepName.trim()) errors.authorizedRepName = "Representative name is required";
      if (!formData.authorizedRepIc.trim()) errors.authorizedRepIc = "Representative IC is required";
      if (!formData.companyPhone.trim()) errors.companyPhone = "Company phone is required";
      if (!formData.companyEmail.trim()) errors.companyEmail = "Company email is required";
      if (!formData.bankName) errors.bankName = "Bank is required";
      if (formData.bankName === "OTHER" && !formData.bankNameOther.trim()) {
        errors.bankNameOther = "Bank name is required";
      }
      if (!formData.bankAccountNo.trim()) errors.bankAccountNo = "Account number is required";
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
      if (!formData.address.trim()) errors.address = "Address is required";
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
    }
    
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Please fill in all required fields");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm() || !borrower) return;
    
    setSaving(true);
    try {
      let payload: Record<string, unknown>;
      
      if (borrower.borrowerType === "CORPORATE") {
        // Corporate borrower payload
        // Note: icNumber is not updated during edit to avoid duplicate audit entries
        // ssmRegistrationNo is the canonical field for corporate registration
        payload = {
          name: formData.authorizedRepName || undefined, // Rep name as primary name
          phone: formData.companyPhone || undefined,
          email: formData.companyEmail || undefined,
          address: formData.businessAddress || undefined,
          companyName: formData.companyName || undefined,
          ssmRegistrationNo: formData.ssmRegistrationNo || undefined,
          businessAddress: formData.businessAddress || undefined,
          bumiStatus: formData.bumiStatus || undefined,
          authorizedRepName: formData.authorizedRepName || undefined,
          authorizedRepIc: formData.authorizedRepIc || undefined,
          companyPhone: formData.companyPhone || undefined,
          companyEmail: formData.companyEmail || undefined,
          natureOfBusiness: formData.natureOfBusiness || undefined,
          dateOfIncorporation: formData.dateOfIncorporation ? new Date(formData.dateOfIncorporation).toISOString() : undefined,
          paidUpCapital: formData.paidUpCapital ? parseFloat(formData.paidUpCapital) : undefined,
          numberOfEmployees: formData.numberOfEmployees ? parseInt(formData.numberOfEmployees) : undefined,
          bankName: formData.bankName || undefined,
          bankNameOther: formData.bankName === "OTHER" ? (formData.bankNameOther || undefined) : undefined,
          bankAccountNo: formData.bankAccountNo || undefined,
        };
      } else {
        // Individual borrower payload
        payload = {
          name: formData.name,
          icNumber: formData.icNumber,
          documentType: formData.documentType,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
          address: formData.address || undefined,
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
        };
      }

      const res = await api.patch<Borrower>(`/api/borrowers/${borrowerId}`, payload);
      if (res.success) {
        toast.success("Borrower updated successfully");
        setIsEditing(false);
        // Refetch full borrower data (including loans/applications relations)
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
    if (!file || !selectedDocCategory) {
      toast.error("Please select a document category first");
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
        setSelectedDocCategory("");
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
              {borrower.borrowerType === "CORPORATE" ? (
                <Badge variant="secondary">
                  <Building2 className="h-3 w-3 mr-1" />
                  Corporate
                </Badge>
              ) : (
                <Badge variant="outline">
                  <User className="h-3 w-3 mr-1" />
                  Individual
                </Badge>
              )}
              {borrower.documentVerified ? (
                <Badge variant="verified">
                  <Fingerprint className="h-3 w-3 mr-1" />
                  e-KYC Verified
                </Badge>
              ) : (
                <Badge variant="unverified">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Manual Verification
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {borrower.borrowerType === "CORPORATE" 
                ? `SSM: ${borrower.ssmRegistrationNo || borrower.icNumber}`
                : `${borrower.documentType === "IC" ? "IC" : "Passport"}: ${borrower.documentType === "IC" ? formatICForDisplay(borrower.icNumber) : borrower.icNumber}`}
              {borrower.borrowerType === "CORPORATE" && (
                <span> • Rep: {borrower.authorizedRepName || borrower.name}</span>
              )}
              <span className="mx-2">•</span>
              Created {formatDate(borrower.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
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
                    {borrower.borrowerType === "CORPORATE" ? "Corporate" : "Individual"}
                  </Badge>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Active Loans</span>
                  <Badge variant="outline">{borrower.loans.length}</Badge>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Applications</span>
                  <Badge variant="outline">{borrower.applications.length}</Badge>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Added</span>
                  <span className="text-sm font-medium">{formatDate(borrower.createdAt)}</span>
                </div>
              </div>
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
                  <div className="grid grid-cols-2 gap-4">
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
                    <div className="col-span-2">
                      <Field
                        label="Business Address"
                        value={borrower.businessAddress || borrower.address || "-"}
                        editValue={formData.businessAddress}
                        onChange={(val) => {
                          setFormData((prev) => ({ ...prev, businessAddress: val }));
                          if (validationErrors.businessAddress) setValidationErrors((prev) => ({ ...prev, businessAddress: "" }));
                        }}
                        error={validationErrors.businessAddress}
                        placeholder="Registered business address"
                        isEditing={isEditing}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Additional Company Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-muted-foreground" />
                    Additional Details
                  </CardTitle>
                  <CardDescription>Optional company information</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
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

              {/* Authorized Representative & Company Contact - Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Authorized Representative */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-muted-foreground" />
                      Authorized Representative
                    </CardTitle>
                    <CardDescription>Person authorized to act on behalf of the company</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Field
                        label="Representative Name"
                        value={borrower.authorizedRepName || borrower.name || "-"}
                        editValue={formData.authorizedRepName}
                        onChange={(val) => {
                          setFormData((prev) => ({ ...prev, authorizedRepName: val }));
                          if (validationErrors.authorizedRepName) setValidationErrors((prev) => ({ ...prev, authorizedRepName: "" }));
                        }}
                        error={validationErrors.authorizedRepName}
                        placeholder="Full name"
                        isEditing={isEditing}
                      />
                      <Field
                        label="Representative IC"
                        value={borrower.authorizedRepIc || "-"}
                        editValue={formData.authorizedRepIc}
                        onChange={(val) => {
                          setFormData((prev) => ({ ...prev, authorizedRepIc: val }));
                          if (validationErrors.authorizedRepIc) setValidationErrors((prev) => ({ ...prev, authorizedRepIc: "" }));
                        }}
                        error={validationErrors.authorizedRepIc}
                        placeholder="880101011234"
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
                    <div className="space-y-3">
                      {!isEditing ? (
                        <>
                          <CopyField label="Phone" value={borrower.companyPhone || borrower.phone} />
                          <CopyField label="Email" value={borrower.companyEmail || borrower.email} />
                        </>
                      ) : (
                        <>
                          <Field
                            label="Company Phone"
                            value={borrower.companyPhone || borrower.phone || "-"}
                            editValue={formData.companyPhone}
                            onChange={(val) => {
                              setFormData((prev) => ({ ...prev, companyPhone: val }));
                              if (validationErrors.companyPhone) setValidationErrors((prev) => ({ ...prev, companyPhone: "" }));
                            }}
                            error={validationErrors.companyPhone}
                            placeholder="+603-12345678"
                            isEditing={isEditing}
                          />
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
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                        <Input
                          type="number"
                          value={noMonthlyIncome ? "0" : formData.monthlyIncome}
                          onChange={(e) => {
                            setFormData((prev) => ({ ...prev, monthlyIncome: e.target.value }));
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

              {/* Individual: Contact & Emergency Contact Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Contact Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      Contact Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {!isEditing ? (
                        <>
                          <CopyField label="Phone" value={borrower.phone} />
                          <CopyField label="Email" value={borrower.email} />
                          <CopyField label="Address" value={borrower.address} />
                        </>
                      ) : (
                        <div className="space-y-3">
                          <Field
                            label="Phone"
                            value={borrower.phone || "-"}
                            editValue={formData.phone}
                            onChange={(val) => {
                              setFormData((prev) => ({ ...prev, phone: val }));
                              if (validationErrors.phone) setValidationErrors((prev) => ({ ...prev, phone: "" }));
                            }}
                            error={validationErrors.phone}
                            placeholder="+60123456789"
                            isEditing={isEditing}
                          />
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
                          <Field
                            label="Address"
                            value={borrower.address || "-"}
                            editValue={formData.address}
                            onChange={(val) => {
                              setFormData((prev) => ({ ...prev, address: val }));
                              if (validationErrors.address) setValidationErrors((prev) => ({ ...prev, address: "" }));
                            }}
                            error={validationErrors.address}
                            placeholder="Full address"
                            isEditing={isEditing}
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

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
                    <div className="space-y-3">
                      {!isEditing ? (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground">Name</p>
                            <p className="font-medium">{borrower.emergencyContactName || "-"}</p>
                          </div>
                          <CopyField label="Phone" value={borrower.emergencyContactPhone} />
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
                            <Input
                              value={formData.emergencyContactPhone}
                              onChange={(e) => setFormData((prev) => ({ ...prev, emergencyContactPhone: e.target.value }))}
                              placeholder="+60123456789"
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
              </div>
            </>
          )}

          {/* Bank Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Bank Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
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
                        setFormData((prev) => ({ ...prev, bankAccountNo: val }));
                        if (validationErrors.bankAccountNo) setValidationErrors((prev) => ({ ...prev, bankAccountNo: "" }));
                      }}
                      error={validationErrors.bankAccountNo}
                      placeholder="1234567890"
                      isEditing={isEditing}
                    />
                  </>
                )}
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right Column - Documents & Activity Timeline */}
        <div className="space-y-6">
          {/* TrueIdentity e-KYC */}
          <TrueIdentityBox borrowerId={borrower.id} />

          {/* Identity Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Identity Documents
              </CardTitle>
              <CardDescription>
                Upload and manage identity documents for this borrower
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Upload Section */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Document Category</label>
                  <Select value={selectedDocCategory} onValueChange={setSelectedDocCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select document type" />
                    </SelectTrigger>
                    <SelectContent>
                      {(borrower.borrowerType === "CORPORATE" 
                        ? CORPORATE_DOCUMENT_OPTIONS
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
                    accept=".jpg,.jpeg,.png,.pdf,.webp"
                    onChange={handleDocumentUpload}
                    disabled={uploadingDoc || !selectedDocCategory}
                  />
                  <Button
                    variant="outline"
                    disabled={uploadingDoc || !selectedDocCategory}
                    onClick={() => document.getElementById("doc-upload")?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingDoc ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>

              {/* Documents List */}
              {borrower.documents && borrower.documents.length > 0 ? (
                <div className="space-y-2">
                  {borrower.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {getDocumentLabel(doc.category, borrower.borrowerType)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {doc.originalName} • {formatFileSize(doc.size)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={doc.path}
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
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No documents uploaded yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                Activity Timeline
              </CardTitle>
              <CardDescription>Changes and events for this borrower</CardDescription>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No activity recorded yet
                </p>
              ) : (
                <div className="space-y-0">
                  {timeline.map((event) => (
                    <TimelineItem key={event.id} event={event} />
                  ))}
                  {hasMoreTimeline && (
                    <div className="pt-4 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchTimeline(timelineCursor || undefined, true)}
                        disabled={loadingMoreTimeline}
                      >
                        {loadingMoreTimeline ? "Loading..." : "Load More"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
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
    </div>
  );
}
