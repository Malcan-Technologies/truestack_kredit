"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface CreateTenantModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateTenantModal({ open, onClose }: CreateTenantModalProps) {
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
    const slug = generateSlug(value);
    setFormData({ ...formData, name: value, slug });
  };

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

      toast.success("Tenant created successfully!");
      onClose();
      // Redirect to subscription so user can choose a plan, then dashboard
      window.location.href = "/dashboard/subscription";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create tenant");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Tenant</DialogTitle>
          <DialogDescription>
            Create a new company or organization tenant. You can manage multiple tenants from one account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
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
            <div className="space-y-2">
              <Label htmlFor="type">License Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: "PPW" | "PPG") =>
                  setFormData({ ...formData, type: value })
                }
                required
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select license type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PPW">
                    PPW - Pemberi Pinjam Wang (Money Lender)
                  </SelectItem>
                  {/* PPG - Pemberi Pajak Gadai (Pawnbroker) - coming soon */}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted">
                This cannot be changed after creation
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
              <Label htmlFor="email">Company Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="info@mycompany.com"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
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
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Tenant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
