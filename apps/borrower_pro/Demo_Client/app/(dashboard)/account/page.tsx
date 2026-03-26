"use client";

import { AccountProfileCard } from "@borrower_pro/components/account-profile-card";
import { AccountSecurityCard } from "@borrower_pro/components/account-security-card";
import { AccountLoginActivityCard } from "@borrower_pro/components/account-login-activity-card";

export default function AccountPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-gradient">My account</h1>
        <p className="text-muted text-base mt-1">
          Manage your login, security, and account information
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AccountProfileCard />
        <AccountSecurityCard />
        <AccountLoginActivityCard className="lg:col-span-2" />
      </div>
    </div>
  );
}
