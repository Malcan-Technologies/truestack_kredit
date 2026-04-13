import { Prisma, PrismaClient } from "@prisma/client";
import {
  DEFAULT_TENANT_ROLE_TEMPLATES,
  FULL_TENANT_PERMISSION_SET,
  LEGACY_TENANT_ROLE_KEY_MAP,
  TENANT_PERMISSIONS,
  getDefaultTenantRoleTemplate,
  getRoleDisplayName,
  type TenantPermission,
} from "@kredit/shared";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type MembershipWithRoleConfig = {
  id: string;
  tenantId: string;
  role: string;
  roleId: string | null;
  isActive: boolean;
  roleConfig?: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    permissions: string[];
    isSystem: boolean;
    isEditable: boolean;
    isDefault: boolean;
  } | null;
};

export interface ResolvedTenantAccess {
  roleId: string | null;
  roleKey: string;
  roleName: string;
  description: string | null;
  permissions: TenantPermission[];
  isOwner: boolean;
  isSystemRole: boolean;
  isEditable: boolean;
  isDefaultRole: boolean;
}

export interface ResolvedAssignableTenantRole {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: TenantPermission[];
  isSystem: boolean;
  isEditable: boolean;
  isDefault: boolean;
}

function normalizeTenantRoleKey(role: string | null | undefined): string {
  if (!role) return "GENERAL_STAFF";
  return LEGACY_TENANT_ROLE_KEY_MAP[role] ?? role;
}

function sanitizePermissions(permissions: string[]): TenantPermission[] {
  const unique = [...new Set(permissions)];
  return unique.filter((permission): permission is TenantPermission =>
    FULL_TENANT_PERMISSION_SET.has(permission as TenantPermission)
  );
}

function toResolvedAssignableRole(role: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  isEditable: boolean;
  isDefault: boolean;
}): ResolvedAssignableTenantRole {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    permissions: sanitizePermissions(role.permissions),
    isSystem: role.isSystem,
    isEditable: role.isEditable,
    isDefault: role.isDefault,
  };
}

export async function ensureTenantRoleCatalog(
  db: PrismaLike,
  tenantId: string
): Promise<ResolvedAssignableTenantRole[]> {
  const existingRoles = await db.tenantRole.findMany({
    where: { tenantId },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      permissions: true,
      isSystem: true,
      isEditable: true,
      isDefault: true,
    },
  });
  const existingByKey = new Map(existingRoles.map((role) => [role.key, role]));

  for (const template of DEFAULT_TENANT_ROLE_TEMPLATES) {
    const existing = existingByKey.get(template.key);

    if (!existing) {
      await db.tenantRole.create({
        data: {
          tenantId,
          key: template.key,
          name: template.name,
          description: template.description,
          permissions: [...template.permissions],
          isSystem: template.isSystem,
          isEditable: template.isEditable,
          isDefault: template.isDefault,
        },
      });
      continue;
    }

    // Keep editable default roles customizable per tenant.
    // Only enforce the immutable OWNER role metadata/template.
    if (template.key === "OWNER") {
      await db.tenantRole.update({
        where: { id: existing.id },
        data: {
          name: template.name,
          description: template.description,
          permissions: [...template.permissions],
          isSystem: template.isSystem,
          isEditable: template.isEditable,
          isDefault: template.isDefault,
        },
      });
    }
  }

  const roles = await db.tenantRole.findMany({
    where: { tenantId },
    orderBy: [{ isSystem: "desc" }, { isDefault: "desc" }, { name: "asc" }],
  });

  return roles.map(toResolvedAssignableRole);
}

export async function ensureTenantMembershipRoleAssignments(
  db: PrismaLike,
  tenantId: string
): Promise<void> {
  const roles = await ensureTenantRoleCatalog(db, tenantId);
  const roleMap = new Map(roles.map((role) => [role.key, role]));
  const memberships = await db.tenantMember.findMany({
    where: { tenantId },
    select: {
      id: true,
      role: true,
      roleId: true,
    },
  });

  for (const membership of memberships) {
    const normalizedKey = normalizeTenantRoleKey(membership.role);
    const matchingRole = roleMap.get(normalizedKey);
    if (!matchingRole) continue;

    if (membership.role !== matchingRole.key || membership.roleId !== matchingRole.id) {
      await db.tenantMember.update({
        where: { id: membership.id },
        data: {
          role: matchingRole.key,
          roleId: matchingRole.id,
        },
      });
    }
  }
}

export async function resolveAssignableTenantRole(
  db: PrismaLike,
  tenantId: string,
  input: {
    roleId?: string | null;
    roleKey?: string | null;
    legacyRole?: string | null;
  }
): Promise<ResolvedAssignableTenantRole> {
  await ensureTenantRoleCatalog(db, tenantId);

  if (input.roleId) {
    const byId = await db.tenantRole.findFirst({
      where: {
        id: input.roleId,
        tenantId,
      },
    });

    if (!byId) {
      throw new Error("Role not found for this tenant");
    }

    return toResolvedAssignableRole(byId);
  }

  const normalizedKey = normalizeTenantRoleKey(
    input.roleKey ?? input.legacyRole ?? "GENERAL_STAFF"
  );
  const byKey = await db.tenantRole.findUnique({
    where: {
      tenantId_key: {
        tenantId,
        key: normalizedKey,
      },
    },
  });

  if (!byKey) {
    throw new Error(`Role "${normalizedKey}" not found for this tenant`);
  }

  return toResolvedAssignableRole(byKey);
}

export async function resolveTenantAccess(
  db: PrismaLike,
  membership: MembershipWithRoleConfig
): Promise<ResolvedTenantAccess> {
  await ensureTenantRoleCatalog(db, membership.tenantId);

  const normalizedKey = normalizeTenantRoleKey(membership.role);
  let roleConfig =
    membership.roleConfig && membership.roleConfig.key === normalizedKey
      ? membership.roleConfig
      : null;

  if (!roleConfig && membership.roleId) {
    roleConfig = await db.tenantRole.findFirst({
      where: {
        id: membership.roleId,
        tenantId: membership.tenantId,
      },
    });
  }

  if (!roleConfig) {
    roleConfig = await db.tenantRole.findUnique({
      where: {
        tenantId_key: {
          tenantId: membership.tenantId,
          key: normalizedKey,
        },
      },
    });
  }

  if (!roleConfig) {
    const fallbackTemplate = getDefaultTenantRoleTemplate("GENERAL_STAFF");
    roleConfig = await db.tenantRole.findUnique({
      where: {
        tenantId_key: {
          tenantId: membership.tenantId,
          key: fallbackTemplate?.key ?? "GENERAL_STAFF",
        },
      },
    });
  }

  if (!roleConfig) {
    throw new Error("Unable to resolve tenant role configuration");
  }

  if (membership.role !== roleConfig.key || membership.roleId !== roleConfig.id) {
    await db.tenantMember.update({
      where: { id: membership.id },
      data: {
        role: roleConfig.key,
        roleId: roleConfig.id,
      },
    });
  }

  const permissions =
    roleConfig.key === "OWNER"
      ? [...TENANT_PERMISSIONS]
      : sanitizePermissions(roleConfig.permissions);

  return {
    roleId: roleConfig.id,
    roleKey: roleConfig.key,
    roleName: roleConfig.name || getRoleDisplayName(roleConfig.key),
    description: roleConfig.description,
    permissions,
    isOwner: roleConfig.key === "OWNER",
    isSystemRole: roleConfig.isSystem,
    isEditable: roleConfig.isEditable,
    isDefaultRole: roleConfig.isDefault,
  };
}
