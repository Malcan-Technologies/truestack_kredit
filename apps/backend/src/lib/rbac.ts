import { Prisma, PrismaClient } from "@prisma/client";
import {
  DEFAULT_TENANT_ROLE_TEMPLATES,
  FULL_TENANT_PERMISSION_SET,
  LEGACY_TENANT_ROLE_KEY_MAP,
  TENANT_PERMISSIONS,
  TENANT_ROLE_CATALOG_REVISION,
  getDefaultTenantRoleTemplate,
  getRoleDisplayName,
  type TenantPermission,
} from "@kredit/shared";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

/** Per-process: tenant catalog has been fully synced for this revision (inserts + immutable updates). */
const tenantCatalogSyncCache = new Set<string>();

function isRootPrismaClient(db: PrismaLike): db is PrismaClient {
  return "$transaction" in db;
}

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

type TenantRoleConfig = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  isEditable: boolean;
  isDefault: boolean;
};

async function findTenantRoleConfigForMembership(
  db: PrismaLike,
  membership: MembershipWithRoleConfig,
  normalizedKey: string
): Promise<TenantRoleConfig | null> {
  let roleConfig: TenantRoleConfig | null =
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

  return roleConfig;
}

async function findTenantFallbackRoleConfig(
  db: PrismaLike,
  tenantId: string
): Promise<TenantRoleConfig | null> {
  const fallbackTemplate = getDefaultTenantRoleTemplate("GENERAL_STAFF");
  return db.tenantRole.findUnique({
    where: {
      tenantId_key: {
        tenantId,
        key: fallbackTemplate?.key ?? "GENERAL_STAFF",
      },
    },
  });
}

/**
 * Self-heal missing **preset** roles for a tenant (keys in {@link DEFAULT_TENANT_ROLE_TEMPLATES}).
 *
 * Does **not** modify tenant-created custom roles: those use unique keys outside the preset list, and
 * we never iterate or update arbitrary `TenantRole` rows.
 *
 * Does **not** overwrite name/permissions for editable default presets (e.g. `OPS_ADMIN`,
 * `GENERAL_STAFF`): we only `createMany` rows that are **missing**; we do not bulk-update every
 * default. Tenant edits to those roles persist until an explicit API reset (`POST .../reset`).
 *
 * **Does** re-apply the platform template to immutable system presets `OWNER` and `SUPER_ADMIN`
 * on a full sync (cache miss)—those roles are not tenant-editable in the UI.
 */
export async function ensureTenantRoleCatalog(
  db: PrismaLike,
  tenantId: string
): Promise<ResolvedAssignableTenantRole[]> {
  const cacheKey = `${tenantId}:${TENANT_ROLE_CATALOG_REVISION}`;

  if (tenantCatalogSyncCache.has(cacheKey)) {
    const roles = await db.tenantRole.findMany({
      where: { tenantId },
      orderBy: [{ isSystem: "desc" }, { isDefault: "desc" }, { name: "asc" }],
    });
    return roles.map(toResolvedAssignableRole);
  }

  const existing = await db.tenantRole.findMany({
    where: { tenantId },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((row) => row.key));

  const missingTemplates = DEFAULT_TENANT_ROLE_TEMPLATES.filter(
    (template) => !existingKeys.has(template.key)
  );

  if (missingTemplates.length > 0) {
    await db.tenantRole.createMany({
      data: missingTemplates.map((template) => ({
        tenantId,
        key: template.key,
        name: template.name,
        description: template.description,
        permissions: [...template.permissions],
        isSystem: template.isSystem,
        isEditable: template.isEditable,
        isDefault: template.isDefault,
      })),
      skipDuplicates: true,
    });
  }

  // Enforce immutable system templates (OWNER / SUPER_ADMIN) when we run a full sync.
  for (const key of ["OWNER", "SUPER_ADMIN"] as const) {
    const template = getDefaultTenantRoleTemplate(key);
    if (!template) continue;
    await db.tenantRole.update({
      where: {
        tenantId_key: {
          tenantId,
          key: template.key,
        },
      },
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

  // Only cache sync completion after a committed write on the root Prisma client.
  // When called with a transaction client, outer transaction rollback should not poison cache.
  if (isRootPrismaClient(db)) {
    tenantCatalogSyncCache.add(cacheKey);
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
  const normalizedKey = normalizeTenantRoleKey(membership.role);
  let roleConfig = await findTenantRoleConfigForMembership(
    db,
    membership,
    normalizedKey
  );

  if (!roleConfig) {
    // Self-heal missing tenant role catalogs or newly introduced default roles,
    // but keep the normal auth path read-only when the expected role already exists.
    await ensureTenantRoleCatalog(db, membership.tenantId);
    roleConfig = await findTenantRoleConfigForMembership(
      db,
      membership,
      normalizedKey
    );
  }

  if (!roleConfig) {
    roleConfig = await findTenantFallbackRoleConfig(db, membership.tenantId);
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
    roleConfig.key === "OWNER" || roleConfig.key === "SUPER_ADMIN"
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
