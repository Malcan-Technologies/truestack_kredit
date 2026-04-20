import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  FadeOut,
  interpolate,
  runOnJS,
  SlideInDown,
  SlideInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import {
  _registerToastHandlers,
  type ToastInput,
  type ToastInstance,
  type ToastType,
} from './toast';

const DEFAULT_DURATION = 2400;
const MAX_VISIBLE = 3;
const ENTER_DURATION = 280;
const EXIT_DURATION = 220;
const SWIPE_DISMISS_DISTANCE = 48;
const SWIPE_DISMISS_VELOCITY = 600;

type ToastPosition = 'top' | 'bottom';

interface ToastProviderProps {
  children: React.ReactNode;
  /** Where toasts appear. Defaults to `top` to mirror the web (sonner) layout. */
  position?: ToastPosition;
}

export function ToastProvider({ children, position = 'top' }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastInstance[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id?: string) => {
    if (id) {
      const timer = timersRef.current.get(id);
      if (timer) clearTimeout(timer);
      timersRef.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    } else {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
      setToasts([]);
    }
  }, []);

  const scheduleDismiss = useCallback(
    (id: string, duration: number) => {
      if (duration <= 0) return;
      const existing = timersRef.current.get(id);
      if (existing) clearTimeout(existing);
      timersRef.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  const show = useCallback(
    (input: ToastInput): string => {
      const id =
        input.id ??
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const duration = input.duration ?? DEFAULT_DURATION;
      const instance: ToastInstance = { ...input, id, createdAt: Date.now() };

      setToasts((current) => {
        const without = current.filter((existing) => existing.id !== id);
        const next = [...without, instance];
        return next.slice(-MAX_VISIBLE);
      });

      scheduleDismiss(id, duration);
      return id;
    },
    [scheduleDismiss],
  );

  useEffect(() => {
    _registerToastHandlers({ show, dismiss });
    return () => {
      _registerToastHandlers(null);
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, [show, dismiss]);

  return (
    <>
      {children}
      <ToastViewport
        toasts={toasts}
        position={position}
        onDismiss={dismiss}
      />
    </>
  );
}

interface ToastViewportProps {
  toasts: ToastInstance[];
  position: ToastPosition;
  onDismiss: (id: string) => void;
}

function ToastViewport({ toasts, position, onDismiss }: ToastViewportProps) {
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  const containerStyle: ViewStyle =
    position === 'top'
      ? { top: insets.top + Spacing.three, bottom: undefined }
      : { bottom: insets.bottom + Spacing.three, top: undefined };

  return (
    <View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={[styles.viewport, containerStyle]}>
      <View style={styles.viewportInner} pointerEvents="box-none">
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            position={position}
            onDismiss={() => onDismiss(toast.id)}
          />
        ))}
      </View>
    </View>
  );
}

interface ToastCardProps {
  toast: ToastInstance;
  position: ToastPosition;
  onDismiss: () => void;
}

function ToastCard({ toast, position, onDismiss }: ToastCardProps) {
  const theme = useTheme();
  const visuals = useToastVisuals(toast.type);
  const enter = position === 'top' ? SlideInUp : SlideInDown;

  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  // Swipe direction that dismisses the toast: up (-1) for top-anchored, down (+1) for bottom.
  const dismissSign = position === 'top' ? -1 : 1;

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // Only claim the gesture once the user has moved vertically — keeps tap-to-dismiss responsive.
        .activeOffsetY(position === 'top' ? [-8, 8] : [-8, 8])
        .failOffsetX([-20, 20])
        .onUpdate((event) => {
          const raw = event.translationY;
          // Clamp to dismiss direction only; pulling the other way feels wrong.
          const clamped =
            position === 'top' ? Math.min(raw, 0) : Math.max(raw, 0);
          translateY.value = clamped;
          opacity.value = interpolate(
            Math.abs(clamped),
            [0, SWIPE_DISMISS_DISTANCE * 2],
            [1, 0.4],
            Extrapolation.CLAMP,
          );
        })
        .onEnd((event) => {
          const traveled = dismissSign * event.translationY;
          const velocity = dismissSign * event.velocityY;
          const shouldDismiss =
            traveled > SWIPE_DISMISS_DISTANCE || velocity > SWIPE_DISMISS_VELOCITY;

          if (shouldDismiss) {
            translateY.value = withTiming(dismissSign * 240, { duration: 180 });
            opacity.value = withTiming(0, { duration: 180 }, (finished) => {
              if (finished) runOnJS(onDismiss)();
            });
          } else {
            translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
            opacity.value = withTiming(1, { duration: 160 });
          }
        }),
    [position, dismissSign, onDismiss, translateY, opacity],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        entering={enter.duration(ENTER_DURATION).easing(Easing.out(Easing.cubic))}
        exiting={FadeOut.duration(EXIT_DURATION).easing(Easing.out(Easing.cubic))}
        style={[
          styles.card,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
          Platform.OS === 'ios' ? styles.cardShadowIOS : styles.cardShadowAndroid,
          animatedStyle,
        ]}>
        <Pressable
          accessibilityRole="alert"
          accessibilityLabel={`${toast.message}${toast.description ? `. ${toast.description}` : ''}`}
          onPress={onDismiss}
          style={({ pressed }) => [styles.cardInner, { opacity: pressed ? 0.85 : 1 }]}>
          {visuals.icon ? (
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: visuals.iconBackground ?? theme.backgroundSelected,
                },
              ]}>
              <MaterialIcons
                name={visuals.icon}
                size={18}
                color={visuals.iconColor ?? theme.text}
              />
            </View>
          ) : null}

          <View style={styles.copy}>
            <ThemedText type="smallBold" numberOfLines={2} style={styles.message}>
              {toast.message}
            </ThemedText>
            {toast.description ? (
              <ThemedText
                type="small"
                themeColor="textSecondary"
                numberOfLines={3}
                style={styles.description}>
                {toast.description}
              </ThemedText>
            ) : null}
          </View>

          {toast.action ? (
            <Pressable
              onPress={async () => {
                await Promise.resolve(toast.action?.onPress());
                onDismiss();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.actionButton,
                { borderColor: theme.border, opacity: pressed ? 0.75 : 1 },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.text }}>
                {toast.action.label}
              </ThemedText>
            </Pressable>
          ) : null}

          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            hitSlop={10}
            style={({ pressed }) => [
              styles.closeButton,
              { opacity: pressed ? 0.5 : 1 },
            ]}>
            <MaterialIcons name="close" size={18} color={theme.textSecondary} />
          </Pressable>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

interface ToastVisuals {
  icon: React.ComponentProps<typeof MaterialIcons>['name'] | null;
  iconColor?: string;
  iconBackground?: string;
}

function useToastVisuals(type: ToastType): ToastVisuals {
  const theme = useTheme();
  switch (type) {
    case 'success':
      return {
        icon: 'check-circle',
        iconColor: theme.success,
        iconBackground: theme.success + '20',
      };
    case 'error':
      return {
        icon: 'error-outline',
        iconColor: theme.error,
        iconBackground: theme.error + '20',
      };
    case 'warning':
      return {
        icon: 'warning-amber',
        iconColor: theme.warning,
        iconBackground: theme.warning + '20',
      };
    case 'info':
      return {
        icon: 'info-outline',
        iconColor: theme.info,
        iconBackground: theme.info + '20',
      };
    default:
      return { icon: null };
  }
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    zIndex: 9999,
  },
  viewportInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.two,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardShadowIOS: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  cardShadowAndroid: {
    elevation: 6,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - 4,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
    flexShrink: 0,
  },
  closeButton: {
    padding: 4,
    marginLeft: -Spacing.two,
    flexShrink: 0,
  },
});
