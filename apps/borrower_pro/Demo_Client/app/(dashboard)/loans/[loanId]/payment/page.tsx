import { BorrowerMakePaymentPage } from "@borrower_pro/components/loan-center/borrower-make-payment-page";

export default async function LoanPaymentRoute({
  params,
}: {
  params: Promise<{ loanId: string }>;
}) {
  const { loanId } = await params;
  return <BorrowerMakePaymentPage loanId={loanId} />;
}
