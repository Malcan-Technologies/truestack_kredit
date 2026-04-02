interface MembershipRecord {
  tenantId: string;
}

interface MembershipsResponse {
  success?: boolean;
  data?: {
    memberships?: MembershipRecord[];
    activeTenantId?: string | null;
  };
  error?: string;
  message?: string;
}

export async function ensureActiveTenantAfterLogin(): Promise<void> {
  const membershipsResponse = await fetch("/api/proxy/auth/memberships", {
    credentials: "include",
  });

  const membershipsData = (await membershipsResponse.json().catch(() => null)) as MembershipsResponse | null;
  const memberships = membershipsData?.data?.memberships ?? [];

  if (!membershipsResponse.ok || !membershipsData?.success) {
    throw new Error(
      membershipsData?.message ||
        membershipsData?.error ||
        "Unable to verify your organization access right now."
    );
  }

  if (memberships.length === 0) {
    return;
  }

  if (membershipsData.data?.activeTenantId) {
    return;
  }

  const firstTenant = memberships[0];
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
        "Unable to activate your organization."
    );
  }
}
