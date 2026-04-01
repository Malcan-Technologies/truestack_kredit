import "server-only";

import { readFile } from "fs/promises";
import path from "path";

export type HelpTopicSummary = {
  slug: string;
  title: string;
  summary: string;
  fileName: string;
  order: number;
};

export type HelpTopicDocument = HelpTopicSummary & {
  markdown: string;
};

const HELP_DOCS_DIR = path.resolve(process.cwd(), "../help-docs");

const HELP_TOPICS: HelpTopicSummary[] = [
  {
    slug: "loan-process",
    title: "Complete loan journey",
    summary:
      "Understand every stage from application to final discharge, including which steps are handled by the admin team and which require your action.",
    fileName: "loan-process.md",
    order: 1,
  },
  {
    slug: "payments",
    title: "Making payments",
    summary:
      "Learn how to repay through the company's bank account, use the transfer reference, and submit your payment for review.",
    fileName: "payments.md",
    order: 2,
  },
  {
    slug: "why-e-kyc-is-required",
    title: "Why e-KYC is required",
    summary:
      "Learn why identity verification is needed for safe lending, compliance, and issuance of your digital signing certificate.",
    fileName: "why-e-kyc-is-required.md",
    order: 3,
  },
];

export async function getHelpTopics(): Promise<HelpTopicSummary[]> {
  return [...HELP_TOPICS].sort((a, b) => a.order - b.order);
}

export async function getHelpTopicBySlug(
  slug: string
): Promise<HelpTopicDocument | null> {
  const topic = HELP_TOPICS.find((item) => item.slug === slug);
  if (!topic) {
    return null;
  }

  const markdown = await readFile(path.join(HELP_DOCS_DIR, topic.fileName), "utf8");
  return {
    ...topic,
    markdown,
  };
}
