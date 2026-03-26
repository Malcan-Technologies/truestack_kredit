import type { Metadata } from "next";
import { getApplicationForMetadata, getBorrowerDisplayName } from "@/lib/metadata-api";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const application = await getApplicationForMetadata(id);
  const displayName = getBorrowerDisplayName(application?.borrower);
  const title = displayName
    ? `Application - ${displayName} - TrueKredit`
    : `Application - TrueKredit`;
  return {
    title,
    description: displayName
      ? `Loan application for ${displayName}`
      : "Loan application details",
  };
}

export default function ApplicationDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
