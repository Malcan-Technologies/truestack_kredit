import type { Metadata } from "next";
import { getLoanForMetadata, getBorrowerDisplayName } from "@/lib/metadata-api";

type Props = {
  params: Promise<{ loanId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { loanId } = await params;
  const loan = await getLoanForMetadata(loanId);
  const displayName = getBorrowerDisplayName(loan?.borrower);
  const title = displayName
    ? `Loan - ${displayName} - TrueKredit`
    : `Loan ${loanId.slice(0, 8)} - TrueKredit`;
  return {
    title,
    description: displayName
      ? `Loan details and schedule for ${displayName}`
      : "Loan details, schedule, and repayment status",
  };
}

export default function LoanDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
