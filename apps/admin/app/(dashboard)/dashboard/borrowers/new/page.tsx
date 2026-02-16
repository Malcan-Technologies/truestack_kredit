"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  User,
  Phone,
  Building2,
  Save,
  Briefcase,
  Plus,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";

// ============================================
// Types
// ============================================

interface Borrower {
  id: string;
  name: string;
}

interface IndividualFormData {
  name: string;
  icNumber: string;
  documentType: string;
  phone: string;
  email: string;
  address: string;
  dateOfBirth: string;
  gender: string;
  race: string;
  educationLevel: string;
  occupation: string;
  employmentStatus: string;
  bankName: string;
  bankNameOther: string;
  bankAccountNo: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  monthlyIncome: string;
}

interface CorporateFormData {
  name: string; // Authorized rep name
  icNumber: string; // SSM registration number
  phone: string;
  email: string;
  address: string;
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
  bankName: string;
  bankNameOther: string;
  bankAccountNo: string;
  directors: Array<{
    name: string;
    icNumber: string;
    position: string;
  }>;
}

const initialIndividualFormData: IndividualFormData = {
  name: "",
  icNumber: "",
  documentType: "IC",
  phone: "",
  email: "",
  address: "",
  dateOfBirth: "",
  gender: "",
  race: "",
  educationLevel: "",
  occupation: "",
  employmentStatus: "",
  bankName: "",
  bankNameOther: "",
  bankAccountNo: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelationship: "",
  monthlyIncome: "",
};

const initialCorporateFormData: CorporateFormData = {
  name: "",
  icNumber: "",
  phone: "",
  email: "",
  address: "",
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
  bankName: "",
  bankNameOther: "",
  bankAccountNo: "",
  directors: [{ name: "", icNumber: "", position: "" }],
};

// ============================================
// Helper Functions
// ============================================

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

// ============================================
// Field Component
// ============================================

interface FieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: "text" | "email" | "date" | "select" | "number";
  /** For type="number": "int" or "float". Default "int" */
  numberMode?: "int" | "float";
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  className?: string;
}

function Field({ 
  label, 
  value, 
  onChange, 
  type = "text",
  numberMode = "int",
  error,
  disabled,
  placeholder,
  options,
  required = true,
  className,
}: FieldProps) {
  if (type === "select" && options) {
    return (
      <div className={className}>
        <Label className="text-xs text-muted-foreground">{label} {required && "*"}</Label>
        <Select value={value} onValueChange={onChange} disabled={disabled}>
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

  if (type === "number") {
    const numValue: number | "" = value === "" ? "" : (numberMode === "float" ? (parseFloat(value) || 0) : (parseInt(value, 10) || 0));
    return (
      <div className={className}>
        <Label className="text-xs text-muted-foreground">{label} {required && "*"}</Label>
        <NumericInput
          mode={numberMode}
          value={numValue}
          onChange={(v) => onChange(v === "" ? "" : String(v))}
          placeholder={placeholder}
          disabled={disabled}
          className={error ? "border-red-500" : ""}
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label} {required && "*"}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={error ? "border-red-500" : ""}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function NewBorrowerPage() {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [borrowerType, setBorrowerType] = useState<"INDIVIDUAL" | "CORPORATE">("INDIVIDUAL");
  const [individualFormData, setIndividualFormData] = useState<IndividualFormData>(initialIndividualFormData);
  const [corporateFormData, setCorporateFormData] = useState<CorporateFormData>(initialCorporateFormData);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [noMonthlyIncome, setNoMonthlyIncome] = useState(false);

  const isIC = individualFormData.documentType === "IC";

  const handleIcNumberChange = (value: string) => {
    const currentIsIC = individualFormData.documentType === "IC";
    const cleanValue = currentIsIC ? value.replace(/\D/g, "").substring(0, 12) : value;
    
    const updates: Partial<IndividualFormData> = { icNumber: cleanValue };
    
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
    
    setIndividualFormData((prev) => ({ ...prev, ...updates }));
    if (validationErrors.icNumber) {
      setValidationErrors((prev) => ({ ...prev, icNumber: "" }));
    }
  };

  const handleDocumentTypeChange = (value: string) => {
    if (value === "PASSPORT") {
      setIndividualFormData((prev) => ({
        ...prev,
        documentType: value,
        dateOfBirth: "",
        gender: "",
      }));
    } else {
      const extractedDate = extractDateFromIC(individualFormData.icNumber);
      const extractedGender = extractGenderFromIC(individualFormData.icNumber);
      setIndividualFormData((prev) => ({
        ...prev,
        documentType: value,
        dateOfBirth: extractedDate || prev.dateOfBirth,
        gender: extractedGender || prev.gender,
      }));
    }
  };

  const validateIndividualForm = (): boolean => {
    const errors: Record<string, string> = {};
    const data = individualFormData;
    if (!data.name.trim()) errors.name = "Name is required";
    if (!data.icNumber.trim()) errors.icNumber = "IC/Passport number is required";
    else if (data.documentType === "IC") {
      const cleanIC = data.icNumber.replace(/\D/g, "");
      if (cleanIC.length !== 12) errors.icNumber = "IC number must be exactly 12 digits";
    }
    if (!data.phone.trim()) errors.phone = "Phone number is required";
    if (!data.email.trim()) errors.email = "Email is required";
    if (!data.address.trim()) errors.address = "Address is required";
    if (!data.dateOfBirth) errors.dateOfBirth = "Date of birth is required";
    if (!data.gender) errors.gender = "Gender is required";
    if (!data.race) errors.race = "Race is required";
    if (!data.educationLevel) errors.educationLevel = "Education level is required";
    if (!data.occupation.trim()) errors.occupation = "Occupation is required";
    if (!data.employmentStatus) errors.employmentStatus = "Employment status is required";
    if (!noMonthlyIncome) {
      if (!data.monthlyIncome.trim()) errors.monthlyIncome = "Monthly income is required";
      else if (isNaN(parseFloat(data.monthlyIncome)) || parseFloat(data.monthlyIncome) < 0) errors.monthlyIncome = "Enter a valid income amount";
    }
    if (!data.bankName) errors.bankName = "Bank is required";
    if (data.bankName === "OTHER" && !data.bankNameOther.trim()) {
      errors.bankNameOther = "Bank name is required";
    }
    if (!data.bankAccountNo.trim()) errors.bankAccountNo = "Account number is required";
    
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Please fill in all required fields");
      return false;
    }
    return true;
  };

  const validateCorporateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const data = corporateFormData;
    if (!data.companyName.trim()) errors.companyName = "Company name is required";
    if (!data.ssmRegistrationNo.trim()) errors.ssmRegistrationNo = "SSM registration number is required";
    if (!data.businessAddress.trim()) errors.businessAddress = "Business address is required";
    if (!data.bumiStatus) errors.bumiStatus = "Taraf (Bumi status) is required for compliance";
    if (!data.companyPhone.trim()) errors.companyPhone = "Company phone is required";
    if (!data.companyEmail.trim()) errors.companyEmail = "Company email is required";
    if (!data.bankName) errors.bankName = "Bank is required";
    if (data.bankName === "OTHER" && !data.bankNameOther.trim()) {
      errors.bankNameOther = "Bank name is required";
    }
    if (!data.bankAccountNo.trim()) errors.bankAccountNo = "Account number is required";
    if (!Array.isArray(data.directors) || data.directors.length < 1) {
      errors.directors = "At least 1 director is required";
    } else if (data.directors.length > 10) {
      errors.directors = "Maximum 10 directors allowed";
    } else {
      data.directors.forEach((director, index) => {
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
    
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Please fill in all required fields");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (borrowerType === "INDIVIDUAL") {
      if (!validateIndividualForm()) return;
    } else {
      if (!validateCorporateForm()) return;
    }
    
    setSaving(true);
    try {
      let payload: Record<string, unknown>;

      if (borrowerType === "INDIVIDUAL") {
        const data = individualFormData;
        payload = {
          borrowerType: "INDIVIDUAL",
          name: data.name,
          icNumber: data.icNumber,
          documentType: data.documentType,
          phone: data.phone || undefined,
          email: data.email || undefined,
          address: data.address || undefined,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString() : undefined,
          gender: data.gender || undefined,
          race: data.race || undefined,
          educationLevel: data.educationLevel || undefined,
          occupation: data.occupation || undefined,
          employmentStatus: data.employmentStatus || undefined,
          bankName: data.bankName || undefined,
          bankNameOther: data.bankName === "OTHER" ? (data.bankNameOther || undefined) : undefined,
          bankAccountNo: data.bankAccountNo || undefined,
          emergencyContactName: data.emergencyContactName || undefined,
          emergencyContactPhone: data.emergencyContactPhone || undefined,
          emergencyContactRelationship: data.emergencyContactRelationship || undefined,
          monthlyIncome: noMonthlyIncome ? 0 : (data.monthlyIncome.trim() !== "" ? parseFloat(data.monthlyIncome) : undefined),
        };
      } else {
        const data = corporateFormData;
        const primaryDirector = data.directors[0];
        payload = {
          borrowerType: "CORPORATE",
          name: primaryDirector?.name || data.authorizedRepName, // Rep name as primary name
          icNumber: data.ssmRegistrationNo, // SSM as primary identifier
          documentType: "IC", // Default for the authorized rep
          phone: data.companyPhone || undefined,
          email: data.companyEmail || undefined,
          address: data.businessAddress || undefined,
          companyName: data.companyName || undefined,
          ssmRegistrationNo: data.ssmRegistrationNo || undefined,
          businessAddress: data.businessAddress || undefined,
          bumiStatus: data.bumiStatus || undefined,
          authorizedRepName: primaryDirector?.name || data.authorizedRepName || undefined,
          authorizedRepIc: primaryDirector?.icNumber || data.authorizedRepIc || undefined,
          companyPhone: data.companyPhone || undefined,
          companyEmail: data.companyEmail || undefined,
          natureOfBusiness: data.natureOfBusiness || undefined,
          dateOfIncorporation: data.dateOfIncorporation ? new Date(data.dateOfIncorporation).toISOString() : undefined,
          paidUpCapital: data.paidUpCapital ? parseFloat(data.paidUpCapital) : undefined,
          numberOfEmployees: data.numberOfEmployees ? parseInt(data.numberOfEmployees) : undefined,
          bankName: data.bankName || undefined,
          bankNameOther: data.bankName === "OTHER" ? (data.bankNameOther || undefined) : undefined,
          bankAccountNo: data.bankAccountNo || undefined,
          directors: data.directors.map((director) => ({
            name: director.name.trim(),
            icNumber: director.icNumber.trim(),
            position: director.position.trim() || undefined,
          })),
        };
      }

      const res = await api.post<Borrower>("/api/borrowers", payload);
      if (res.success && res.data) {
        toast.success("Borrower created successfully");
        router.push(`/dashboard/borrowers/${res.data.id}`);
      } else {
        toast.error(res.error || "Failed to create borrower");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBorrowerTypeChange = (type: "INDIVIDUAL" | "CORPORATE") => {
    setBorrowerType(type);
    setValidationErrors({});
    setNoMonthlyIncome(false);
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
            <h1 className="text-2xl font-heading font-bold text-gradient">New Borrower</h1>
            <p className="text-muted-foreground">
              Create a new borrower record
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Creating..." : "Create Borrower"}
        </Button>
      </div>

      {/* Borrower Type Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Borrower Type</CardTitle>
          <CardDescription>Select the type of borrower you want to create</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button
              variant={borrowerType === "INDIVIDUAL" ? "default" : "outline"}
              className="flex-1 h-auto py-4"
              onClick={() => handleBorrowerTypeChange("INDIVIDUAL")}
            >
              <User className="h-5 w-5 mr-2" />
              <div className="text-left">
                <div className="font-medium">Individual</div>
                <div className={`text-xs ${borrowerType === "INDIVIDUAL" ? "opacity-80" : "text-muted-foreground"}`}>
                  Personal borrower with IC/Passport
                </div>
              </div>
            </Button>
            <Button
              variant={borrowerType === "CORPORATE" ? "default" : "outline"}
              className="flex-1 h-auto py-4"
              onClick={() => handleBorrowerTypeChange("CORPORATE")}
            >
              <Building2 className="h-5 w-5 mr-2" />
              <div className="text-left">
                <div className="font-medium">Corporate</div>
                <div className={`text-xs ${borrowerType === "CORPORATE" ? "opacity-80" : "text-muted-foreground"}`}>
                  Company/Business with SSM registration
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Form */}
        <div className="lg:col-span-2 space-y-6">
          {borrowerType === "INDIVIDUAL" ? (
            <>
              {/* Identity Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-muted-foreground" />
                    Identity Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Field
                      label="Name"
                      value={individualFormData.name}
                      onChange={(val) => {
                        setIndividualFormData((prev) => ({ ...prev, name: val }));
                        if (validationErrors.name) setValidationErrors((prev) => ({ ...prev, name: "" }));
                      }}
                      error={validationErrors.name}
                      placeholder="Full name"
                    />
                    <div>
                      <Label className="text-xs text-muted-foreground">Document Type *</Label>
                      <Select value={individualFormData.documentType} onValueChange={handleDocumentTypeChange}>
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
                      <Label className="text-xs text-muted-foreground">
                        {isIC ? "IC Number" : "Passport Number"} *
                      </Label>
                      <Input
                        value={individualFormData.icNumber}
                        onChange={(e) => handleIcNumberChange(e.target.value)}
                        placeholder={isIC ? "880101011234" : "A12345678"}
                        className={validationErrors.icNumber ? "border-red-500" : ""}
                      />
                      {validationErrors.icNumber && (
                        <p className="text-xs text-red-500 mt-1">{validationErrors.icNumber}</p>
                      )}
                      {isIC && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter 12 digits only. DOB and gender auto-extracted.
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Personal Information */}
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
                      value={individualFormData.dateOfBirth}
                      onChange={(val) => {
                        setIndividualFormData((prev) => ({ ...prev, dateOfBirth: val }));
                        if (validationErrors.dateOfBirth) setValidationErrors((prev) => ({ ...prev, dateOfBirth: "" }));
                      }}
                      type="date"
                      error={validationErrors.dateOfBirth}
                      disabled={isIC && !!extractDateFromIC(individualFormData.icNumber)}
                    />
                    <Field
                      label="Gender"
                      value={individualFormData.gender}
                      onChange={(val) => {
                        setIndividualFormData((prev) => ({ ...prev, gender: val }));
                        if (validationErrors.gender) setValidationErrors((prev) => ({ ...prev, gender: "" }));
                      }}
                      type="select"
                      options={GENDER_OPTIONS}
                      error={validationErrors.gender}
                      disabled={isIC && !!extractGenderFromIC(individualFormData.icNumber)}
                    />
                    <Field
                      label="Race"
                      value={individualFormData.race}
                      onChange={(val) => {
                        setIndividualFormData((prev) => ({ ...prev, race: val }));
                        if (validationErrors.race) setValidationErrors((prev) => ({ ...prev, race: "" }));
                      }}
                      type="select"
                      options={RACE_OPTIONS}
                      error={validationErrors.race}
                    />
                    <Field
                      label="Education"
                      value={individualFormData.educationLevel}
                      onChange={(val) => {
                        setIndividualFormData((prev) => ({ ...prev, educationLevel: val }));
                        if (validationErrors.educationLevel) setValidationErrors((prev) => ({ ...prev, educationLevel: "" }));
                      }}
                      type="select"
                      options={EDUCATION_OPTIONS}
                      error={validationErrors.educationLevel}
                    />
                    <Field
                      label="Occupation"
                      value={individualFormData.occupation}
                      onChange={(val) => {
                        setIndividualFormData((prev) => ({ ...prev, occupation: val }));
                        if (validationErrors.occupation) setValidationErrors((prev) => ({ ...prev, occupation: "" }));
                      }}
                      error={validationErrors.occupation}
                      placeholder="e.g., Accountant"
                    />
                    <Field
                      label="Employment Status"
                      value={individualFormData.employmentStatus}
                      onChange={(val) => {
                        setIndividualFormData((prev) => ({ ...prev, employmentStatus: val }));
                        if (validationErrors.employmentStatus) setValidationErrors((prev) => ({ ...prev, employmentStatus: "" }));
                      }}
                      type="select"
                      options={EMPLOYMENT_OPTIONS}
                      error={validationErrors.employmentStatus}
                    />
                    <div>
                      <Label className="text-xs text-muted-foreground">Monthly Income (RM) *</Label>
                      <NumericInput
                        mode="float"
                        value={noMonthlyIncome ? 0 : (individualFormData.monthlyIncome === "" ? "" : (parseFloat(individualFormData.monthlyIncome) || 0))}
                        onChange={(v) => {
                          setIndividualFormData((prev) => ({ ...prev, monthlyIncome: v === "" ? "" : String(v) }));
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
                          id="no-monthly-income"
                          checked={noMonthlyIncome}
                          onCheckedChange={(checked) => {
                            setNoMonthlyIncome(checked === true);
                            if (checked) {
                              setIndividualFormData((prev) => ({ ...prev, monthlyIncome: "0" }));
                              if (validationErrors.monthlyIncome) setValidationErrors((prev) => ({ ...prev, monthlyIncome: "" }));
                            } else {
                              setIndividualFormData((prev) => ({ ...prev, monthlyIncome: "" }));
                            }
                          }}
                        />
                        <label htmlFor="no-monthly-income" className="text-xs text-muted-foreground cursor-pointer">
                          No monthly income (Tiada Pendapatan)
                        </label>
                      </div>
                    </div>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field
                      label="Phone"
                      value={individualFormData.phone}
                      onChange={(val) => {
                        setIndividualFormData((prev) => ({ ...prev, phone: val }));
                        if (validationErrors.phone) setValidationErrors((prev) => ({ ...prev, phone: "" }));
                      }}
                      error={validationErrors.phone}
                      placeholder="+60123456789"
                    />
                    <Field
                      label="Email"
                      value={individualFormData.email}
                      onChange={(val) => {
                        setIndividualFormData((prev) => ({ ...prev, email: val }));
                        if (validationErrors.email) setValidationErrors((prev) => ({ ...prev, email: "" }));
                      }}
                      type="email"
                      error={validationErrors.email}
                      placeholder="email@example.com"
                    />
                    <Field
                      label="Address"
                      value={individualFormData.address}
                      onChange={(val) => {
                        setIndividualFormData((prev) => ({ ...prev, address: val }));
                        if (validationErrors.address) setValidationErrors((prev) => ({ ...prev, address: "" }));
                      }}
                      error={validationErrors.address}
                      placeholder="Full address"
                      className="md:col-span-2"
                    />
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
                  <div className="grid grid-cols-2 gap-4">
                    <Field
                      label="Bank"
                      value={individualFormData.bankName}
                      onChange={(val) => {
                        setIndividualFormData((prev) => ({ 
                          ...prev, 
                          bankName: val,
                          bankNameOther: val === "OTHER" ? prev.bankNameOther : ""
                        }));
                        if (validationErrors.bankName) setValidationErrors((prev) => ({ ...prev, bankName: "" }));
                      }}
                      type="select"
                      options={BANK_OPTIONS}
                      error={validationErrors.bankName}
                    />
                    {individualFormData.bankName === "OTHER" && (
                      <Field
                        label="Bank Name"
                        value={individualFormData.bankNameOther}
                        onChange={(val) => {
                          setIndividualFormData((prev) => ({ ...prev, bankNameOther: val }));
                          if (validationErrors.bankNameOther) setValidationErrors((prev) => ({ ...prev, bankNameOther: "" }));
                        }}
                        error={validationErrors.bankNameOther}
                        placeholder="Enter bank name"
                      />
                    )}
                    <Field
                      label="Account Number"
                      value={individualFormData.bankAccountNo}
                      onChange={(val) => {
                        setIndividualFormData((prev) => ({ ...prev, bankAccountNo: val }));
                        if (validationErrors.bankAccountNo) setValidationErrors((prev) => ({ ...prev, bankAccountNo: "" }));
                      }}
                      error={validationErrors.bankAccountNo}
                      placeholder="1234567890"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Emergency Contact */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    Emergency Contact
                  </CardTitle>
                  <CardDescription>Optional</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <Input
                        value={individualFormData.emergencyContactName}
                        onChange={(e) => setIndividualFormData((prev) => ({ ...prev, emergencyContactName: e.target.value }))}
                        placeholder="Contact name"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Phone</Label>
                      <Input
                        value={individualFormData.emergencyContactPhone}
                        onChange={(e) => setIndividualFormData((prev) => ({ ...prev, emergencyContactPhone: e.target.value }))}
                        placeholder="+60123456789"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Relationship</Label>
                      <Select 
                        value={individualFormData.emergencyContactRelationship} 
                        onValueChange={(val) => setIndividualFormData((prev) => ({ ...prev, emergencyContactRelationship: val }))}
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
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
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
                      value={corporateFormData.companyName}
                      onChange={(val) => {
                        setCorporateFormData((prev) => ({ ...prev, companyName: val }));
                        if (validationErrors.companyName) setValidationErrors((prev) => ({ ...prev, companyName: "" }));
                      }}
                      error={validationErrors.companyName}
                      placeholder="Company Sdn Bhd"
                    />
                    <Field
                      label="SSM Registration No"
                      value={corporateFormData.ssmRegistrationNo}
                      onChange={(val) => {
                        setCorporateFormData((prev) => ({ ...prev, ssmRegistrationNo: val, icNumber: val }));
                        if (validationErrors.ssmRegistrationNo) setValidationErrors((prev) => ({ ...prev, ssmRegistrationNo: "" }));
                      }}
                      error={validationErrors.ssmRegistrationNo}
                      placeholder="202001012345 (1234567-X)"
                    />
                    <Field
                      label="Taraf (Bumi Status)"
                      value={corporateFormData.bumiStatus}
                      onChange={(val) => {
                        setCorporateFormData((prev) => ({ ...prev, bumiStatus: val }));
                        if (validationErrors.bumiStatus) setValidationErrors((prev) => ({ ...prev, bumiStatus: "" }));
                      }}
                      type="select"
                      options={BUMI_STATUS_OPTIONS}
                      error={validationErrors.bumiStatus}
                    />
                    <Field
                      label="Nature of Business"
                      value={corporateFormData.natureOfBusiness}
                      onChange={(val) => setCorporateFormData((prev) => ({ ...prev, natureOfBusiness: val }))}
                      placeholder="e.g., Retail, Manufacturing"
                      required={false}
                    />
                    <Field
                      label="Date of Incorporation"
                      value={corporateFormData.dateOfIncorporation}
                      onChange={(val) => setCorporateFormData((prev) => ({ ...prev, dateOfIncorporation: val }))}
                      type="date"
                      required={false}
                    />
                    <Field
                      label="Business Address"
                      value={corporateFormData.businessAddress}
                      onChange={(val) => {
                        setCorporateFormData((prev) => ({ ...prev, businessAddress: val, address: val }));
                        if (validationErrors.businessAddress) setValidationErrors((prev) => ({ ...prev, businessAddress: "" }));
                      }}
                      error={validationErrors.businessAddress}
                      placeholder="Registered business address"
                      className="col-span-2"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Additional Details & Company Contact - Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Additional Company Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5 text-muted-foreground" />
                      Additional Company Details
                    </CardTitle>
                    <CardDescription>Optional</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <Field
                        label="Paid-up Capital (RM)"
                        value={corporateFormData.paidUpCapital}
                        onChange={(val) => setCorporateFormData((prev) => ({ ...prev, paidUpCapital: val }))}
                        type="number"
                        numberMode="float"
                        placeholder="100000"
                        required={false}
                      />
                      <Field
                        label="Number of Employees"
                        value={corporateFormData.numberOfEmployees}
                        onChange={(val) => setCorporateFormData((prev) => ({ ...prev, numberOfEmployees: val }))}
                        type="number"
                        placeholder="10"
                        required={false}
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
                    <div className="grid grid-cols-2 gap-4">
                      <Field
                        label="Company Phone"
                        value={corporateFormData.companyPhone}
                        onChange={(val) => {
                          setCorporateFormData((prev) => ({ ...prev, companyPhone: val, phone: val }));
                          if (validationErrors.companyPhone) setValidationErrors((prev) => ({ ...prev, companyPhone: "" }));
                        }}
                        error={validationErrors.companyPhone}
                        placeholder="+603-12345678"
                      />
                      <Field
                        label="Company Email"
                        value={corporateFormData.companyEmail}
                        onChange={(val) => {
                          setCorporateFormData((prev) => ({ ...prev, companyEmail: val, email: val }));
                          if (validationErrors.companyEmail) setValidationErrors((prev) => ({ ...prev, companyEmail: "" }));
                        }}
                        type="email"
                        error={validationErrors.companyEmail}
                        placeholder="info@company.com"
                      />
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
                  <CardDescription>
                    Add 1 to 10 directors. The first director will be used as authorized representative.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {corporateFormData.directors.map((director, index) => (
                      <div key={`director-${index}`} className="rounded-lg border p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">
                            Director {index + 1}{index === 0 ? " (Authorized Representative)" : ""}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (corporateFormData.directors.length <= 1) return;
                              setCorporateFormData((prev) => {
                                const nextDirectors = prev.directors.filter((_, i) => i !== index);
                                const firstDirector = nextDirectors[0];
                                return {
                                  ...prev,
                                  directors: nextDirectors,
                                  authorizedRepName: firstDirector?.name || "",
                                  authorizedRepIc: firstDirector?.icNumber || "",
                                  name: firstDirector?.name || "",
                                };
                              });
                            }}
                            disabled={corporateFormData.directors.length <= 1}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Field
                            label="Director Name"
                            value={director.name}
                            onChange={(val) => {
                              setCorporateFormData((prev) => {
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
                              if (validationErrors.directors) {
                                setValidationErrors((prev) => ({ ...prev, directors: "" }));
                              }
                            }}
                            error={validationErrors[`directorName_${index}`]}
                            placeholder="Full name"
                          />
                          <div>
                            <Field
                              label="Director IC Number"
                              value={director.icNumber}
                              onChange={(val) => {
                                const cleanVal = val.replace(/\D/g, "").substring(0, 12);
                                setCorporateFormData((prev) => {
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
                                if (validationErrors.directors) {
                                  setValidationErrors((prev) => ({ ...prev, directors: "" }));
                                }
                              }}
                              error={validationErrors[`directorIc_${index}`]}
                              placeholder="880101011234"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Enter 12 digits only (e.g., 880101011234)
                            </p>
                          </div>
                          <Field
                            label="Position"
                            value={director.position}
                            onChange={(val) => {
                              setCorporateFormData((prev) => {
                                const nextDirectors = [...prev.directors];
                                nextDirectors[index] = { ...nextDirectors[index], position: val };
                                return { ...prev, directors: nextDirectors };
                              });
                            }}
                            placeholder="e.g., Director"
                            required={false}
                          />
                        </div>
                      </div>
                    ))}

                    {validationErrors.directors && (
                      <p className="text-xs text-red-500">{validationErrors.directors}</p>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (corporateFormData.directors.length >= 10) return;
                        setCorporateFormData((prev) => ({
                          ...prev,
                          directors: [...prev.directors, { name: "", icNumber: "", position: "" }],
                        }));
                        if (validationErrors.directors) {
                          setValidationErrors((prev) => ({ ...prev, directors: "" }));
                        }
                      }}
                      disabled={corporateFormData.directors.length >= 10}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Director
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {corporateFormData.directors.length}/10 directors
                    </p>
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
                  <div className="grid grid-cols-2 gap-4">
                    <Field
                      label="Bank"
                      value={corporateFormData.bankName}
                      onChange={(val) => {
                        setCorporateFormData((prev) => ({ 
                          ...prev, 
                          bankName: val,
                          bankNameOther: val === "OTHER" ? prev.bankNameOther : ""
                        }));
                        if (validationErrors.bankName) setValidationErrors((prev) => ({ ...prev, bankName: "" }));
                      }}
                      type="select"
                      options={BANK_OPTIONS}
                      error={validationErrors.bankName}
                    />
                    {corporateFormData.bankName === "OTHER" && (
                      <Field
                        label="Bank Name"
                        value={corporateFormData.bankNameOther}
                        onChange={(val) => {
                          setCorporateFormData((prev) => ({ ...prev, bankNameOther: val }));
                          if (validationErrors.bankNameOther) setValidationErrors((prev) => ({ ...prev, bankNameOther: "" }));
                        }}
                        error={validationErrors.bankNameOther}
                        placeholder="Enter bank name"
                      />
                    )}
                    <Field
                      label="Account Number"
                      value={corporateFormData.bankAccountNo}
                      onChange={(val) => {
                        setCorporateFormData((prev) => ({ ...prev, bankAccountNo: val }));
                        if (validationErrors.bankAccountNo) setValidationErrors((prev) => ({ ...prev, bankAccountNo: "" }));
                      }}
                      error={validationErrors.bankAccountNo}
                      placeholder="1234567890"
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Right Column - Tips */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {borrowerType === "INDIVIDUAL" ? (
                <>
                  <p>
                    <strong className="text-foreground">IC Number:</strong> Enter 12 digits without dashes. Date of birth and gender will be automatically extracted.
                  </p>
                  <p>
                    <strong className="text-foreground">Passport:</strong> For non-Malaysian borrowers, select Passport and enter the details manually.
                  </p>
                  <p>
                    <strong className="text-foreground">Required Fields:</strong> All fields marked with * are mandatory for compliance reporting.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong className="text-foreground">SSM Number:</strong> Enter the company registration number exactly as shown on the SSM certificate.
                  </p>
                  <p>
                    <strong className="text-foreground">Authorized Representative:</strong> This person will be the main contact for the loan and must be authorized to sign on behalf of the company.
                  </p>
                  <p>
                    <strong className="text-foreground">Documents:</strong> You can upload identity documents after creating the borrower profile.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
