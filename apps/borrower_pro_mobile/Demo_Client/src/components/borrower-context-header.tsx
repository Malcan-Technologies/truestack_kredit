import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BorrowerProfileSwitcher } from '@/components/borrower-profile-switcher';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatBorrowerTypeLabel, getBorrowerDisplayName } from '@/lib/format/borrower';
import { useBorrowerAccess } from '@/lib/borrower-access';
import { useRouter } from 'expo-router';

export function BorrowerContextHeader() {
  const router = useRouter();
  const theme = useTheme();
  const {
    activeBorrower,
    activeBorrowerId,
    hasBorrowerProfiles,
    profiles,
    switchBorrowerProfile,
    switchingProfileId,
  } = useBorrowerAccess();
  const [open, setOpen] = useState(false);
  const sheetProgress = useRef(new Animated.Value(0)).current;

  const activeProfile = activeBorrower ?? profiles[0] ?? null;
  const displayName = activeProfile ? getBorrowerDisplayName(activeProfile) : '';
  const initials = useMemo(() => {
    const normalized = displayName.trim();
    if (!normalized) {
      return 'B';
    }

    const parts = normalized.split(/\s+/).filter(Boolean);
    return parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }, [displayName]);

  const openSheet = useCallback(() => {
    setOpen(true);
    sheetProgress.setValue(0);
    Animated.timing(sheetProgress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [sheetProgress]);

  const closeSheet = useCallback(
    (onClosed?: () => void) => {
      Animated.timing(sheetProgress, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setOpen(false);
        onClosed?.();
      });
    },
    [sheetProgress],
  );

  if (!hasBorrowerProfiles || !activeProfile) {
    return null;
  }

  async function handleSwitch(profileId: string) {
    try {
      await switchBorrowerProfile(profileId);
      closeSheet();
    } catch (error) {
      Alert.alert(
        'Unable to switch profile',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch borrower profile"
        onPress={openSheet}
        style={({ pressed }) => [
          styles.trigger,
          {
            borderColor: theme.border,
            backgroundColor: theme.backgroundElement,
            opacity: pressed ? 0.8 : 1,
          },
        ]}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>
            {initials}
          </ThemedText>
        </View>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
            },
          ]}>
          <MaterialIcons name="expand-more" size={12} color={theme.textSecondary} />
        </View>
      </Pressable>

      <Modal transparent visible={open} onRequestClose={() => closeSheet()}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => closeSheet()} />
          <Animated.View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                transform: [
                  {
                    translateY: sheetProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [360, 0],
                    }),
                  },
                ],
              },
            ]}>
            <SafeAreaView edges={['bottom']} style={styles.sheetSafeArea}>
              <View
                style={[
                  styles.sheetHandle,
                  {
                    backgroundColor: theme.border,
                  },
                ]}
              />
              <View style={styles.modalHeader}>
                <View style={styles.modalCopy}>
                  <ThemedText type="subtitle">Borrower profiles</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Active: {displayName} ({formatBorrowerTypeLabel(activeProfile.borrowerType)})
                  </ThemedText>
                </View>
                <Pressable onPress={() => closeSheet()}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    Close
                  </ThemedText>
                </Pressable>
              </View>

              <BorrowerProfileSwitcher
                profiles={profiles}
                activeProfileId={activeBorrowerId}
                switchingProfileId={switchingProfileId}
                onSwitch={(profile) => handleSwitch(profile.id)}
              />

              <View style={styles.footer}>
                <Pressable
                  onPress={() => {
                    closeSheet(() => {
                      router.push('/onboarding');
                    });
                  }}
                  style={({ pressed }) => [
                    styles.addButton,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}>
                  <MaterialIcons name="add-circle-outline" size={18} color={theme.text} />
                  <ThemedText type="smallBold">Add profile</ThemedText>
                </Pressable>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
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
    maxHeight: '84%',
  },
  sheetSafeArea: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
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
    gap: Spacing.two,
  },
  modalCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  footer: {
    paddingTop: Spacing.one,
  },
  addButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
});
