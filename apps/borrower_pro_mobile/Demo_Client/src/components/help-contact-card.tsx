import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { borrowerAuthClient } from '@/lib/api/borrower';
import type { LenderInfo } from '@kredit/borrower';

function ContactAction({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void | Promise<void>;
}) {
  return (
    <View style={styles.contactRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {onPress ? (
        <Pressable onPress={() => void onPress()}>
          <ThemedText type="default" themeColor="primary">
            {value || '—'}
          </ThemedText>
        </Pressable>
      ) : (
        <ThemedText type="default">{value || '—'}</ThemedText>
      )}
    </View>
  );
}

export function HelpContactCard() {
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
      description="If you need assistance with your application, repayments, or loan journey, contact the admin team using the details below.">
      {loading ? (
        <ActivityIndicator />
      ) : error || !lender ? (
        <ThemedText type="small" themeColor="textSecondary">
          {error || 'Contact details are not available right now.'}
        </ThemedText>
      ) : (
        <View style={styles.stack}>
          <ContactAction
            label="Company email"
            value={lender.email || '—'}
            onPress={
              lender.email
                ? () => Linking.openURL(`mailto:${encodeURIComponent(lender.email || '')}`)
                : undefined
            }
          />
          <ContactAction
            label="Contact number"
            value={lender.contactNumber || '—'}
            onPress={
              lender.contactNumber
                ? () => Linking.openURL(`tel:${String(lender.contactNumber).replace(/\s+/g, '')}`)
                : undefined
            }
          />
        </View>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.two,
  },
  contactRow: {
    gap: Spacing.one,
  },
});
