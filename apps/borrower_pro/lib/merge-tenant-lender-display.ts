import type { LenderInfo } from "@kredit/borrower";

/** Multi-line `\n`-aware trim; yields one-line array when no newlines */
export function businessAddressToLines(
  address: string | null | undefined
): readonly string[] {
  if (!address?.trim()) return [];
  const lines = address
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 0) return lines;
  return [address.trim()];
}

/** Display phone row + dial href using tenant contact when provided; preserves fallbacks eg Pinjocep placeholders */
export function normalizePhoneHref(
  contactNumber: string | null | undefined,
  fallbackPhone: string,
  fallbackHref: string
): { phone: string; phoneHref: string } {
  const t = contactNumber?.trim();
  if (!t) {
    return { phone: fallbackPhone, phoneHref: fallbackHref };
  }

  const digitsOnly = t.replace(/\D/g, "");
  if (!digitsOnly) {
    return { phone: t, phoneHref: fallbackHref };
  }

  let telHref: string;
  if (digitsOnly.startsWith("60")) {
    telHref = `tel:+${digitsOnly}`;
  } else if (digitsOnly.startsWith("0")) {
    telHref = `tel:+60${digitsOnly.slice(1)}`;
  } else {
    telHref = `tel:+${digitsOnly}`;
  }

  return { phone: t, phoneHref: telHref };
}

export type StaticLenderFields = {
  lenderName: string;
  legalName: string;
  email: string;
  phone: string;
  phoneHref: string;
  ssm: string;
  kpktLicense: string;
  addressLines: readonly string[];
};

function pickTenantText(value: string | null | undefined, fallback: string): string {
  const x = typeof value === "string" ? value.trim() : "";
  return x || fallback;
}

/**
 * Tenant-first footer / branding fields: Admin-set Tenant overrides static site defaults when present.
 */
export function mergeLenderFooterFields(
  staticFields: StaticLenderFields,
  tenant: LenderInfo | null
): StaticLenderFields {
  const nameFromTenant = tenant?.name?.trim();
  const lenderName = nameFromTenant ?? staticFields.lenderName;
  const legalName = nameFromTenant ?? staticFields.legalName;

  const addrFromTenant = businessAddressToLines(tenant?.businessAddress);
  const addressLines =
    addrFromTenant.length > 0 ? addrFromTenant : [...staticFields.addressLines];

  const phone = normalizePhoneHref(
    tenant?.contactNumber ?? null,
    staticFields.phone,
    staticFields.phoneHref
  );

  return {
    lenderName,
    legalName,
    email: pickTenantText(tenant?.email ?? null, staticFields.email),
    phone: phone.phone,
    phoneHref: phone.phoneHref,
    ssm: pickTenantText(tenant?.registrationNumber ?? null, staticFields.ssm),
    kpktLicense: pickTenantText(tenant?.licenseNumber ?? null, staticFields.kpktLicense),
    addressLines,
  };
}
