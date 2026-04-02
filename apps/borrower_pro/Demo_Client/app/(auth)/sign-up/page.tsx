"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import {
  type SecuritySetupPreference,
  getSecuritySetupPreferenceCopy,
  setPendingVerificationEmail,
  setSecuritySetupPreference,
} from "@kredit/shared";
import { Button } from "@borrower_pro/components/ui/button";
import { Input } from "@borrower_pro/components/ui/input";
import { Label } from "@borrower_pro/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@borrower_pro/components/ui/card";
import { toast } from "sonner";

const ONBOARDING_NAMESPACE = "borrower";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [securityPreference, setSecurityPreference] =
    useState<SecuritySetupPreference>("either");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const normalizedEmail = email.trim();
    const { error } = await signUp.email({
      name: name.trim() || "User",
      email: normalizedEmail,
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Sign up failed");
      return;
    }
    setPendingVerificationEmail(ONBOARDING_NAMESPACE, normalizedEmail);
    setSecuritySetupPreference(ONBOARDING_NAMESPACE, securityPreference);
    toast.success("Account created. Check your email to verify your address.");
    router.replace(`/verify-email?email=${encodeURIComponent(normalizedEmail)}&source=signup`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Sign up</CardTitle>
          <CardDescription>
            Create an account to borrow from licensed money lenders
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>After you verify, what would you like to set up next?</Label>
              <div className="grid gap-2">
                {(
                  ["passkey", "authenticator", "either"] as SecuritySetupPreference[]
                ).map((option) => {
                  const copy = getSecuritySetupPreferenceCopy(option);
                  return (
                    <Button
                      key={option}
                      type="button"
                      variant={securityPreference === option ? "default" : "outline"}
                      className="h-auto justify-start py-3 text-left whitespace-normal"
                      onClick={() => setSecurityPreference(option)}
                    >
                      <span className="block">
                        <span className="block font-medium">{copy.title}</span>
                        <span className="block text-xs opacity-80">{copy.description}</span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Sign up"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/sign-in" className="text-primary underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
