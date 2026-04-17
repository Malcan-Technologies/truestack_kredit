import { BorrowerEarlySettlementPage } from "@borrower_pro/components/loan-center";

export default async function BorrowerEarlySettlementRoute({
  params,
}: {
  params: Promise<{ loanId: string }>;
}) {
  const { loanId } = await params;
  return <BorrowerEarlySettlementPage loanId={loanId} />;
}
