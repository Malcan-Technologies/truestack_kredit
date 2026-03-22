import type { Metadata } from "next";
import { getProductForMetadata } from "@/lib/metadata-api";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductForMetadata(id);
  const title = product?.name ? `Edit Product - ${product.name} - TrueKredit` : "Edit Product - TrueKredit";
  return {
    title,
    description: product?.name
      ? `Edit ${product.name} loan product configuration`
      : "Edit loan product",
  };
}

export default function EditProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
