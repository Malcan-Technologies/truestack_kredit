"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await signIn.email({
        email: formData.email,
        password: formData.password,
      });

      console.log("[Login] signIn result:", result);

      if (result.error) {
        throw new Error(result.error.message || "Login failed");
      }

      // Small delay to ensure cookie is set by browser
      await new Promise(resolve => setTimeout(resolve, 100));

      // After login, set the active tenant to the first available membership
      // Use proxy route for backend calls (ensures cookies work correctly)
      const membershipsRes = await fetch("/api/proxy/auth/memberships", {
        credentials: "include",
      });
      console.log("[Login] memberships response status:", membershipsRes.status);
      const membershipsData = await membershipsRes.json();
      console.log("[Login] memberships data:", membershipsData);

      if (membershipsData.success && membershipsData.data.memberships.length > 0) {
        // If no active tenant is set, set the first one
        if (!membershipsData.data.activeTenantId) {
          const firstTenant = membershipsData.data.memberships[0];
          console.log("[Login] Setting active tenant:", firstTenant.tenantId);
          const switchRes = await fetch("/api/proxy/auth/switch-tenant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ tenantId: firstTenant.tenantId }),
          });
          const switchData = await switchRes.json();
          console.log("[Login] switch-tenant result:", switchData);
        }
      }

      toast.success("Login successful");
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-gradient">Sign In</CardTitle>
          <CardDescription>
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href={
                    formData.email.trim()
                      ? `/forgot-password?email=${encodeURIComponent(formData.email.trim())}`
                      : "/forgot-password"
                  }
                  className="text-sm text-muted hover:text-foreground"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <p className="text-sm text-muted text-center">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-foreground font-medium hover:underline">
                Register
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
