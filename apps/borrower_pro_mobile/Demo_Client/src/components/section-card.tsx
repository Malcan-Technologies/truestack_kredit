import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SectionCardProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  /** When true, only the bordered body is shown (no title/description row). */
  hideHeader?: boolean;
  children: React.ReactNode;
  /** When set, the header toggles visibility of the body; starts collapsed if defaultExpanded is false. */
  collapsible?: boolean;
  /** Only used when collapsible is true. Defaults to collapsed unless set to true. */
  defaultExpanded?: boolean;
  /** One line under the title while collapsed (e.g. document count). */
  collapsedSummary?: string;
}

export function SectionCard({
  title,
  description,
  action,
  hideHeader = false,
  children,
  collapsible = false,
  defaultExpanded,
  collapsedSummary,
}: SectionCardProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(() =>
    !collapsible ? true : (defaultExpanded ?? false),
  );

  const showBody = !collapsible || expanded;

  if (hideHeader) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
        ]}>
        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  const headerInner = (
    <View style={styles.headerRow}>
      <View style={styles.headerCopy}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {collapsible && !expanded && collapsedSummary ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
            {collapsedSummary}
          </ThemedText>
        ) : null}
        {showBody && description ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
            {description}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.headerTrailing}>
        {action ? <View style={styles.action}>{action}</View> : null}
        {collapsible ? (
          <MaterialIcons
            name={expanded ? 'expand-less' : 'expand-more'}
            size={22}
            color={theme.textSecondary}
          />
        ) : null}
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}>
      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((v) => !v)}
          style={({ pressed }) => [styles.headerPressable, pressed && styles.headerPressed]}>
          {headerInner}
        </Pressable>
      ) : (
        <View style={styles.header}>{headerInner}</View>
      )}

      {showBody ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.two,
  },
  headerPressable: {
    borderRadius: 12,
    marginHorizontal: -Spacing.one,
    marginTop: -Spacing.one,
    paddingHorizontal: Spacing.one,
    paddingTop: Spacing.one,
  },
  headerPressed: {
    opacity: 0.85,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  headerTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    gap: Spacing.two,
  },
  description: {
    lineHeight: 20,
  },
  action: {
    alignSelf: 'center',
  },
  content: {
    gap: Spacing.three,
  },
});
