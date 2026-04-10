"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  bindOpenCompanyInvitation,
  clearPendingAcceptInvitationPath,
  fetchBorrowerInvitationPreview,
  setPendingAcceptInvitationPath,
} from "@borrower_pro/lib/borrower-auth-client";
import {
  fetchSecurityStatus,
  orgAcceptInvitation,
  useSession,
} from "@/lib/auth-client";
import { Button } from "@borrower_pro/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@borrower_pro/components/ui/card";

function AcceptInvitationInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationId = useMemo(
    () => searchParams.get("invitationId")?.trim() ?? "",
    [searchParams]
  );
  const { data: session, isPending: sessionPending } = useSession();
  const sessionUserId = session?.user?.id ?? null;

  const [phase, setPhase] = useState<
    "idle" | "redirect-signin" | "redirect-security" | "accepting" | "done" | "error"
  >("idle");
  const [retryCount, setRetryCount] = useState(0);
  const handleRetry = useCallback(() => {
    setPhase("idle");
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!invitationId) {
      clearPendingAcceptInvitationPath();
      return;
    }
    setPendingAcceptInvitationPath(
      `/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`
    );
  }, [invitationId]);

  useEffect(() => {
    if (!invitationId || sessionPending) return;

    if (!sessionUserId) {
      setPhase("redirect-signin");
      const returnTo = `/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`;
      router.replace(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const security = await fetchSecurityStatus(
          session!.user as { emailVerified?: boolean; twoFactorEnabled?: boolean }
        );
        if (cancelled) return;
        if (!security.isSecuritySetupComplete) {
          setPhase("redirect-security");
          const returnTo = `/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`;
          router.replace(`/security-setup?returnTo=${encodeURIComponent(returnTo)}`);
          return;
        }

        setPhase("accepting");
        const preview = await fetchBorrowerInvitationPreview(invitationId);
        if (cancelled) return;

        if (preview.data.inviteKind === "open_link") {
          await bindOpenCompanyInvitation(invitationId);
        }
        if (cancelled) return;

        const acceptRes = await orgAcceptInvitation({ invitationId });
        if (cancelled) return;
        const err = acceptRes as { error?: { message?: string } | null };
        if (err.error) {
          throw new Error(err.error.message || "Could not accept invitation");
        }

        setPhase("done");
        clearPendingAcceptInvitationPath();
        toast.success("You're now a member of this company profile.");
        router.replace("/profile");
        router.refresh();
      } catch (e) {
        if (cancelled) return;
        setPhase("error");
        const message = e instanceof Error ? e.message : "Could not accept invitation";
        if (/not found|expired|claimed by another|already been bound|already a member/i.test(message)) {
          clearPendingAcceptInvitationPath();
        }
        toast.error(message);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitationId, sessionUserId, sessionPending, router, retryCount]);

  if (!invitationId) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Invalid invitation</CardTitle>
          <CardDescription>
            This link is missing an invitation id. Ask your teammate to send the invitation again.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={() => router.replace("/sign-in")}>
            Sign in
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Accept invitation</CardTitle>
        <CardDescription>
          {phase === "redirect-signin" || phase === "redirect-security"
            ? "Redirecting…"
            : phase === "accepting"
              ? "Joining your company workspace…"
              : phase === "done"
                ? "Accepted! Redirecting to your profile…"
                : phase === "error"
                  ? "Something went wrong. Please try again."
                  : "Preparing your invitation…"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          You may need to verify your email and complete security setup before joining.
        </p>
      </CardContent>
      {phase === "error" && (
        <CardFooter>
          <Button onClick={handleRetry}>Try again</Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default function AcceptInvitationPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense
        fallback={
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground text-sm">Loading…</p>
            </CardContent>
          </Card>
        }
      >
        <AcceptInvitationInner />
      </Suspense>
    </div>
  );
}
