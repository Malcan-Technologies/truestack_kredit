/**
 * Horizontal snap carousel — reusable card pager for KPI / metric strips.
 *
 * Why this exists:
 * - On mobile we frequently want to show a small set of equally-weighted
 *   summary cards (KPIs, metrics, quick stats). Stacking them in a 2x2 grid
 *   eats a lot of vertical space; an edge-to-edge horizontal carousel with
 *   snap behaviour preserves discoverability while taking ~half the height.
 * - The pattern shipped first on the dashboard's KPI strip; any new screen
 *   that needs the same affordance should import from here instead of
 *   re-implementing scroll math, snap logic, and pagination dots.
 *
 * UX guidelines (see `docs/planning/navigation-ux.md` §19):
 * - Cards should be wide enough to read at a glance (≥160pt) but show a
 *   "peek" of the next card so users discover the carousel is scrollable.
 * - Always render pagination dots when there are 2+ cards (`showDots`
 *   defaults to true). Dots should be centered below the strip.
 * - Bleed to the screen edges by passing the page horizontal padding via
 *   `pagePadding`; the component handles the negative margin and content
 *   inset automatically.
 */

import React, {
  Children,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { hapticTick } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

interface HorizontalSnapCarouselProps {
  children: React.ReactNode;
  /**
   * Width (in points) for each card. If omitted the component computes it
   * from `peek` + `pagePadding` so a single card fills the screen with the
   * next one peeking in.
   */
  cardWidth?: number;
  /** Gap between cards. */
  gap?: number;
  /** Horizontal padding applied by the parent screen. Cards bleed to edges. */
  pagePadding?: number;
  /** How much of the next card peeks when `cardWidth` is auto-computed. */
  peek?: number;
  /** Minimum auto-computed card width on very narrow screens. */
  minCardWidth?: number;
  /** Initial centered/active card index. */
  initialIndex?: number;
  /** Show pagination dots below the strip. Defaults to true. */
  showDots?: boolean;
  /** Override testID for the underlying ScrollView. */
  testID?: string;
}

/**
 * Helper for callers that want to render a custom skeleton at the same
 * card width the carousel will use. Mirrors the internal sizing math.
 */
export function useSnapCarouselCardWidth({
  pagePadding = Spacing.four,
  peek = 36,
  minCardWidth = 180,
}: {
  pagePadding?: number;
  peek?: number;
  minCardWidth?: number;
} = {}): number {
  const { width } = useWindowDimensions();
  return Math.max(minCardWidth, width - pagePadding * 2 - peek);
}

export function HorizontalSnapCarousel({
  children,
  cardWidth: explicitCardWidth,
  gap = Spacing.three,
  pagePadding = Spacing.four,
  peek = 36,
  minCardWidth = 180,
  initialIndex = 0,
  showDots = true,
  testID,
}: HorizontalSnapCarouselProps) {
  const theme = useTheme();
  const autoWidth = useSnapCarouselCardWidth({ pagePadding, peek, minCardWidth });
  const cardWidth = explicitCardWidth ?? autoWidth;

  const items = useMemo(() => Children.toArray(children), [children]);
  const snapInterval = cardWidth + gap;
  const clampedInitial = Math.max(0, Math.min(items.length - 1, initialIndex));

  const [activeIndex, setActiveIndex] = useState(clampedInitial);
  const scrollRef = useRef<ScrollView>(null);
  const didInitialScroll = useRef(false);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = event.nativeEvent.contentOffset.x;
      const next = Math.max(
        0,
        Math.min(items.length - 1, Math.round(x / snapInterval)),
      );
      if (next !== activeIndex) {
        setActiveIndex(next);
        hapticTick();
      }
    },
    [activeIndex, items.length, snapInterval],
  );

  const handleContentSizeChange = useCallback(() => {
    if (didInitialScroll.current || clampedInitial === 0) return;
    didInitialScroll.current = true;
    scrollRef.current?.scrollTo({
      x: clampedInitial * snapInterval,
      y: 0,
      animated: false,
    });
  }, [clampedInitial, snapInterval]);

  if (items.length === 0) return null;

  return (
    <View style={[styles.wrap, { marginHorizontal: -pagePadding }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={snapInterval}
        snapToAlignment="start"
        disableIntervalMomentum
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: pagePadding },
        ]}
        contentOffset={{ x: clampedInitial * snapInterval, y: 0 }}
        onContentSizeChange={handleContentSizeChange}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        testID={testID}>
        {items.map((child, index) => (
          <View
            key={index}
            style={[
              styles.item,
              { width: cardWidth },
              index < items.length - 1 ? { marginRight: gap } : null,
            ]}>
            {child}
          </View>
        ))}
      </ScrollView>
      {showDots && items.length > 1 ? (
        <View style={styles.dots}>
          {items.map((_, i) => {
            const active = i === activeIndex;
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: active ? theme.text : theme.border,
                    width: active ? 16 : 6,
                    opacity: active ? 1 : 0.7,
                  },
                ]}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  content: {
    paddingVertical: 2,
    alignItems: 'stretch',
  },
  item: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.one,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
