"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Signup route for referral links. Redirects to register with ref query preserved.
 * e.g. /signup?ref=FTYTFQPU -> /register?ref=FTYTFQPU
 */
function SignupRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    const url = ref ? `/register?ref=${encodeURIComponent(ref)}` : "/register";
    router.replace(url);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Redirecting to registration...</p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    }>
      <SignupRedirect />
    </Suspense>
  );
}
