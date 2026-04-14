import { MaterialIcons } from '@expo/vector-icons';
import { type Href, useNavigation, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BorrowerContextHeader } from '@/components/borrower-context-header';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TITLE_MAX = 30;
const TITLE_MIN = 17;
const COLLAPSE_RANGE = 52;

type ToolbarVariant = 'primary' | 'outline' | 'danger';

/** Compact pill for `headerActions` (sits next to the profile switcher). */
export function PageHeaderToolbarButton({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: ToolbarVariant;
  loading?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const palette = useMemo(() => {
    if (variant === 'outline') {
      return {
        backgroundColor: theme.background,
        borderColor: theme.border,
        textColor: theme.text,
      };
    }
    if (variant === 'danger') {
      return {
        backgroundColor: theme.error,
        borderColor: theme.error,
        textColor: theme.primaryForeground,
      };
    }
    return {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
      textColor: theme.primaryForeground,
    };
  }, [theme, variant]);

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => void onPress()}
      style={({ pressed }) => [
        toolbarButtonStyles.root,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          opacity: pressed || disabled || loading ? 0.75 : 1,
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.textColor} size="small" />
      ) : (
        <ThemedText type="smallBold" style={{ color: palette.textColor }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const toolbarButtonStyles = StyleSheet.create({
  root: {
    minHeight: 34,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

interface PageScreenProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
  showBackButton?: boolean;
  showBottomNav?: boolean;
  backFallbackHref?: Href;
  showBorrowerContextHeader?: boolean;
  /** Primary actions (e.g. Edit, Save) — shown to the left of the profile switcher. */
  headerActions?: React.ReactNode;
  /** When false, title stays a fixed size (no scroll shrink). */
  collapseTitleOnScroll?: boolean;
}

export function PageScreen({
  title,
  subtitle,
  children,
  contentStyle,
  showBackButton = false,
  showBottomNav = false,
  backFallbackHref = '/',
  showBorrowerContextHeader = false,
  headerActions,
  collapseTitleOnScroll = true,
}: PageScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const scrollY = useSharedValue(0);

  const bottomPadding =
    Spacing.four +
    insets.bottom +
    (showBottomNav ? BottomTabInset : Math.max(0, BottomTabInset - insets.bottom));

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const titleAnimatedStyle = useAnimatedStyle(() => {
    if (!collapseTitleOnScroll) {
      return { fontSize: TITLE_MAX, lineHeight: 38 };
    }
    const fontSize = interpolate(
      scrollY.value,
      [0, COLLAPSE_RANGE],
      [TITLE_MAX, TITLE_MIN],
      Extrapolation.CLAMP,
    );
    const lineHeight = interpolate(
      scrollY.value,
      [0, COLLAPSE_RANGE],
      [38, 22],
      Extrapolation.CLAMP,
    );
    return { fontSize, lineHeight };
  });

  const subtitleAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 20], [1, 0], Extrapolation.CLAMP);
    const maxHeight = interpolate(scrollY.value, [0, 28], [72, 0], Extrapolation.CLAMP);
    const marginTop = interpolate(scrollY.value, [0, 24], [Spacing.one, 0], Extrapolation.CLAMP);
    return { opacity, maxHeight, overflow: 'hidden' as const, marginTop };
  });

  const headerBorderColor = theme.border;
  const headerUnderlineStyle = useAnimatedStyle(() => ({
    borderBottomWidth: interpolate(
      scrollY.value,
      [6, 18],
      [0, StyleSheet.hairlineWidth],
      Extrapolation.CLAMP,
    ),
    borderBottomColor: headerBorderColor,
  }));

  function handleBack() {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    router.replace(backFallbackHref);
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={['top']} style={[styles.stickyHeader, { backgroundColor: theme.background }]}>
        <View style={[styles.headerInner, { paddingHorizontal: Spacing.four, maxWidth: MaxContentWidth }]}>
          {showBackButton ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={handleBack}
              style={({ pressed }) => [
                styles.backButton,
                {
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              <MaterialIcons
                name={Platform.OS === 'ios' ? 'arrow-back-ios-new' : 'arrow-back'}
                size={20}
                color={theme.primary}
              />
              {Platform.OS === 'ios' ? (
                <ThemedText type="default" style={{ color: theme.primary }}>
                  Back
                </ThemedText>
              ) : null}
            </Pressable>
          ) : null}

          <Animated.View style={[styles.headerToolbar, headerUnderlineStyle]}>
            <View style={styles.titleColumn}>
              <Animated.Text
                accessibilityRole="header"
                numberOfLines={2}
                ellipsizeMode="tail"
                style={[
                  styles.titleText,
                  { color: theme.text, fontWeight: '600' },
                  collapseTitleOnScroll ? titleAnimatedStyle : undefined,
                  !collapseTitleOnScroll ? { fontSize: TITLE_MAX, lineHeight: 38 } : undefined,
                ]}>
                {title}
              </Animated.Text>
              {subtitle ? (
                <Animated.View style={subtitleAnimatedStyle}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
                    {subtitle}
                  </ThemedText>
                </Animated.View>
              ) : null}
            </View>
            {headerActions || showBorrowerContextHeader ? (
              <View style={styles.headerActionsRow}>
                {headerActions ? <View style={styles.headerActionsInner}>{headerActions}</View> : null}
                {showBorrowerContextHeader ? <BorrowerContextHeader /> : null}
              </View>
            ) : null}
          </Animated.View>
        </View>
      </SafeAreaView>

      <Animated.ScrollView
        style={[styles.scroll, { backgroundColor: theme.background }]}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: bottomPadding,
            paddingHorizontal: Spacing.four,
            maxWidth: MaxContentWidth,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator>
        <View style={[styles.body, contentStyle]}>{children}</View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stickyHeader: {
    width: '100%',
    alignItems: 'center',
    zIndex: 2,
  },
  headerInner: {
    width: '100%',
    paddingTop: Spacing.two,
  },
  headerToolbar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    marginTop: Spacing.one,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
  },
  titleText: {
    fontSize: TITLE_MAX,
    lineHeight: 38,
  },
  subtitle: {
    lineHeight: 20,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: Spacing.two,
    paddingTop: 2,
  },
  headerActionsInner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  body: {
    gap: Spacing.three,
  },
  backButton: {
    minHeight: 32,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginLeft: -Spacing.one,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
  },
});
