"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserCircle, Share2, Users, Shield, Eye, EyeOff, Building2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession, updateUser } from "@/lib/auth-client";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { CopyField } from "@/components/ui/copy-field";
import { Skeleton } from "@/components/ui/skeleton";
import { BANK_OPTIONS, getBankLabel } from "@/lib/bank-options";
import Link from "next/link";

interface CurrentMembership {
  referrer: { id: string; name: string | null; email: string } | null;
  createdAt: string | null;
  referralBankAccountName: string | null;
  referralBankName: string | null;
  referralBankNameOther: string | null;
  referralBankAccountNo: string | null;
}

interface ReferralData {
  id: string;
  referredUserEmail: string;
  referredUserName: string | null;
  referralCode: string;
  rewardAmount: number;
  isEligible: boolean;
  isPaid: boolean;
  eligibleAt: string;
  paidAt: string | null;
  createdAt: string;
}

interface ReferralsResponse {
  total: number;
  eligible: number;
  paid: number;
  unpaid: number;
  totalRewards: number;
  paidRewards: number;
  referrals: ReferralData[];
}

interface PasswordInfo {
  passwordChangedAt: string;
}

interface LoginLog {
  id: string;
  ipAddress: string | null;
  deviceType: string | null;
  createdAt: string;
}

interface TenantMembership {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  role: string;
  subscription?: {
    plan: string;
    status: string;
    currentPeriodEnd: string;
    gracePeriodEnd?: string;
  } | null;
  addOns?: { addOnType: string; status: string }[];
}

export default function ProfilePage() {
  const [currentMembership, setCurrentMembership] = useState<CurrentMembership | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingReferralCode, setLoadingReferralCode] = useState(false);
  const [referrals, setReferrals] = useState<ReferralsResponse | null>(null);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [savingReferralBank, setSavingReferralBank] = useState(false);
  const [editingReferralBank, setEditingReferralBank] = useState(false);
  const [referralBankAccountName, setReferralBankAccountName] = useState("");
  const [referralBankName, setReferralBankName] = useState("");
  const [referralBankNameOther, setReferralBankNameOther] = useState("");
  const [referralBankAccountNo, setReferralBankAccountNo] = useState("");
  const [passwordInfo, setPasswordInfo] = useState<PasswordInfo | null>(null);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [tenants, setTenants] = useState<TenantMembership[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  const router = useRouter();
  const { data: session, isPending: sessionLoading, refetch: refetchSession } = useSession();
  const currentUser = session?.user;

  const fetchData = async () => {
    if (!session) return;
    
    setLoading(true);
    try {
      const [meRes, passwordInfoRes, loginLogsRes] = await Promise.all([
        fetch("/api/proxy/auth/me", { credentials: "include" }),
        fetch("/api/proxy/auth/password-info", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/proxy/auth/login-history", { credentials: "include" }).then((r) => r.json()),
      ]);
      const meData = await meRes.json();

      if (meData.success && meData.data?.user) {
        const user = meData.data.user;
        setCurrentMembership({
          referrer: user.referrer ?? null,
          createdAt: user.createdAt ?? null,
          referralBankAccountName: user.referralBankAccountName ?? null,
          referralBankName: user.referralBankName ?? null,
          referralBankNameOther: user.referralBankNameOther ?? null,
          referralBankAccountNo: user.referralBankAccountNo ?? null,
        });
        setReferralBankAccountName(
          (user.referralBankAccountName || "").trim() || (user.name || "").trim()
        );
        setReferralBankName(user.referralBankName || "");
        setReferralBankNameOther(user.referralBankNameOther || "");
        setReferralBankAccountNo(user.referralBankAccountNo || "");
      }
      if (passwordInfoRes.success && passwordInfoRes.data) {
        setPasswordInfo(passwordInfoRes.data);
      }
      if (loginLogsRes.success && loginLogsRes.data) {
        setLoginLogs(loginLogsRes.data);
      }
    } catch (error) {
      console.error("Failed to fetch profile data:", error);
    }
    setLoading(false);
  };

  const fetchReferralCode = async () => {
    if (!session) return;
    
    setLoadingReferralCode(true);
    try {
      const res = await fetch("/api/proxy/auth/referral-code", { credentials: "include" });
      const data = await res.json();
      
      if (data.success && data.data?.referralCode) {
        setReferralCode(data.data.referralCode);
      } else {
        toast.error("Failed to load referral code");
      }
    } catch (error) {
      console.error("Failed to fetch referral code:", error);
      toast.error("Failed to load referral code");
    }
    setLoadingReferralCode(false);
  };

  const fetchReferrals = async () => {
    if (!session) return;
    
    setLoadingReferrals(true);
    try {
      const res = await fetch("/api/proxy/referrals", { credentials: "include" });
      const data = await res.json();
      
      if (data.success && data.data) {
        setReferrals(data.data);
      } else {
        console.error("Failed to fetch referrals:", data);
      }
    } catch (error) {
      console.error("Failed to fetch referrals:", error);
    }
    setLoadingReferrals(false);
  };

  const fetchTenants = async () => {
    if (!session) return;
    setLoadingTenants(true);
    try {
      const res = await fetch("/api/proxy/auth/memberships", { credentials: "include" });
      const data = await res.json();
      if (data.success && data.data?.memberships) {
        setTenants(data.data.memberships);
      }
    } catch (error) {
      console.error("Failed to fetch tenants:", error);
    }
    setLoadingTenants(false);
  };

  useEffect(() => {
    if (session) {
      fetchData();
      fetchReferralCode();
      fetchReferrals();
      fetchTenants();
    }
  }, [session]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profileName.trim()) {
      toast.error("Name is required");
      return;
    }

    setSavingProfile(true);
    try {
      // Use Better Auth's updateUser to update the name
      // This ensures the session cache is updated properly
      const result = await updateUser({
        name: profileName.trim(),
      });

      if (result.error) {
        toast.error(result.error.message || "Failed to update profile");
        setSavingProfile(false);
        return;
      }

      toast.success("Profile updated successfully");
      setShowEditProfile(false);
      // Refetch session to get updated data
      refetchSession();
      fetchData();
    } catch (error) {
      toast.error("Failed to update profile");
    }
    setSavingProfile(false);
  };

  // Build referral link and share message (code is 6 alphanumeric, no prefix)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const displayCode = referralCode ?? null;
  const referralLink = referralCode ? `${appUrl}/signup?ref=${referralCode}` : null;

  const shareMessage = referralCode && referralLink
    ? `Hi! If you're signing up for TrueKredit, feel free to use my referral code 🤩. It helps track my invites on the platform.

Referral Code: ${referralCode}

Sign up here: ${referralLink}`
    : "";

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setChangingPassword(true);
    try {
      const response = await fetch("/api/proxy/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const res = await response.json();
      if (res.success) {
        toast.success("Password changed successfully. Please log in again.");
        setShowChangePassword(false);
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        router.push("/login");
      } else {
        toast.error(res.error || "Failed to change password");
      }
    } catch {
      toast.error("Failed to change password");
    }
    setChangingPassword(false);
  };

  const handleShare = async () => {
    if (!shareMessage) return;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "TrueKredit referral",
          text: shareMessage,
        });
        toast.success("Shared!");
      } else {
        await navigator.clipboard.writeText(shareMessage);
        toast.success("Message copied – share it with friends!");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(shareMessage);
          toast.success("Message copied – share it with friends!");
        } catch {
          toast.error("Failed to copy");
        }
      }
    }
  };

  const handleSaveReferralBank = async () => {
    const accountHolderName = referralBankAccountName.trim();
    const accountNo = referralBankAccountNo.replace(/\D/g, "");
    const bankNameOther = referralBankNameOther.trim();

    if (!accountHolderName) {
      toast.error("Account holder name is required");
      return;
    }
    if (!referralBankName) {
      toast.error("Bank is required");
      return;
    }
    if (referralBankName === "OTHER" && !bankNameOther) {
      toast.error("Please enter the bank name");
      return;
    }
    if (!/^\d{8,17}$/.test(accountNo)) {
      toast.error("Account number must be 8-17 digits");
      return;
    }

    setSavingReferralBank(true);
    try {
      const response = await fetch("/api/proxy/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          referralBankAccountName: accountHolderName,
          referralBankName,
          referralBankNameOther: referralBankName === "OTHER" ? bankNameOther : null,
          referralBankAccountNo: accountNo,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.error || "Failed to save referral payout bank details");
        return;
      }

      toast.success("Referral payout bank details saved");
      setEditingReferralBank(false);
      await fetchData();
    } catch (error) {
      toast.error("Failed to save referral payout bank details");
    } finally {
      setSavingReferralBank(false);
    }
  };

  if (sessionLoading || loading) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-gradient">Profile</h1>
        <p className="text-muted">Manage your personal account information and referral code</p>
      </div>

      {/* My Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserCircle className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="font-heading">My Profile</CardTitle>
                <CardDescription>Your personal account information</CardDescription>
              </div>
            </div>
            {!showEditProfile && (
              <Button
                variant="outline"
                onClick={() => {
                  setProfileName(currentUser?.name || "");
                  setShowEditProfile(true);
                }}
              >
                Edit Profile
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {showEditProfile ? (
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name *</label>
                  <Input
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Your name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    value={currentUser?.email || ""}
                    disabled
                    className="bg-surface"
                  />
                  <p className="text-xs text-muted">Email cannot be changed</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditProfile(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted">Name</p>
                <p className="font-medium">{currentUser?.name || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted">Email</p>
                <p className="font-medium">{currentUser?.email || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted">Member since</p>
                <p className="font-medium">
                  {currentMembership?.createdAt
                    ? formatDate(currentMembership.createdAt)
                    : "—"}
                </p>
              </div>
              {currentMembership?.referrer && (
                <div className="md:col-span-3">
                  <p className="text-sm text-muted">Referred by</p>
                  <p className="font-medium">
                    {currentMembership.referrer.name || currentMembership.referrer.email}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security + Your Tenants - 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Security */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="font-heading">Security</CardTitle>
                <CardDescription>Account security settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Change Password</p>
                <p className="text-sm text-muted">
                  Last changed: {passwordInfo?.passwordChangedAt
                    ? formatDate(passwordInfo.passwordChangedAt)
                    : "Never"}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowChangePassword(!showChangePassword)}
              >
                {showChangePassword ? "Cancel" : "Change Password"}
              </Button>
            </div>

            {showChangePassword && (
              <form onSubmit={handleChangePassword} className="p-4 border border-border rounded-lg space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Current Password *</label>
                  <div className="relative">
                    <Input
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">New Password *</label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted">
                    Min 8 characters, 1 uppercase, 1 lowercase, 1 number
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Confirm New Password *</label>
                  <Input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    minLength={8}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={changingPassword}>
                    {changingPassword ? "Changing..." : "Update Password"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowChangePassword(false);
                      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            <Separator />

            <div className="py-2">
              <p className="font-medium mb-3">Recent Login Activity</p>
              {loginLogs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loginLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <span title={formatDate(log.createdAt)}>
                            {formatRelativeTime(log.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.deviceType || "Unknown"}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {log.ipAddress || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted">No login history available</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

        {/* Your Tenants */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="font-heading">Your Tenants</CardTitle>
                  <CardDescription>Organizations you belong to with their plans and billing</CardDescription>
                </div>
              </div>
              <Button variant="default" size="sm" asChild>
                <Link href="/dashboard/onboarding">
                  <Plus className="h-4 w-4 mr-2" />
                  New Tenant
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingTenants ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tenants yet</p>
            ) : (
              <div className="space-y-4">
                {tenants.map((t) => (
                  <div
                    key={t.tenantId}
                    className="flex items-center justify-between gap-4 p-4 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 h-10 w-10 rounded-lg bg-surface border border-border flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold font-heading">{t.tenantName}</p>
                          <Badge variant="outline" className="text-xs">
                            {t.role}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[
                            `Plan: ${t.subscription?.plan ? t.subscription.plan.charAt(0).toUpperCase() + t.subscription.plan.slice(1) : "Free"}`,
                            t.addOns && t.addOns.length > 0
                              ? `Add-ons: ${t.addOns.filter((a) => a.status === "ACTIVE").map((a) => a.addOnType === "TRUESEND" ? "TrueSend" : a.addOnType === "TRUEIDENTITY" ? "TrueIdentity" : a.addOnType).join(", ")}`
                              : null,
                            t.subscription
                              ? t.subscription.status === "GRACE_PERIOD" && t.subscription.gracePeriodEnd
                                ? `Due ${formatDate(t.subscription.gracePeriodEnd)}`
                                : t.subscription.currentPeriodEnd
                                  ? `Renews ${formatDate(t.subscription.currentPeriodEnd)}`
                                  : null
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/proxy/auth/switch-tenant", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ tenantId: t.tenantId }),
                          });
                          const data = await res.json();
                          if (data.success) {
                            toast.success(`Switched to ${data.data.tenantName}`);
                            window.location.href = "/dashboard/billing";
                          } else {
                            toast.error(data.error || "Failed to switch tenant");
                          }
                        } catch {
                          toast.error("Failed to switch tenant");
                        }
                      }}
                    >
                      Billing
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Referrals - combined code + my referrals */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="font-heading">Referrals</CardTitle>
              <CardDescription>Share your code and track users you&apos;ve referred</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Referral code - copyable field */}
          <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 p-4">
            {loadingReferralCode ? (
              <Skeleton className="h-14 w-full rounded" />
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CopyField
                  label="Your referral code"
                  value={displayCode}
                  className="flex-1 min-w-0"
                  valueClassName="font-mono text-lg"
                  copyableStyle
                  toastMessage="Referral code copied to clipboard"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleShare}
                  disabled={!shareMessage}
                  className="shrink-0"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              </div>
            )}
          </div>

          {/* Referral payout bank account */}
          <div
            className={`rounded-lg border p-4 space-y-4 ${
              currentMembership?.referralBankAccountNo
                ? "bg-neutral-100 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700"
                : "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/60"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Bank account for referral payouts</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Provide your bank account details so we can send referral rewards to you when payouts are processed.
                  Account holder name must match your bank account name exactly.
                </p>
              </div>
              {currentMembership?.referralBankAccountNo && !editingReferralBank && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingReferralBank(true)}
                  className="shrink-0"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>

            {currentMembership?.referralBankAccountNo && !editingReferralBank ? (
              /* Read-only view when saved */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Account holder name</p>
                  <p className="font-medium">{currentMembership.referralBankAccountName || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bank</p>
                  <p className="font-medium">
                    {getBankLabel(currentMembership.referralBankName, currentMembership.referralBankNameOther)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Account number</p>
                  <p className="font-mono font-medium">{currentMembership.referralBankAccountNo}</p>
                </div>
              </div>
            ) : (
              /* Editable form */
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Account holder name *</label>
                    <Input
                      value={referralBankAccountName}
                      onChange={(e) => setReferralBankAccountName(e.target.value)}
                      placeholder="As per bank account"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bank *</label>
                    <Select
                      value={referralBankName}
                      onValueChange={(value) => {
                        setReferralBankName(value);
                        if (value !== "OTHER") setReferralBankNameOther("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select bank" />
                      </SelectTrigger>
                      <SelectContent>
                        {BANK_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {referralBankName === "OTHER" && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Bank name *</label>
                      <Input
                        value={referralBankNameOther}
                        onChange={(e) => setReferralBankNameOther(e.target.value)}
                        placeholder="Enter bank name"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Account number *</label>
                    <Input
                      value={referralBankAccountNo}
                      onChange={(e) => setReferralBankAccountNo(e.target.value.replace(/\D/g, "").slice(0, 17))}
                      placeholder="8-17 digits"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Current bank: {getBankLabel(referralBankName || currentMembership?.referralBankName || null, referralBankNameOther || currentMembership?.referralBankNameOther)}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={handleSaveReferralBank}
                      disabled={savingReferralBank}
                      className={
                        !currentMembership?.referralBankAccountNo
                          ? "bg-black hover:bg-black/90 text-white"
                          : undefined
                      }
                    >
                      {savingReferralBank ? "Saving..." : "Save payout bank details"}
                    </Button>
                    {currentMembership?.referralBankAccountNo && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditingReferralBank(false);
                          setReferralBankAccountName(
                            (currentMembership?.referralBankAccountName || "").trim() || (currentUser?.name || "").trim()
                          );
                          setReferralBankName(currentMembership?.referralBankName || "");
                          setReferralBankNameOther(currentMembership?.referralBankNameOther || "");
                          setReferralBankAccountNo(currentMembership?.referralBankAccountNo || "");
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {loadingReferrals ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-3">
                  <Skeleton className="h-20 w-full rounded-lg" />
                </div>
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
              </div>
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          ) : referrals ? (
            <>
              {/* Summary stats - sub-cards with hierarchy */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Primary: Total Rewards */}
                <div className="sm:col-span-3 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                    Total rewards
                  </p>
                  <p className="text-2xl font-heading font-bold tabular-nums">
                    {formatCurrency(referrals.totalRewards / 100)}
                  </p>
                </div>
                {/* Secondary: Count breakdown */}
                <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                    Total
                  </p>
                  <p className="text-xl font-heading font-bold tabular-nums">
                    {referrals.total}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">referrals</p>
                </div>
                <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                    Eligible
                  </p>
                  <p className="text-xl font-heading font-bold tabular-nums text-foreground">
                    {referrals.eligible}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">awaiting payout</p>
                </div>
                <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                    Paid
                  </p>
                  <p className="text-xl font-heading font-bold tabular-nums text-foreground">
                    {referrals.paid}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">payouts completed</p>
                </div>
              </div>

              {/* Referrals table */}
              {referrals.referrals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No referrals yet. Share your code to start earning rewards.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>User</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Reward</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {referrals.referrals.map((referral) => (
                        <TableRow key={referral.id} className="hover:bg-surface/50">
                          <TableCell className="font-medium">
                            {referral.referredUserName || referral.referredUserEmail}
                            {referral.referredUserName && (
                              <div className="text-xs text-muted-foreground">
                                {referral.referredUserEmail}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-sm">{referral.referralCode}</span>
                          </TableCell>
                          <TableCell className="font-heading tabular-nums">{formatCurrency(referral.rewardAmount / 100)}</TableCell>
                          <TableCell>
                            {referral.isPaid ? (
                              <Badge variant="info">Paid</Badge>
                            ) : (
                              <Badge variant="success">Eligible</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(referral.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Failed to load referrals</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-80 mt-2" />
      </div>

      {/* My Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-5 w-40" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-28" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security + Your Tenants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Security */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-9 w-32 rounded-md" />
            </div>
            <Separator />
            <div className="py-2 space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-full rounded" />
              <Skeleton className="h-10 w-full rounded" />
              <Skeleton className="h-10 w-full rounded" />
            </div>
          </CardContent>
        </Card>

        {/* Your Tenants */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 rounded shrink-0" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-4 w-56" />
                </div>
              </div>
              <Skeleton className="h-9 w-28 rounded-md shrink-0" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center gap-3 min-w-0">
                  <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                  <div className="space-y-2 min-w-0">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <Skeleton className="h-9 w-16 rounded-md shrink-0" />
              </div>
              <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center gap-3 min-w-0">
                  <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                  <div className="space-y-2 min-w-0">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
                <Skeleton className="h-9 w-16 rounded-md shrink-0" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referrals */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 p-4">
            <Skeleton className="h-14 w-full rounded" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-3 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 p-4">
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-8 w-28" />
            </div>
            <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 p-4">
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-6 w-8" />
            </div>
            <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 p-4">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-6 w-8" />
            </div>
            <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 p-4">
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-6 w-8" />
            </div>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex gap-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-4 w-12" />
            </div>
            <div className="divide-y divide-border">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 flex gap-4 items-center">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-16 rounded" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
