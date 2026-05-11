import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const OVERLAY_SCRIM = 'rgba(0, 0, 0, 0.36)';

type BottomSheetModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Sheet content (inputs, copy). */
  children: React.ReactNode;
  /** Pinned below the body — primary action (dismiss via header Close / backdrop). */
  footer?: React.ReactNode;
  /** Use when the body may overflow (e.g. password fields). */
  scrollable?: boolean;
  /**
   * Max height as % of screen — slightly above profile switcher (84%) for priority flows.
   * @default 92
   */
  maxHeightPercent?: number;
};

export function BottomSheetModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  scrollable = false,
  maxHeightPercent = 92,
}: BottomSheetModalProps) {
  const theme = useTheme();
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(() => visible);
  const windowHeight = Dimensions.get('window').height;
  const scrollMaxHeight = Math.round(windowHeight * 0.58);

  useLayoutEffect(() => {
    if (visible) {
      setMounted(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    if (visible) {
      sheetProgress.setValue(0);
      Animated.timing(sheetProgress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(sheetProgress, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMounted(false);
        }
      });
    }
  }, [visible, mounted, sheetProgress]);

  if (!mounted) {
    return null;
  }

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityRole="button" />
          <Animated.View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                maxHeight: `${maxHeightPercent}%`,
                transform: [
                  {
                    translateY: sheetProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [480, 0],
                    }),
                  },
                ],
              },
            ]}>
            <SafeAreaView edges={['bottom']} style={styles.sheetSafeArea}>
              <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />

              <View style={styles.modalHeader}>
                <View style={styles.modalCopy}>
                  <ThemedText type="subtitle">{title}</ThemedText>
                  {subtitle ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {subtitle}
                    </ThemedText>
                  ) : null}
                </View>
                <Pressable onPress={onClose} hitSlop={12}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    Close
                  </ThemedText>
                </Pressable>
              </View>

              {scrollable ? (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={[styles.sheetScroll, { maxHeight: scrollMaxHeight }]}
                  contentContainerStyle={styles.sheetScrollContent}>
                  {children}
                </ScrollView>
              ) : (
                <View style={styles.sheetBody}>{children}</View>
              )}

              {footer ? (
                <View style={[styles.sheetFooter, { borderTopColor: theme.border }]}>{footer}</View>
              ) : null}
            </SafeAreaView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: OVERLAY_SCRIM,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    width: '100%',
    overflow: 'hidden',
  },
  sheetSafeArea: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    /** Inset bottom + breathing room — primary action aligns across scroll vs non-scroll sheets. */
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: Spacing.one,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  modalCopy: {
    flex: 1,
    gap: Spacing.two,
  },
  sheetBody: {
    gap: Spacing.four,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    gap: Spacing.four,
    paddingBottom: Spacing.two,
  },
  sheetFooter: {
    alignSelf: 'stretch',
    width: '100%',
    paddingTop: Spacing.four,
    marginTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
