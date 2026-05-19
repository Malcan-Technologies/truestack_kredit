/**
 * Helper for invalidating `Borrower.ssmFieldProvenance` entries when a
 * borrower field is manually edited away from its TrueSSM™-synced value.
 *
 * Pattern mirrors the e-KYC reset behaviour: when an admin overrides a value
 * that originated from an SSM pull, the "SSM Verified" badge for that field
 * must drop off. Re-synchronising via the apply modal restores it.
 *
 * Used from both:
 *   - `modules/borrowers/routes.ts` PATCH /borrowers/:id (admin edit)
 *   - `modules/borrowers/borrowerUpdateService.ts` (borrower self-service)
 *
 * The SSM field list intentionally matches `mapper.ts` SSM_MAPPABLE_FIELDS.
 */

import { Prisma } from '@prisma/client';

import { SSM_MAPPABLE_FIELDS, type SsmMappableField } from './mapper.js';

/**
 * Outcome of `computeSsmProvenanceAfterEdit`:
 *   - `undefined`  → caller should NOT write `ssmFieldProvenance` at all.
 *   - `Prisma.JsonNull` → caller should clear the column to null.
 *   - `Record<…>` → caller should write the new provenance object.
 *
 * This three-way return lets callers compose it directly into a Prisma
 * update payload without an extra branch.
 */
export type SsmProvenanceUpdate =
  | undefined
  | typeof Prisma.JsonNull
  | Record<string, unknown>;

/** Each candidate field tells us what's being edited and what's currently stored. */
export interface ProvenanceCandidate {
  field: SsmMappableField;
  /**
   * Incoming value from the patch payload.
   *   - `undefined` → field is not part of the patch; skip it.
   *   - `null` / empty string → treated as "cleared".
   *   - anything else → coerced to string for comparison.
   */
  incoming: unknown;
  /**
   * Currently-stored borrower value (post-normalisation — e.g. dates already
   * sliced to `YYYY-MM-DD`, Prisma Decimals already converted to number).
   */
  current: unknown;
}

/**
 * Normalise to the canonical string used for equality checks. Empty string
 * and `null` collapse to `null` so "" and `null` don't appear different.
 */
function normalise(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  return String(value);
}

/**
 * Decide which provenance entries (if any) should be removed because the
 * caller is about to change their underlying value.
 *
 * @param existingProvenance The current `Borrower.ssmFieldProvenance` JSON
 *   column (Prisma `JsonValue` — we accept anything and defensively type-check).
 * @param candidates One entry per SSM-mappable field that *might* be touched
 *   by the patch. Use `incoming: undefined` for fields not in the patch so
 *   they're skipped cleanly.
 *
 * @returns A `SsmProvenanceUpdate` — see the type above.
 */
export function computeSsmProvenanceAfterEdit(
  existingProvenance: Prisma.JsonValue | null | undefined,
  candidates: ProvenanceCandidate[],
): SsmProvenanceUpdate {
  if (
    !existingProvenance ||
    typeof existingProvenance !== 'object' ||
    Array.isArray(existingProvenance)
  ) {
    return undefined;
  }

  const provenance = existingProvenance as Record<string, unknown>;
  const provenancedFields = Object.keys(provenance);
  if (provenancedFields.length === 0) return undefined;

  const fieldsToClear = new Set<string>();
  for (const { field, incoming, current } of candidates) {
    if (!provenancedFields.includes(field)) continue;
    if (incoming === undefined) continue;
    if (normalise(incoming) !== normalise(current)) {
      fieldsToClear.add(field);
    }
  }

  if (fieldsToClear.size === 0) return undefined;

  const next: Record<string, unknown> = { ...provenance };
  for (const f of fieldsToClear) delete next[f];

  // Collapse to JsonNull when emptied so the column doesn't carry an empty
  // object — keeps `lastSsmPullAt` queries and `ssmFieldProvenance ?? null`
  // checks behaving the same way.
  if (Object.keys(next).length === 0) return Prisma.JsonNull;
  return next;
}

/**
 * Convenience: build a list of `ProvenanceCandidate` rows from an existing
 * borrower record and an inbound patch. Each candidate is the value-pair
 * (incoming, current) for one of the {@link SSM_MAPPABLE_FIELDS}. The caller
 * supplies a `pluck` function so it can normalise types (Date → ISO date,
 * Decimal → number) however its endpoint needs.
 *
 * Typical use:
 *
 * ```ts
 * const candidates = buildSsmProvenanceCandidates({
 *   existing,
 *   patch,
 *   pluckCurrent: (field) => normaliseExisting(existing, field),
 *   pluckIncoming: (field) => normaliseIncoming(patch, field),
 * });
 * const provenanceUpdate = computeSsmProvenanceAfterEdit(
 *   existing.ssmFieldProvenance,
 *   candidates,
 * );
 * if (provenanceUpdate !== undefined) updateData.ssmFieldProvenance = provenanceUpdate;
 * ```
 */
export function buildSsmProvenanceCandidates(args: {
  pluckIncoming: (field: SsmMappableField) => unknown;
  pluckCurrent: (field: SsmMappableField) => unknown;
}): ProvenanceCandidate[] {
  return SSM_MAPPABLE_FIELDS.map((field) => ({
    field,
    incoming: args.pluckIncoming(field),
    current: args.pluckCurrent(field),
  }));
}
