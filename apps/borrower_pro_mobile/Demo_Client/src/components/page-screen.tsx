import { MaterialIcons } from '@expo/vector-icons';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { type Href, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  type RefreshControlProps,
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
import { NotificationHeaderButton } from '@/components/notification-header-button';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/lib/theme/theme-preference';

const TITLE_MAX = 30;
const TITLE_MIN = 17;
const COLLAPSE_RANGE = 52;

/** Fixed width for leading/trailing slots so the title stays visually centered (stack / back-button screens). */
const COMPACT_NAV_SIDE_WIDTH = Platform.OS === 'ios' ? 64 : 72;

function iosMajorVersion(): number | null {
  if (Platform.OS !== 'ios') return null;
  const v = Platform.Version;
  if (typeof v === 'string') return parseInt(v.split('.')[0] ?? '0', 10) || null;
  if (typeof v === 'number') return Math.floor(v);
  return null;
}

/**
 * iOS: native SF Symbol (`chevron.backward`, minimal bar); older iOS: `chevron.left`.
 * Android / web: Material arrow-back (no label).
 */
function PageHeaderBackIcon({ tintColor }: { tintColor: string }) {
  if (Platform.OS !== 'ios') {
    return <MaterialIcons name="arrow-back" size={22} color={tintColor} />;
  }

  const major = iosMajorVersion();
  const name = major != null && major < 14 ? 'chevron.left' : 'chevron.backward';

  return (
    <SymbolView
      name={name}
      size={20}
      weight="semibold"
      tintColor={tintColor}
      fallback={<MaterialIcons name="arrow-back-ios-new" size={22} color={tintColor} />}
    />
  );
}

const BACK_GLASS_SIZE = 44;
const BACK_GLASS_RADIUS = BACK_GLASS_SIZE / 2;

/**
 * iOS 26+: `GlassView` applies `UIGlassEffect` (Liquid Glass). Requires both API checks from expo-glass-effect.
 * Older iOS / Android / web: icon only.
 */
function PageHeaderBackControl({
  tintColor,
  glassColorScheme,
}: {
  tintColor: string;
  glassColorScheme: 'light' | 'dark' | 'auto';
}) {
  const useLiquidGlass =
    Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

  const icon = <PageHeaderBackIcon tintColor={tintColor} />;

  if (!useLiquidGlass) {
    return icon;
  }

  return (
    <GlassView
      glassEffectStyle="regular"
      isInteractive
      colorScheme={glassColorScheme}
      style={styles.backGlassView}
      // Native prop (see expo-glass-effect GlassEffectModule); omitted from TS defs.
      // @ts-expect-error borderRadius maps to iOS cornerConfiguration for UIGlassEffect
      borderRadius={BACK_GLASS_RADIUS}>
      {icon}
    </GlassView>
  );
}

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
  /** Shown under the title on **root** screens only. Ignored when `showBackButton` is true. */
  subtitle?: string;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
  /** Native pull-to-refresh on the main scroll (e.g. `RefreshControl`). */
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /**
   * Replaces the main `Animated.ScrollView` with this scrollable (typically Reanimated `Animated.FlatList`).
   * Use for paginated / infinite lists. **`children` are ignored** when set — build the screen body inside
   * the list (`ListHeaderComponent`, `renderItem`, etc.).
   *
   * Typed as `ReactElement<any>` because we forward dynamic props (`onScroll`, `style`, etc.) via
   * `cloneElement` and React 19's default `ReactElement<unknown>` would make `.props` unknown.
   */
  scrollableOverride?: React.ReactElement<any>;
  showBackButton?: boolean;
  showBottomNav?: boolean;
  backFallbackHref?: Href;
  /**
   * Borrower profile switcher (avatar). Only for **root** tab screens — omit on stack screens
   * (`showBackButton: true`), which use the compact centered-title bar instead.
   */
  showBorrowerContextHeader?: boolean;
  /** Lightweight header actions (e.g. Retry). On stack screens, shown on the right of the compact title bar. */
  headerActions?: React.ReactNode;
  /** When false, title stays a fixed size (no scroll shrink). */
  collapseTitleOnScroll?: boolean;
  /** Fixed action bar anchored to the bottom of the screen, above the safe area. */
  stickyFooter?: React.ReactNode;
  /** Override the default back navigation. When provided, called instead of `navigation.goBack()`. */
  onBack?: () => void | Promise<void>;
}

export function PageScreen({
  title,
  subtitle,
  children,
  contentStyle,
  refreshControl,
  scrollableOverride,
  showBackButton = false,
  showBottomNav = false,
  backFallbackHref = '/',
  showBorrowerContextHeader = false,
  headerActions,
  collapseTitleOnScroll = true,
  stickyFooter,
  onBack,
}: PageScreenProps) {
  const theme = useTheme();
  const { resolvedScheme } = useThemePreference();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const scrollY = useSharedValue(0);

  const bottomPadding = stickyFooter
    ? Spacing.four
    : Spacing.four +
      insets.bottom +
      (showBottomNav ? BottomTabInset : Math.max(0, BottomTabInset - insets.bottom));

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const titleAnimatedStyle = useAnimatedStyle(() => {
    if (showBackButton) {
      return { fontSize: TITLE_MIN, lineHeight: 22 };
    }
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
    const marginTop = interpolate(scrollY.value, [0, 24], [Spacing.two, 0], Extrapolation.CLAMP);
    return { opacity, maxHeight, overflow: 'hidden' as const, marginTop };
  });

  /** Full-width hairline under the header (iOS UINavigationBar separator style). */
  const headerHairlineStyle = useAnimatedStyle(() => {
    if (showBackButton) {
      return {
        opacity: interpolate(scrollY.value, [2, 24], [0, 0.55], Extrapolation.CLAMP),
      };
    }
    if (!collapseTitleOnScroll) {
      return { opacity: 0 };
    }
    /** Slightly soft — similar to iOS separator when content scrolls under the bar. */
    return {
      opacity: interpolate(scrollY.value, [2, 24], [0, 0.55], Extrapolation.CLAMP),
    };
  });

  const headerToolbarAnimatedStyle = useAnimatedStyle(() => {
    if (showBackButton) {
      return {};
    }
    if (!collapseTitleOnScroll) {
      return {
        alignItems: 'flex-start' as const,
      };
    }
    const collapseT = Math.min(Math.max(scrollY.value / COLLAPSE_RANGE, 0), 1);
    /** When mostly collapsed, vertically center title with trailing actions (compact nav bar). */
    const compact = collapseT > 0.78;
    return {
      alignItems: (compact ? 'center' : 'flex-start') as 'center' | 'flex-start',
    };
  });

  const showProfileSwitcher = Boolean(showBorrowerContextHeader && !showBackButton);
  /** Bell + profile switcher only on root tab screens (not stack / not onboarding-only without profiles). */
  const showNotificationBell = showProfileSwitcher;

  function handleBack() {
    if (onBack) {
      void onBack();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    router.replace(backFallbackHref);
  }

  useEffect(() => {
    if (!showBackButton || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBackButton, onBack]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={['top']} style={[styles.stickyHeader, { backgroundColor: theme.background }]}>
        <View style={[styles.headerInner, { paddingHorizontal: Spacing.four, maxWidth: MaxContentWidth }]}>
          {showBackButton ? (
            <>
              <View style={styles.compactNavBar}>
                <View style={[styles.compactNavSide, { width: COMPACT_NAV_SIDE_WIDTH }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={handleBack}
                    style={({ pressed }) => [
                      styles.backButtonInline,
                      {
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}>
                    <PageHeaderBackControl
                      glassColorScheme={resolvedScheme}
                      tintColor={theme.primary}
                    />
                  </Pressable>
                </View>
                <View style={styles.compactNavTitleWrap} pointerEvents="none">
                  <Animated.Text
                    accessibilityRole="header"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={[
                      styles.compactNavTitleText,
                      { color: theme.text, fontWeight: '600' },
                      titleAnimatedStyle,
                    ]}>
                    {title}
                  </Animated.Text>
                </View>
                <View
                  style={[
                    styles.compactNavSide,
                    styles.compactNavSideEnd,
                    { width: COMPACT_NAV_SIDE_WIDTH },
                  ]}>
                  {headerActions ? (
                    <View style={styles.headerActionsInnerCompact}>{headerActions}</View>
                  ) : (
                    <View style={styles.compactNavSideSpacer} />
                  )}
                </View>
              </View>
            </>
          ) : (
            <Animated.View style={[styles.headerToolbar, headerToolbarAnimatedStyle]}>
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
              {headerActions || showNotificationBell || showProfileSwitcher ? (
                <View style={styles.headerActionsRow}>
                  {headerActions ? <View style={styles.headerActionsInner}>{headerActions}</View> : null}
                  {showNotificationBell ? <NotificationHeaderButton /> : null}
                  {showProfileSwitcher ? <BorrowerContextHeader /> : null}
                </View>
              ) : null}
            </Animated.View>
          )}
        </View>

        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          style={[
            styles.headerHairline,
            { backgroundColor: theme.border },
            headerHairlineStyle,
          ]}
        />
      </SafeAreaView>

      {scrollableOverride ? (
        (() => {
          const op = scrollableOverride.props as {
            style?: ViewStyle;
            contentContainerStyle?: ViewStyle;
            refreshControl?: React.ReactElement<RefreshControlProps>;
            showsVerticalScrollIndicator?: boolean;
          };
          return React.cloneElement(scrollableOverride, {
            onScroll,
            scrollEventThrottle: 16,
            keyboardShouldPersistTaps: 'handled',
            style: [styles.scroll, { backgroundColor: theme.background }, op.style],
            contentContainerStyle: [
              styles.scrollContent,
              {
                paddingBottom: bottomPadding,
                paddingHorizontal: Spacing.four,
                maxWidth: MaxContentWidth,
                alignSelf: 'center',
                width: '100%',
              },
              op.contentContainerStyle,
            ],
            refreshControl: refreshControl ?? op.refreshControl,
            showsVerticalScrollIndicator: op.showsVerticalScrollIndicator ?? true,
          } as never);
        })()
      ) : (
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
          refreshControl={refreshControl}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator>
          <View style={[styles.body, contentStyle]}>{children}</View>
        </Animated.ScrollView>
      )}

      {stickyFooter ? (
        <View
          style={[
            styles.stickyFooter,
            {
              backgroundColor: theme.background,
              borderTopColor: theme.border,
              paddingBottom: insets.bottom + Spacing.two,
            },
          ]}>
          <View style={styles.stickyFooterInner}>{stickyFooter}</View>
        </View>
      ) : null}
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
  headerHairline: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
  },
  headerInner: {
    width: '100%',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerToolbar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingBottom: Spacing.three,
    marginTop: Spacing.two,
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
    paddingTop: Spacing.one,
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
  compactNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingBottom: Spacing.three,
  },
  compactNavSide: {
    justifyContent: 'center',
  },
  compactNavSideEnd: {
    alignItems: 'flex-end',
  },
  compactNavSideSpacer: {
    width: 1,
    height: 1,
    opacity: 0,
  },
  compactNavTitleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  compactNavTitleText: {
    textAlign: 'center',
    width: '100%',
    fontSize: TITLE_MIN,
    lineHeight: 22,
  },
  backButtonInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginLeft: -Spacing.one,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
    minHeight: 44,
  },
  /** iOS 26+ UIGlassEffect capsule behind the chevron (see `PageHeaderBackControl`). */
  backGlassView: {
    width: BACK_GLASS_SIZE,
    height: BACK_GLASS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionsInnerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: Spacing.two,
    maxWidth: '100%',
  },
  stickyFooter: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  stickyFooterInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.two,
  },
});
