export const TENANT_PERMISSIONS = [
  "dashboard.view",
  "borrowers.view",
  "borrowers.create",
  "borrowers.edit",
  "applications.view",
  "applications.create",
  "applications.edit",
  "applications.approve_l1",
  "applications.approve_l2",
  "applications.reject",
  "loans.view",
  "loans.manage",
  "loans.disburse",
  "payments.view",
  "payments.approve",
  "payments.reverse",
  "settlements.view",
  "settlements.approve",
  "attestation.view",
  "attestation.schedule",
  "attestation.witness_sign",
  "collections.view",
  "collections.manage",
  "collections.promise_to_pay",
  "collections.restructure",
  "compliance.view",
  "compliance.review",
  "compliance.export",
  "products.view",
  "products.create",
  "products.edit",
  "products.archive",
  "agreements.view",
  "agreements.manage",
  "signing_certificates.view",
  "signing_certificates.manage",
  "availability.view",
  "availability.manage",
  "truesend.view",
  "truesend.manage",
  "notifications.view",
  "notifications.manage_settings",
  "notifications.send_broadcast",
  "notifications.view_logs",
  "trueidentity.view",
  "trueidentity.manage",
  "audit_logs.view",
  "reports.view",
  "reports.export",
  "team.view",
  "team.invite",
  "team.edit_roles",
  "team.deactivate",
  "roles.view",
  "roles.manage",
  "tenant_settings.view",
  "tenant_settings.edit",
  "billing.view",
  "billing.manage",
] as const;

export type TenantPermission = (typeof TENANT_PERMISSIONS)[number];

export const DEFAULT_TENANT_ROLE_KEYS = [
  "OWNER",
  "OPS_ADMIN",
  "GENERAL_STAFF",
  "CREDIT_OFFICER_L1",
  "APPROVAL_AUTHORITY_L2",
  "FINANCE_OFFICER",
  "ATTESTOR",
  "COLLECTIONS_OFFICER",
  "COMPLIANCE_OFFICER",
  "AUDITOR_READONLY",
] as const;

export type DefaultTenantRoleKey = (typeof DEFAULT_TENANT_ROLE_KEYS)[number];
export type TenantRoleKey = DefaultTenantRoleKey | (string & {});

export interface TenantRoleTemplate {
  key: TenantRoleKey;
  name: string;
  description: string;
  isSystem: boolean;
  isEditable: boolean;
  isDefault: boolean;
  permissions: TenantPermission[];
}

export interface TenantPermissionGroup {
  key: string;
  label: string;
  description: string;
  permissions: TenantPermission[];
}

const allPermissions = [...TENANT_PERMISSIONS];

function pickPermissions(
  ...permissions: TenantPermission[]
): TenantPermission[] {
  return permissions;
}

function withBorrowerPageTrueIdentityDefaults(
  permissions: TenantPermission[]
): TenantPermission[] {
  const permissionSet = new Set<TenantPermission>(permissions);

  if (permissionSet.has("borrowers.view")) {
    permissionSet.add("trueidentity.view");
  }

  if (
    permissionSet.has("borrowers.create") ||
    permissionSet.has("borrowers.edit")
  ) {
    permissionSet.add("trueidentity.view");
    permissionSet.add("trueidentity.manage");
  }

  return [...permissionSet];
}

export const DEFAULT_TENANT_ROLE_TEMPLATES: TenantRoleTemplate[] = [
  {
    key: "OWNER",
    name: "Owner",
    description: "Tenant super admin with unrestricted access and ownership transfer rights.",
    isSystem: true,
    isEditable: false,
    isDefault: true,
    permissions: allPermissions,
  },
  {
    key: "OPS_ADMIN",
    name: "Operations Admin",
    description: "Day-to-day admin across operations without ownership or role-system control.",
    isSystem: false,
    isEditable: true,
    isDefault: true,
    permissions: withBorrowerPageTrueIdentityDefaults(pickPermissions(
      "dashboard.view",
      "borrowers.view",
      "borrowers.create",
      "borrowers.edit",
      "applications.view",
      "applications.create",
      "applications.edit",
      "applications.approve_l1",
      "applications.reject",
      "loans.view",
      "loans.manage",
      "payments.view",
      "settlements.view",
      "attestation.view",
      "attestation.schedule",
      "collections.view",
      "collections.manage",
      "collections.promise_to_pay",
      "collections.restructure",
      "compliance.view",
      "compliance.review",
      "products.view",
      "agreements.view",
      "availability.view",
      "trueidentity.view",
      "notifications.view",
      "notifications.manage_settings",
      "notifications.send_broadcast",
      "notifications.view_logs",
      "reports.view",
      "team.view",
      "team.invite",
      "tenant_settings.view",
      "tenant_settings.edit",
      "billing.view"
    )),
  },
  {
    key: "GENERAL_STAFF",
    name: "General Staff",
    description: "Low-privilege operating role for routine borrower and application handling.",
    isSystem: false,
    isEditable: true,
    isDefault: true,
    permissions: withBorrowerPageTrueIdentityDefaults(pickPermissions(
      "dashboard.view",
      "borrowers.view",
      "borrowers.create",
      "borrowers.edit",
      "applications.view",
      "applications.create",
      "applications.edit",
      "loans.view",
      "notifications.view",
      "payments.view",
      "settlements.view",
      "attestation.view",
      "agreements.view",
      "availability.view"
    )),
  },
  {
    key: "CREDIT_OFFICER_L1",
    name: "Credit Officer L1",
    description: "First-line underwriter for application review and amendment loops.",
    isSystem: false,
    isEditable: true,
    isDefault: true,
    permissions: withBorrowerPageTrueIdentityDefaults(pickPermissions(
      "dashboard.view",
      "borrowers.view",
      "borrowers.create",
      "borrowers.edit",
      "applications.view",
      "applications.create",
      "applications.edit",
      "applications.approve_l1",
      "applications.reject",
      "loans.view",
      "notifications.view",
      "compliance.view",
      "reports.view"
    )),
  },
  {
    key: "APPROVAL_AUTHORITY_L2",
    name: "Approval Authority L2",
    description: "Senior approver for final credit decisions and high-level oversight.",
    isSystem: false,
    isEditable: true,
    isDefault: true,
    permissions: pickPermissions(
      "dashboard.view",
      "applications.view",
      "applications.approve_l2",
      "applications.reject",
      "loans.view",
      "notifications.view",
      "compliance.view",
      "audit_logs.view",
      "reports.view"
    ),
  },
  {
    key: "FINANCE_OFFICER",
    name: "Finance Officer",
    description: "Handles disbursements, payment approvals, settlements, and finance reporting.",
    isSystem: false,
    isEditable: true,
    isDefault: true,
    permissions: pickPermissions(
      "dashboard.view",
      "loans.view",
      "loans.disburse",
      "payments.view",
      "payments.approve",
      "settlements.view",
      "settlements.approve",
      "notifications.view",
      "reports.view",
      "reports.export",
      "billing.view",
      "tenant_settings.view"
    ),
  },
  {
    key: "ATTESTOR",
    name: "Attestor",
    description: "Witness-only role for attestation meetings and limited agreement visibility.",
    isSystem: false,
    isEditable: true,
    isDefault: true,
    permissions: pickPermissions(
      "dashboard.view",
      "attestation.view",
      "attestation.schedule",
      "attestation.witness_sign",
      "agreements.view"
    ),
  },
  {
    key: "COLLECTIONS_OFFICER",
    name: "Collections Officer",
    description: "Manages delinquent accounts, restructuring discussions, and collections reporting.",
    isSystem: false,
    isEditable: true,
    isDefault: true,
    permissions: pickPermissions(
      "dashboard.view",
      "loans.view",
      "payments.view",
      "collections.view",
      "collections.manage",
      "collections.promise_to_pay",
      "collections.restructure",
      "notifications.view",
      "reports.view"
    ),
  },
  {
    key: "COMPLIANCE_OFFICER",
    name: "Compliance Officer",
    description: "Owns compliance review, evidence gathering, and regulatory exports.",
    isSystem: false,
    isEditable: true,
    isDefault: true,
    permissions: withBorrowerPageTrueIdentityDefaults(pickPermissions(
      "dashboard.view",
      "borrowers.view",
      "applications.view",
      "loans.view",
      "compliance.view",
      "compliance.review",
      "compliance.export",
      "agreements.view",
      "signing_certificates.view",
      "trueidentity.view",
      "notifications.view",
      "audit_logs.view",
      "reports.view",
      "reports.export"
    )),
  },
  {
    key: "AUDITOR_READONLY",
    name: "Auditor Read Only",
    description: "Read-only access for internal audit and external review.",
    isSystem: false,
    isEditable: true,
    isDefault: true,
    permissions: withBorrowerPageTrueIdentityDefaults(pickPermissions(
      "dashboard.view",
      "borrowers.view",
      "applications.view",
      "loans.view",
      "payments.view",
      "settlements.view",
      "attestation.view",
      "collections.view",
      "compliance.view",
      "products.view",
      "agreements.view",
      "signing_certificates.view",
      "availability.view",
      "truesend.view",
      "notifications.view",
      "notifications.view_logs",
      "trueidentity.view",
      "audit_logs.view",
      "reports.view",
      "team.view",
      "tenant_settings.view",
      "billing.view"
    )),
  },
];

export const LEGACY_TENANT_ROLE_KEY_MAP: Record<string, DefaultTenantRoleKey> = {
  OWNER: "OWNER",
  ADMIN: "OPS_ADMIN",
  STAFF: "GENERAL_STAFF",
};

export const RBAC_PERMISSION_GROUPS: TenantPermissionGroup[] = [
  {
    key: "overview",
    label: "Overview",
    description: "Dashboard and cross-functional visibility.",
    permissions: pickPermissions("dashboard.view"),
  },
  {
    key: "loanOps",
    label: "Loan Operations",
    description: "Borrowers, applications, loans, payments, and attestations.",
    permissions: pickPermissions(
      "borrowers.view",
      "borrowers.create",
      "borrowers.edit",
      "applications.view",
      "applications.create",
      "applications.edit",
      "applications.approve_l1",
      "applications.approve_l2",
      "applications.reject",
      "loans.view",
      "loans.manage",
      "loans.disburse",
      "payments.view",
      "payments.approve",
      "payments.reverse",
      "settlements.view",
      "settlements.approve",
      "attestation.view",
      "attestation.schedule",
      "attestation.witness_sign"
    ),
  },
  {
    key: "collections",
    label: "Collections",
    description: "Past-due follow-up and restructuring actions.",
    permissions: pickPermissions(
      "collections.view",
      "collections.manage",
      "collections.promise_to_pay",
      "collections.restructure"
    ),
  },
  {
    key: "compliance",
    label: "Compliance",
    description: "Compliance review, evidence, and export access.",
    permissions: pickPermissions(
      "compliance.view",
      "compliance.review",
      "compliance.export",
      "audit_logs.view",
      "reports.view",
      "reports.export"
    ),
  },
  {
    key: "configuration",
    label: "Business Configuration",
    description: "Products, agreements, signing, availability, and integrations.",
    permissions: pickPermissions(
      "products.view",
      "products.create",
      "products.edit",
      "products.archive",
      "agreements.view",
      "agreements.manage",
      "signing_certificates.view",
      "signing_certificates.manage",
      "availability.view",
      "availability.manage",
      "truesend.view",
      "truesend.manage",
      "notifications.view",
      "notifications.manage_settings",
      "notifications.send_broadcast",
      "notifications.view_logs",
      "trueidentity.view",
      "trueidentity.manage"
    ),
  },
  {
    key: "administration",
    label: "Administration",
    description: "Team management, roles, settings, and billing.",
    permissions: pickPermissions(
      "team.view",
      "team.invite",
      "team.edit_roles",
      "team.deactivate",
      "roles.view",
      "roles.manage",
      "tenant_settings.view",
      "tenant_settings.edit",
      "billing.view",
      "billing.manage"
    ),
  },
];

export const FULL_TENANT_PERMISSION_SET = new Set<TenantPermission>(
  TENANT_PERMISSIONS
);

export function getDefaultTenantRoleTemplate(
  key: string
): TenantRoleTemplate | undefined {
  return DEFAULT_TENANT_ROLE_TEMPLATES.find((role) => role.key === key);
}

export function getRoleDisplayName(roleKey: string): string {
  return (
    getDefaultTenantRoleTemplate(roleKey)?.name ??
    roleKey
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ")
  );
}

export function isTenantPermission(value: string): value is TenantPermission {
  return FULL_TENANT_PERMISSION_SET.has(value as TenantPermission);
}
