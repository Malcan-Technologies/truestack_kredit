"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Loader2, Mail, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import {
  createOpenCompanyInvitation,
  dispatchBorrowerProfileSwitched,
  fetchCompanyMembersContext,
  leaveCompanyOrganization,
  type CompanyMembersContext,
} from "@borrower_pro/lib/borrower-auth-client";
import {
  orgCancelInvitation,
  orgInviteMember,
  orgListInvitations,
  orgListMembers,
  orgRemoveMember,
  orgUpdateMemberRole,
} from "@borrower_pro/lib/auth-client";
import { formatDate } from "../Demo_Client/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type OrgMemberRow = {
  id: string;
  userId: string;
  role: string;
  user?: { email?: string | null; name?: string | null };
};

type OrgInviteRow = {
  id: string;
  email: string;
  role?: string | null;
  status?: string;
  expiresAt?: string | Date;
};

function parseMembersPayload(res: unknown): OrgMemberRow[] {
  const r = res as {
    data?: { members?: OrgMemberRow[] };
    members?: OrgMemberRow[];
  };
  return r.data?.members ?? r.members ?? [];
}

function parseInvitesPayload(res: unknown): OrgInviteRow[] {
  const r = res as {
    data?: { invitations?: OrgInviteRow[] };
    invitations?: OrgInviteRow[];
  };
  return r.data?.invitations ?? r.invitations ?? [];
}

function displayRole(role: string): string {
  const parts = role.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.includes("owner")) return "Owner";
  if (parts.includes("admin")) return "Admin";
  return "Member";
}

function roleIncludes(role: string, ...keys: string[]): boolean {
  const parts = role.split(",").map((s) => s.trim()).filter(Boolean);
  return keys.some((k) => parts.includes(k));
}

export function CompanyMembersCard({
  externalRefreshKey,
}: {
  /** Increment (e.g. profile toolbar refresh) to reload org context, members, and pending invitations. */
  externalRefreshKey?: number;
} = {}) {
  const [context, setContext] = useState<CompanyMembersContext | null>(null);
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [invites, setInvites] = useState<OrgInviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [submitting, setSubmitting] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [lastShareUrl, setLastShareUrl] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<OrgMemberRow | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const orgId = context?.organizationId ?? null;
  const canManage = Boolean(context?.canManageMembers && orgId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ctxRes = await fetchCompanyMembersContext();
      const ctx = ctxRes.data;
      setContext(ctx);
      if (!ctx.isCorporate || !ctx.organizationId) {
        setMembers([]);
        setInvites([]);
        return;
      }
      const [mRes, iRes] = await Promise.all([
        orgListMembers({ organizationId: ctx.organizationId }),
        orgListInvitations({ organizationId: ctx.organizationId }),
      ]);
      setMembers(parseMembersPayload(mRes));
      setInvites(parseInvitesPayload(iRes));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load company members");
      setContext(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (externalRefreshKey === undefined || externalRefreshKey === 0) return;
    void load();
  }, [externalRefreshKey, load]);

  const refreshLists = async () => {
    if (!orgId) return;
    try {
      const [mRes, iRes] = await Promise.all([
        orgListMembers({ organizationId: orgId }),
        orgListInvitations({ organizationId: orgId }),
      ]);
      setMembers(parseMembersPayload(mRes));
      setInvites(parseInvitesPayload(iRes));
    } catch {
      /* refresh is best-effort */
    }
  };

  const sendEmailInvite = async () => {
    if (!orgId || !inviteEmail.trim()) return;
    setSubmitting(true);
    try {
      const res = await orgInviteMember({
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        organizationId: orgId,
      });
      const err = res as { error?: { message?: string } };
      if (err.error) throw new Error(err.error.message || "Invite failed");
      toast.success("Invitation sent");
      setInviteOpen(false);
      setInviteEmail("");
      await refreshLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setSubmitting(false);
    }
  };

  const createShareLink = async () => {
    if (!canManage) return;
    setShareBusy(true);
    setLastShareUrl(null);
    try {
      const { invitationId } = await createOpenCompanyInvitation("member");
      const url = `${window.location.origin}/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`;
      setLastShareUrl(url);
      toast.success("Shareable link created — copy and send it securely.");
      await refreshLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create link");
    } finally {
      setShareBusy(false);
    }
  };

  const copyShare = async () => {
    if (!lastShareUrl) return;
    try {
      await navigator.clipboard.writeText(lastShareUrl);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  const revokeInvite = async (id: string) => {
    try {
      const res = await orgCancelInvitation({ invitationId: id });
      const err = res as { error?: { message?: string } };
      if (err.error) throw new Error(err.error.message || "Could not revoke");
      toast.success("Invitation revoked");
      await refreshLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke");
    }
  };

  const changeMemberRole = async (memberId: string, next: "member" | "admin") => {
    if (!orgId) return;
    try {
      const res = await orgUpdateMemberRole({ memberId, role: next, organizationId: orgId });
      const err = res as { error?: { message?: string } };
      if (err.error) throw new Error(err.error.message || "Could not update role");
      toast.success("Role updated");
      await refreshLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update role");
    }
  };

  const confirmRemoveMember = async () => {
    if (!removeTarget) return;
    const email = removeTarget.user?.email;
    if (!email) {
      toast.error("Missing member email");
      return;
    }
    try {
      const res = await orgRemoveMember({
        memberIdOrEmail: email,
        organizationId: orgId!,
      });
      const err = res as { error?: { message?: string } };
      if (err.error) throw new Error(err.error.message || "Could not remove member");
      toast.success("Member removed");
      setRemoveTarget(null);
      await refreshLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove member");
    }
  };

  const confirmLeave = async () => {
    if (!orgId) return;
    try {
      await leaveCompanyOrganization(orgId);
      toast.success("You left the company workspace");
      setLeaveOpen(false);
      dispatchBorrowerProfileSwitched("refresh");
      window.location.href = "/dashboard";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not leave");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Company members
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </CardContent>
      </Card>
    );
  }

  if (!context?.isCorporate) {
    return null;
  }

  if (context.needsOrgBackfill || !orgId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Company members
          </CardTitle>
          <CardDescription>
            This corporate profile has no linked users in the system yet, so a company workspace cannot be
            created. Add at least one borrower profile link, or contact support. If you still see this after
            users have access, try switching away and back to this company profile, or run the optional org
            backfill script (see docs).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Company members
          </CardTitle>
          <CardDescription>
            {canManage
              ? "Invite colleagues by email or share a one-time link. Anyone with the link can join once it is used."
              : "People with access to this corporate borrower profile."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
                <Mail className="h-4 w-4 mr-2" />
                Invite by email
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={shareBusy}
                onClick={() => void createShareLink()}
              >
                {shareBusy ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Shareable link
              </Button>
            </div>
          ) : null}

          {lastShareUrl && canManage ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2 text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-400">Open invite link</p>
              <p className="text-muted-foreground">
                Anyone with this link can accept while it is valid and unused. Treat it like a password.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Input readOnly value={lastShareUrl} className="font-mono text-xs flex-1 min-w-[12rem]" />
                <Button type="button" size="sm" variant="secondary" onClick={() => void copyShare()}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Members</h4>
            <ul className="divide-y rounded-md border">
              {members.map((m) => {
                const isOwner = roleIncludes(m.role, "owner");
                const label = m.user?.name?.trim() || m.user?.email || m.userId;
                return (
                  <li
                    key={m.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{label}</div>
                      {m.user?.email ? (
                        <div className="truncate text-muted-foreground text-xs">{m.user.email}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Badge variant="secondary">{displayRole(m.role)}</Badge>
                      {canManage && !isOwner ? (
                        <Select
                          value={roleIncludes(m.role, "admin") ? "admin" : "member"}
                          onValueChange={(v) => {
                            if (v === "member" || v === "admin") void changeMemberRole(m.id, v);
                          }}
                        >
                          <SelectTrigger className="h-8 w-[7.5rem]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : null}
                      {canManage && !isOwner ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          aria-label="Remove member"
                          onClick={() => setRemoveTarget(m)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {invites.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Pending invitations</h4>
              <ul className="divide-y rounded-md border">
                {invites.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between p-3 text-sm"
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-mono text-xs">{inv.email}</span>
                      {inv.role ? (
                        <Badge variant="outline" className="ml-2">
                          {inv.role}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {inv.expiresAt ? (
                        <span className="text-xs text-muted-foreground">
                          Expires{" "}
                          {formatDate(
                            typeof inv.expiresAt === "string"
                              ? inv.expiresAt
                              : inv.expiresAt.toISOString()
                          )}
                        </span>
                      ) : null}
                      {canManage ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => void revokeInvite(inv.id)}>
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!context.canManageMembers && context.role ? (
            <Button type="button" variant="outline" onClick={() => setLeaveOpen(true)}>
              Leave company workspace
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite by email</DialogTitle>
            <DialogDescription>They must sign in with this email to accept.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) => {
                  if (v === "member" || v === "admin") setInviteRole(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void sendEmailInvite()}>
              {submitting ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              They will lose access to this corporate borrower profile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmRemoveMember()}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave this company?</DialogTitle>
            <DialogDescription>
              You will lose access to this corporate borrower profile until invited again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setLeaveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmLeave()}>
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
