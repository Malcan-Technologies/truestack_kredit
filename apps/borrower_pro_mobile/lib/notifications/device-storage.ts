import AsyncStorage from '@react-native-async-storage/async-storage';

const STORED_PUSH_TOKEN_KEY = 'borrower_push_token';

export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredPushToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORED_PUSH_TOKEN_KEY, token);
  } catch {
    // Ignore storage failures so registration does not block app usage.
  }
}

export async function clearStoredPushToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORED_PUSH_TOKEN_KEY);
  } catch {
    // Ignore storage failures so sign-out still completes.
  }
}
