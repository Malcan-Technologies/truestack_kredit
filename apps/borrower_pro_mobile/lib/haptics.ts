/**
 * Thin wrapper around expo-haptics for in-app feedback.
 *
 * Centralised so we can:
 *  - swallow errors on platforms that don't support haptics (web, Android
 *    devices without a haptic engine);
 *  - keep call sites tiny (`hapticTick()`) and consistent;
 *  - one day route through a "reduced motion / haptics off" user preference.
 *
 * Use the lightest variant that conveys the intent:
 *  - `hapticTick()`   — selection / tab / carousel page change (Selection feedback).
 *  - `hapticTap()`    — button press confirmation (Light Impact).
 *  - `hapticSuccess()` / `hapticWarning()` / `hapticError()` — completion/notification.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const isSupported = Platform.OS === 'ios' || Platform.OS === 'android';

function safe(fn: () => Promise<unknown> | unknown) {
  if (!isSupported) return;
  try {
    void fn();
  } catch {
    // best-effort: never throw from a haptic call
  }
}

/** Subtle "tick" for selection changes (carousel page change, segmented control). */
export function hapticTick() {
  safe(() => Haptics.selectionAsync());
}

/** Light impact for button presses. */
export function hapticTap() {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticSuccess() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function hapticWarning() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export function hapticError() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
