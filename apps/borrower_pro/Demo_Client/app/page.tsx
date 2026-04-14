import { redirect } from "next/navigation";
import { fetchBorrowerMeServer } from "@/lib/borrower-auth-server";
import { HomePageContent } from "./homepage-content";

export default async function HomePage() {
  const res = await fetchBorrowerMeServer();
  if (res?.success) {
    if (res.data.profileCount > 0) {
      redirect("/dashboard");
    }
    redirect("/onboarding");
  }

  return <HomePageContent />;
}
