import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { HelpTopicList } from '@/components/help-topic-list';
import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  type HelpTopicDocument,
  type HelpTopicSection,
  getHelpTopicBySlug,
} from '@/lib/help/help-topics';

export default function HelpTopicScreen() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const topic = slug ? getHelpTopicBySlug(slug) : null;

  if (!topic) {
    return (
      <PageScreen
        title="Help"
        showBackButton
        backFallbackHref="/help">
        <SectionCard
          title="Topic unavailable"
          description="Choose another guide from the help center.">
          <HelpTopicList />
        </SectionCard>
      </PageScreen>
    );
  }

  return (
    <PageScreen title={topic.title} showBackButton backFallbackHref="/help">
      <TopicHero topic={topic} />
      {topic.sections.map((section, index) => (
        <TopicSection
          key={section.title}
          section={section}
          index={index}
        />
      ))}
    </PageScreen>
  );
}

function TopicHero({ topic }: { topic: HelpTopicDocument }) {
  const theme = useTheme();
  return (
    <SectionCard hideHeader title={topic.title}>
      <View style={styles.hero}>
        <View
          style={[
            styles.heroIconWrap,
            { backgroundColor: theme.backgroundSelected },
          ]}>
          <MaterialIcons name={topic.icon} size={24} color={theme.primary} />
        </View>
        <ThemedText
          type="default"
          themeColor="textSecondary"
          style={styles.heroSummary}>
          {topic.summary}
        </ThemedText>
      </View>
    </SectionCard>
  );
}

function TopicSection({
  section,
  index,
}: {
  section: HelpTopicSection;
  index: number;
}) {
  const isOverview = index === 0 || /overview/i.test(section.title);
  const looksLikeSteps = section.bullets
    ? /(stage|step|how|process)/i.test(section.title)
    : false;
  const looksLikeNotes = /(note|tip|important|warning)/i.test(section.title);

  return (
    <SectionCard title={section.title}>
      <View style={styles.sectionContent}>
        {section.paragraphs?.map((paragraph, paragraphIndex) => (
          <ThemedText
            key={`paragraph-${paragraphIndex}`}
            type="default"
            style={[
              styles.paragraph,
              isOverview && styles.paragraphLead,
            ]}>
            {paragraph}
          </ThemedText>
        ))}
        {section.bullets && section.bullets.length > 0 ? (
          <View style={styles.bulletList}>
            {section.bullets.map((bullet, bulletIndex) => (
              <BulletRow
                key={`bullet-${bulletIndex}`}
                index={bulletIndex}
                text={bullet}
                variant={
                  looksLikeSteps
                    ? 'numbered'
                    : looksLikeNotes
                      ? 'note'
                      : 'dot'
                }
              />
            ))}
          </View>
        ) : null}
      </View>
    </SectionCard>
  );
}

type BulletVariant = 'dot' | 'numbered' | 'note';

function BulletRow({
  index,
  text,
  variant,
}: {
  index: number;
  text: string;
  variant: BulletVariant;
}) {
  const theme = useTheme();

  return (
    <View style={styles.bulletRow}>
      {variant === 'numbered' ? (
        <View
          style={[
            styles.bulletNumber,
            {
              backgroundColor: theme.backgroundSelected,
            },
          ]}>
          <ThemedText
            type="smallBold"
            style={[styles.bulletNumberText, { color: theme.primary }]}>
            {index + 1}
          </ThemedText>
        </View>
      ) : variant === 'note' ? (
        <View style={styles.bulletIcon}>
          <MaterialIcons
            name="info-outline"
            size={16}
            color={theme.textSecondary}
          />
        </View>
      ) : (
        <View style={styles.bulletIcon}>
          <View
            style={[styles.bulletDot, { backgroundColor: theme.primary }]}
          />
        </View>
      )}
      <ThemedText type="default" style={styles.bulletText}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroSummary: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  sectionContent: {
    gap: Spacing.three,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  paragraphLead: {
    fontSize: 15,
    lineHeight: 22,
  },
  bulletList: {
    gap: Spacing.two + 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three - 4,
  },
  bulletIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bulletNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  bulletNumberText: {
    fontSize: 11,
    lineHeight: 14,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
});
