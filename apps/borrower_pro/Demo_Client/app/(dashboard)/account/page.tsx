"use client";

import { AccountProfileCard } from "../../../../components/account-profile-card";
import { AccountSecurityCard } from "../../../../components/account-security-card";
import { AccountLoginActivityCard } from "../../../../components/account-login-activity-card";

export default function AccountPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">My account</h2>
        <p className="text-muted-foreground mt-1">
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
