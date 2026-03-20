"use client";

import { useState, useEffect } from "react";
import { UserCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useSession, updateUser } from "@/lib/auth-client";
import { formatDate } from "../lib/borrower-form-display";
import { toast } from "sonner";

interface AccountData {
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt?: string;
  };
}

export function AccountProfileCard() {
  const { data: session, isPending } = useSession();
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch("/api/proxy/borrower-auth/account", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setAccount(json.data);
          setEditName(json.data.user?.name || "");
        }
      })
      .catch(() => toast.error("Failed to load account"))
      .finally(() => setLoading(false));
  }, [session]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const { error } = await updateUser({ name: editName.trim() });
      if (error) throw new Error(error.message);
      setAccount((prev) =>
        prev
          ? {
              ...prev,
              user: { ...prev.user, name: editName.trim() },
            }
          : null
      );
      setShowEdit(false);
      toast.success("Account updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditName(account?.user?.name || "");
    setShowEdit(false);
  };

  if (isPending || loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <UserCircle className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="font-heading">My Account</CardTitle>
              <CardDescription>Your personal account information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const user = account?.user ?? session?.user;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserCircle className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="font-heading">My Account</CardTitle>
              <CardDescription>Your personal account information</CardDescription>
            </div>
          </div>
          {!showEdit && (
            <Button variant="outline" onClick={() => setShowEdit(true)}>
              Edit account
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {showEdit ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name *</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  value={user?.email || ""}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{user?.name || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{user?.email || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Member since</p>
              <p className="font-medium">
                {account?.user?.createdAt
                  ? formatDate(account.user.createdAt)
                  : "—"}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
