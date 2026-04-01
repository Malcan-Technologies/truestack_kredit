import Link from "next/link";
import { BookOpenText, CircleHelp } from "lucide-react";
import { HelpMarkdown } from "@borrower_pro/components/help/help-markdown";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@borrower_pro/components/ui/card";
import { cn } from "@borrower_pro/lib/utils";
import type {
  HelpTopicDocument,
  HelpTopicSummary,
} from "@borrower_pro/lib/help-docs";

type HelpTopicViewProps = {
  topics: HelpTopicSummary[];
  topic: HelpTopicDocument;
};

export function HelpTopicView({ topics, topic }: HelpTopicViewProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <CircleHelp className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl">Borrower Help Center</CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6">
              Practical guides to help you understand each step of your loan journey in the
              portal, from application through repayment and final discharge.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="h-fit xl:sticky xl:top-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenText className="h-4 w-4" />
              Help topics
            </CardTitle>
            <CardDescription>
              Select a topic to read the full guide.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {topics.map((item) => {
              const isActive = item.slug === topic.slug;

              return (
                <Link
                  key={item.slug}
                  href={`/help/${item.slug}`}
                  className={cn(
                    "block rounded-xl border px-4 py-3 transition-colors",
                    isActive
                      ? "border-primary/30 bg-primary/10"
                      : "border-border hover:bg-secondary"
                  )}
                >
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {item.summary}
                  </p>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <HelpMarkdown content={topic.markdown} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
