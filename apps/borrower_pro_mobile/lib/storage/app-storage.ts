import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

function getWebStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function getStoredItem(key: string): Promise<string | null> {
  const webStorage = getWebStorage();
  if (webStorage) {
    try {
      return webStorage.getItem(key);
    } catch {
      return null;
    }
  }

  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setStoredItem(key: string, value: string): Promise<void> {
  const webStorage = getWebStorage();
  if (webStorage) {
    try {
      webStorage.setItem(key, value);
      return;
    } catch {
      return;
    }
  }

  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures so onboarding remains usable.
  }
}

export async function removeStoredItem(key: string): Promise<void> {
  const webStorage = getWebStorage();
  if (webStorage) {
    try {
      webStorage.removeItem(key);
      return;
    } catch {
      return;
    }
  }

  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Ignore storage removal failures.
  }
}
