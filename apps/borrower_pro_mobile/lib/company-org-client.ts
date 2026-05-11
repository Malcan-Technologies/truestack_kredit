/**
 * Better Auth organization APIs for company members (same contract as web `auth-client` org helpers).
 * Uses the borrower Expo `authClient` with `organizationClient` plugin.
 */

import { authClient } from '@/lib/auth/auth-client';

const client = authClient as typeof authClient & {
  organization: {
    inviteMember: (args: {
      email: string;
      role: 'admin' | 'member' | 'owner';
      organizationId?: string;
      resend?: boolean;
    }) => Promise<unknown>;
    listMembers: (args?: { query?: { organizationId?: string } }) => Promise<unknown>;
    listInvitations: (args?: { query?: { organizationId?: string } }) => Promise<unknown>;
    removeMember: (args: { memberIdOrEmail: string; organizationId?: string }) => Promise<unknown>;
    updateMemberRole: (args: {
      memberId: string;
      role: string;
      organizationId?: string;
    }) => Promise<unknown>;
    cancelInvitation: (args: { invitationId: string }) => Promise<unknown>;
  };
};

export function orgInviteMember(args: {
  email: string;
  role: 'admin' | 'member' | 'owner';
  organizationId?: string;
  resend?: boolean;
}) {
  return client.organization.inviteMember(args);
}

export function orgListMembers(args?: { organizationId?: string }) {
  return client.organization.listMembers(args ? { query: args } : undefined);
}

export function orgListInvitations(args?: { organizationId?: string }) {
  return client.organization.listInvitations(args ? { query: args } : undefined);
}

export function orgRemoveMember(args: { memberIdOrEmail: string; organizationId?: string }) {
  return client.organization.removeMember(args);
}

export function orgUpdateMemberRole(args: {
  memberId: string;
  role: string;
  organizationId?: string;
}) {
  return client.organization.updateMemberRole(args);
}

export function orgCancelInvitation(args: { invitationId: string }) {
  return client.organization.cancelInvitation(args);
}
