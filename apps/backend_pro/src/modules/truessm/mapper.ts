/**
 * Maps a TrueSSM company profile response into a normalized borrower diff.
 *
 * Imports `MSIC_CODE_DESCRIPTIONS` to resolve `rocBusinessCodeInfos[]` codes
 * (e.g. "47413") to a human-readable industry description for the free-text
 * `Borrower.natureOfBusiness` column.
 *
 * The provider returns a deeply nested envelope:
 *
 *   data.getCompProfile.{
 *     rocCompanyInfo:           {...},           // identity, incorpDate, statusOfCompany, etc.
 *     rocRegAddressInfo:        {...},           // registered office address (preferred)
 *     rocBusinessAddressInfo:   {...},           // business address (fallback)
 *     rocShareCapitalInfo:      {...},           // totalIssued = paid-up capital (RM)
 *     rocCompanyOfficerListInfo.rocCompanyOfficerInfos.rocCompanyOfficerInfos: [...]
 *     rocShareholderListInfo.rocShareholderInfos.rocShareholderInfos:         [...]
 *     rocChargesListInfo.rocChargesInfos.rocChargesInfos:                     [...]
 *   }
 *
 * SSM uses internal single-letter state codes (`B` = Selangor). The borrower
 * record stores ISO 3166-2 codes (`MY-10`) via the `country-state-city`
 * package, so we translate before producing the diff.
 */

import { lookupMsicDescription } from './msicCodes.js';

export const SSM_MAPPABLE_FIELDS = [
  'companyName',
  'ssmRegistrationNo',
  'dateOfIncorporation',
  'paidUpCapital',
  'natureOfBusiness',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postcode',
  'country',
] as const;

export type SsmMappableField = (typeof SSM_MAPPABLE_FIELDS)[number];

export interface SsmFieldDiff {
  field: SsmMappableField;
  label: string;
  current: string | null;
  incoming: string | null;
  /** UI hint: "Will overwrite" (both differ), "Will fill" (current empty), or "Unchanged". */
  action: 'overwrite' | 'fill' | 'unchanged' | 'no_data';
}

export interface SsmCompanyProfileSummary {
  /** Display name of the entity, used in modal copy and toasts. */
  entityName: string | null;
  /** Registry registration number returned by SSM. */
  regNo: string | null;
  /** Free-text registry status if available (e.g. "EXISTING"). */
  status: string | null;
}

export interface SsmCompanyProfileMappingResult {
  summary: SsmCompanyProfileSummary;
  fields: SsmFieldDiff[];
}

/**
 * Action proposed for one director when syncing TrueSSM officers against the
 * borrower's `BorrowerDirector` rows:
 *   - `add`     → No matching director exists; create a new row.
 *   - `update`  → IC matches, but the SSM-reported name differs from ours.
 *   - `verify`  → IC + name match; nothing to write, just stamp provenance.
 */
export type SsmDirectorAction = 'add' | 'update' | 'verify';

export interface SsmDirectorDiffEntry {
  /** Canonicalised IC (uppercase, no dashes/spaces) — used for matching. */
  icNumber: string;
  /** IC as returned by SSM, for display. */
  icNumberRaw: string;
  /** Officer name as returned by SSM. */
  ssmName: string;
  /** Human-readable ID type label (MyKad / Passport / Company / Other). */
  idTypeLabel: string | null;
  /** Date of appointment (ISO yyyy-mm-dd) for display. */
  startDate: string | null;
  action: SsmDirectorAction;
  /** Matched borrower director, if any. */
  match: {
    id: string;
    name: string;
    position: string | null;
    isAuthorizedRepresentative: boolean;
    hasEkyc: boolean;
    hasCompletedEkyc: boolean;
  } | null;
  /**
   * Field-level changes (only populated for `update`). Currently only name
   * is sync-able; position is preserved unless the row is freshly created.
   */
  changes: {
    name?: { from: string; to: string };
  };
}

/**
 * Existing borrower director that has no SSM match. Surfaced as an advisory
 * warning — never auto-removed because they may have e-KYC progress.
 */
export interface SsmDirectorOrphan {
  id: string;
  name: string;
  icNumber: string;
  position: string | null;
  isAuthorizedRepresentative: boolean;
  hasEkyc: boolean;
  hasCompletedEkyc: boolean;
}

export interface SsmDirectorMappingResult {
  summary: {
    entityName: string | null;
    regNo: string | null;
  };
  /** SSM directors with proposed add/update/verify action. */
  diff: SsmDirectorDiffEntry[];
  /** Borrower-side directors not present in the SSM officer list (D only). */
  orphans: SsmDirectorOrphan[];
}

/** Director-facing snapshot of a `BorrowerDirector` row for matching. */
export interface CurrentDirector {
  id: string;
  name: string;
  icNumber: string;
  position: string | null;
  isAuthorizedRepresentative: boolean;
  trueIdentityStatus: string | null;
  trueIdentityResult: string | null;
}

const FIELD_LABELS: Record<SsmMappableField, string> = {
  companyName: 'Company Name',
  ssmRegistrationNo: 'SSM Registration No',
  dateOfIncorporation: 'Date of Incorporation',
  paidUpCapital: 'Paid-up Capital (RM)',
  natureOfBusiness: 'Nature of Business',
  addressLine1: 'Address Line 1',
  addressLine2: 'Address Line 2',
  city: 'City',
  state: 'State',
  postcode: 'Postcode',
  country: 'Country',
};

/**
 * SSM single-letter state codes → `country-state-city` subdivision codes used
 * by the borrower form. The library returns Malaysian states with `isoCode`
 * set to the bare two-digit subdivision code (e.g. `"10"` for Selangor, NOT
 * `"MY-10"`). Keep this table aligned with `getStateOptions('MY')` in
 * `apps/admin_pro/lib/address-options.ts`.
 */
const SSM_STATE_CODE_TO_ISO: Record<string, string> = {
  A: '01', // Johor
  B: '10', // Selangor
  C: '06', // Pahang
  D: '03', // Kelantan
  E: '02', // Kedah
  F: '05', // Negeri Sembilan
  G: '07', // Pulau Pinang
  H: '12', // Sabah
  J: '08', // Perak
  K: '13', // Sarawak
  L: '15', // W.P. Labuan
  M: '04', // Melaka
  N: '09', // Perlis
  P: '11', // Terengganu
  R: '16', // W.P. Putrajaya
  W: '14', // W.P. Kuala Lumpur
};

/**
 * SSM `statusOfCompany` and `companyStatus` are single-letter codes. We surface
 * the most common ones; unknown codes fall through verbatim so admins still see
 * the raw value.
 */
const SSM_STATUS_OF_COMPANY: Record<string, string> = {
  E: 'EXISTING',
  L: 'LIQUIDATED',
  W: 'WOUND UP',
  D: 'DISSOLVED',
  S: 'STRUCK OFF',
};

function translateSsmState(code: string | null): string | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  if (!upper) return null;
  // Already a bare subdivision code ("10") — pass through.
  if (/^\d{2}$/.test(upper)) return upper;
  // Legacy `MY-10` form — strip the prefix to match `country-state-city`.
  const prefixed = upper.match(/^MY-(\d{2})$/);
  if (prefixed) return prefixed[1];
  return SSM_STATE_CODE_TO_ISO[upper] ?? null;
}

function translateSsmCompanyStatus(code: string | null): string | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  if (!upper) return null;
  return SSM_STATUS_OF_COMPANY[upper] ?? upper;
}

/** Read a nested key path, return string if non-empty. */
function readString(source: unknown, ...keys: string[]): string | null {
  if (!source || typeof source !== 'object') return null;
  const obj = source as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function readNumberLike(source: unknown, ...keys: string[]): string | null {
  if (!source || typeof source !== 'object') return null;
  const obj = source as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Parse a TrueSSM date string into ISO yyyy-mm-dd, returning null on failure.
 * SSM returns dates in ISO-8601 with a UTC offset like `"1910-03-10T17:00:00.000Z"`.
 * We extract the date portion in UTC so we don't accidentally shift days due to MYT (+8).
 * Also accepts `dd/mm/yyyy` and `dd-mm-yyyy` for resilience.
 */
function parseSsmDate(value: string | null): string | null {
  if (!value) return null;
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const dmyMatch = value.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (dmyMatch) {
    const dd = dmyMatch[1].padStart(2, '0');
    const mm = dmyMatch[2].padStart(2, '0');
    const yyyy = dmyMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

interface ExtractedAddress {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

/**
 * Extract structured address from one of SSM's address blocks
 * (`rocRegAddressInfo` / `rocBusinessAddressInfo`). SSM concatenates the street
 * across `address1` / `address2` / `address3`; line 2 becomes the join of the
 * tail lines so we don't lose data.
 */
function extractAddressFromBlock(block: Record<string, unknown> | null): ExtractedAddress {
  if (!block) {
    return { addressLine1: null, addressLine2: null, city: null, state: null, postcode: null, country: null };
  }
  const addressLine1 = readString(block, 'address1');
  const line2 = readString(block, 'address2');
  const line3 = readString(block, 'address3');
  const addressLine2 = [line2, line3].filter(Boolean).join(', ') || null;
  const city = readString(block, 'town');
  const stateCode = readString(block, 'state');
  const postcode = readString(block, 'postcode');
  return {
    addressLine1,
    addressLine2,
    city,
    state: translateSsmState(stateCode),
    postcode,
    country: addressLine1 || city || postcode ? 'MY' : null,
  };
}

interface BorrowerCurrent {
  companyName: string | null;
  ssmRegistrationNo: string | null;
  dateOfIncorporation: Date | string | null;
  paidUpCapital: number | string | null;
  natureOfBusiness: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

function dateToISOOnly(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return typeof value === 'string' ? value : null;
  return parsed.toISOString().slice(0, 10);
}

function numberToString(value: number | string | null): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  return String(value).trim() || null;
}

/**
 * Normalise a numeric string returned by SSM. The provider returns paid-up
 * capital with trailing zeroes (e.g. `"1135511271.5500"`); we drop them so the
 * diff doesn't claim "1135511271.55" vs "1135511271.5500" is an overwrite.
 */
function normaliseMoneyString(value: string | null): string | null {
  if (!value) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  // Keep up to 2 decimals (matches Borrower.paidUpCapital column scale)
  return (Math.round(num * 100) / 100).toString();
}

/**
 * Pull the primary MSIC business code out of an SSM `getCompProfile` payload
 * and format it for the borrower's free-text `natureOfBusiness` column.
 *
 * SSM returns one or more entries under
 *   `rocBusinessCodeListInfo.rocBusinessCodeInfos.rocBusinessCodeInfos[]`
 * each shaped roughly as:
 *
 *   { businessCode: "47413", priority: "1", businessDesc?: "..." }
 *
 * Selection rules (deterministic, no UI picker):
 *   1. Prefer the entry with the lowest numeric `priority` (1 = primary).
 *   2. Tie-break by the entry's original index, so a payload already in the
 *      "right" order wins.
 *   3. The displayed value is `"<MSIC description> (<code>)"` when we can
 *      resolve the code locally; otherwise we fall back to whatever string
 *      description SSM included, or to just the code when neither is present.
 *
 * Returns `null` when no usable code is present so the diff records "no_data"
 * and leaves the existing borrower value untouched.
 */
function extractPrimaryBusinessNature(compProfile: Record<string, unknown>): string | null {
  const listOuter = asObject(compProfile['rocBusinessCodeListInfo']);
  const listMid = asObject(listOuter?.['rocBusinessCodeInfos']);
  const arr = listMid?.['rocBusinessCodeInfos'];
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const entries = arr
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((row, idx) => {
      const code = readString(row, 'businessCode', 'msicCode') ?? null;
      const fallbackDesc =
        readString(row, 'businessDesc', 'businessDescription', 'description') ?? null;
      const priorityStr = readString(row, 'priority') ?? '';
      const priority = Number(priorityStr);
      return {
        code: code?.trim() || null,
        fallbackDesc,
        priority: Number.isFinite(priority) ? priority : Number.POSITIVE_INFINITY,
        idx,
      };
    })
    .filter((entry) => entry.code !== null);

  if (entries.length === 0) return null;

  entries.sort((a, b) => a.priority - b.priority || a.idx - b.idx);
  const primary = entries[0]!;
  const code = primary.code!;
  const description = lookupMsicDescription(code) ?? primary.fallbackDesc ?? null;
  return description ? `${description} (${code})` : code;
}

function diffOne(
  field: SsmMappableField,
  current: string | null,
  incoming: string | null,
): SsmFieldDiff {
  if (incoming === null) {
    return { field, label: FIELD_LABELS[field], current, incoming, action: 'no_data' };
  }
  if ((current ?? '') === '') {
    return { field, label: FIELD_LABELS[field], current, incoming, action: 'fill' };
  }
  if ((current ?? '').trim() === incoming.trim()) {
    return { field, label: FIELD_LABELS[field], current, incoming, action: 'unchanged' };
  }
  return { field, label: FIELD_LABELS[field], current, incoming, action: 'overwrite' };
}

/**
 * Public API: turn a raw SSM company profile response into a diff against
 * the borrower record.
 */
export function mapCompanyProfileToBorrowerDiff(
  rawData: unknown,
  borrower: BorrowerCurrent,
): SsmCompanyProfileMappingResult {
  const data = (rawData as Record<string, unknown> | undefined) ?? {};
  const compProfile = asObject(data['getCompProfile']) ?? (data as Record<string, unknown>);

  const roc = asObject(compProfile['rocCompanyInfo']) ?? {};
  const regAddress = asObject(compProfile['rocRegAddressInfo']);
  const businessAddress = asObject(compProfile['rocBusinessAddressInfo']);
  const shareCapital = asObject(compProfile['rocShareCapitalInfo']);

  const incomingCompanyName = readString(roc, 'companyName');
  // Old SSM registration numbers carry a single-letter check digit in a
  // separate `checkDigit` field (e.g. companyNo="67" + checkDigit="W" →
  // canonical form "67-W"). New-format reg numbers (12-digit, post-2017)
  // leave `checkDigit` blank, so we only append the suffix when present.
  const rawCompanyNo = readString(roc, 'companyNo', 'regNo');
  const rawCheckDigit = readString(roc, 'checkDigit');
  const incomingRegNo =
    rawCompanyNo && rawCheckDigit
      ? `${rawCompanyNo}-${rawCheckDigit}`
      : rawCompanyNo;
  const incomingIncorporation = parseSsmDate(readString(roc, 'incorpDate', 'dateOfIncorporation'));
  const incomingPaidUpCapital = normaliseMoneyString(
    readNumberLike(shareCapital, 'totalIssued', 'paidUpCapital') ?? null,
  );
  const incomingNatureOfBusiness = extractPrimaryBusinessNature(compProfile);

  const status =
    translateSsmCompanyStatus(readString(roc, 'statusOfCompany')) ??
    translateSsmCompanyStatus(readString(roc, 'companyStatus'));

  // Prefer registered office address; fall back to business address.
  const address = regAddress
    ? extractAddressFromBlock(regAddress)
    : extractAddressFromBlock(businessAddress);

  const summary: SsmCompanyProfileSummary = {
    entityName: incomingCompanyName,
    regNo: incomingRegNo,
    status,
  };

  const currentIncorporation = dateToISOOnly(borrower.dateOfIncorporation);
  const currentPaidUpCapital = normaliseMoneyString(numberToString(borrower.paidUpCapital));

  const fields: SsmFieldDiff[] = [
    diffOne('companyName', borrower.companyName, incomingCompanyName),
    diffOne('ssmRegistrationNo', borrower.ssmRegistrationNo, incomingRegNo),
    diffOne('dateOfIncorporation', currentIncorporation, incomingIncorporation),
    diffOne('paidUpCapital', currentPaidUpCapital, incomingPaidUpCapital),
    diffOne('natureOfBusiness', borrower.natureOfBusiness, incomingNatureOfBusiness),
    diffOne('addressLine1', borrower.addressLine1, address.addressLine1),
    diffOne('addressLine2', borrower.addressLine2, address.addressLine2),
    diffOne('city', borrower.city, address.city),
    diffOne('state', borrower.state, address.state),
    diffOne('postcode', borrower.postcode, address.postcode),
    diffOne('country', borrower.country, address.country),
  ];

  return { summary, fields };
}

/** Coerce a string incoming value into the right shape for the Borrower update. */
export function castIncomingForUpdate(
  field: SsmMappableField,
  incoming: string,
): Date | number | string | null {
  if (field === 'dateOfIncorporation') {
    const parsed = new Date(incoming);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (field === 'paidUpCapital') {
    const num = Number(incoming);
    return Number.isFinite(num) ? num : null;
  }
  return incoming;
}

/* ============================== Directors ================================ */

/** ID type codes used by the provider. See `apps/admin_pro/docs/TRUESSM_API.md`. */
const SSM_ID_TYPE_LABEL: Record<string, string> = {
  MK: 'MyKad',
  P: 'Passport',
  C: 'Company',
  X: 'Other',
};

/**
 * Canonicalise an IC / passport / company number for matching. Strips every
 * non-alphanumeric character and upper-cases the rest, so e.g.
 *   "850101-14-5678"  →  "850101145678"
 *   "a 1234567(8)"     →  "A12345678"
 *
 * Returns null when nothing usable remains.
 */
export function normaliseIcForMatch(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}

/** Officer entry path: `rocCompanyOfficerListInfo.rocCompanyOfficerInfos.rocCompanyOfficerInfos[]`. */
function readNestedList(
  source: unknown,
  outerKey: string,
  innerKey: string,
): Array<Record<string, unknown>> {
  const outer = asObject((source as Record<string, unknown> | undefined)?.[outerKey]);
  if (!outer) return [];
  const middle = asObject(outer[innerKey]);
  if (!middle) return [];
  const arr = middle[innerKey];
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  );
}

/**
 * Public API: map SSM officers (filtered to Directors only) into a diff
 * against the borrower's `BorrowerDirector` rows.
 *
 * Matching is by **canonicalised IC**. Name-only matching is intentionally
 * NOT supported — a typo'd IC will show up as one "add" + one orphan, which
 * is easier for the admin to reason about than a silent fuzzy match.
 *
 * `position` is never overwritten by an update — admins choose the title
 * (e.g. "Managing Director") and we don't want to clobber it. Newly added
 * directors get `position: "Director"` since that's literally what SSM said.
 */
export function mapCompanyOfficersToDirectorDiff(
  rawData: unknown,
  currentDirectors: CurrentDirector[],
): SsmDirectorMappingResult {
  const data = (rawData as Record<string, unknown> | undefined) ?? {};
  const compProfile = asObject(data['getCompProfile']) ?? (data as Record<string, unknown>);
  const roc = asObject(compProfile['rocCompanyInfo']) ?? {};

  // Summary mirrors the field-diff summary so the modal header can show the
  // entity name + reg no consistently.
  const entityName = readString(roc, 'companyName');
  const rawCompanyNo = readString(roc, 'companyNo', 'regNo');
  const rawCheckDigit = readString(roc, 'checkDigit');
  const regNo =
    rawCompanyNo && rawCheckDigit ? `${rawCompanyNo}-${rawCheckDigit}` : rawCompanyNo;

  const officers = readNestedList(
    compProfile,
    'rocCompanyOfficerListInfo',
    'rocCompanyOfficerInfos',
  );

  // Filter to designation = "D" (Director). Secretaries / auditors / managers
  // / officers don't map to `BorrowerDirector`.
  const directorOfficers = officers.filter(
    (o) => (readString(o, 'designationCode') ?? '').toUpperCase() === 'D',
  );

  // Build a canonical-IC lookup for the borrower side so we can match in O(1).
  const currentByCanonicalIc = new Map<string, CurrentDirector>();
  for (const d of currentDirectors) {
    const canon = normaliseIcForMatch(d.icNumber);
    if (canon) currentByCanonicalIc.set(canon, d);
  }

  const matchedDirectorIds = new Set<string>();
  const diff: SsmDirectorDiffEntry[] = [];
  for (const officer of directorOfficers) {
    const rawIc = readString(officer, 'idNo') ?? '';
    const canonIc = normaliseIcForMatch(rawIc);
    // Skip officers with no usable identifier — there's nothing to match or
    // create cleanly. (Real-world data: government-owned entities sometimes
    // appear as shareholders, but never as directors with no idNo.)
    if (!canonIc) continue;

    const ssmName = readString(officer, 'name') ?? '';
    const idType = (readString(officer, 'idType') ?? '').toUpperCase();
    const idTypeLabel = SSM_ID_TYPE_LABEL[idType] ?? (idType || null);
    const startDate = parseSsmDate(
      readString(officer, 'appointmentDate', 'startDate'),
    );

    const match = currentByCanonicalIc.get(canonIc) ?? null;
    if (match) matchedDirectorIds.add(match.id);

    let action: SsmDirectorAction;
    const changes: SsmDirectorDiffEntry['changes'] = {};
    if (!match) {
      action = 'add';
    } else {
      const existingName = match.name.trim();
      const incomingName = ssmName.trim();
      // Use case-insensitive comparison so trivial casing differences ("Tan
      // Ah Kow" vs "TAN AH KOW") don't flag a needless update. The SSM
      // payload usually uppercases names.
      if (
        existingName.length > 0 &&
        incomingName.length > 0 &&
        existingName.toUpperCase() === incomingName.toUpperCase()
      ) {
        action = 'verify';
      } else {
        action = 'update';
        changes.name = { from: existingName, to: incomingName };
      }
    }

    diff.push({
      icNumber: canonIc,
      icNumberRaw: rawIc,
      ssmName,
      idTypeLabel,
      startDate,
      action,
      match: match
        ? {
            id: match.id,
            name: match.name,
            position: match.position,
            isAuthorizedRepresentative: match.isAuthorizedRepresentative,
            hasEkyc: Boolean(match.trueIdentityStatus),
            hasCompletedEkyc:
              match.trueIdentityStatus === 'completed' &&
              match.trueIdentityResult === 'approved',
          }
        : null,
      changes,
    });
  }

  // Orphans = borrower directors not present in SSM's officer list. Surfaced
  // as a warning row — the admin can review manually. We never auto-delete
  // because of attached e-KYC state, signatory flag, etc.
  const orphans: SsmDirectorOrphan[] = currentDirectors
    .filter((d) => !matchedDirectorIds.has(d.id))
    .map((d) => ({
      id: d.id,
      name: d.name,
      icNumber: d.icNumber,
      position: d.position,
      isAuthorizedRepresentative: d.isAuthorizedRepresentative,
      hasEkyc: Boolean(d.trueIdentityStatus),
      hasCompletedEkyc:
        d.trueIdentityStatus === 'completed' && d.trueIdentityResult === 'approved',
    }));

  return {
    summary: { entityName, regNo },
    diff,
    orphans,
  };
}
