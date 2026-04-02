"use client";

import { useEffect, useRef, useState } from "react";
import { UserCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession, updateUser } from "@/lib/auth-client";
import { formatDate } from "@/lib/utils";
import { AccountSecurityCard } from "@/components/account-security-card";

interface ProfileDetails {
  createdAt: string | null;
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

export default function ProfilePage() {
  const [profileDetails, setProfileDetails] = useState<ProfileDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwordInfo, setPasswordInfo] = useState<PasswordInfo | null>(null);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const { data: session, isPending: sessionLoading, refetch: refetchSession } = useSession();
  const currentUser = session?.user;
  const hasLoadedOnce = useRef(false);

  const fetchProfileData = async () => {
    if (!session) return;
    if (!hasLoadedOnce.current) setLoading(true);

    try {
      const [meRes, passwordInfoRes, loginLogsRes] = await Promise.all([
        fetch("/api/proxy/auth/me", { credentials: "include" }),
        fetch("/api/proxy/auth/password-info", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/proxy/auth/login-history", { credentials: "include" }).then((r) => r.json()),
      ]);
      const meData = await meRes.json();

      if (meData.success && meData.data?.user) {
        setProfileDetails({
          createdAt: meData.data.user.createdAt ?? null,
        });
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
    hasLoadedOnce.current = true;
  };

  const userId = session?.user?.id;
  useEffect(() => {
    if (userId) {
      void fetchProfileData();
    } else {
      hasLoadedOnce.current = false;
    }
  }, [userId]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profileName.trim()) {
      toast.error("Name is required");
      return;
    }

    setSavingProfile(true);
    try {
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
      refetchSession();
      void fetchProfileData();
    } catch {
      toast.error("Failed to update profile");
    }
    setSavingProfile(false);
  };

  if (sessionLoading || loading) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-gradient">Profile</h1>
        <p className="text-muted">Manage your personal account information and security settings</p>
      </div>

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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  <Input value={currentUser?.email || ""} disabled className="bg-surface" />
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                  {profileDetails?.createdAt ? formatDate(profileDetails.createdAt) : "—"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <AccountSecurityCard
          passwordChangedAt={passwordInfo?.passwordChangedAt ?? null}
          loginLogs={loginLogs}
        />
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 shrink-0 rounded" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

      <div>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 shrink-0 rounded" />
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
            <Skeleton className="h-40 w-full rounded" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
