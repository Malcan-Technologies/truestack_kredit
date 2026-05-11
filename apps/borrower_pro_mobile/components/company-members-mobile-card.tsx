import type { CompanyMembersContext } from '@kredit/borrower';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { borrowerAuthClient } from '@/lib/api/borrower';
import {
  orgCancelInvitation,
  orgInviteMember,
  orgListInvitations,
  orgListMembers,
  orgRemoveMember,
  orgUpdateMemberRole,
} from '@/lib/company-org-client';
import { getEnv } from '@/lib/config/env';
import { useBorrowerAccess } from '@/lib/borrower-access';
import { formatDate } from '@/lib/format/date';

type OrgMemberRow = {
  id: string;
  userId: string;
  role: string;
  user?: { email?: string | null; name?: string | null };
};

type OrgInviteRow = {
  id: string;
  email: string;
  role?: string | null;
  status?: string;
  expiresAt?: string | Date;
};

function parseMembersPayload(res: unknown): OrgMemberRow[] {
  const r = res as {
    data?: { members?: OrgMemberRow[] };
    members?: OrgMemberRow[];
  };
  return r.data?.members ?? r.members ?? [];
}

function parseInvitesPayload(res: unknown): OrgInviteRow[] {
  const r = res as {
    data?: { invitations?: OrgInviteRow[] };
    invitations?: OrgInviteRow[];
  };
  return r.data?.invitations ?? r.invitations ?? [];
}

function displayRole(role: string): string {
  const parts = role
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.includes('owner')) return 'Owner';
  if (parts.includes('admin')) return 'Admin';
  return 'Member';
}

function roleIncludes(role: string, ...keys: string[]): boolean {
  const parts = role.split(',').map((s) => s.trim()).filter(Boolean);
  return keys.some((k) => parts.includes(k));
}

function buildAcceptInvitationUrl(invitationId: string): string {
  const origin = getEnv().authBaseUrl;
  if (!origin) return '';
  return `${origin.replace(/\/$/, '')}/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`;
}

type ButtonVariant = 'primary' | 'outline';

function CompactButton({
  label,
  onPress,
  variant = 'outline',
  loading,
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const palette =
    variant === 'outline'
      ? {
          backgroundColor: theme.background,
          borderColor: theme.border,
          textColor: theme.text,
        }
      : {
          backgroundColor: theme.primary,
          borderColor: theme.primary,
          textColor: theme.primaryForeground,
        };

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactBtn,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          opacity: pressed || loading || disabled ? 0.75 : 1,
          flex: 1,
          minWidth: 0,
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.textColor} size="small" />
      ) : (
        <View style={styles.compactBtnInner}>
          {icon}
          <ThemedText type="smallBold" style={{ color: palette.textColor }} numberOfLines={1}>
            {label}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

export function CompanyMembersMobileCard({ refreshKey }: { refreshKey?: number }) {
  const theme = useTheme();
  const router = useRouter();
  const { refreshBorrowerProfiles } = useBorrowerAccess();
  const [context, setContext] = useState<CompanyMembersContext | null>(null);
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [invites, setInvites] = useState<OrgInviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [submitting, setSubmitting] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [lastShareUrl, setLastShareUrl] = useState<string | null>(null);

  const orgId = context?.organizationId ?? null;
  const canManage = Boolean(context?.canManageMembers && orgId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ctxRes = await borrowerAuthClient.fetchCompanyMembersContext();
      const ctx = ctxRes.data;
      setContext(ctx);
      if (!ctx.isCorporate || !ctx.organizationId) {
        setMembers([]);
        setInvites([]);
        return;
      }
      const [mRes, iRes] = await Promise.all([
        orgListMembers({ organizationId: ctx.organizationId }),
        orgListInvitations({ organizationId: ctx.organizationId }),
      ]);
      setMembers(parseMembersPayload(mRes));
      setInvites(parseInvitesPayload(iRes));
    } catch (e) {
      Alert.alert('Company access', e instanceof Error ? e.message : 'Failed to load company members.');
      setContext(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (refreshKey === undefined || refreshKey === 0) return;
    void load();
  }, [refreshKey, load]);

  const refreshLists = async () => {
    if (!orgId) return;
    try {
      const [mRes, iRes] = await Promise.all([
        orgListMembers({ organizationId: orgId }),
        orgListInvitations({ organizationId: orgId }),
      ]);
      setMembers(parseMembersPayload(mRes));
      setInvites(parseInvitesPayload(iRes));
    } catch {
      /* best-effort */
    }
  };

  const sendEmailInvite = async () => {
    if (!orgId || !inviteEmail.trim()) return;
    setSubmitting(true);
    try {
      const res = await orgInviteMember({
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        organizationId: orgId,
      });
      const err = res as { error?: { message?: string } };
      if (err && typeof err === 'object' && 'error' in err && err.error) {
        throw new Error(err.error.message || 'Invite failed');
      }
      Alert.alert('Invitation sent', 'They must sign in with this email to accept.');
      setInviteOpen(false);
      setInviteEmail('');
      await refreshLists();
    } catch (e) {
      Alert.alert('Invite failed', e instanceof Error ? e.message : 'Could not send invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const createShareLink = async () => {
    if (!canManage) return;
    setShareBusy(true);
    setLastShareUrl(null);
    try {
      const { invitationId } = await borrowerAuthClient.createOpenCompanyInvitation('member');
      const url = buildAcceptInvitationUrl(invitationId);
      if (!url) {
        throw new Error('Set EXPO_PUBLIC_AUTH_BASE_URL to build invite links.');
      }
      setLastShareUrl(url);
      await refreshLists();
    } catch (e) {
      Alert.alert('Share link', e instanceof Error ? e.message : 'Could not create link.');
    } finally {
      setShareBusy(false);
    }
  };

  const copyShare = async () => {
    if (!lastShareUrl) return;
    try {
      await Clipboard.setStringAsync(lastShareUrl);
      Alert.alert('Copied', 'Link copied to clipboard.');
    } catch {
      Alert.alert('Copy failed', 'Could not copy to clipboard.');
    }
  };

  const revokeInvite = async (id: string) => {
    try {
      const res = await orgCancelInvitation({ invitationId: id });
      const err = res as { error?: { message?: string } };
      if (err && typeof err === 'object' && 'error' in err && err.error) {
        throw new Error(err.error.message || 'Could not revoke');
      }
      await refreshLists();
    } catch (e) {
      Alert.alert('Revoke failed', e instanceof Error ? e.message : 'Could not revoke.');
    }
  };

  const changeMemberRole = (member: OrgMemberRow, next: 'member' | 'admin') => {
    if (!orgId) return;
    void (async () => {
      try {
        const res = await orgUpdateMemberRole({
          memberId: member.id,
          role: next,
          organizationId: orgId,
        });
        const err = res as { error?: { message?: string } };
        if (err && typeof err === 'object' && 'error' in err && err.error) {
          throw new Error(err.error.message || 'Could not update role');
        }
        await refreshLists();
      } catch (e) {
        Alert.alert('Role update', e instanceof Error ? e.message : 'Could not update role.');
      }
    })();
  };

  const promptChangeRole = (member: OrgMemberRow) => {
    const current = roleIncludes(member.role, 'admin') ? 'admin' : 'member';
    Alert.alert('Change role', member.user?.email ?? member.userId, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Member',
        onPress: () => {
          if (current !== 'member') changeMemberRole(member, 'member');
        },
      },
      {
        text: 'Admin',
        onPress: () => {
          if (current !== 'admin') changeMemberRole(member, 'admin');
        },
      },
    ]);
  };

  const confirmRemoveMember = (member: OrgMemberRow) => {
    const email = member.user?.email;
    if (!email) {
      Alert.alert('Remove member', 'Missing member email.');
      return;
    }
    Alert.alert(
      'Remove member?',
      'They will lose access to this corporate borrower profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const res = await orgRemoveMember({
                  memberIdOrEmail: email,
                  organizationId: orgId!,
                });
                const err = res as { error?: { message?: string } };
                if (err && typeof err === 'object' && 'error' in err && err.error) {
                  throw new Error(err.error.message || 'Could not remove member');
                }
                await refreshLists();
              } catch (e) {
                Alert.alert('Remove failed', e instanceof Error ? e.message : 'Could not remove.');
              }
            })();
          },
        },
      ],
    );
  };

  const confirmLeave = () => {
    if (!orgId) return;
    Alert.alert(
      'Leave this company?',
      'You will lose access to this corporate borrower profile until invited again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await borrowerAuthClient.leaveCompanyOrganization(orgId);
                await refreshBorrowerProfiles();
                router.replace('/borrower-profile');
              } catch (e) {
                Alert.alert('Leave failed', e instanceof Error ? e.message : 'Could not leave.');
              }
            })();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SectionCard title="Company access" description="Who can use this corporate profile.">
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Loading…
          </ThemedText>
        </View>
      </SectionCard>
    );
  }

  if (!context?.isCorporate) {
    return null;
  }

  if (context.needsOrgBackfill || !orgId) {
    return (
      <SectionCard title="Company access">
        <ThemedText type="small" themeColor="textSecondary">
          This corporate profile has no linked company workspace yet. Try switching profiles or contact
          support if colleagues should have access.
        </ThemedText>
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard
        title="Company access"
        description={
          canManage
            ? 'Invite by email or create a one-time link. Treat shared links like passwords.'
            : 'People with access to this corporate borrower profile.'
        }>
        {canManage ? (
          <View style={styles.actionRow}>
            <CompactButton
              label="Invite"
              icon={<MaterialIcons name="mail-outline" size={16} color={theme.text} />}
              onPress={() => setInviteOpen(true)}
            />
            <CompactButton
              label="Share link"
              loading={shareBusy}
              icon={<MaterialIcons name="link" size={16} color={theme.text} />}
              onPress={() => void createShareLink()}
            />
          </View>
        ) : null}

        {lastShareUrl && canManage ? (
          <View style={[styles.shareBox, { borderColor: theme.warning, backgroundColor: theme.background }]}>
            <ThemedText type="smallBold" style={{ color: theme.warning }}>
              Open invite link
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
              {lastShareUrl}
            </ThemedText>
            <CompactButton label="Copy link" variant="primary" onPress={() => void copyShare()} />
          </View>
        ) : null}

        <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>
          Members
        </ThemedText>
        <View style={[styles.listBox, { borderColor: theme.border }]}>
          {members.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.listEmpty}>
              No members yet.
            </ThemedText>
          ) : (
            members.map((m, index) => {
              const isOwner = roleIncludes(m.role, 'owner');
              const label = m.user?.name?.trim() || m.user?.email || m.userId;
              return (
                <View
                  key={m.id}
                  style={[
                    styles.memberRow,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  ]}>
                  <View style={styles.memberMain}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {label}
                    </ThemedText>
                    {m.user?.email ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {m.user.email}
                      </ThemedText>
                    ) : null}
                  </View>
                  <View style={styles.memberActions}>
                    <View style={[styles.rolePill, { borderColor: theme.border }]}>
                      <ThemedText type="small">{displayRole(m.role)}</ThemedText>
                    </View>
                    {canManage && !isOwner ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Change role"
                        onPress={() => promptChangeRole(m)}
                        hitSlop={8}>
                        <MaterialIcons name="manage-accounts" size={20} color={theme.primary} />
                      </Pressable>
                    ) : null}
                    {canManage && !isOwner ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove member"
                        onPress={() => confirmRemoveMember(m)}
                        hitSlop={8}>
                        <MaterialIcons name="person-remove" size={20} color={theme.error} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {invites.length > 0 ? (
          <>
            <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>
              Pending invitations
            </ThemedText>
            <View style={[styles.listBox, { borderColor: theme.border }]}>
              {invites.map((inv, index) => (
                <View
                  key={inv.id}
                  style={[
                    styles.inviteRow,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  ]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText type="small" numberOfLines={1} style={{ fontFamily: 'monospace' }}>
                      {inv.email}
                    </ThemedText>
                    {inv.expiresAt ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        Expires {formatDate(typeof inv.expiresAt === 'string' ? inv.expiresAt : inv.expiresAt.toISOString())}
                      </ThemedText>
                    ) : null}
                  </View>
                  {canManage ? (
                    <Pressable onPress={() => void revokeInvite(inv.id)} hitSlop={8}>
                      <ThemedText type="smallBold" style={{ color: theme.error }}>
                        Revoke
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        {!context.canManageMembers && context.role ? (
          <Pressable
            accessibilityRole="button"
            onPress={confirmLeave}
            style={({ pressed }) => [
              styles.leaveBtn,
              { borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.error }}>
              Leave company workspace
            </ThemedText>
          </Pressable>
        ) : null}
      </SectionCard>

      <Modal visible={inviteOpen} animationType="slide" transparent onRequestClose={() => setInviteOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <ThemedText type="subtitle">Invite by email</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              They must sign in with this email to accept.
            </ThemedText>
            <TextInput
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="colleague@company.com"
              placeholderTextColor={theme.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                {
                  borderColor: theme.border,
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                },
              ]}
            />
            <ThemedText type="smallBold" style={{ marginTop: Spacing.one }}>
              Role
            </ThemedText>
            <View style={styles.roleRow}>
              {(['member', 'admin'] as const).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setInviteRole(r)}
                  style={[
                    styles.roleChip,
                    {
                      borderColor: inviteRole === r ? theme.primary : theme.border,
                      backgroundColor: inviteRole === r ? theme.backgroundSelected : theme.background,
                    },
                  ]}>
                  <ThemedText type="smallBold" style={{ color: inviteRole === r ? theme.primary : theme.text }}>
                    {r === 'member' ? 'Member' : 'Admin'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <View style={styles.modalActions}>
              <CompactButton label="Cancel" onPress={() => setInviteOpen(false)} />
              <CompactButton
                label={submitting ? '…' : 'Send'}
                variant="primary"
                loading={submitting}
                disabled={submitting || !inviteEmail.trim()}
                onPress={() => void sendEmailInvite()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  compactBtn: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    justifyContent: 'center',
  },
  shareBox: {
    marginTop: Spacing.two,
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  listBox: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  listEmpty: {
    padding: Spacing.three,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  memberMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  rolePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  leaveBtn: {
    marginTop: Spacing.three,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.one,
  },
  roleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  roleChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
