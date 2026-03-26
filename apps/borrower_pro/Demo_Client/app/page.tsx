import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-client";
import { fetchBorrowerMeServer } from "@/lib/borrower-auth-server";
import { Button } from "../../components/ui/button";

export default async function HomePage() {
  const { data: session } = await getSession();
  if (session?.user) {
    const res = await fetchBorrowerMeServer();
    if (res?.success && res.data.profileCount > 0) {
      redirect("/dashboard");
    }
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="font-heading text-3xl font-bold">Demo Client</h1>
      <p className="text-muted-foreground text-center max-w-md">
        TrueKredit Pro — Digital license KPKT borrowing. Sign in or sign up to get started.
      </p>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-up">Sign up</Link>
        </Button>
      </div>
    </div>
  );
}
