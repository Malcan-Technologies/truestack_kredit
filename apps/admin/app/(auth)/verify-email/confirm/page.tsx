"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getSecuritySetupPreference,
  getSecuritySetupPreferenceCopy,
} from "@kredit/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type VerifyState = "loading" | "success" | "error";
const ONBOARDING_NAMESPACE = "admin";

function VerifyEmailConfirmContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [state, setState] = useState<VerifyState>(token ? "loading" : "error");
  const [message, setMessage] = useState("Verifying your email...");
  const [nextStepMessage, setNextStepMessage] = useState("");

  useEffect(() => {
    const preference = getSecuritySetupPreference(ONBOARDING_NAMESPACE);
    if (!preference) return;

    setNextStepMessage(
      `Next, sign in and set up ${getSecuritySetupPreferenceCopy(preference).title.toLowerCase()}.`
    );
  }, []);

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This verification link is invalid or incomplete.");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.message || result?.error?.message || "This verification link is invalid or has expired.");
        }

        if (!cancelled) {
          setState("success");
          setMessage("Your email has been verified. You can sign in now.");
        }
      } catch (error) {
        if (!cancelled) {
          setState("error");
          setMessage(error instanceof Error ? error.message : "Unable to verify your email.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-gradient">Email Verification</CardTitle>
          <CardDescription>
            {state === "loading" ? "Please wait while we confirm your email." : message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === "loading" ? (
            <p className="text-sm text-muted-foreground text-center">Verifying your email...</p>
          ) : nextStepMessage ? (
            <p className="text-sm text-muted-foreground text-center">{nextStepMessage}</p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          {state === "success" ? (
            <Button asChild className="w-full">
              <Link href="/login">Go to sign in</Link>
            </Button>
          ) : null}
          {state === "error" ? (
            <Button asChild variant="outline" className="w-full">
              <Link href="/verify-email">Resend verification email</Link>
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  );
}

export default function VerifyEmailConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">Loading...</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <VerifyEmailConfirmContent />
    </Suspense>
  );
}
