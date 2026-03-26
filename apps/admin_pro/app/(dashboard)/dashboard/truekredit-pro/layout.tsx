import type { Metadata } from "next";
import { RestrictedAccessControl } from "@/components/restricted-access-control";

export const metadata: Metadata = {
  title: "TrueKredit Pro - TrueKredit",
  description: "Attestation meetings and Pro workflows",
};

export default function TruekreditProLayout({ children }: { children: React.ReactNode }) {
  return (
    <RestrictedAccessControl>
      <div className="mx-auto w-full min-w-0 max-w-7xl 2xl:max-w-[min(100%,96rem)]">{children}</div>
    </RestrictedAccessControl>
  );
}
