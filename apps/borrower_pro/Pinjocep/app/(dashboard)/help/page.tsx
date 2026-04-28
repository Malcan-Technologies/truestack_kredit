import { notFound, redirect } from "next/navigation";
import { getHelpTopics } from "@borrower_pro/lib/help-docs";

export default async function HelpIndexPage() {
  const topics = await getHelpTopics();
  const firstTopic = topics[0];

  if (!firstTopic) {
    notFound();
  }

  redirect(`/help/${firstTopic.slug}`);
}
