"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CopyPlus,
  RefreshCcw,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  RBAC_PERMISSION_GROUPS,
  type TenantPermission,
} from "@kredit/shared";
import { RoleGate } from "@/components/role-gate";
import { useTenantPermissions } from "@/components/tenant-context";
import { canManageRoles } from "@/lib/permissions";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface TenantRoleRecord {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  permissions: TenantPermission[];
  isSystem: boolean;
  isEditable: boolean;
  isDefault: boolean;
  memberCount: number;
}

interface RoleDraft {
  name: string;
  description: string;
  permissions: TenantPermission[];
}

const EMPTY_DRAFT: RoleDraft = {
  name: "",
  description: "",
  permissions: [],
};

function permissionLabel(permission: TenantPermission): string {
  return permission
    .split(".")
    .map((part) =>
      part
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    )
    .join(" - ");
}

function RolesCatalogSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading roles">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="w-full rounded-lg border border-border p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-[72%] max-w-[200px]" />
              <Skeleton className="h-3 w-full" />
            </div>
            <Skeleton className="h-5 w-8 shrink-0 rounded-full" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RoleEditorHeaderSkeleton() {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-7 w-44 max-w-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}

function RoleEditorBodySkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading role details">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-20 w-full" />
      </div>
      <Separator />
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, g) => (
          <div key={g} className="space-y-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-full max-w-lg" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex gap-3 rounded-lg border border-border p-3"
                >
                  <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-sm" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-[88%]" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Card className="border-border bg-muted/30">
        <CardContent className="pt-6">
          <Skeleton className="h-4 w-full max-w-2xl" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function RolesPage() {
  const router = useRouter();
  const tenantPermissions = useTenantPermissions();
  const canEditRoles = canManageRoles(tenantPermissions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<TenantRoleRecord[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [draft, setDraft] = useState<RoleDraft>(EMPTY_DRAFT);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    cloneRoleId: "",
  });

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  const selectedPermissionSet = useMemo(
    () => new Set(draft.permissions),
    [draft.permissions]
  );

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/proxy/tenants/roles", {
        credentials: "include",
      });
      const result = await response.json();

      if (!result.success || !Array.isArray(result.data)) {
        throw new Error(result.error || "Failed to load roles");
      }

      const nextRoles = result.data as TenantRoleRecord[];
      setRoles(nextRoles);
      setSelectedRoleId((current) => current || nextRoles[0]?.id || "");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load tenant roles"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRoles();
  }, []);

  useEffect(() => {
    if (!selectedRole) {
      setDraft(EMPTY_DRAFT);
      return;
    }

    setDraft({
      name: selectedRole.name,
      description: selectedRole.description || "",
      permissions: [...selectedRole.permissions],
    });
  }, [selectedRole]);

  const togglePermission = (permission: TenantPermission, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      permissions: checked
        ? [...current.permissions, permission]
        : current.permissions.filter((item) => item !== permission),
    }));
  };

  const handleSaveRole = async () => {
    if (!selectedRole) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/proxy/tenants/roles/${selectedRole.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          permissions: draft.permissions,
        }),
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to update role");
      }

      toast.success("Role updated");
      await fetchRoles();
      setSelectedRoleId(selectedRole.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update role"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleResetRole = async () => {
    if (!selectedRole) return;

    setSaving(true);
    try {
      const response = await fetch(
        `/api/proxy/tenants/roles/${selectedRole.id}/reset`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to reset role");
      }

      toast.success("Role reset to default permissions");
      await fetchRoles();
      setSelectedRoleId(selectedRole.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reset role"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async () => {
    if (!createForm.name.trim()) {
      toast.error("Role name is required");
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/proxy/tenants/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: createForm.name.trim(),
          description: createForm.description.trim() || null,
          cloneRoleId: createForm.cloneRoleId || undefined,
        }),
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to create role");
      }

      toast.success("Custom role created");
      setShowCreateDialog(false);
      setCreateForm({ name: "", description: "", cloneRoleId: "" });
      await fetchRoles();
      setSelectedRoleId(result.data.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create role"
      );
    } finally {
      setCreating(false);
    }
  };

  const criticalPermissionWarning =
    !selectedPermissionSet.has("team.invite") &&
    !selectedPermissionSet.has("team.edit_roles") &&
    !selectedPermissionSet.has("roles.manage");

  return (
    <RoleGate requiredPermissions={["roles.view", "roles.manage"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-heading font-bold text-gradient">
                Roles & Access
              </h1>
              <p className="text-muted-foreground">
                Edit tenant role presets and control what each role can access.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void fetchRoles()}
              disabled={loading}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            {canEditRoles && (
              <Button
                onClick={() => setShowCreateDialog(true)}
                disabled={loading}
              >
                <CopyPlus className="h-4 w-4 mr-2" />
                New Role
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Role Catalog</CardTitle>
              <CardDescription>
                Default roles are prefilled for every tenant. Custom roles are tenant-specific.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <RolesCatalogSkeleton />
              ) : roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No roles found for this tenant.</p>
              ) : (
                roles.map((role) => {
                  const isSelected = role.id === selectedRoleId;

                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRoleId(role.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-medium">{role.name}</div>
                          <p className="text-sm text-muted-foreground">
                            {role.description || "No description set."}
                          </p>
                        </div>
                        <Badge variant="outline">{role.memberCount}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {role.isSystem && (
                          <Badge variant="default">System</Badge>
                        )}
                        {role.isDefault && (
                          <Badge variant="secondary">Default</Badge>
                        )}
                        {!role.isEditable && (
                          <Badge variant="outline">Locked</Badge>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              {loading ? (
                <RoleEditorHeaderSkeleton />
              ) : (
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CardTitle>{selectedRole?.name || "Select a role"}</CardTitle>
                      {selectedRole?.isSystem && (
                        <Badge variant="default">
                          <Shield className="h-3 w-3 mr-1" />
                          System
                        </Badge>
                      )}
                      {selectedRole?.isDefault && (
                        <Badge variant="secondary">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Default
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      {selectedRole
                        ? `${selectedRole.memberCount} member(s) currently use this role.`
                        : "Choose a role from the left to inspect or edit its access."}
                    </CardDescription>
                  </div>
                  {selectedRole && (
                    <div className="flex items-center gap-2">
                      {canEditRoles && selectedRole.isEditable && selectedRole.isDefault && (
                        <Button variant="outline" onClick={handleResetRole} disabled={saving}>
                          Reset to default
                        </Button>
                      )}
                      {canEditRoles && selectedRole.isEditable && (
                        <Button onClick={handleSaveRole} disabled={saving}>
                          Save changes
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {loading ? (
                <RoleEditorBodySkeleton />
              ) : !selectedRole ? (
                <p className="text-sm text-muted-foreground">
                  Select a role to view its permissions.
                </p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Role name</Label>
                      <Input
                        value={draft.name}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        disabled={!canEditRoles || !selectedRole.isEditable}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role key</Label>
                      <Input value={selectedRole.key} disabled />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      disabled={!canEditRoles || !selectedRole.isEditable}
                      placeholder="Explain who this role is for and what it should be used for."
                    />
                  </div>

                  {!selectedRole.isEditable && (
                    <Card className="border-border bg-muted/30">
                      <CardContent className="pt-6 text-sm text-muted-foreground">
                        This role is system-managed and cannot be edited here. Use
                        ownership transfer for `OWNER`.
                      </CardContent>
                    </Card>
                  )}

                  {criticalPermissionWarning && selectedRole.isEditable && (
                    <Card className="border-amber-500/40 bg-amber-500/5">
                      <CardContent className="pt-6 text-sm text-muted-foreground">
                        This role will not be able to invite users or manage access.
                        Keep at least one other role with administration permissions assigned.
                      </CardContent>
                    </Card>
                  )}

                  <Separator />

                  <div className="space-y-6">
                    {RBAC_PERMISSION_GROUPS.map((group) => (
                      <div key={group.key} className="space-y-3">
                        <div>
                          <h2 className="font-medium">{group.label}</h2>
                          <p className="text-sm text-muted-foreground">
                            {group.description}
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {group.permissions.map((permission) => (
                            <label
                              key={permission}
                              className="flex items-start gap-3 rounded-lg border border-border p-3"
                            >
                              <Checkbox
                                checked={selectedPermissionSet.has(permission)}
                                onCheckedChange={(checked) =>
                                  togglePermission(permission, checked === true)
                                }
                                disabled={!canEditRoles || !selectedRole.isEditable}
                              />
                              <div className="space-y-1">
                                <p className="text-sm font-medium">
                                  {permissionLabel(permission)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {permission}
                                </p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Card className="border-border bg-muted/30">
                    <CardContent className="pt-6 text-sm text-muted-foreground flex items-start gap-2">
                      <Users className="h-4 w-4 mt-0.5 shrink-0" />
                      Member assignment happens in
                      <Link
                        href="/dashboard/settings"
                        className="font-medium text-foreground hover:underline"
                      >
                        Team Members
                      </Link>
                      so you can update who uses each role without leaving tenant settings.
                    </CardContent>
                  </Card>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create custom role</DialogTitle>
              <DialogDescription>
                Start from a default template or clone an existing tenant role.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. Senior Collections"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Describe who should use this role."
                />
              </div>
              <div className="space-y-2">
                <Label>Clone from</Label>
                <Select
                  value={createForm.cloneRoleId || undefined}
                  onValueChange={(value) =>
                    setCreateForm((current) => ({
                      ...current,
                      cloneRoleId: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional starting template" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setCreateForm({ name: "", description: "", cloneRoleId: "" });
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateRole} disabled={creating}>
                {creating ? "Creating…" : "Create role"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGate>
  );
}
