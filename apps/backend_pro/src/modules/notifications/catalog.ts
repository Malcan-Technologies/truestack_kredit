export const NOTIFICATION_CHANNELS = ['email', 'in_app', 'push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationCategory =
  | 'payments'
  | 'collections'
  | 'loan_lifecycle'
  | 'applications'
  | 'announcements';

export interface NotificationDefinition {
  key: string;
  label: string;
  description: string;
  category: NotificationCategory;
  channels: NotificationChannel[];
  defaultEnabledChannels?: NotificationChannel[];
}

export const NOTIFICATION_DEFINITIONS: NotificationDefinition[] = [
  {
    key: 'payment_receipt',
    label: 'Payment receipts',
    description: 'Receipt confirmation after a payment is recorded.',
    category: 'payments',
    channels: ['email', 'in_app', 'push'],
  },
  {
    key: 'payment_reminder',
    label: 'Payment reminders',
    description: 'Upcoming repayment reminders before the due date.',
    category: 'payments',
    channels: ['email', 'in_app', 'push'],
  },
  {
    key: 'late_payment_notice',
    label: 'Late payment notices',
    description: 'Consolidated late-payment reminders after a due date is missed.',
    category: 'collections',
    channels: ['email', 'in_app', 'push'],
  },
  {
    key: 'arrears_notice',
    label: 'Arrears notices',
    description: 'Formal arrears notification once a loan enters arrears.',
    category: 'collections',
    channels: ['email', 'in_app', 'push'],
  },
  {
    key: 'default_notice',
    label: 'Default notices',
    description: 'Formal default notification when a loan is defaulted.',
    category: 'collections',
    channels: ['email', 'in_app', 'push'],
  },
  {
    key: 'loan_disbursed',
    label: 'Loan disbursed',
    description: 'Confirmation that a loan has been disbursed.',
    category: 'loan_lifecycle',
    channels: ['email', 'in_app', 'push'],
  },
  {
    key: 'loan_completed',
    label: 'Loan completed',
    description: 'Confirmation that a loan has been completed or early-settled.',
    category: 'loan_lifecycle',
    channels: ['email', 'in_app', 'push'],
  },
  {
    key: 'signed_agreement_ready',
    label: 'Signed agreement ready',
    description: 'Digitally signed agreement available for review.',
    category: 'loan_lifecycle',
    channels: ['email', 'in_app', 'push'],
  },
  {
    key: 'loan_attestation_complete',
    label: 'Attestation complete',
    description:
      'When borrower or lender finishes the attestation step; next steps are KYC, certificate, then signing.',
    category: 'loan_lifecycle',
    channels: ['in_app', 'push'],
  },
  {
    key: 'loan_kyc_completed',
    label: 'KYC verification complete',
    description:
      'When TrueStack KYC completes successfully and the borrower identity gate is satisfied.',
    category: 'loan_lifecycle',
    channels: ['in_app', 'push'],
  },
  {
    key: 'loan_signing_certificate_ready',
    label: 'Digital signing certificate ready',
    description:
      'When a valid MTSA signing certificate is detected or enrollment succeeds before digital signing.',
    category: 'loan_lifecycle',
    channels: ['in_app', 'push'],
  },
  {
    key: 'attestation_meeting_reminder',
    label: 'Attestation meeting reminders',
    description: 'Reminder before a scheduled attestation meeting.',
    category: 'loan_lifecycle',
    channels: ['email', 'in_app', 'push'],
  },
  {
    key: 'application_submitted',
    label: 'Application submitted',
    description: 'Borrower confirmation that an application was submitted.',
    category: 'applications',
    channels: ['in_app', 'push'],
  },
  {
    key: 'application_approved',
    label: 'Application approved',
    description: 'Borrower-facing approval update after underwriting.',
    category: 'applications',
    channels: ['in_app', 'push'],
  },
  {
    key: 'application_rejected',
    label: 'Application rejected',
    description: 'Borrower-facing rejection update after underwriting.',
    category: 'applications',
    channels: ['in_app', 'push'],
  },
  {
    key: 'application_counter_offer',
    label: 'Lender counter offer',
    description: 'When the lender sends a proposed amount and term for the borrower to review.',
    category: 'applications',
    channels: ['in_app', 'push'],
  },
  {
    key: 'application_returned_for_amendments',
    label: 'Returned for amendments',
    description: 'When the lender returns the application to draft for the borrower to amend.',
    category: 'applications',
    channels: ['in_app', 'push'],
  },
  {
    key: 'announcement_broadcast',
    label: 'Announcements',
    description: 'Tenant-wide announcements and marketing broadcasts.',
    category: 'announcements',
    channels: ['in_app', 'push'],
  },
];

export type NotificationAudienceType =
  | 'ALL_BORROWERS'
  | 'ACTIVE_BORROWERS'
  | 'OVERDUE_BORROWERS'
  | 'APPLICANTS';

export const NOTIFICATION_AUDIENCE_OPTIONS: Array<{
  value: NotificationAudienceType;
  label: string;
  description: string;
}> = [
  {
    value: 'ALL_BORROWERS',
    label: 'Everyone',
    description: 'Every borrower profile under this Pro tenant.',
  },
  {
    value: 'ACTIVE_BORROWERS',
    label: 'Active borrowers',
    description: 'Borrowers with active or pre-disbursement loans.',
  },
  {
    value: 'OVERDUE_BORROWERS',
    label: 'Overdue borrowers',
    description: 'Borrowers with loans currently in arrears or default.',
  },
  {
    value: 'APPLICANTS',
    label: 'Applicants',
    description: 'Borrowers with submitted, under-review, or pending final approval applications.',
  },
];

export function getNotificationDefinition(key: string): NotificationDefinition | undefined {
  return NOTIFICATION_DEFINITIONS.find((definition) => definition.key === key);
}

export function isNotificationChannel(value: string): value is NotificationChannel {
  return NOTIFICATION_CHANNELS.includes(value as NotificationChannel);
}

