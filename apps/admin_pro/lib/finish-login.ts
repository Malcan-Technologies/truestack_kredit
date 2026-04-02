import { signOut } from "@/lib/auth-client";

export const ADMIN_ACCESS_REQUIRED_MESSAGE =
  "This account does not have admin access. Ask your organization owner to invite you.";
export const ADMIN_ACCESS_RETRYABLE_MESSAGE =
  "Unable to verify admin access right now.";

export interface AdminMembershipRecord {
  tenantId: string;
  role: string;
  tenantName?: string;
  tenantLogoUrl?: string | null;
}

interface MembershipsResponse {
  success?: boolean;
  data?: {
    memberships?: AdminMembershipRecord[];
    activeTenantId?: string | null;
  };
  error?: string;
  message?: string;
}

export type AdminMembershipAccessResult =
  | {
      kind: "authorized";
      memberships: AdminMembershipRecord[];
      activeTenantId: string | null;
    }
  | {
      kind: "unauthorized";
    }
  | {
      kind: "error";
      message: string;
    };

async function signOutUnauthorizedAdmin(): Promise<void> {
  try {
    await signOut();
  } catch {
    // Best-effort cleanup before returning to the login page.
  }
}

export async function fetchAdminMembershipAccess(): Promise<AdminMembershipAccessResult> {
  const membershipsResponse = await fetch("/api/proxy/auth/memberships", {
    credentials: "include",
  });

  if (membershipsResponse.status === 401) {
    return { kind: "unauthorized" };
  }

  const membershipsData = (await membershipsResponse.json().catch(() => null)) as MembershipsResponse | null;
  const memberships = membershipsData?.data?.memberships ?? [];

  if (!membershipsResponse.ok || !membershipsData?.success) {
    return {
      kind: "error",
      message:
        membershipsData?.message ||
        membershipsData?.error ||
        ADMIN_ACCESS_RETRYABLE_MESSAGE,
    };
  }

  if (memberships.length === 0) {
    return { kind: "unauthorized" };
  }

  return {
    kind: "authorized",
    memberships,
    activeTenantId: membershipsData.data?.activeTenantId ?? null,
  };
}

export async function ensureActiveTenantAfterLogin(): Promise<void> {
  const access = await fetchAdminMembershipAccess();

  if (access.kind === "error") {
    throw new Error(access.message);
  }

  if (access.kind === "unauthorized") {
    await signOutUnauthorizedAdmin();
    throw new Error(ADMIN_ACCESS_REQUIRED_MESSAGE);
  }

  if (access.activeTenantId) {
    return;
  }

  const firstTenant = access.memberships[0];
  const switchTenantResponse = await fetch("/api/proxy/auth/switch-tenant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tenantId: firstTenant.tenantId }),
  });

  const switchTenantData = (await switchTenantResponse.json().catch(() => null)) as
    | { success?: boolean; error?: string; message?: string }
    | null;

  if (!switchTenantResponse.ok || !switchTenantData?.success) {
    throw new Error(
      switchTenantData?.message ||
        switchTenantData?.error ||
        "Unable to activate your admin organization."
    );
  }
}

export async function revokeUnauthorizedAdminAccess(): Promise<void> {
  await signOutUnauthorizedAdmin();
}
