import {
  FULL_TENANT_PERMISSION_SET,
  type TenantPermission,
} from "@kredit/shared";

export type TenantRole = string;

const PAGE_ACCESS_RULES: Array<{
  prefix: string;
  anyOf: TenantPermission[];
  exact?: boolean;
}> = [
  { prefix: "/dashboard/settings/roles", anyOf: ["roles.view", "roles.manage"] },
  { prefix: "/dashboard/roles", anyOf: ["roles.view", "roles.manage"] },
  {
    prefix: "/dashboard/settings",
    anyOf: [
      "tenant_settings.view",
      "tenant_settings.edit",
      "team.view",
      "team.invite",
      "team.edit_roles",
      "team.deactivate",
      "billing.view",
      "billing.manage",
    ],
  },
  { prefix: "/dashboard/admin-logs", anyOf: ["audit_logs.view"] },
  {
    prefix: "/dashboard/modules/notifications",
    anyOf: [
      "notifications.view",
      "notifications.manage_settings",
      "notifications.send_broadcast",
      "notifications.view_logs",
      "truesend.view",
      "truesend.manage",
    ],
  },
  {
    prefix: "/dashboard/modules/truesend",
    anyOf: [
      "notifications.view",
      "notifications.manage_settings",
      "notifications.send_broadcast",
      "notifications.view_logs",
      "truesend.view",
      "truesend.manage",
    ],
  },
  { prefix: "/dashboard/modules/trueidentity", anyOf: ["trueidentity.view", "trueidentity.manage"] },
  {
    prefix: "/dashboard/borrowers",
    anyOf: ["borrowers.view", "borrowers.create", "borrowers.edit"],
  },
  {
    prefix: "/dashboard/applications",
    anyOf: [
      "applications.view",
      "applications.create",
      "applications.edit",
      "applications.approve_l1",
      "applications.approve_l2",
      "applications.reject",
    ],
  },
  {
    prefix: "/dashboard/loans",
    exact: true,
    anyOf: ["loans.view", "loans.manage", "loans.disburse"],
  },
  {
    prefix: "/dashboard/loans",
    anyOf: [
      "loans.view",
      "loans.manage",
      "loans.disburse",
      "payments.view",
      "payments.approve",
      "settlements.view",
      "settlements.approve",
      "collections.view",
      "collections.manage",
    ],
  },
  {
    prefix: "/dashboard/products",
    anyOf: ["products.view", "products.create", "products.edit", "products.archive"],
  },
  {
    prefix: "/dashboard/compliance",
    anyOf: ["compliance.view", "compliance.review", "compliance.export", "reports.view", "reports.export"],
  },
  { prefix: "/dashboard/reports", anyOf: ["reports.view", "reports.export"] },
  { prefix: "/dashboard/billing", anyOf: ["billing.view", "billing.manage"] },
  { prefix: "/dashboard/subscription", anyOf: ["billing.view", "billing.manage"] },
  { prefix: "/dashboard/plan", anyOf: ["billing.view", "billing.manage"] },
  { prefix: "/dashboard/debt-marketplace", anyOf: ["loans.view", "dashboard.view"] },
  { prefix: "/dashboard/promotions", anyOf: ["dashboard.view"] },
  { prefix: "/dashboard/calculator", anyOf: ["dashboard.view"] },
  { prefix: "/dashboard/contact", anyOf: ["dashboard.view"] },
  { prefix: "/dashboard/help", anyOf: ["dashboard.view"] },
  { prefix: "/dashboard/onboarding", anyOf: ["dashboard.view"] },
  { prefix: "/dashboard/profile", anyOf: ["dashboard.view"] },
  { prefix: "/dashboard/security-setup", anyOf: ["dashboard.view"] },
  {
    prefix: "/dashboard/truekredit-pro/payment-approvals",
    anyOf: ["payments.view", "payments.approve"],
  },
  {
    prefix: "/dashboard/truekredit-pro/early-settlement-approvals",
    anyOf: ["settlements.view", "settlements.approve"],
  },
  {
    prefix: "/dashboard/truekredit-pro/attestation-meetings",
    anyOf: ["attestation.view", "attestation.schedule", "attestation.witness_sign"],
  },
  {
    prefix: "/dashboard/truekredit-pro/availability",
    anyOf: ["availability.view", "availability.manage"],
  },
  {
    prefix: "/dashboard/truekredit-pro/signing-certificates",
    anyOf: ["signing_certificates.view", "signing_certificates.manage", "attestation.witness_sign"],
  },
  {
    prefix: "/dashboard/truekredit-pro/agreements",
    anyOf: ["agreements.view", "agreements.manage"],
  },
  { prefix: "/dashboard", anyOf: ["dashboard.view"] },
];

export function normalizePermissions(
  permissions: string[] | undefined | null
): TenantPermission[] {
  if (!permissions?.length) return [];
  return [...new Set(permissions)].filter((permission): permission is TenantPermission =>
    FULL_TENANT_PERMISSION_SET.has(permission as TenantPermission)
  );
}

export function hasPermission(
  permissions: string[] | undefined | null,
  permission: TenantPermission
): boolean {
  return normalizePermissions(permissions).includes(permission);
}

export function hasAnyPermission(
  permissions: string[] | undefined | null,
  ...required: TenantPermission[]
): boolean {
  const current = new Set(normalizePermissions(permissions));
  return required.some((permission) => current.has(permission));
}

export function canAccessPage(
  permissions: string[] | undefined | null,
  path: string
): boolean {
  const rule = PAGE_ACCESS_RULES.find(
    ({ prefix, exact }) =>
      exact ? path === prefix : path === prefix || path.startsWith(`${prefix}/`)
  );

  if (!rule) return true;
  return hasAnyPermission(permissions, ...rule.anyOf);
}

export function canApproveApplications(
  permissions: string[] | undefined | null
): boolean {
  return hasAnyPermission(
    permissions,
    "applications.approve_l1",
    "applications.approve_l2"
  );
}

export function canApproveApplicationsL1(
  permissions: string[] | undefined | null
): boolean {
  return hasPermission(permissions, "applications.approve_l1");
}

export function canApproveApplicationsL2(
  permissions: string[] | undefined | null
): boolean {
  return hasPermission(permissions, "applications.approve_l2");
}

export function canManageProducts(
  permissions: string[] | undefined | null
): boolean {
  return hasAnyPermission(
    permissions,
    "products.create",
    "products.edit",
    "products.archive"
  );
}

export function canManageBorrowers(
  permissions: string[] | undefined | null
): boolean {
  return hasAnyPermission(permissions, "borrowers.create", "borrowers.edit");
}

export function canCreateApplications(
  permissions: string[] | undefined | null
): boolean {
  return hasPermission(permissions, "applications.create");
}

export function canEditApplications(
  permissions: string[] | undefined | null
): boolean {
  return hasPermission(permissions, "applications.edit");
}

export function canManageLoans(
  permissions: string[] | undefined | null
): boolean {
  return hasAnyPermission(
    permissions,
    "loans.manage",
    "loans.disburse",
    "payments.approve",
    "settlements.approve",
    "collections.manage"
  );
}

export function canApprovePayments(
  permissions: string[] | undefined | null
): boolean {
  return hasPermission(permissions, "payments.approve");
}

export function canApproveSettlements(
  permissions: string[] | undefined | null
): boolean {
  return hasPermission(permissions, "settlements.approve");
}

export function canManageComplianceExports(
  permissions: string[] | undefined | null
): boolean {
  return hasAnyPermission(permissions, "compliance.export", "reports.export");
}

export function canViewReports(
  permissions: string[] | undefined | null
): boolean {
  return hasAnyPermission(permissions, "reports.view", "reports.export");
}

export function canManageAgreements(
  permissions: string[] | undefined | null
): boolean {
  return hasPermission(permissions, "agreements.manage");
}

export function canManageSigningCertificates(
  permissions: string[] | undefined | null
): boolean {
  return hasAnyPermission(
    permissions,
    "signing_certificates.manage",
    "attestation.witness_sign"
  );
}

export function canManageAvailability(
  permissions: string[] | undefined | null
): boolean {
  return hasPermission(permissions, "availability.manage");
}

export function canManageTrueSend(
  permissions: string[] | undefined | null
): boolean {
  return hasAnyPermission(
    permissions,
    "truesend.manage",
    "notifications.manage_settings"
  );
}

export function canManageNotifications(
  permissions: string[] | undefined | null
): boolean {
  return hasAnyPermission(
    permissions,
    "notifications.manage_settings",
    "notifications.send_broadcast"
  );
}

export function canManageTrueIdentity(
  permissions: string[] | undefined | null
): boolean {
  return hasPermission(permissions, "trueidentity.manage");
}

export function canManageSettings(
  permissions: string[] | undefined | null
): boolean {
  return hasPermission(permissions, "tenant_settings.edit");
}

export function canManageRoles(
  permissions: string[] | undefined | null
): boolean {
  return hasPermission(permissions, "roles.manage");
}
