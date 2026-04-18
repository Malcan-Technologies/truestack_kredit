import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { borrowerAuthClient } from '@/lib/api/borrower';
import { toast } from '@/lib/toast';
import type { LenderInfo } from '@kredit/borrower';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

function ContactCopyRow({
  icon,
  label,
  value,
  copyLabel,
  isLast,
}: {
  icon: IconName;
  label: string;
  value: string;
  copyLabel: string;
  isLast: boolean;
}) {
  const theme = useTheme();
  const hasValue = Boolean(value);

  const handleCopy = async () => {
    if (!hasValue) return;
    try {
      await Clipboard.setStringAsync(value);
      toast.success(`${copyLabel} copied`, { description: value });
    } catch {
      toast.error(`Couldn't copy ${copyLabel.toLowerCase()}`);
    }
  };

  return (
    <Pressable
      accessibilityRole={hasValue ? 'button' : undefined}
      accessibilityLabel={hasValue ? `Copy ${copyLabel.toLowerCase()}: ${value}` : undefined}
      accessibilityHint={hasValue ? 'Copies to your clipboard' : undefined}
      disabled={!hasValue}
      onPress={() => void handleCopy()}
      style={({ pressed }) => [
        styles.row,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
        { opacity: hasValue && pressed ? 0.7 : 1 },
      ]}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: theme.backgroundSelected },
        ]}>
        <MaterialIcons name={icon} size={18} color={theme.primary} />
      </View>
      <View style={styles.copy}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
        <ThemedText type="smallBold" numberOfLines={1}>
          {value || '—'}
        </ThemedText>
      </View>
      {hasValue ? (
        <View
          style={[
            styles.copyAffordance,
            { backgroundColor: theme.backgroundSelected },
          ]}>
          <MaterialIcons name="content-copy" size={16} color={theme.text} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function HelpContactCard() {
  const theme = useTheme();
  const [lender, setLender] = useState<LenderInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void borrowerAuthClient
      .fetchLenderInfo()
      .then((result) => {
        if (!cancelled) {
          setLender(result.data);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Something went wrong');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SectionCard
      title="Need more help?"
      description="Tap a contact to copy it. Reach the admin team for help with applications, payments, or your loan.">
      {loading ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : error || !lender ? (
        <View style={styles.statusRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.statusText}>
            {error || 'Contact details are not available right now.'}
          </ThemedText>
        </View>
      ) : (
        <View style={styles.rowGroup}>
          <ContactCopyRow
            icon="mail-outline"
            label="Email"
            copyLabel="Email"
            value={lender.email || ''}
            isLast={false}
          />
          <ContactCopyRow
            icon="phone"
            label="Phone"
            copyLabel="Phone number"
            value={lender.contactNumber || ''}
            isLast
          />
        </View>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  rowGroup: {
    marginHorizontal: -Spacing.three,
    marginVertical: -Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
  },
  copyAffordance: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: {
    paddingVertical: Spacing.two,
    alignItems: 'flex-start',
  },
  statusText: {
    lineHeight: 20,
  },
});
