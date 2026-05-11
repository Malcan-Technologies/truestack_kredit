import { MaterialIcons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getHelpTopics } from '@/lib/help/help-topics';

export function HelpTopicList({
  title = 'Help topics',
  description = 'Select a topic to read the full guide.',
  activeSlug,
}: {
  title?: string;
  description?: string;
  activeSlug?: string;
}) {
  const router = useRouter();
  const theme = useTheme();
  const topics = getHelpTopics();

  return (
    <SectionCard title={title} description={description}>
      <View style={styles.list}>
        {topics.map((topic, index) => {
          const active = topic.slug === activeSlug;
          const isLast = index === topics.length - 1;

          return (
            <Pressable
              key={topic.slug}
              accessibilityRole="button"
              accessibilityLabel={topic.title}
              accessibilityState={{ selected: active }}
              disabled={active}
              onPress={() => router.push(`/help/${topic.slug}` as Href)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: active ? theme.backgroundSelected : 'transparent',
                  opacity: !active && pressed ? 0.7 : 1,
                },
                !isLast && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border,
                },
              ]}>
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: active
                      ? theme.background
                      : theme.backgroundSelected,
                  },
                ]}>
                <MaterialIcons
                  name={topic.icon}
                  size={18}
                  color={active ? theme.primary : theme.text}
                />
              </View>
              <View style={styles.copy}>
                <ThemedText
                  type="smallBold"
                  numberOfLines={1}
                  style={{ color: active ? theme.primary : theme.text }}>
                  {topic.title}
                </ThemedText>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  numberOfLines={2}
                  style={styles.summary}>
                  {topic.summary}
                </ThemedText>
              </View>
              <MaterialIcons
                name={active ? 'check-circle' : 'chevron-right'}
                size={20}
                color={active ? theme.primary : theme.textSecondary}
              />
            </Pressable>
          );
        })}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  list: {
    marginHorizontal: -Spacing.three,
    marginVertical: -Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - 2,
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
  summary: {
    fontSize: 13,
    lineHeight: 18,
  },
});
