/**
 * Confirmation modal shown before a borrower submits a manual payment or early-settlement request.
 *
 * Forces the user to explicitly tick "I have transferred the exact amount" before the underlying
 * submit handler is fired — mirrors the web `Dialog` flow used in `borrower-make-payment-page` and
 * `borrower-early-settlement-page`.
 */

import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BottomSheetModal } from '@/components/bottom-sheet-modal';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ConfirmRow = {
  label: string;
  value: string;
  mono?: boolean;
};

export function ConfirmTransferSheet({
  visible,
  onClose,
  onConfirm,
  submitting,
  title,
  description,
  amountLabel,
  amountText,
  rows,
  checkboxLabel,
  confirmLabel,
  confirmed,
  onConfirmedChange,
  warning,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  title: string;
  description: string;
  amountLabel: string;
  amountText: string;
  rows: ConfirmRow[];
  checkboxLabel: React.ReactNode;
  confirmLabel: string;
  confirmed: boolean;
  onConfirmedChange: (next: boolean) => void;
  warning?: string;
}) {
  const theme = useTheme();

  useEffect(() => {
    if (!visible) {
      onConfirmedChange(false);
    }
  }, [visible, onConfirmedChange]);

  return (
    <BottomSheetModal
      visible={visible}
      onClose={() => {
        if (submitting) return;
        onClose();
      }}
      title={title}
      subtitle={description}
      scrollable
      footer={
        <View style={styles.footerRow}>
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={onClose}
            style={({ pressed }) => [
              styles.footerCancel,
              { borderColor: theme.border, opacity: submitting ? 0.5 : pressed ? 0.85 : 1 },
            ]}>
            <ThemedText type="smallBold">Cancel</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting || !confirmed }}
            disabled={submitting || !confirmed}
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.footerConfirm,
              {
                backgroundColor: theme.primary,
                opacity: submitting || !confirmed ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}>
            {submitting ? (
              <ActivityIndicator color={theme.primaryForeground} />
            ) : (
              <>
                <MaterialIcons name="check-circle" size={18} color={theme.primaryForeground} />
                <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
                  {confirmLabel}
                </ThemedText>
              </>
            )}
          </Pressable>
        </View>
      }>
      <View style={styles.content}>
        <View
          style={[
            styles.summaryBox,
            {
              borderColor: theme.primary + '40',
              backgroundColor: theme.primary + '0F',
            },
          ]}>
          <View style={styles.summaryHeadline}>
            <ThemedText type="small" themeColor="textSecondary">
              {amountLabel}
            </ThemedText>
            <ThemedText type="subtitle" style={styles.summaryAmount}>
              {amountText}
            </ThemedText>
          </View>

          {rows.map((row) => (
            <View key={row.label} style={styles.summaryRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.summaryRowLabel}>
                {row.label}
              </ThemedText>
              <ThemedText
                type={row.mono ? 'code' : 'small'}
                numberOfLines={1}
                style={styles.summaryRowValue}>
                {row.value || '—'}
              </ThemedText>
            </View>
          ))}
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed, disabled: submitting }}
          disabled={submitting}
          onPress={() => onConfirmedChange(!confirmed)}
          style={({ pressed }) => [
            styles.checkboxRow,
            {
              borderColor: confirmed ? theme.primary : theme.border,
              backgroundColor: confirmed ? theme.primary + '0F' : theme.background,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <View
            style={[
              styles.checkboxBox,
              {
                borderColor: confirmed ? theme.primary : theme.border,
                backgroundColor: confirmed ? theme.primary : theme.background,
              },
            ]}>
            {confirmed ? (
              <MaterialIcons name="check" size={14} color={theme.primaryForeground} />
            ) : null}
          </View>
          <ThemedText type="small" style={styles.checkboxLabel}>
            {checkboxLabel}
          </ThemedText>
        </Pressable>

        {warning ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.warning}>
            {warning}
          </ThemedText>
        ) : null}
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
  },
  summaryBox: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  summaryHeadline: {
    gap: 2,
  },
  summaryAmount: {
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  summaryRowLabel: {
    flexShrink: 0,
  },
  summaryRowValue: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: Spacing.three,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxLabel: {
    flex: 1,
    lineHeight: 20,
  },
  warning: {
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  footerCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerConfirm: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderRadius: 14,
    paddingVertical: Spacing.three,
  },
});
