"use client";

import { useRouter } from "next/navigation";
import { signOut } from "../lib/auth-client";
import { Button } from "./ui/button";

export function SignOutButton({ redirectTo = "/" }: { redirectTo?: string }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await signOut();
        router.push(redirectTo);
      }}
    >
      Sign out
    </Button>
  );
}
