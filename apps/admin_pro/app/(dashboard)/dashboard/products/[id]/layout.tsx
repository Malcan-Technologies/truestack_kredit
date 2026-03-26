import type { Metadata } from "next";
import { getProductForMetadata } from "@/lib/metadata-api";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductForMetadata(id);
  const title = product?.name ? `Product - ${product.name} - TrueKredit` : "Product - TrueKredit";
  return {
    title,
    description: product?.name
      ? `View and edit ${product.name} loan product`
      : "Loan product details",
  };
}

export default function ProductDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
