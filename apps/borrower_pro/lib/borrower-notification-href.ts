/**
 * Borrower notification links must stay on same-origin app routes.
 * Invalid or external deep links fall back to the inbox route.
 */
export function normalizeBorrowerNotificationHref(
  value: string | null | undefined
): string | null {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/notifications";
  }

  return trimmed;
}
