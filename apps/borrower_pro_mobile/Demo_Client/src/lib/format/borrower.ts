import { parsePhoneNumber, formatPhoneNumber } from 'react-phone-number-input';

import { getCountryName, getStateName } from '@/lib/address-options';

const DISPLAY_FALLBACK = '—';

const OPTION_LABELS = {
  documentType: {
    IC: 'IC (MyKad)',
    PASSPORT: 'Passport',
  },
  bankName: {
    MAYBANK: 'Maybank',
    CIMB: 'CIMB Bank',
    PUBLIC_BANK: 'Public Bank',
    RHB: 'RHB Bank',
    HONG_LEONG: 'Hong Leong Bank',
    AMBANK: 'AmBank',
    BANK_ISLAM: 'Bank Islam',
    BANK_RAKYAT: 'Bank Rakyat',
    BSN: 'BSN',
    AFFIN: 'Affin Bank',
    ALLIANCE: 'Alliance Bank',
    OCBC: 'OCBC Bank',
    UOB: 'UOB',
    HSBC: 'HSBC',
    STANDARD_CHARTERED: 'Standard Chartered',
    AGROBANK: 'Agrobank',
    MUAMALAT: 'Bank Muamalat',
    OTHER: 'Lain-lain (Other)',
  },
  gender: {
    MALE: 'Male',
    FEMALE: 'Female',
  },
  race: {
    MELAYU: 'Melayu',
    CINA: 'Cina',
    INDIA: 'India',
    LAIN_LAIN: 'Lain-lain',
    BUMIPUTRA_SABAH_SARAWAK: 'Bumiputra Sabah/Sarawak',
    BUKAN_WARGANEGARA: 'Bukan Warganegara',
  },
  educationLevel: {
    NO_FORMAL: 'Tiada Pendidikan Formal',
    PRIMARY: 'Sekolah Rendah',
    SECONDARY: 'Sekolah Menengah',
    DIPLOMA: 'Diploma',
    DEGREE: 'Ijazah Sarjana Muda',
    POSTGRADUATE: 'Pasca Siswazah',
  },
  employmentStatus: {
    EMPLOYED: 'Bekerja',
    SELF_EMPLOYED: 'Bekerja Sendiri',
    UNEMPLOYED: 'Tidak Bekerja',
    RETIRED: 'Bersara',
    STUDENT: 'Pelajar',
  },
  bumiStatus: {
    BUMI: 'Bumiputera',
    BUKAN_BUMI: 'Bukan Bumiputera',
    ASING: 'Asing',
  },
  emergencyContactRelationship: {
    SPOUSE: 'Spouse',
    PARENT: 'Parent',
    SIBLING: 'Sibling',
    CHILD: 'Child',
    FRIEND: 'Friend',
    OTHER: 'Other',
  },
} as const;

type OptionKind = keyof typeof OPTION_LABELS;

function toTrimmedString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

export function normalizeDisplayValue(value: unknown): string {
  return toTrimmedString(value) ?? DISPLAY_FALLBACK;
}

export function formatBorrowerTypeLabel(value: string | null | undefined): string {
  return value === 'CORPORATE' ? 'Corporate' : 'Individual';
}

export function getBorrowerDisplayName(data: {
  borrowerType?: string | null;
  companyName?: string | null;
  name?: string | null;
}): string {
  if (data.borrowerType === 'CORPORATE') {
    return toTrimmedString(data.companyName) ?? toTrimmedString(data.name) ?? 'Borrower';
  }

  return toTrimmedString(data.name) ?? toTrimmedString(data.companyName) ?? 'Borrower';
}

export function formatOptionLabel(kind: OptionKind, value: string | null | undefined): string {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    return DISPLAY_FALLBACK;
  }

  return OPTION_LABELS[kind][normalized as keyof (typeof OPTION_LABELS)[typeof kind]] ?? normalized;
}

export function formatBankLabel(
  bankName: string | null | undefined,
  bankNameOther?: string | null | undefined,
): string {
  if (bankName === 'OTHER') {
    return toTrimmedString(bankNameOther) ?? OPTION_LABELS.bankName.OTHER;
  }

  return formatOptionLabel('bankName', bankName);
}

export function formatCurrency(value: string | number | null | undefined): string {
  if (value === '' || value === null || value === undefined) {
    return DISPLAY_FALLBACK;
  }

  const numberValue = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(numberValue)) {
    return DISPLAY_FALLBACK;
  }

  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numberValue);
}

export function formatICForDisplay(icNumber: string | null | undefined): string {
  const normalized = toTrimmedString(icNumber);
  if (!normalized) {
    return DISPLAY_FALLBACK;
  }

  const cleanIC = normalized.replace(/[-\s]/g, '');
  if (/^\d{12}$/.test(cleanIC)) {
    return `${cleanIC.slice(0, 6)}-${cleanIC.slice(6, 8)}-${cleanIC.slice(8)}`;
  }

  return normalized;
}

export function formatBorrowerDocumentLine(data: {
  borrowerType?: string | null;
  documentType?: string | null;
  icNumber?: string | null;
  ssmRegistrationNo?: string | null;
}): string {
  if (data.borrowerType === 'CORPORATE') {
    return `SSM: ${normalizeDisplayValue(data.ssmRegistrationNo)}`;
  }

  if (data.documentType === 'PASSPORT') {
    return normalizeDisplayValue(data.icNumber);
  }

  return formatICForDisplay(data.icNumber);
}

export function formatAddressValue(data: {
  address?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  businessAddress?: string | null;
}): string {
  const primaryLine =
    toTrimmedString(data.addressLine1) ??
    toTrimmedString(data.businessAddress) ??
    toTrimmedString(data.address);

  const localityParts = [
    toTrimmedString(data.city),
    toTrimmedString(getStateName(data.country, data.state) ?? data.state),
    toTrimmedString(data.postcode),
  ].filter((part): part is string => Boolean(part));

  const parts = [
    primaryLine,
    toTrimmedString(data.addressLine2),
    localityParts.length > 0 ? localityParts.join(', ') : null,
    toTrimmedString(getCountryName(data.country) ?? data.country),
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(', ') : DISPLAY_FALLBACK;
}

export function getFlagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

export function formatPhoneWithFlag(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return DISPLAY_FALLBACK;
  try {
    const parsed = parsePhoneNumber(trimmed);
    if (parsed?.country) {
      const flag = getFlagEmoji(parsed.country);
      const formatted = formatPhoneNumber(trimmed);
      return `${flag} ${formatted || trimmed}`;
    }
  } catch {}
  return trimmed;
}

export function humanizeToken(value: string | null | undefined, fallback = DISPLAY_FALLBACK): string {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    return fallback;
  }

  return normalized
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatBooleanLabel(value: boolean | null | undefined): string {
  if (typeof value !== 'boolean') {
    return DISPLAY_FALLBACK;
  }

  return value ? 'Yes' : 'No';
}
