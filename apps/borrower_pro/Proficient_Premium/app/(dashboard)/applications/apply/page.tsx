import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@borrower_pro/components/ui/button";
import { ApplicationFlowWizard } from "@borrower_pro/components/application-form";

export default function ApplyForLoanPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex w-full flex-col items-start gap-2 sm:gap-3">
        <Button variant="ghost" size="sm" asChild className="shrink-0 text-muted-foreground -ml-2 sm:-ml-2.5">
          <Link href="/applications">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to applications
          </Link>
        </Button>
        <div className="w-full min-w-0">
          <Suspense
            fallback={
              <div className="flex justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <ApplicationFlowWizard />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
