import React, { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

type SkeletonBlockProps = {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Pulsing placeholder block. Use inside cards to mirror final layout (reduces perceived jump).
 * Hides decorative content from accessibility while loading.
 */
export function SkeletonBlock({ width, height, borderRadius = 8, style }: SkeletonBlockProps) {
  const theme = useTheme();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          ...(width !== undefined ? { width } : {}),
          height,
          borderRadius,
          backgroundColor: theme.backgroundElement,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
