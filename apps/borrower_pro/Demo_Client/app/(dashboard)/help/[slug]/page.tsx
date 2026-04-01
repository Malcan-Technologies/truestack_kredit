import { notFound } from "next/navigation";
import { HelpTopicView } from "@borrower_pro/components/help/help-topic-view";
import { getHelpTopicBySlug, getHelpTopics } from "@borrower_pro/lib/help-docs";

type HelpTopicPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams() {
  const topics = await getHelpTopics();

  return topics.map((topic) => ({
    slug: topic.slug,
  }));
}

export default async function HelpTopicPage({ params }: HelpTopicPageProps) {
  const { slug } = await params;
  const [topics, topic] = await Promise.all([
    getHelpTopics(),
    getHelpTopicBySlug(slug),
  ]);

  if (!topic) {
    notFound();
  }

  return <HelpTopicView topics={topics} topic={topic} />;
}
