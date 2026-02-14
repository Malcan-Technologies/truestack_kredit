"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function SubscriptionPage() {
  const [subscriptionStatus, setSubscriptionStatus] = useState<"FREE" | "PAID">("FREE");
  const [subscribing, setSubscribing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const res = await fetch("/api/proxy/auth/me", { credentials: "include" });
      const data = await res.json();
      if (data.success && data.data.tenant) {
        setSubscriptionStatus(data.data.tenant.subscriptionStatus || "FREE");
      }
    } catch (error) {
      console.error("Failed to fetch subscription status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const res = await fetch("/api/proxy/billing/subscribe", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();

      if (data.success) {
        toast.success("Subscription activated! Reloading...");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast.error(data.error || "Failed to subscribe");
      }
    } catch (error) {
      toast.error("Failed to subscribe");
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-3">Upgrade your plan</h1>
        <p className="text-lg text-muted-foreground">
          Get the most out of TrueKredit with unlimited access
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
        {/* FREE Plan */}
        <Card
          className={cn(
            "relative p-6 border-2 transition-all",
            subscriptionStatus === "FREE"
              ? "border-primary/50 bg-surface"
              : "border-border hover:border-border/80"
          )}
        >
          {subscriptionStatus === "FREE" && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge variant="outline" className="bg-background">
                Your current plan
              </Badge>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-2">Free</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">RM 0</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">See what AI can do</p>
            </div>

            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-sm">Dashboard access</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-sm">Profile management</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-sm">Basic settings</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-sm">Help documentation</span>
              </li>
            </ul>

            <div className="pt-4">
              {subscriptionStatus === "FREE" ? (
                <Button variant="outline" className="w-full" disabled>
                  Current plan
                </Button>
              ) : (
                <Button variant="outline" className="w-full" disabled>
                  Downgrade
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* PAID Plan (Pro) */}
        <Card
          className={cn(
            "relative p-6 border-2 transition-all",
            subscriptionStatus === "PAID"
              ? "border-primary bg-primary/5"
              : "border-primary shadow-lg hover:shadow-xl"
          )}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="bg-gradient-accent border-0 text-white">
              <Sparkles className="h-3 w-3 mr-1" />
              {subscriptionStatus === "PAID" ? "Active" : "Most Popular"}
            </Badge>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                Pro
                <Zap className="h-5 w-5 text-primary" />
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">RM 499</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">Unlock the full experience</p>
            </div>

            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm font-medium">Everything in Free</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Borrower management</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Loan products & applications</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Payment tracking & schedules</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Compliance reports</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Full audit logs</span>
              </li>
            </ul>

            <div className="pt-4">
              {subscriptionStatus === "PAID" ? (
                <Button variant="default" className="w-full bg-gradient-accent hover:opacity-90" disabled>
                  Current plan
                </Button>
              ) : (
                <Button
                  className="w-full bg-gradient-accent hover:opacity-90 text-white"
                  onClick={handleSubscribe}
                  disabled={subscribing}
                >
                  {subscribing ? "Processing..." : "Upgrade to Pro"}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="text-center mt-8">
        <p className="text-sm text-muted-foreground">
          Need more capabilities for your business?{" "}
          <Link href="/dashboard/help" className="text-primary hover:underline">
            Contact us
          </Link>
        </p>
      </div>
    </div>
  );
}
