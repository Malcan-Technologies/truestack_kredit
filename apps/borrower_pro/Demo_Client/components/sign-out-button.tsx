"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@borrower_pro/lib/auth-client";
import { Button } from "@borrower_pro/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await signOut();
        router.push("/");
      }}
    >
      Sign out
    </Button>
  );
}
