"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { OnboardingStepper } from "@/components/onboarding-stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function generateSlug(name: string): string {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 30);

  const suffix = Math.random().toString(36).substring(2, 6);
  return baseSlug ? `${baseSlug}-${suffix}` : suffix;
}

export default function TenantOnboardingPage() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    type: "" as "PPW" | "PPG" | "",
    licenseNumber: "",
    registrationNumber: "",
    email: "",
    contactNumber: "",
    businessAddress: "",
  });

  const handleNameChange = (value: string) => {
    setFormData((prev) => ({ ...prev, name: value, slug: generateSlug(value) }));
  };

  const isFormComplete =
    formData.name.trim() !== "" &&
    formData.type !== "" &&
    formData.licenseNumber.trim() !== "" &&
    formData.registrationNumber.trim() !== "" &&
    formData.email.trim() !== "" &&
    formData.contactNumber.trim() !== "" &&
    formData.businessAddress.trim() !== "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/proxy/tenants/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create tenant");
      }

      toast.success("Tenant created successfully");
      window.location.href = "/dashboard/subscription?from=onboarding";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create tenant");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-10">
      <OnboardingStepper currentStep={1} />

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-heading font-bold">Register New Tenant</h1>
          <p className="text-sm text-muted-foreground">
            Set up your tenant profile before choosing a subscription plan.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
          <CardDescription>
            Enter your company information exactly as registered for compliance and billing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Company Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="My Company Sdn Bhd"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">License Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: "PPW" | "PPG") =>
                    setFormData((prev) => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select license type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PPW">
                      PPW - Pemberi Pinjam Wang (Money Lender)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This cannot be changed after creation.
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
                    setFormData((prev) => ({ ...prev, licenseNumber: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="registrationNumber">Company Registration Number (SSM)</Label>
                <Input
                  id="registrationNumber"
                  type="text"
                  placeholder="202401012345 (12345-A)"
                  value={formData.registrationNumber}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, registrationNumber: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Company Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="info@mycompany.com"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactNumber">Contact Number</Label>
                <PhoneInput
                  value={formData.contactNumber || undefined}
                  onChange={(value: string | undefined) =>
                    setFormData((prev) => ({ ...prev, contactNumber: value ?? "" }))
                  }
                  placeholder="16 2487680"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessAddress">Business Address</Label>
              <Input
                id="businessAddress"
                type="text"
                placeholder="123 Jalan Utama, 50000 Kuala Lumpur"
                value={formData.businessAddress}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, businessAddress: e.target.value }))
                }
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" asChild disabled={loading}>
                <Link href="/dashboard">Cancel</Link>
              </Button>
              <Button type="submit" disabled={loading || !isFormComplete}>
                {loading ? "Creating..." : "Continue to Plan Selection"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
