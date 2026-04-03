"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  setPendingVerificationEmail,
} from "@kredit/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BackToTruestackButton, BackToRootButton } from "@/components/powered-by-truestack";

const ONBOARDING_NAMESPACE = "admin";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    referralCode: "",
  });

  // Pre-fill optional referral code from URL (?ref=CODE); strip legacy INV- if present
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref && typeof ref === "string") {
      const code = ref.replace(/^INV-/i, "").trim().toUpperCase().slice(0, 6);
      if (code) setFormData((prev) => ({ ...prev, referralCode: code }));
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);

    try {
      // Call our custom registration API that creates tenant + user
      const { confirmPassword: _, ...payload } = formData;
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }

      const email = data?.data?.email || formData.email;
      setPendingVerificationEmail(ONBOARDING_NAMESPACE, email);
      toast.success("Account created. Check your email to verify your address.");
      router.push(`/verify-email?email=${encodeURIComponent(email)}&source=signup`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <BackToTruestackButton variant="outline" />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-gradient">Create Account</CardTitle>
          <CardDescription>
            Sign up for TrueKredit
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                minLength={8}
                required
              />
              <p className="text-xs text-muted">
                Min 8 characters, 1 uppercase, 1 lowercase, 1 number
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData({ ...formData, confirmPassword: e.target.value })
                }
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="referralCode">Referral code (optional)</Label>
              <Input
                id="referralCode"
                type="text"
                placeholder="e.g. ABC123"
                value={formData.referralCode}
                onChange={(e) =>
                  setFormData({ ...formData, referralCode: e.target.value.trim() })
                }
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
            <p className="text-sm text-muted text-center">
              Already have an account?{" "}
              <Link href="/login" className="text-foreground font-medium hover:underline">
                Sign In
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
      <div className="mt-8">
        <BackToRootButton variant="ghost" />
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">Loading...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}
