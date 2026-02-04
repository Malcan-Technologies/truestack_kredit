"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Generate a unique slug from company name
 * Adds a random suffix to ensure uniqueness
 */
function generateSlug(name: string): string {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 30); // Limit base length
  
  // Add random 4-char suffix for uniqueness
  const suffix = Math.random().toString(36).substring(2, 6);
  return baseSlug ? `${baseSlug}-${suffix}` : suffix;
}

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    tenantName: "",
    tenantSlug: "",
    tenantType: "" as "PPW" | "PPG" | "",
    licenseNumber: "",
    registrationNumber: "",
    tenantEmail: "",
    contactNumber: "",
    businessAddress: "",
    email: "",
    password: "",
    name: "",
  });

  // Auto-generate slug when tenant name changes
  const handleTenantNameChange = (value: string) => {
    const slug = generateSlug(value);
    setFormData({ ...formData, tenantName: value, tenantSlug: slug });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Call our custom registration API that creates tenant + user
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }

      toast.success("Registration successful! Welcome to TrueKredit.");
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-gradient">Register Tenant</CardTitle>
          <CardDescription>
            Create your company account on TrueKredit
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Company Information Section */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted">Company Information</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tenantName">Company Name</Label>
              <Input
                id="tenantName"
                type="text"
                placeholder="My Company Sdn Bhd"
                value={formData.tenantName}
                onChange={(e) => handleTenantNameChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenantType">License Type</Label>
              <Select
                value={formData.tenantType}
                onValueChange={(value: "PPW" | "PPG") =>
                  setFormData({ ...formData, tenantType: value })
                }
                required
              >
                <SelectTrigger id="tenantType">
                  <SelectValue placeholder="Select license type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PPW">
                    PPW - Pemberi Pinjam Wang (Money Lender)
                  </SelectItem>
                  <SelectItem value="PPG">
                    PPG - Pemberi Pajak Gadai (Pawnbroker)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted">
                This cannot be changed after registration
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="licenseNumber">KPKT License Number</Label>
              <Input
                id="licenseNumber"
                type="text"
                placeholder="PPW/KL/2024/001"
                value={formData.licenseNumber}
                onChange={(e) =>
                  setFormData({ ...formData, licenseNumber: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="registrationNumber">
                Company Registration Number (SSM)
              </Label>
              <Input
                id="registrationNumber"
                type="text"
                placeholder="202401012345 (12345-A)"
                value={formData.registrationNumber}
                onChange={(e) =>
                  setFormData({ ...formData, registrationNumber: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenantEmail">Company Email</Label>
              <Input
                id="tenantEmail"
                type="email"
                placeholder="info@mycompany.com"
                value={formData.tenantEmail}
                onChange={(e) =>
                  setFormData({ ...formData, tenantEmail: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactNumber">Contact Number</Label>
              <Input
                id="contactNumber"
                type="tel"
                placeholder="+60123456789"
                value={formData.contactNumber}
                onChange={(e) =>
                  setFormData({ ...formData, contactNumber: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessAddress">Business Address</Label>
              <Input
                id="businessAddress"
                type="text"
                placeholder="123 Jalan Utama, 50000 Kuala Lumpur"
                value={formData.businessAddress}
                onChange={(e) =>
                  setFormData({ ...formData, businessAddress: e.target.value })
                }
                required
              />
            </div>

            {/* Divider */}
            <Separator className="my-2" />

            {/* User Information Section */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted">Your Account</p>
            </div>

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
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
            <p className="text-sm text-muted text-center">
              Already have an account?{" "}
              <Link href="/login" className="text-accent hover:underline">
                Sign In
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
