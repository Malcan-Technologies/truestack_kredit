"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  BorrowerDetailCard,
  type BorrowerDetailCardHandle,
} from "@borrower_pro/components/borrower-detail-card";
import { TruestackKycCard } from "@borrower_pro/components/truestack-kyc-card";
import { DigitalSigningComingSoonCard } from "@borrower_pro/components/digital-signing-coming-soon-card";
import { BorrowerDocumentsCard } from "@borrower_pro/components/borrower-documents-card";
import { RefreshButton } from "@borrower_pro/components/ui/refresh-button";
import { Button } from "@borrower_pro/components/ui/button";
import {
  fetchBorrowerMe,
  switchBorrowerProfile,
  BORROWER_PROFILE_SWITCHED_EVENT,
} from "@borrower_pro/lib/borrower-auth-client";
import { fetchBorrower } from "@borrower_pro/lib/borrower-api-client";

export default function YourProfilePage() {
  const router = useRouter();
  const cardRef = useRef<BorrowerDetailCardHandle>(null);
  const [borrowerType, setBorrowerType] = useState<"INDIVIDUAL" | "CORPORATE" | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileEditing, setProfileEditing] = useState(false);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

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

  if (loading || !borrowerType) {
    return (
      <div className="text-sm text-muted-foreground">
        {loading ? "Loading..." : "Redirecting..."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!profileEditing ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-gradient">Your profile</h1>
            <p className="text-muted text-base mt-1">View and update your borrower details</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <RefreshButton
              onRefresh={handleToolbarRefresh}
              showToast
              showLabel
              successMessage="Profile refreshed"
            />
            <Button onClick={() => cardRef.current?.startEdit()}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Borrower
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
            onEditingChange={setProfileEditing}
            onRefresh={bumpDataRefresh}
          />
        </div>
        {/* Right column - TrueIdentity & Documents */}
        <div className="space-y-6">
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
