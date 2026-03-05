export type TenantRole = "OWNER" | "ADMIN" | "STAFF";

// Pages that STAFF cannot access at all (fully blocked)
const BLOCKED_PAGES = ["/dashboard/billing", "/dashboard/plan", "/dashboard/admin-logs", "/dashboard/modules"];

/**
 * Check if a role can access a given page path.
 * Returns false only for pages in the BLOCKED_PAGES list when role is STAFF.
 */
export function canAccessPage(role: TenantRole, path: string): boolean {
  if (role === "OWNER" || role === "ADMIN") return true;
  return !BLOCKED_PAGES.some((p) => path.startsWith(p));
}

/** OWNER/ADMIN can approve or reject loan applications */
export function canApproveApplications(role: TenantRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** OWNER/ADMIN can create, edit, delete, and toggle products */
export function canManageProducts(role: TenantRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** OWNER/ADMIN can edit tenant info and manage team members */
export function canManageSettings(role: TenantRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
