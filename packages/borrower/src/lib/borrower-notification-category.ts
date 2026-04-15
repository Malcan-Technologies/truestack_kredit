const BORROWER_NOTIFICATION_CATEGORY_KEYS = [
  'payments',
  'collections',
  'loan_lifecycle',
  'applications',
  'announcements',
] as const;

export type BorrowerNotificationCategoryKind = (typeof BORROWER_NOTIFICATION_CATEGORY_KEYS)[number] | 'other';

export function resolveBorrowerNotificationCategoryKind(category: string): BorrowerNotificationCategoryKind {
  const k = category.trim().toLowerCase();
  return (BORROWER_NOTIFICATION_CATEGORY_KEYS as readonly string[]).includes(k)
    ? (k as BorrowerNotificationCategoryKind)
    : 'other';
}

export function borrowerNotificationCategoryLabel(category: string): string {
  return category
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
