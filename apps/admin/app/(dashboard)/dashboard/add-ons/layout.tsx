import type { Metadata } from "next";
import { RestrictedAccessControl } from "@/components/restricted-access-control";

export const metadata: Metadata = {
  title: "Add-ons - TrueKredit",
  description: "Purchase add-ons and extras",
};

export default function AddOnsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RestrictedAccessControl>{children}</RestrictedAccessControl>;
}
