import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { HelpContactCard } from '@/components/help-contact-card';
import { HelpTopicList } from '@/components/help-topic-list';
import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getHelpTopicBySlug } from '@/lib/help/help-topics';

export default function HelpTopicScreen() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const topic = slug ? getHelpTopicBySlug(slug) : null;

  if (!topic) {
    return (
      <PageScreen title="Help" subtitle="We couldn't find that help topic." showBackButton backFallbackHref="/help">
        <SectionCard title="Topic unavailable" description="Choose another guide from the help center.">
          <HelpTopicList />
        </SectionCard>
      </PageScreen>
    );
  }

  return (
    <PageScreen
      title={topic.title}
      subtitle={topic.summary}
      showBackButton
      backFallbackHref="/help">
      {topic.sections.map((section) => (
        <SectionCard key={section.title} title={section.title}>
          <View style={styles.sectionContent}>
            {section.paragraphs?.map((paragraph, index) => (
              <ThemedText key={`${section.title}-paragraph-${index}`} type="default">
                {paragraph}
              </ThemedText>
            ))}
            {section.bullets?.map((bullet, index) => (
              <View key={`${section.title}-bullet-${index}`} style={styles.bulletRow}>
                <ThemedText type="default" themeColor="textSecondary">
                  •
                </ThemedText>
                <ThemedText type="default" style={styles.bulletText}>
                  {bullet}
                </ThemedText>
              </View>
            ))}
          </View>
        </SectionCard>
      ))}

      <HelpTopicList
        title="More topics"
        description="Open another guide from the help center."
        activeSlug={topic.slug}
      />
      <HelpContactCard />
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  sectionContent: {
    gap: Spacing.two,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  bulletText: {
    flex: 1,
  },
});
