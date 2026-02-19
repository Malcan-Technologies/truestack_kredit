import type { Metadata } from "next";
import { getBorrowerForMetadata, getBorrowerDisplayName } from "@/lib/metadata-api";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const borrower = await getBorrowerForMetadata(id);
  const displayName = getBorrowerDisplayName(borrower);
  const title = displayName ? `Borrower - ${displayName} - TrueKredit` : "Borrower - TrueKredit";
  return {
    title,
    description: displayName
      ? `View and manage ${displayName}'s profile and loan history`
      : "Borrower profile and loan history",
  };
}

export default function BorrowerDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
