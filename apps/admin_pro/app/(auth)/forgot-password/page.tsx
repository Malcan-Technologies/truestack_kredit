"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Step = 1 | 2 | 3;

const CODE_LENGTH = 6;

function ForgotPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get("email")?.trim() ?? "";
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(emailFromUrl);
  const emailLocked = !!emailFromUrl;

  useEffect(() => {
    const fromUrl = searchParams.get("email")?.trim() ?? "";
    if (fromUrl) setEmail(fromUrl);
  }, [searchParams]);

  const [codeDigits, setCodeDigits] = useState<string[]>(
    Array(CODE_LENGTH).fill("")
  );
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("If an account exists, you will receive a reset code.");
        setStep(2);
      } else {
        toast.error(data.error || "Something went wrong.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...codeDigits];
    next[index] = digit;
    setCodeDigits(next);
    if (digit && index < CODE_LENGTH - 1) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !codeDigits[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    const next = [...codeDigits];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCodeDigits(next);
    const focusIdx = Math.min(pasted.length, CODE_LENGTH - 1);
    codeInputRefs.current[focusIdx]?.focus();
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = codeDigits.join("");
    if (!email.trim() || code.length !== CODE_LENGTH) {
      toast.error("Please enter the 6-digit code from your email.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/password-reset/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Code verified. Enter your new password.");
        setStep(3);
      } else {
        toast.error(data.error || "Invalid or expired code.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8 || newPassword.length > 128) {
      toast.error("Password must be 8–128 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Password reset successfully. You can now sign in.");
        router.push("/login");
      } else {
        toast.error(data.error || "Something went wrong.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-gradient">
            Reset Password
          </CardTitle>
          <CardDescription>
            {step === 1 && "Enter your email to receive a reset code."}
            {step === 2 && "Enter the 6-digit code sent to your email."}
            {step === 3 && "Enter your new password."}
          </CardDescription>
        </CardHeader>

        {step === 1 && (
          <form onSubmit={handleRequestCode}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={emailLocked}
                  className={emailLocked ? "bg-muted" : undefined}
                  required
                />
                {emailLocked && (
                  <p className="text-xs text-muted">
                    <Link
                      href="/forgot-password"
                      className="text-foreground font-medium hover:underline"
                    >
                      Use a different email
                    </Link>
                  </p>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send reset code"}
              </Button>
              <p className="text-sm text-muted text-center">
                Remember your password?{" "}
                <Link
                  href="/login"
                  className="text-foreground font-medium hover:underline"
                >
                  Sign In
                </Link>
              </p>
            </CardFooter>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyCode}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>Reset code</Label>
                <div
                  className="flex gap-2 justify-center"
                  onPaste={handleCodePaste}
                >
                  {codeDigits.map((digit, i) => (
                    <Input
                      key={i}
                      ref={(el) => {
                        codeInputRefs.current[i] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(i, e)}
                      className="w-11 h-12 text-center text-lg font-mono"
                      aria-label={`Digit ${i + 1}`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted">
                  Check your email for the 6-digit code. It expires in 15
                  minutes.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying..." : "Verify code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={loading}
                onClick={() => {
                  setStep(1);
                  setCodeDigits(Array(CODE_LENGTH).fill(""));
                }}
              >
                Use a different email
              </Button>
            </CardFooter>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleConfirmPassword}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  maxLength={128}
                  required
                />
                <p className="text-xs text-muted">
                  Min 8 characters, max 128 characters.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Resetting..." : "Reset password"}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}

export default function ForgotPasswordPage() {
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
      <ForgotPasswordContent />
    </Suspense>
  );
}
