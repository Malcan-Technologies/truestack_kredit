"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Building2, Pencil, User } from "lucide-react";
import {
  BorrowerDetailCard,
  type BorrowerDetailCardHandle,
} from "@borrower_pro/components/borrower-detail-card";
import { TruestackKycCard } from "@borrower_pro/components/truestack-kyc-card";
import { DigitalSigningComingSoonCard } from "@borrower_pro/components/digital-signing-coming-soon-card";
import { BorrowerDocumentsCard } from "@borrower_pro/components/borrower-documents-card";
import { RefreshButton } from "@borrower_pro/components/ui/refresh-button";
import { Button } from "@borrower_pro/components/ui/button";
import { Badge } from "@borrower_pro/components/ui/badge";
import { Skeleton } from "@borrower_pro/components/ui/skeleton";
import {
  fetchBorrowerMe,
  peekPendingAcceptInvitationPath,
  switchBorrowerProfile,
  BORROWER_PROFILE_SWITCHED_EVENT,
} from "@borrower_pro/lib/borrower-auth-client";
import { CompanyMembersCard } from "@borrower_pro/components/company-members-card";
import {
  fetchBorrower,
  type BorrowerDetail,
} from "@borrower_pro/lib/borrower-api-client";
import { formatICForDisplay } from "@borrower_pro/lib/borrower-form-display";

function profilePageHeaderFromBorrower(data: BorrowerDetail) {
  const isIndividual = data.borrowerType === "INDIVIDUAL";
  const title = isIndividual
    ? data.name?.trim() || "Borrower"
    : data.companyName?.trim() || data.name?.trim() || "Borrower";
  let documentLine: string;
  if (isIndividual) {
    const dt = data.documentType || "IC";
    const ic = data.icNumber?.trim() ?? "";
    documentLine = dt === "IC" ? formatICForDisplay(ic) : ic;
  } else {
    documentLine = `SSM: ${data.ssmRegistrationNo?.trim() || "—"}`;
  }
  return { title, isIndividual, documentLine };
}

function ProfilePageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-8 w-[min(100%,14rem)]" />
          <div className="flex items-center gap-2 flex-wrap">
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-4 w-40 max-w-full" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 sm:justify-end">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <Skeleton className="h-5 w-40" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="rounded-lg border border-border bg-card p-6 space-y-3">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="rounded-lg border border-border bg-card p-6 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function YourProfilePage() {
  const router = useRouter();
  const cardRef = useRef<BorrowerDetailCardHandle>(null);
  const [borrowerType, setBorrowerType] = useState<"INDIVIDUAL" | "CORPORATE" | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileEditing, setProfileEditing] = useState(false);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [profileHeader, setProfileHeader] = useState<ReturnType<
    typeof profilePageHeaderFromBorrower
  > | null>(null);

  const bumpDataRefresh = useCallback(() => {
    setDataRefreshKey((k) => k + 1);
  }, []);

  const handleToolbarRefresh = useCallback(async () => {
    await cardRef.current?.refresh();
    bumpDataRefresh();
  }, [bumpDataRefresh]);

  const loadSettings = async () => {
    let cancelled = false;
    setLoading(true);
    try {
      const meRes = await fetchBorrowerMe();
      if (!cancelled && meRes.success) {
        const { activeBorrowerId, profileCount, profiles } = meRes.data;
        if (profileCount === 0) {
          const pending = peekPendingAcceptInvitationPath();
          if (pending) {
            router.replace(pending);
            return;
          }
          router.replace("/onboarding");
          return;
        }
        // Auto-select first profile when none active (same as BorrowerSwitcher)
        let effectiveActiveId = activeBorrowerId;
        if (!effectiveActiveId && profiles.length > 0) {
          try {
            await switchBorrowerProfile(profiles[0].id);
            effectiveActiveId = profiles[0].id;
            router.refresh();
            // Brief delay so session update is visible to next request
            await new Promise((r) => setTimeout(r, 100));
          } catch {
            router.replace("/onboarding");
            return;
          }
        }
        if (!effectiveActiveId) {
          router.replace("/onboarding");
          return;
        }
        let borrowerRes: Awaited<ReturnType<typeof fetchBorrower>>;
        try {
          borrowerRes = await fetchBorrower();
        } catch {
          // Retry once if session may not have propagated yet after switch
          await new Promise((r) => setTimeout(r, 200));
          try {
            borrowerRes = await fetchBorrower();
          } catch {
            if (!cancelled) router.replace("/onboarding");
            return;
          }
        }
        if (!cancelled && borrowerRes.success) {
          setBorrowerType(
            borrowerRes.data.borrowerType as "INDIVIDUAL" | "CORPORATE"
          );
          setProfileHeader(profilePageHeaderFromBorrower(borrowerRes.data));
        }
      }
    } catch {
      if (!cancelled) router.replace("/onboarding");
    } finally {
      if (!cancelled) setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [router]);

  // Re-fetch when user switches borrower profile (e.g. Individual → Corporate)
  useEffect(() => {
    const handler = async () => {
      setLoading(true);
      try {
        const borrowerRes = await fetchBorrower();
        if (borrowerRes.success) {
          setBorrowerType(
            borrowerRes.data.borrowerType as "INDIVIDUAL" | "CORPORATE"
          );
          setProfileHeader(profilePageHeaderFromBorrower(borrowerRes.data));
        }
      } catch {
        // Session may still be propagating; retry once
        await new Promise((r) => setTimeout(r, 200));
        try {
          const borrowerRes = await fetchBorrower();
          if (borrowerRes.success) {
            setBorrowerType(
              borrowerRes.data.borrowerType as "INDIVIDUAL" | "CORPORATE"
            );
            setProfileHeader(profilePageHeaderFromBorrower(borrowerRes.data));
          }
        } catch {
          // Ignore
        }
      } finally {
        setLoading(false);
      }
    };
    window.addEventListener(BORROWER_PROFILE_SWITCHED_EVENT, handler);
    return () =>
      window.removeEventListener(BORROWER_PROFILE_SWITCHED_EVENT, handler);
  }, []);

  if (loading) {
    return <ProfilePageSkeleton />;
  }

  if (!borrowerType) {
    return (
      <div className="text-sm text-muted-foreground">Redirecting...</div>
    );
  }

  return (
    <div className="space-y-6">
      {!profileEditing && profileHeader ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-heading font-bold truncate">
              {profileHeader.title}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant={profileHeader.isIndividual ? "outline" : "secondary"}>
                {profileHeader.isIndividual ? (
                  <User className="h-3 w-3 mr-1" />
                ) : (
                  <Building2 className="h-3 w-3 mr-1" />
                )}
                {profileHeader.isIndividual ? "Individual" : "Corporate"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {profileHeader.documentLine}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0 sm:justify-end">
            <RefreshButton
              onRefresh={handleToolbarRefresh}
              showToast
              showLabel
              successMessage="Profile refreshed"
            />
            <Button onClick={() => cardRef.current?.startEdit()}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Profile
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Borrower details (matches admin borrowers [id] layout) */}
        <div className="lg:col-span-2 space-y-6">
          <BorrowerDetailCard
            ref={cardRef}
            hideInlineEditButton
            hideViewHeader
            onBorrowerLoaded={(data) =>
              setProfileHeader(profilePageHeaderFromBorrower(data))
            }
            onEditingChange={setProfileEditing}
            onRefresh={bumpDataRefresh}
          />
        </div>
        {/* Right column - TrueIdentity & Documents */}
        <div className="space-y-6">
          {borrowerType === "CORPORATE" ? (
            <CompanyMembersCard externalRefreshKey={dataRefreshKey} />
          ) : null}
          <TruestackKycCard
            onStatusLoaded={bumpDataRefresh}
            refreshKey={dataRefreshKey}
          />
          <DigitalSigningComingSoonCard />
          <BorrowerDocumentsCard
            borrowerType={borrowerType}
            externalRefreshKey={dataRefreshKey}
          />
        </div>
      </div>
    </div>
  );
}
