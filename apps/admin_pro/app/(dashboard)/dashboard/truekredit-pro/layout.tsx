import type { Metadata } from "next";
import { RestrictedAccessControl } from "@/components/restricted-access-control";

export const metadata: Metadata = {
  title: "TrueKredit Pro - TrueKredit",
  description: "Attestation meetings and Pro workflows",
};

export default function TruekreditProLayout({ children }: { children: React.ReactNode }) {
  return (
    <RestrictedAccessControl>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </RestrictedAccessControl>
  );
}
