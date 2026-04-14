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
        {topics.map((topic) => {
          const active = topic.slug === activeSlug;

          return (
            <Pressable
              key={topic.slug}
              disabled={active}
              onPress={() => router.push((`/help/${topic.slug}` as Href))}
              style={({ pressed }) => [
                styles.row,
                {
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active ? theme.backgroundSelected : theme.background,
                  opacity: active ? 1 : pressed ? 0.8 : 1,
                },
              ]}>
              <View style={styles.copy}>
                <ThemedText type="smallBold" style={{ color: active ? theme.primary : theme.text }}>
                  {topic.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
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
    gap: Spacing.two,
  },
  row: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  copy: {
    flex: 1,
    gap: Spacing.one,
  },
});
