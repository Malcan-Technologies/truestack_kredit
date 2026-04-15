import { redirect } from "next/navigation";

export default function LegacyTrueSendPage() {
  redirect("/dashboard/modules/notifications");
}
