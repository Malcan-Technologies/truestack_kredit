import { redirect } from "next/navigation";

export default function LegacyRolesRedirectPage() {
  redirect("/dashboard/roles");
}
