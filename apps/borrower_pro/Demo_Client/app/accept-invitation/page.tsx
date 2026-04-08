"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
  const ranAccept = useRef(false);
  const acceptCompleted = useRef(false);
  const [phase, setPhase] = useState<
    "idle" | "redirect-signin" | "redirect-security" | "accepting" | "done"
  >("idle");

  useEffect(() => {
    if (!invitationId) return;
    setPendingAcceptInvitationPath(
      `/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`
    );
  }, [invitationId]);

  useEffect(() => {
    if (!invitationId || sessionPending) return;

    if (!session) {
      setPhase("redirect-signin");
      const returnTo = `/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`;
      router.replace(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    if (ranAccept.current) return;
    ranAccept.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const security = await fetchSecurityStatus(
          session.user as { emailVerified?: boolean; twoFactorEnabled?: boolean }
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

        const acceptRes = await orgAcceptInvitation({ invitationId });
        const err = acceptRes as { error?: { message?: string } | null };
        if (err.error) {
          throw new Error(err.error.message || "Could not accept invitation");
        }

        clearPendingAcceptInvitationPath();
        acceptCompleted.current = true;
        setPhase("done");
        toast.success("You're now a member of this company profile.");
        router.replace("/profile");
        router.refresh();
      } catch (e) {
        if (cancelled) return;
        ranAccept.current = false;
        setPhase("idle");
        toast.error(e instanceof Error ? e.message : "Could not accept invitation");
      }
    })();

    return () => {
      cancelled = true;
      if (!acceptCompleted.current) {
        ranAccept.current = false;
      }
    };
  }, [invitationId, session, sessionPending, router]);

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
              : "Preparing your invitation…"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          You may need to verify your email and complete security setup before joining.
        </p>
      </CardContent>
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
