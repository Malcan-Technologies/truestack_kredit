"use client";

import { useEffect, useState } from "react";
import { UserCircle, Gift, Copy, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession, updateUser } from "@/lib/auth-client";
import { formatCurrency, formatDate } from "@/lib/utils";

interface CurrentMembership {
  role: string;
  referrer: { id: string; name: string | null; email: string } | null;
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

  const { data: session, isPending: sessionLoading, refetch: refetchSession } = useSession();
  const currentUser = session?.user;
  const currentRole = currentMembership?.role || "STAFF";

  const fetchData = async () => {
    if (!session) return;
    
    setLoading(true);
    try {
      // Fetch current membership role
      const meRes = await fetch("/api/proxy/auth/me", { credentials: "include" });
      const meData = await meRes.json();
      
      if (meData.success && meData.data?.user) {
        setCurrentMembership({
          role: meData.data.user.role,
          referrer: meData.data.user.referrer ?? null,
        });
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

  useEffect(() => {
    if (session) {
      fetchData();
      fetchReferralCode();
      fetchReferrals();
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

  const handleCopyCode = async () => {
    if (!displayCode) return;
    try {
      await navigator.clipboard.writeText(displayCode);
      toast.success("Referral code copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
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

  if (sessionLoading || loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="space-y-6">
          <div className="h-8 w-48 bg-surface rounded animate-pulse" />
          <div className="h-64 bg-surface rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your personal account information and referral code</p>
      </div>

      {/* My Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserCircle className="h-5 w-5 text-accent" />
              <div>
                <CardTitle>My Profile</CardTitle>
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
                <p className="text-sm text-muted">Role</p>
                <Badge variant={currentRole === "OWNER" ? "default" : "outline"}>
                  {currentRole}
                </Badge>
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

      {/* Referral Code */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Gift className="h-5 w-5 text-accent" />
            <div>
              <CardTitle>Referral Code</CardTitle>
              <CardDescription>Share your referral code to invite others</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingReferralCode ? (
            <div className="space-y-4">
              <div className="h-16 bg-surface rounded animate-pulse" />
              <div className="h-16 bg-surface rounded animate-pulse" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Referral Code</p>
                  <p className="font-medium truncate" title={displayCode ?? ""}>
                    {displayCode ?? "—"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyCode}
                  disabled={!displayCode}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-muted-foreground flex-1 min-w-0">
                  Share your referral with a message
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleShare}
                  disabled={!shareMessage}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share as Link
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* My Referrals */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-accent" />
            <div>
              <CardTitle>My Referrals</CardTitle>
              <CardDescription>Track users you've referred and rewards</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingReferrals ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 bg-surface rounded animate-pulse" />
                ))}
              </div>
              <div className="h-64 bg-surface rounded animate-pulse" />
            </div>
          ) : referrals ? (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <p className="text-xs text-muted-foreground">Total Referrals</p>
                  <p className="text-2xl font-bold">{referrals.total}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Eligible</p>
                  <p className="text-2xl font-bold text-green-500">{referrals.eligible}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="text-2xl font-bold text-blue-500">{referrals.paid}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Rewards</p>
                  <p className="text-2xl font-bold">{formatCurrency(referrals.totalRewards / 100)}</p>
                </div>
              </div>

              {/* Referrals table */}
              {referrals.referrals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No referrals yet. Share your code to start earning rewards!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Code Used</TableHead>
                        <TableHead>Reward</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {referrals.referrals.map((referral) => (
                        <TableRow key={referral.id}>
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
                          <TableCell>{formatCurrency(referral.rewardAmount / 100)}</TableCell>
                          <TableCell>
                            {referral.isPaid ? (
                              <Badge variant="default" className="bg-blue-500 text-black">Paid</Badge>
                            ) : (
                              <Badge variant="default" className="bg-green-500 text-black">Eligible</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{formatDate(referral.createdAt)}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>Failed to load referrals</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
