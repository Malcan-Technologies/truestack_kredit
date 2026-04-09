"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Search,
  KeyRound,
  RefreshCw,
  Plus,
  Ban,
  Server,
  LockKeyhole,
  RotateCcw,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import {
  getSigningProfile,
  saveSigningProfile,
  startStaffKyc,
  getStaffKycStatus,
  checkSigningHealth,
  getCertStatus,
  checkCertByIc,
  requestEnrollmentOtp,
  enrollCert,
  revokeCert,
  verifyCertPin,
  resetCertPin,
  getTenantSigners,
  checkStaffEmailChange,
  confirmStaffEmailChange,
  type StaffSigningProfile,
  type CertInfo,
  type TenantSigner,
} from "@/lib/admin-signing-client";
import {
  CERT_PIN_REGEX,
  filterCertPinInput,
} from "@/lib/cert-pin-validation";
import { formatDate } from "@/lib/utils";

/** Certificate lookup by Malaysian IC (MyKad): exactly 12 numeric digits */
const CERT_LOOKUP_IC_REGEX = /^\d{12}$/;

function filterCertLookupIcInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 12);
}

export default function SigningCertificatesPage() {
  const { data: authSession } = useSession();
  const currentUserId = authSession?.user?.id;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StaffSigningProfile | null>(null);
  const [gatewayOnline, setGatewayOnline] = useState<boolean | null>(null);

  // Tenant signers (main table)
  const [tenantSigners, setTenantSigners] = useState<TenantSigner[]>([]);

  // Certificate status for logged-in user
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null);

  // KYC state (for enrollment modal)
  const [kycComplete, setKycComplete] = useState(false);
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [kycResult, setKycResult] = useState<string | null>(null);

  // Certificate lookup
  const [lookupIc, setLookupIc] = useState("");
  const [lookupResult, setLookupResult] = useState<CertInfo | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  // ---- Modal states ----
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);

  // Profile form (inside modal)
  const [profileForm, setProfileForm] = useState({
    icNumber: "",
    fullName: "",
    email: "",
    phone: "",
    nationality: "MY",
    documentType: "MYKAD",
    designation: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Enrollment modal state
  const [enrollPin, setEnrollPin] = useState("");
  const [enrollPinConfirm, setEnrollPinConfirm] = useState("");
  const [enrollOtp, setEnrollOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [startingKyc, setStartingKyc] = useState(false);

  // Revoke modal state
  const [revokeReason, setRevokeReason] = useState("keyCompromise");
  const [revokePin, setRevokePin] = useState("");
  const [revoking, setRevoking] = useState(false);

  // Verify PIN modal state
  const [verifyPinDialogOpen, setVerifyPinDialogOpen] = useState(false);
  const [verifyPinValue, setVerifyPinValue] = useState("");
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [verifyPinResult, setVerifyPinResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Reset PIN modal state
  const [resetPinDialogOpen, setResetPinDialogOpen] = useState(false);
  const [resetCurrentPin, setResetCurrentPin] = useState("");
  const [resetNewPin, setResetNewPin] = useState("");
  const [resetNewPinConfirm, setResetNewPinConfirm] = useState("");
  const [resettingPin, setResettingPin] = useState(false);

  // Email change OTP dialog state
  const [emailOtpDialogOpen, setEmailOtpDialogOpen] = useState(false);
  const [emailOtpValue, setEmailOtpValue] = useState("");
  const [emailOtpBusy, setEmailOtpBusy] = useState(false);
  const [emailOtpError, setEmailOtpError] = useState<string | null>(null);
  const [pendingNewEmail, setPendingNewEmail] = useState<string | null>(null);

  const hasCert = certInfo?.certStatus === "Valid";
  const hasProfile = !!profile;

  // Find current user's row in the signers table
  const currentUserSigner = tenantSigners.find(
    (s) => s.userId === currentUserId,
  );
  const currentUserHasCert = currentUserSigner?.certStatus === "Valid";

  // ---- Data Loading ----
  const fetchSigners = useCallback(async () => {
    try {
      const res = await getTenantSigners();
      if (res.success) setTenantSigners(res.signers);
    } catch {
      // non-critical
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, healthRes] = await Promise.all([
        getSigningProfile(),
        checkSigningHealth(),
        fetchSigners(),
      ]);

      setGatewayOnline(healthRes.online);

      if (profileRes.profile) {
        setProfile(profileRes.profile);
        setProfileForm({
          icNumber: profileRes.profile.icNumber,
          fullName: profileRes.profile.fullName,
          email: profileRes.profile.email,
          phone: profileRes.profile.phone || "",
          nationality: profileRes.profile.nationality,
          documentType: profileRes.profile.documentType,
          designation: profileRes.profile.designation || "",
        });

        if (healthRes.online) {
          try {
            const certRes = await getCertStatus();
            setCertInfo(certRes.certInfo);

            if (certRes.certInfo?.certStatus !== "Valid") {
              const kycRes = await getStaffKycStatus();
              setKycComplete(kycRes.kycComplete);
              if (kycRes.latestSession) {
                setKycStatus(kycRes.latestSession.status);
                setKycResult(kycRes.latestSession.result || null);
                if (
                  kycRes.latestSession.status === "pending" &&
                  kycRes.latestSession.onboardingUrl
                ) {
                  setKycUrl(kycRes.latestSession.onboardingUrl);
                }
              }
            }
          } catch {
            // cert check failed
          }
        }
      }
    } catch (err) {
      console.error("Failed to load signing data:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchSigners]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---- Handlers ----

  const finishSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await saveSigningProfile(profileForm);
      if (res.success) {
        setProfile(res.profile);
        toast.success("Signing profile saved");
        setProfileDialogOpen(false);
        await loadData();
      }
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileForm.icNumber || !profileForm.fullName || !profileForm.email) {
      toast.error("IC Number, Full Name, and Email are required");
      return;
    }

    const emailChanged =
      profile && profileForm.email.trim().toLowerCase() !== profile.email.toLowerCase();

    if (emailChanged && hasCert) {
      setSavingProfile(true);
      try {
        const check = await checkStaffEmailChange(profileForm.email.trim());
        if (check.requiresOtp) {
          if (!check.otpSent) {
            toast.error(check.error || "Failed to send OTP");
            return;
          }
          setPendingNewEmail(profileForm.email.trim());
          setEmailOtpValue("");
          setEmailOtpError(null);
          setEmailOtpDialogOpen(true);
          return;
        }
      } catch {
        toast.error("Failed to check email change");
        return;
      } finally {
        setSavingProfile(false);
      }
    }

    await finishSaveProfile();
  };

  const handleConfirmEmailOtp = async () => {
    if (!pendingNewEmail || !emailOtpValue.trim()) return;
    setEmailOtpBusy(true);
    setEmailOtpError(null);
    try {
      const res = await confirmStaffEmailChange(pendingNewEmail, emailOtpValue.trim());
      if (res.success) {
        toast.success("Email updated in signing certificate");
        setEmailOtpDialogOpen(false);
        setPendingNewEmail(null);
        await finishSaveProfile();
      } else {
        setEmailOtpError(res.error || "OTP verification failed");
      }
    } catch {
      setEmailOtpError("Failed to confirm email change");
    } finally {
      setEmailOtpBusy(false);
    }
  };

  const handleResendEmailOtp = async () => {
    if (!pendingNewEmail) return;
    setEmailOtpBusy(true);
    setEmailOtpError(null);
    try {
      const check = await checkStaffEmailChange(pendingNewEmail);
      if (check.otpSent) {
        toast.success("OTP resent to " + pendingNewEmail);
      } else {
        setEmailOtpError(check.error || "Failed to resend OTP");
      }
    } catch {
      setEmailOtpError("Failed to resend OTP");
    } finally {
      setEmailOtpBusy(false);
    }
  };

  const handleCheckCert = async () => {
    try {
      const res = await getCertStatus();
      setCertInfo(res.certInfo);
      if (res.certInfo?.certStatus === "Valid") {
        toast.success("Valid certificate found!");
      } else {
        const kycRes = await getStaffKycStatus();
        setKycComplete(kycRes.kycComplete);
        if (kycRes.latestSession) {
          setKycStatus(kycRes.latestSession.status);
          setKycResult(kycRes.latestSession.result || null);
          if (
            kycRes.latestSession.status === "pending" &&
            kycRes.latestSession.onboardingUrl
          ) {
            setKycUrl(kycRes.latestSession.onboardingUrl);
          }
        }
      }
    } catch {
      toast.error("Failed to check certificate");
    }
  };

  const handleStartKyc = async () => {
    setStartingKyc(true);
    try {
      const res = await startStaffKyc();
      if (res.success && res.onboardingUrl) {
        setKycUrl(res.onboardingUrl);
        setKycStatus("pending");
        window.open(res.onboardingUrl, "_blank");
      } else {
        toast.error(res.error || "Failed to start KYC");
      }
    } catch {
      toast.error("Failed to start KYC session");
    } finally {
      setStartingKyc(false);
    }
  };

  const handleRefreshKycStatus = async () => {
    const res = await getStaffKycStatus();
    setKycComplete(res.kycComplete);
    if (res.latestSession) {
      setKycStatus(res.latestSession.status);
      setKycResult(res.latestSession.result || null);
    }
    if (res.kycComplete) {
      toast.success("KYC verification complete!");
    }
  };

  const handleRequestOtp = async () => {
    setSendingOtp(true);
    try {
      const res = await requestEnrollmentOtp();
      if (res.success) {
        setOtpSent(true);
        toast.success("OTP sent to your email");
      } else {
        toast.error(res.statusMsg || "Failed to send OTP");
      }
    } catch {
      toast.error("Failed to request OTP");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleEnroll = async () => {
    if (!CERT_PIN_REGEX.test(enrollPin)) {
      toast.error("PIN must be exactly 8 digits (numbers only)");
      return;
    }
    if (enrollPin !== enrollPinConfirm) {
      toast.error("PINs do not match");
      return;
    }
    if (!enrollOtp) {
      toast.error("Please enter the OTP from your email");
      return;
    }
    setEnrolling(true);
    try {
      const res = await enrollCert(enrollPin, enrollOtp);
      if (res.success) {
        toast.success("Certificate enrolled successfully!");
        resetEnrollForm();
        setEnrollDialogOpen(false);
        await loadData();
      } else {
        toast.error(
          res.errorDescription || res.statusMsg || "Enrollment failed",
        );
      }
    } catch {
      toast.error("Enrollment failed");
    } finally {
      setEnrolling(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokePin || !certInfo?.certSerialNo) return;
    if (!CERT_PIN_REGEX.test(revokePin)) {
      toast.error("PIN must be exactly 8 digits (numbers only)");
      return;
    }
    setRevoking(true);
    try {
      const res = await revokeCert(
        certInfo.certSerialNo,
        revokeReason,
        revokePin,
      );
      if (res.success) {
        toast.success("Certificate revoked");
        setRevokePin("");
        setRevokeReason("keyCompromise");
        setRevokeDialogOpen(false);
        await loadData();
      } else {
        toast.error(
          res.errorDescription || res.statusMsg || "Revocation failed",
        );
      }
    } catch {
      toast.error("Revocation failed");
    } finally {
      setRevoking(false);
    }
  };

  const handleLookup = async () => {
    if (!CERT_LOOKUP_IC_REGEX.test(lookupIc)) {
      toast.error("IC number must be exactly 12 digits (numbers only)");
      return;
    }
    setLookingUp(true);
    try {
      const res = await checkCertByIc(lookupIc);
      setLookupResult(res.certInfo);
    } catch {
      toast.error("Lookup failed");
    } finally {
      setLookingUp(false);
    }
  };

  const handleVerifyPin = async () => {
    if (!verifyPinValue) return;
    if (!CERT_PIN_REGEX.test(verifyPinValue)) {
      toast.error("PIN must be exactly 8 digits (numbers only)");
      return;
    }
    setVerifyingPin(true);
    setVerifyPinResult(null);
    try {
      const res = await verifyCertPin(verifyPinValue);
      if (res.success && res.certPinStatus === "Valid") {
        setVerifyPinResult({ success: true, message: "PIN is correct" });
      } else {
        setVerifyPinResult({
          success: false,
          message:
            res.errorDescription || res.statusMsg || "PIN verification failed",
        });
      }
    } catch {
      setVerifyPinResult({ success: false, message: "PIN verification failed" });
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleResetPin = async () => {
    if (!resetCurrentPin || !resetNewPin) return;
    if (!CERT_PIN_REGEX.test(resetCurrentPin)) {
      toast.error("Current PIN must be exactly 8 digits (numbers only)");
      return;
    }
    if (!CERT_PIN_REGEX.test(resetNewPin)) {
      toast.error("New PIN must be exactly 8 digits (numbers only)");
      return;
    }
    if (resetNewPin !== resetNewPinConfirm) {
      toast.error("New PINs do not match");
      return;
    }
    setResettingPin(true);
    try {
      const res = await resetCertPin(resetCurrentPin, resetNewPin);
      if (res.success) {
        toast.success("PIN reset successfully");
        setResetCurrentPin("");
        setResetNewPin("");
        setResetNewPinConfirm("");
        setResetPinDialogOpen(false);
      } else {
        toast.error(
          res.errorDescription || res.statusMsg || "PIN reset failed",
        );
      }
    } catch {
      toast.error("PIN reset failed");
    } finally {
      setResettingPin(false);
    }
  };

  const openProfileDialog = (editing: boolean) => {
    if (!editing) {
      setProfileForm({
        icNumber: "",
        fullName: "",
        email: "",
        phone: "",
        nationality: "MY",
        documentType: "MYKAD",
        designation: "",
      });
    }
    setProfileDialogOpen(true);
  };

  const openEnrollDialog = async () => {
    resetEnrollForm();
    setEnrollDialogOpen(true);
    if (!certInfo) await handleCheckCert();
  };

  const resetEnrollForm = () => {
    setEnrollPin("");
    setEnrollPinConfirm("");
    setEnrollOtp("");
    setOtpSent(false);
  };

  const certStatusBadge = (status: string | undefined | null) => {
    if (status === "Valid")
      return (
        <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Valid
        </Badge>
      );
    if (status === "Revoked")
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Revoked
        </Badge>
      );
    return (
      <Badge variant="secondary">
        <AlertTriangle className="h-3 w-3 mr-1" />
        {status || "None"}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">
            Signing certificates
          </h1>
          <p className="text-muted text-sm mt-1">
            Manage digital signing certificates for internal staff. All signers
            need a valid certificate to sign loan agreements.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadData()}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Server Status */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">On-prem signing server</p>
                <p className="text-xs text-muted-foreground">
                  Signing gateway and certificate services
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {loading ? (
                <Skeleton className="h-6 w-24 rounded-full" />
              ) : gatewayOnline === null ? (
                <Badge variant="secondary">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Checking…
                </Badge>
              ) : gatewayOnline ? (
                <Badge className="bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/15">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Online
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Offline
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Internal Signers Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Internal signers</CardTitle>
              <CardDescription>
                Staff members with signing profiles in your organisation
              </CardDescription>
            </div>
            {!loading && !hasProfile && (
              <Button size="sm" onClick={() => openProfileDialog(false)}>
                <Plus className="h-4 w-4 mr-1" />
                Add my profile
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <TableSkeleton
              headers={[
                "Name",
                "IC Number",
                "Designation",
                "Certificate",
                "Valid Until",
                "KYC",
                "Actions",
              ]}
              columns={[
                { width: "w-36", subLine: true },
                { width: "w-28" },
                { width: "w-24" },
                { badge: true, width: "w-16" },
                { width: "w-24" },
                { circle: true },
                { width: "w-28" },
              ]}
            />
          ) : tenantSigners.length === 0 && !hasProfile ? (
            <div className="text-center py-8">
              <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                No signing profiles yet. Add yours to get started.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openProfileDialog(false)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create signing profile
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>IC Number</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>KYC</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantSigners.map((s) => {
                  const isMe = s.userId === currentUserId;
                  const isValid = s.certStatus === "Valid";
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium">{s.fullName}</div>
                            <div className="text-xs text-muted-foreground">
                              {s.email}
                            </div>
                          </div>
                          {isMe && (
                            <Badge
                              variant="outline"
                              className="text-xs px-1.5 py-0"
                            >
                              You
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.icNumber}
                      </TableCell>
                      <TableCell>{s.designation || "—"}</TableCell>
                      <TableCell>{certStatusBadge(s.certStatus)}</TableCell>
                      <TableCell className="text-sm">
                        {s.certValidTo
                          ? formatDate(s.certValidTo)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {s.kycComplete ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isMe && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openProfileDialog(true)}
                            >
                              Edit
                            </Button>
                            {isValid ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setVerifyPinValue("");
                                    setVerifyPinResult(null);
                                    setVerifyPinDialogOpen(true);
                                  }}
                                  disabled={!gatewayOnline}
                                >
                                  <LockKeyhole className="h-3 w-3 mr-1" />
                                  Verify PIN
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setResetCurrentPin("");
                                    setResetNewPin("");
                                    setResetNewPinConfirm("");
                                    setResetPinDialogOpen(true);
                                  }}
                                  disabled={!gatewayOnline}
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Reset PIN
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                  onClick={() => {
                                    setRevokePin("");
                                    setRevokeReason("keyCompromise");
                                    setRevokeDialogOpen(true);
                                  }}
                                >
                                  <Ban className="h-3 w-3 mr-1" />
                                  Revoke
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => void openEnrollDialog()}
                                disabled={!gatewayOnline}
                              >
                                <KeyRound className="h-3 w-3 mr-1" />
                                Enroll
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Certificate Lookup */}
      <Card>
        <CardHeader>
          <CardTitle>Certificate lookup</CardTitle>
          <CardDescription>
            Check any user&apos;s certificate status by IC number (12 digits)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex gap-2">
              <Skeleton className="h-10 max-w-[250px] flex-1 rounded-md" />
              <Skeleton className="h-10 w-24 rounded-md" />
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={lookupIc}
                onChange={(e) =>
                  setLookupIc(filterCertLookupIcInput(e.target.value))
                }
                inputMode="numeric"
                maxLength={12}
                pattern="\d{12}"
                placeholder="12-digit IC number"
                className="max-w-[250px] font-mono"
                onKeyDown={(e) => e.key === "Enter" && void handleLookup()}
              />
              <Button
                variant="outline"
                onClick={() => void handleLookup()}
                disabled={lookingUp || !CERT_LOOKUP_IC_REGEX.test(lookupIc)}
              >
                {lookingUp ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Check
              </Button>
            </div>
          )}

          {!loading && lookupResult && (
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                {certStatusBadge(lookupResult.certStatus)}
              </div>
              {lookupResult.certSerialNo && (
                <p className="text-muted-foreground">
                  Serial: {lookupResult.certSerialNo}
                </p>
              )}
              {lookupResult.certValidFrom && (
                <p className="text-muted-foreground">
                  Valid:{" "}
                  {formatDate(lookupResult.certValidFrom)} —{" "}
                  {lookupResult.certValidTo
                    ? formatDate(lookupResult.certValidTo)
                    : "N/A"}
                </p>
              )}
              {lookupResult.errorDescription && (
                <p className="text-muted-foreground">
                  {lookupResult.errorDescription}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- MODALS ---- */}

      {/* Add / Edit Profile Modal */}
      <Dialog
        open={profileDialogOpen}
        onOpenChange={(o) => !o && setProfileDialogOpen(false)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {hasProfile ? "Edit signing profile" : "Create signing profile"}
            </DialogTitle>
            <DialogDescription>
              {hasCert
                ? "Identity fields (IC, name, document type) are locked while your certificate is active. Email changes require OTP verification."
                : "Enter your identity details for certificate management. These details are submitted to the Certificate Authority."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>IC Number *</Label>
                <Input
                  value={profileForm.icNumber}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, icNumber: e.target.value })
                  }
                  placeholder="e.g. 891114075601"
                  disabled={hasCert}
                />
              </div>
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  value={profileForm.fullName}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, fullName: e.target.value })
                  }
                  disabled={hasCert}
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, email: e.target.value })
                  }
                />
                {hasCert && (
                  <p className="text-xs text-muted-foreground">
                    Changing your email will require OTP verification to the new
                    address.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={profileForm.phone}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, phone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Designation</Label>
                <Input
                  value={profileForm.designation}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      designation: e.target.value,
                    })
                  }
                  placeholder="e.g. Director, Authorised Signatory"
                />
              </div>
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select
                  value={profileForm.documentType}
                  onValueChange={(v) =>
                    setProfileForm({ ...profileForm, documentType: v })
                  }
                  disabled={hasCert}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MYKAD">MyKad</SelectItem>
                    <SelectItem value="PASSPORT">Passport</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProfileDialogOpen(false)}
              disabled={savingProfile}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {hasProfile ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll Certificate Modal */}
      <Dialog
        open={enrollDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setEnrollDialogOpen(false);
            resetEnrollForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enroll certificate</DialogTitle>
            <DialogDescription>
              Complete identity verification and set a PIN to receive your
              digital signing certificate.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Step 1: KYC */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  1
                </span>
                <h4 className="font-medium">Identity Verification (KYC)</h4>
              </div>

              {kycComplete ? (
                <div className="flex items-center gap-2 text-green-500 pl-8">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">KYC Verified</span>
                </div>
              ) : kycStatus === "pending" && kycUrl ? (
                <div className="space-y-2 pl-8">
                  <div className="flex items-center gap-2 text-yellow-500">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">
                      KYC session in progress. Complete verification in the
                      opened window.
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={kycUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4 mr-1" /> Open KYC
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefreshKycStatus}
                    >
                      Refresh Status
                    </Button>
                  </div>
                </div>
              ) : kycStatus === "completed" && kycResult === "rejected" ? (
                <div className="space-y-2 pl-8">
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="h-4 w-4" />
                    <span className="text-sm">
                      KYC was rejected. Please try again.
                    </span>
                  </div>
                  <Button
                    onClick={handleStartKyc}
                    disabled={startingKyc}
                    size="sm"
                  >
                    {startingKyc && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Retry KYC
                  </Button>
                </div>
              ) : kycStatus === "processing" ? (
                <div className="space-y-2 pl-8">
                  <div className="flex items-center gap-2 text-yellow-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">
                      KYC is being processed. This may take a few minutes.
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshKycStatus}
                  >
                    Refresh Status
                  </Button>
                </div>
              ) : (
                <div className="pl-8">
                  <Button
                    onClick={handleStartKyc}
                    disabled={startingKyc}
                    size="sm"
                  >
                    {startingKyc && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Start KYC Verification
                  </Button>
                </div>
              )}
            </div>

            {/* Step 2: PIN & OTP */}
            <div
              className={`space-y-3 ${!kycComplete ? "opacity-50 pointer-events-none" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  2
                </span>
                <h4 className="font-medium">Set PIN &amp; Verify Email</h4>
              </div>

              <div className="space-y-4 pl-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Choose PIN (8 digits, numbers only)</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      value={enrollPin}
                      onChange={(e) =>
                        setEnrollPin(filterCertPinInput(e.target.value))
                      }
                      maxLength={8}
                      pattern="\d{8}"
                      placeholder="8-digit PIN"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm PIN</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      value={enrollPinConfirm}
                      onChange={(e) =>
                        setEnrollPinConfirm(filterCertPinInput(e.target.value))
                      }
                      maxLength={8}
                      pattern="\d{8}"
                      placeholder="Re-enter 8-digit PIN"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Email OTP</Label>
                  <div className="flex gap-2">
                    <Input
                      value={enrollOtp}
                      onChange={(e) => setEnrollOtp(e.target.value)}
                      placeholder="Enter OTP from email"
                      className="max-w-[200px]"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRequestOtp}
                      disabled={sendingOtp || otpSent}
                    >
                      {sendingOtp && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {otpSent ? "OTP Sent" : "Send OTP"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEnrollDialogOpen(false);
                resetEnrollForm();
              }}
              disabled={enrolling}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEnroll}
              disabled={
                enrolling ||
                !CERT_PIN_REGEX.test(enrollPin) ||
                enrollPin !== enrollPinConfirm ||
                !enrollOtp ||
                !kycComplete
              }
            >
              {enrolling && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              <KeyRound className="h-4 w-4 mr-2" />
              Enroll Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Certificate Modal */}
      <Dialog
        open={revokeDialogOpen}
        onOpenChange={(o) => !o && setRevokeDialogOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke certificate</DialogTitle>
            <DialogDescription>
              This action is irreversible. You will need to enroll a new
              certificate to sign documents afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {certInfo?.certSerialNo && (
              <p className="text-sm text-muted-foreground">
                Serial: {certInfo.certSerialNo}
              </p>
            )}
            <div className="space-y-2">
              <Label>Revocation Reason</Label>
              <Select value={revokeReason} onValueChange={setRevokeReason}>
                <SelectTrigger className="max-w-[300px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyCompromise">Key Compromise</SelectItem>
                  <SelectItem value="affiliationChanged">
                    Affiliation Changed
                  </SelectItem>
                  <SelectItem value="superseded">Superseded</SelectItem>
                  <SelectItem value="cessationOfOperation">
                    Cessation of Operation
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Your PIN (8 digits)</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={revokePin}
                onChange={(e) =>
                  setRevokePin(filterCertPinInput(e.target.value))
                }
                maxLength={8}
                pattern="\d{8}"
                placeholder="8-digit certificate PIN"
                className="max-w-[250px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeDialogOpen(false)}
              disabled={revoking}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoking || !CERT_PIN_REGEX.test(revokePin)}
            >
              {revoking && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Revoke Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Verify PIN Modal */}
      <Dialog
        open={verifyPinDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setVerifyPinDialogOpen(false);
            setVerifyPinValue("");
            setVerifyPinResult(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Verify certificate PIN</DialogTitle>
            <DialogDescription>
              Test your certificate PIN to confirm it is working correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Your PIN (8 digits)</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={verifyPinValue}
                onChange={(e) => {
                  setVerifyPinValue(filterCertPinInput(e.target.value));
                  setVerifyPinResult(null);
                }}
                maxLength={8}
                pattern="\d{8}"
                placeholder="8-digit certificate PIN"
                onKeyDown={(e) => e.key === "Enter" && handleVerifyPin()}
              />
            </div>
            {verifyPinResult && (
              <div
                className={`flex items-center gap-2 text-sm ${
                  verifyPinResult.success ? "text-green-500" : "text-destructive"
                }`}
              >
                {verifyPinResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {verifyPinResult.message}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVerifyPinDialogOpen(false);
                setVerifyPinValue("");
                setVerifyPinResult(null);
              }}
            >
              Close
            </Button>
            <Button
              onClick={handleVerifyPin}
              disabled={verifyingPin || !CERT_PIN_REGEX.test(verifyPinValue)}
            >
              {verifyingPin && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              <LockKeyhole className="h-4 w-4 mr-2" />
              Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset PIN Modal */}
      <Dialog
        open={resetPinDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setResetPinDialogOpen(false);
            setResetCurrentPin("");
            setResetNewPin("");
            setResetNewPinConfirm("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset certificate PIN</DialogTitle>
            <DialogDescription>
              Change your certificate PIN. You will need your current PIN to
              verify your identity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reset-cert-pin-current">Current PIN (8 digits)</Label>
              <Input
                id="reset-cert-pin-current"
                type="text"
                name="reset-cert-pin-current"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={resetCurrentPin}
                onChange={(e) =>
                  setResetCurrentPin(filterCertPinInput(e.target.value))
                }
                maxLength={8}
                pattern="\d{8}"
                placeholder="8-digit current PIN"
                className="[-webkit-text-security:disc]"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-cert-pin-new">New PIN (8 digits, numbers only)</Label>
              <Input
                id="reset-cert-pin-new"
                type="text"
                name="reset-cert-pin-new"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={resetNewPin}
                onChange={(e) =>
                  setResetNewPin(filterCertPinInput(e.target.value))
                }
                maxLength={8}
                pattern="\d{8}"
                placeholder="8-digit PIN"
                className="[-webkit-text-security:disc]"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-cert-pin-confirm">Confirm New PIN</Label>
              <Input
                id="reset-cert-pin-confirm"
                type="text"
                name="reset-cert-pin-confirm"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={resetNewPinConfirm}
                onChange={(e) =>
                  setResetNewPinConfirm(filterCertPinInput(e.target.value))
                }
                maxLength={8}
                pattern="\d{8}"
                placeholder="Re-enter 8-digit PIN"
                className="[-webkit-text-security:disc]"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetPinDialogOpen(false);
                setResetCurrentPin("");
                setResetNewPin("");
                setResetNewPinConfirm("");
              }}
              disabled={resettingPin}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetPin}
              disabled={
                resettingPin ||
                !CERT_PIN_REGEX.test(resetCurrentPin) ||
                !CERT_PIN_REGEX.test(resetNewPin) ||
                resetNewPin !== resetNewPinConfirm
              }
            >
              {resettingPin && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Change OTP Modal */}
      <Dialog
        open={emailOtpDialogOpen}
        onOpenChange={(open) => {
          if (!open && !emailOtpBusy) {
            setEmailOtpDialogOpen(false);
            setPendingNewEmail(null);
          }
        }}
      >
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
                {pendingNewEmail}
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
              <Label htmlFor="staff-email-change-otp">Email OTP</Label>
              <Input
                id="staff-email-change-otp"
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
