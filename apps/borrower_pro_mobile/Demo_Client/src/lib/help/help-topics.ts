export type HelpTopicSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type HelpTopicSummary = {
  slug: string;
  title: string;
  summary: string;
  order: number;
};

export type HelpTopicDocument = HelpTopicSummary & {
  sections: HelpTopicSection[];
};

const HELP_TOPICS: HelpTopicDocument[] = [
  {
    slug: 'loan-process',
    title: 'Complete loan journey',
    summary:
      'Understand every stage from application to final discharge, including which steps are handled by the admin team and which require your action.',
    order: 1,
    sections: [
      {
        title: 'Overview',
        paragraphs: [
          'This guide explains the usual end-to-end borrower journey in the portal, from application all the way to loan discharge after full repayment.',
          'Some labels may differ slightly in your portal, but the overall sequence stays broadly the same.',
        ],
      },
      {
        title: 'Main stages',
        bullets: [
          'Submit your loan application together with the required supporting documents.',
          'Wait for the admin team to review the application.',
          'If a counteroffer is issued, review it and decide whether to accept it.',
          'Complete any required attestation step.',
          'Complete e-KYC and the related identity checks.',
          'Obtain the digital signing certificate when prompted.',
          'Review and digitally sign the finalized loan agreement.',
          'Wait for the admin team and witness to complete their signing steps and prepare release.',
          'Receive disbursement once the loan is approved and ready for payout.',
          'Repay according to schedule until the loan is fully settled.',
        ],
      },
      {
        title: 'Important notes',
        bullets: [
          'If your application is rejected, the process stops unless you submit a new application later.',
          'If a counteroffer is declined, the application does not continue unless a new offer or application is created.',
          'Late payment charges may accrue daily according to your loan terms until overdue amounts are cleared.',
          'After all repayments are completed, the admin team processes discharge and closes the loan record.',
        ],
      },
    ],
  },
  {
    slug: 'payments',
    title: 'Making payments',
    summary:
      "Learn how to repay through the company's bank account, use the transfer reference, and submit your payment for review.",
    order: 2,
    sections: [
      {
        title: 'How payment works',
        bullets: [
          'Open the payment page for the relevant loan.',
          'Choose the suggested instalment amount or enter a custom amount.',
          'Review the bank account details shown on the page carefully.',
          'Copy and use the generated transfer reference in your banking app or online banking reference field.',
          'Complete the transfer from your bank account.',
          'Upload a receipt if available to support the submission.',
          'Submit the payment in the portal for admin review.',
        ],
      },
      {
        title: 'What happens next',
        bullets: [
          'The admin team reviews the submitted payment.',
          'Once the payment is verified, the loan schedule is updated.',
          'Before verification is complete, the schedule may still show the earlier balance or due status.',
        ],
      },
      {
        title: 'Important notes',
        bullets: [
          'Only transfer to the bank account shown on the payment page for your loan.',
          'Use the correct transfer reference so the payment can be matched more easily.',
          'If the bank account details are missing, contact the admin team before making payment.',
          'Late payment charges may apply if you pay after the due date, depending on your loan terms.',
        ],
      },
    ],
  },
  {
    slug: 'why-e-kyc-is-required',
    title: 'Why e-KYC is required',
    summary:
      'Learn why identity verification is needed for safe lending, compliance, and issuance of your digital signing certificate.',
    order: 3,
    sections: [
      {
        title: 'Why the portal asks you to complete e-KYC',
        paragraphs: [
          'e-KYC helps confirm that the person applying for the loan and signing the agreement is the real borrower.',
          'It supports safe lending, helps reduce impersonation and fraudulent activity, and allows the company to maintain proper borrower records.',
        ],
      },
      {
        title: 'Why it matters for signing',
        paragraphs: [
          'After e-KYC is completed successfully, your verified identity can be used to obtain the digital signing certificate needed for signing the loan agreement.',
          'That certificate helps tie the signature to your verified identity and supports the integrity of the signed agreement.',
        ],
      },
      {
        title: 'What this means for you',
        bullets: [
          'Complete e-KYC as soon as it becomes available in your loan journey.',
          'Make sure the information and images you provide are clear and accurate.',
          'You usually cannot move to digital signing until e-KYC is completed successfully.',
        ],
      },
    ],
  },
  {
    slug: 'security-and-privacy',
    title: 'Security and privacy',
    summary:
      'Learn how your personal data, e-KYC information, identity documents, and account access are protected in the portal.',
    order: 4,
    sections: [
      {
        title: 'What information is protected',
        bullets: [
          'Personal details and account information.',
          'e-KYC data, identity documents, and verification images.',
          'Loan-related records and signed agreements.',
        ],
      },
      {
        title: 'How your privacy is protected',
        bullets: [
          'Access is limited to authorized personnel and approved service providers who need it for legitimate work.',
          'Information is used only for relevant business, legal, servicing, verification, and compliance purposes.',
          'Sensitive data is protected using encryption and related safeguards.',
          'Website traffic is protected with SSL/TLS to secure data sent between your device and the portal.',
          'Data is stored in Malaysia, kept encrypted, and backed up for resilience and recovery.',
        ],
      },
      {
        title: 'How to protect your account',
        bullets: [
          'Choose a strong password.',
          'Keep your password private and do not share your login details.',
          'Contact the admin team promptly if you suspect unauthorized access.',
        ],
      },
      {
        title: 'More details',
        paragraphs: [
          'For the full legal and privacy documents, open the policy pages from the About section in Settings.',
        ],
      },
    ],
  },
];

export function getHelpTopics(): HelpTopicSummary[] {
  return HELP_TOPICS.map(({ slug, title, summary, order }) => ({
    slug,
    title,
    summary,
    order,
  })).sort((a, b) => a.order - b.order);
}

export function getHelpTopicBySlug(slug: string): HelpTopicDocument | null {
  return HELP_TOPICS.find((topic) => topic.slug === slug) ?? null;
}
