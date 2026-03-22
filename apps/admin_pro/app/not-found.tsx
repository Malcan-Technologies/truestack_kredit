import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-heading font-bold text-gradient">
          Page not found
        </h1>
        <p className="text-muted-foreground">
          The page you are looking for does not exist or you don&apos;t have access to it.
        </p>
        <Button asChild>
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
