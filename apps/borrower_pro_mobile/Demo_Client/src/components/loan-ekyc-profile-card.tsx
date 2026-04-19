import { MaterialIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatICForDisplay, formatOptionLabel } from '@/lib/format/borrower';
import { isIndividualIdentityLocked } from '@/lib/borrower-verification';
import type { BorrowerDetail } from '@kredit/borrower';

/**
 * Read-only summary of the identity fields TrueStack consumes (name, IC, document type), plus an
 * "Edit name & IC" action that opens a pushed edit screen using stickyFooter. Mirrors web's
 * `LoanEkycProfileSummary` but restricted to the fields editable on mobile.
 */
export function LoanEkycProfileCard({
  borrower,
  loanId,
}: {
  borrower: BorrowerDetail;
  loanId: string;
}) {
  const router = useRouter();
  const theme = useTheme();
  const isCorporate = borrower.borrowerType === 'CORPORATE';
  const identityLocked = !isCorporate && isIndividualIdentityLocked(borrower);
  const authorizedRep = isCorporate
    ? borrower.directors?.find((d) => d.isAuthorizedRepresentative === true) ??
      borrower.directors?.[0]
    : null;

  return (
    <SectionCard
      title="Check your details"
      description="TrueStack uses these fields to verify you. Make sure they match your ID exactly.">
      <View
        style={[
          styles.infoBox,
          { borderColor: theme.border, backgroundColor: theme.background },
        ]}>
        <View style={styles.inlineRow}>
          <MaterialIcons name="info-outline" size={16} color={theme.primary} />
          <ThemedText type="smallBold">Must match your ID</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Full name, IC/passport number, and document type are sent to TrueStack for verification.
        </ThemedText>
      </View>

      {isCorporate ? (
        <View style={styles.stack}>
          <ReadonlyRow label="Company" value={borrower.companyName ?? '—'} />
          <ReadonlyRow label="SSM No." value={borrower.ssmRegistrationNo ?? '—'} />
          {authorizedRep ? (
            <>
              <ReadonlyRow label="Authorized rep" value={authorizedRep.name ?? '—'} />
              <ReadonlyRow
                label="Rep IC"
                value={formatICForDisplay(authorizedRep.icNumber)}
              />
            </>
          ) : (
            <ThemedText type="small" style={{ color: theme.warning }}>
              No authorized representative set. Mark one in your borrower profile first.
            </ThemedText>
          )}
        </View>
      ) : (
        <View style={styles.stack}>
          <ReadonlyRow label="Name" value={borrower.name?.trim() || '—'} />
          <ReadonlyRow
            label="Document"
            value={formatOptionLabel('documentType', borrower.documentType)}
          />
          <ReadonlyRow
            label={borrower.documentType === 'PASSPORT' ? 'Passport' : 'IC number'}
            value={
              borrower.documentType === 'PASSPORT'
                ? borrower.icNumber ?? '—'
                : formatICForDisplay(borrower.icNumber)
            }
          />
        </View>
      )}

      {isCorporate || identityLocked ? (
        <ThemedText type="small" themeColor="textSecondary">
          {identityLocked
            ? 'Identity already verified — these fields cannot be changed.'
            : 'Edit company or director details in your borrower profile.'}
        </ThemedText>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push(`/loans/${loanId}/edit-identity` as Href)
          }
          style={({ pressed }) => [
            styles.editBtn,
            { borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
          ]}>
          <MaterialIcons name="edit" size={16} color={theme.text} />
          <ThemedText type="smallBold">Edit name & IC</ThemedText>
        </Pressable>
      )}
    </SectionCard>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.readonlyRow,
        { borderColor: theme.border, backgroundColor: theme.background },
      ]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.readonlyValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.one,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  infoBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  readonlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
    minHeight: 44,
  },
  readonlyValue: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
  },
  editBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
  },
});
