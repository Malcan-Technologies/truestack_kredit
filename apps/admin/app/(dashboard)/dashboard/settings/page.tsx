"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Users, Building2, UserX, UserCheck, Upload, X, ImageIcon, Crown, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { TableActionButton } from "@/components/ui/table-action-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/auth-client";
import { useTenantContext } from "@/components/tenant-context";
import { formatDate } from "@/lib/utils";
import { canManageSettings } from "@/lib/permissions";
import type { TenantRole } from "@/lib/permissions";

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  type: "PPW" | "PPG";
  licenseNumber: string | null;
  registrationNumber: string | null;
  email: string | null;
  contactNumber: string | null;
  businessAddress: string | null;
  logoUrl: string | null;
  status: string;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface CurrentMembership {
  role: string;
}

export default function SettingsPage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [currentMembership, setCurrentMembership] = useState<CurrentMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    password: "",
    role: "STAFF",
  });
  // Tenant editing state
  const [showEditTenant, setShowEditTenant] = useState(false);
  const [savingTenant, setSavingTenant] = useState(false);
  const [tenantForm, setTenantForm] = useState({
    name: "",
    licenseNumber: "",
    registrationNumber: "",
    email: "",
    contactNumber: "",
    businessAddress: "",
  });
  
  // Logo upload state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  
  // Ownership transfer state
  const [showTransferOwnership, setShowTransferOwnership] = useState(false);
  const [transferringOwnership, setTransferringOwnership] = useState(false);
  const [selectedNewOwner, setSelectedNewOwner] = useState<User | null>(null);

  const router = useRouter();
  const { data: session, isPending: sessionLoading, refetch: refetchSession } = useSession();
  const { refreshTenantData } = useTenantContext();
  const currentUser = session?.user;
  const currentRole = currentMembership?.role || "STAFF";

  const fetchData = async () => {
    if (!session) return;
    
    setLoading(true);
    try {
      // Use proxy route for backend calls (ensures cookies work correctly)
      const [tenantRes, usersRes, meRes] = await Promise.all([
        fetch("/api/proxy/tenants/current", { credentials: "include" }).then(r => r.json()),
        fetch("/api/proxy/tenants/users", { credentials: "include" }).then(r => r.json()),
        fetch("/api/proxy/auth/me", { credentials: "include" }).then(r => r.json()),
      ]);

      if (tenantRes.success && tenantRes.data) {
        setTenant(tenantRes.data);
      }
      if (usersRes.success && usersRes.data) {
        setUsers(usersRes.data);
      }
      if (meRes.success && meRes.data?.user) {
        setCurrentMembership({ role: meRes.data.user.role });
      }
    } catch (error) {
      console.error("Failed to fetch settings data:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/proxy/tenants/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newUser),
      });
      const res = await response.json();
      
      if (res.success) {
        toast.success("User added successfully");
        setShowAddUser(false);
        setNewUser({ email: "", name: "", password: "", role: "STAFF" });
        fetchData();
      } else {
        toast.error(res.error || "Failed to add user");
      }
    } catch (error) {
      toast.error("Failed to add user");
    }
  };

  const handleToggleUserActive = async (user: User) => {
    try {
      const response = await fetch(`/api/proxy/tenants/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const res = await response.json();
      
      if (res.success) {
        toast.success(`User ${user.isActive ? "deactivated" : "activated"}`);
        fetchData();
      } else {
        toast.error(res.error || "Failed to update user");
      }
    } catch (error) {
      toast.error("Failed to update user");
    }
  };

  const handleChangeRole = async (user: User) => {
    const newRole = user.role === "ADMIN" ? "STAFF" : "ADMIN";
    try {
      const response = await fetch(`/api/proxy/tenants/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      });
      const res = await response.json();

      if (res.success) {
        toast.success(`${user.name || user.email} is now ${newRole}`);
        fetchData();
      } else {
        toast.error(res.error || "Failed to change role");
      }
    } catch (error) {
      toast.error("Failed to change role");
    }
  };

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tenantForm.name.trim()) {
      toast.error("Company name is required");
      return;
    }

    setSavingTenant(true);
    try {
      const response = await fetch("/api/proxy/tenants/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: tenantForm.name.trim(),
          licenseNumber: tenantForm.licenseNumber.trim() || null,
          registrationNumber: tenantForm.registrationNumber.trim() || null,
          email: tenantForm.email.trim() || null,
          contactNumber: tenantForm.contactNumber.trim() || null,
          businessAddress: tenantForm.businessAddress.trim() || null,
        }),
      });
      const res = await response.json();

      if (res.success) {
        toast.success("Tenant information updated successfully");
        setShowEditTenant(false);
        fetchData();
      } else {
        toast.error(res.error || "Failed to update tenant");
      }
    } catch (error) {
      toast.error("Failed to update tenant");
    }
    setSavingTenant(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      toast.error("File size must be less than 2MB");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only JPEG, PNG, and WebP images are allowed");
      return;
    }

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);

      const response = await fetch("/api/proxy/tenants/current/logo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const res = await response.json();

      if (res.success) {
        toast.success("Logo uploaded successfully");
        fetchData();
        // Notify other components (like sidebar) to refresh tenant data
        refreshTenantData();
      } else {
        toast.error(res.error || "Failed to upload logo");
      }
    } catch (error) {
      toast.error("Failed to upload logo");
    }
    setUploadingLogo(false);
    // Reset the input
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
  };

  const handleDeleteLogo = async () => {
    if (!confirm("Are you sure you want to delete the logo?")) return;

    setDeletingLogo(true);
    try {
      const response = await fetch("/api/proxy/tenants/current/logo", {
        method: "DELETE",
        credentials: "include",
      });
      const res = await response.json();

      if (res.success) {
        toast.success("Logo deleted successfully");
        fetchData();
        // Notify other components (like sidebar) to refresh tenant data
        refreshTenantData();
      } else {
        toast.error(res.error || "Failed to delete logo");
      }
    } catch (error) {
      toast.error("Failed to delete logo");
    }
    setDeletingLogo(false);
  };

  const handleTransferOwnership = async () => {
    if (!selectedNewOwner) return;

    setTransferringOwnership(true);
    try {
      const response = await fetch("/api/proxy/tenants/transfer-ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newOwnerId: selectedNewOwner.id }),
      });
      const res = await response.json();

      if (res.success) {
        toast.success(`Ownership transferred to ${selectedNewOwner.name || selectedNewOwner.email}`);
        setShowTransferOwnership(false);
        setSelectedNewOwner(null);
        fetchData();
      } else {
        toast.error(res.error || "Failed to transfer ownership");
      }
    } catch (error) {
      toast.error("Failed to transfer ownership");
    }
    setTransferringOwnership(false);
  };

  if (sessionLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-gradient">Settings</h1>
        <p className="text-muted">Manage your tenant settings and users</p>
      </div>

      {/* Tenant Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Tenant Information</CardTitle>
                <CardDescription>
                  Your organization details used in receipts, Jadual J, Jadual K, and compliance reports
                </CardDescription>
              </div>
            </div>
            {canManageSettings(currentRole as TenantRole) && !showEditTenant && (
              <Button
                variant="outline"
                onClick={() => {
                  setTenantForm({
                    name: tenant?.name || "",
                    licenseNumber: tenant?.licenseNumber || "",
                    registrationNumber: tenant?.registrationNumber || "",
                    email: tenant?.email || "",
                    contactNumber: tenant?.contactNumber || "",
                    businessAddress: tenant?.businessAddress || "",
                  });
                  setShowEditTenant(true);
                }}
              >
                Edit Information
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {showEditTenant ? (
            <form onSubmit={handleUpdateTenant} className="space-y-4">
              {/* Logo Upload Section */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Company Logo</label>
                <div className="flex items-center gap-4">
                  <div className="relative w-24 h-24 border border-border rounded-lg overflow-hidden bg-surface flex items-center justify-center">
                    {tenant?.logoUrl ? (
                      <Image
                        src={tenant.logoUrl}
                        alt="Company logo"
                        fill
                        className="object-contain"
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingLogo}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {uploadingLogo ? "Uploading..." : "Upload Logo"}
                    </Button>
                    {tenant?.logoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deletingLogo}
                        onClick={handleDeleteLogo}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4 mr-2" />
                        {deletingLogo ? "Deleting..." : "Remove Logo"}
                      </Button>
                    )}
                    <p className="text-xs text-muted">
                      Max 2MB. JPEG, PNG, or WebP.
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Company Name *</label>
                  <Input
                    value={tenantForm.name}
                    onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                    placeholder="Company name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">License Type</label>
                  <div className="flex items-center h-10">
                    <Badge variant="outline">
                      {tenant?.type === "PPW" 
                        ? "PPW - Pemberi Pinjam Wang" 
                        : tenant?.type === "PPG" 
                          ? "PPG - Pemberi Pajak Gadai" 
                          : "—"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">License type cannot be changed</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tenant Slug</label>
                  <Input
                    value={tenant?.slug || ""}
                    disabled
                    className="bg-surface"
                  />
                  <p className="text-xs text-muted">Slug cannot be changed</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">KPKT License Number</label>
                  <Input
                    value={tenantForm.licenseNumber}
                    onChange={(e) => setTenantForm({ ...tenantForm, licenseNumber: e.target.value })}
                    placeholder="e.g., PPW/KL/2024/001"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Registration Number (SSM)</label>
                  <Input
                    value={tenantForm.registrationNumber}
                    onChange={(e) => setTenantForm({ ...tenantForm, registrationNumber: e.target.value })}
                    placeholder="e.g., 123456-X"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Company Email</label>
                  <Input
                    type="email"
                    value={tenantForm.email}
                    onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })}
                    placeholder="company@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Contact Number</label>
                  <Input
                    value={tenantForm.contactNumber}
                    onChange={(e) => setTenantForm({ ...tenantForm, contactNumber: e.target.value })}
                    placeholder="+60 12-345 6789"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <div className="flex items-center h-10">
                    <Badge variant={tenant?.status === "ACTIVE" ? "success" : "warning"}>
                      {tenant?.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">Status cannot be changed</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Business Address</label>
                  <Input
                    value={tenantForm.businessAddress}
                    onChange={(e) => setTenantForm({ ...tenantForm, businessAddress: e.target.value })}
                    placeholder="Full business address"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={savingTenant}>
                  {savingTenant ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditTenant(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Logo Display */}
              {tenant?.logoUrl && (
                <div className="flex items-center gap-4 pb-4 border-b border-border">
                  <div className="relative w-16 h-16 border border-border rounded-lg overflow-hidden bg-surface">
                    <Image
                      src={tenant.logoUrl}
                      alt="Company logo"
                      fill
                      className="object-contain"
                    />
                  </div>
                  <div>
                    <p className="text-sm text-muted">Company Logo</p>
                    <p className="font-medium">{tenant.name}</p>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted">Company Name</p>
                  <p className="font-medium">{tenant?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">Tenant Slug</p>
                  <p className="font-medium">{tenant?.slug || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">License Type</p>
                  <Badge variant="outline">
                    {tenant?.type === "PPW" 
                      ? "PPW - Pemberi Pinjam Wang" 
                      : tenant?.type === "PPG" 
                        ? "PPG - Pemberi Pajak Gadai" 
                        : "—"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted">Status</p>
                  <Badge variant={tenant?.status === "ACTIVE" ? "success" : "warning"}>
                    {tenant?.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted">KPKT License Number</p>
                  <p className="font-medium">{tenant?.licenseNumber || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">Registration Number (SSM)</p>
                  <p className="font-medium">{tenant?.registrationNumber || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">Company Email</p>
                  <p className="font-medium">{tenant?.email || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">Contact Number</p>
                  <p className="font-medium">{tenant?.contactNumber || "—"}</p>
                </div>
                <div className="md:col-span-3">
                  <p className="text-sm text-muted">Business Address</p>
                  <p className="font-medium">{tenant?.businessAddress || "—"}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                {users.length}/5 members used
              </CardDescription>
            </div>
          </div>
          {canManageSettings(currentRole as TenantRole) && (
            <Button 
              onClick={() => setShowAddUser(!showAddUser)}
              disabled={users.length >= 5}
            >
              {users.length >= 5 ? "Limit Reached" : "Add User"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add user form */}
          {showAddUser && (
            <form onSubmit={handleAddUser} className="p-4 border border-border rounded-lg space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email *</label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password *</label>
                  <Input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    minLength={8}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role *</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="STAFF">Staff</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit">Add User</Button>
                <Button type="button" variant="outline" onClick={() => setShowAddUser(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Users table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{user.name || "—"}</p>
                      <p className="text-sm text-muted">{user.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === "OWNER" ? "default" : "outline"}>
                      {user.role === "OWNER" && <Crown className="h-3 w-3 mr-1" />}
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "success" : "secondary"}>
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {user.role !== "OWNER" && currentRole === "OWNER" && (
                        <>
                          <TableActionButton
                            icon={user.isActive ? UserX : UserCheck}
                            label={user.isActive ? "Deactivate" : "Activate"}
                            variant={user.isActive ? "destructive" : "success"}
                            onClick={() => handleToggleUserActive(user)}
                          />
                          {user.isActive && (
                            <TableActionButton
                              icon={ArrowLeftRight}
                              label={user.role === "ADMIN" ? "Switch to Staff" : "Switch to Admin"}
                              onClick={() => handleChangeRole(user)}
                            />
                          )}
                          {user.isActive && (
                            <TableActionButton
                              icon={Crown}
                              label="Transfer Ownership"
                              variant="warning"
                              onClick={() => {
                                setSelectedNewOwner(user);
                                setShowTransferOwnership(true);
                              }}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Transfer Ownership Confirmation Dialog */}
      <Dialog open={showTransferOwnership} onOpenChange={setShowTransferOwnership}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Transfer Ownership
            </DialogTitle>
            <DialogDescription>
              You are about to transfer ownership of this tenant to another user.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
              <p className="text-sm font-medium text-warning mb-2">Warning: This action cannot be undone!</p>
              <ul className="text-sm text-muted space-y-1">
                <li>• You will be demoted from Owner to Admin</li>
                <li>• <strong>{selectedNewOwner?.name || selectedNewOwner?.email}</strong> will become the new Owner</li>
                <li>• Only the new Owner can transfer ownership back to you</li>
              </ul>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted">New Owner</p>
                <p className="font-medium">{selectedNewOwner?.name || "—"}</p>
                <p className="text-muted">{selectedNewOwner?.email}</p>
              </div>
              <div>
                <p className="text-muted">Current Owner (You)</p>
                <p className="font-medium">{currentUser?.name || "—"}</p>
                <p className="text-muted">{currentUser?.email}</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowTransferOwnership(false);
                setSelectedNewOwner(null);
              }}
              disabled={transferringOwnership}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleTransferOwnership}
              disabled={transferringOwnership}
            >
              {transferringOwnership ? "Transferring..." : "Transfer Ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
