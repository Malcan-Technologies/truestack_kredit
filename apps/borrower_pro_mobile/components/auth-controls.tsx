import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  type KeyboardTypeOptions,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function AuthInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  editable = true,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'words' | 'sentences';
  editable?: boolean;
}) {
  const theme = useTheme();

  return (
    <TextInput
      style={[
        styles.input,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          color: theme.text,
        },
        !editable && styles.disabled,
      ]}
      placeholder={placeholder}
      placeholderTextColor={theme.textSecondary}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      editable={editable}
    />
  );
}

export function AuthButton({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
}) {
  const theme = useTheme();
  const isOutline = variant === 'outline';

  return (
    <Pressable
      style={[
        styles.button,
        {
          backgroundColor: isOutline ? theme.background : theme.primary,
          borderColor: isOutline ? theme.border : theme.primary,
        },
        (disabled || loading) && styles.disabled,
      ]}
      disabled={disabled || loading}
      onPress={() => void onPress()}>
      {loading ? (
        <ActivityIndicator color={isOutline ? theme.text : theme.primaryForeground} size="small" />
      ) : (
        <ThemedText
          type="smallBold"
          style={{ color: isOutline ? theme.text : theme.primaryForeground }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function AuthMessage({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'error';
}) {
  const theme = useTheme();

  return (
    <ThemedText
      type="small"
      style={[
        styles.message,
        {
          color: tone === 'error' ? theme.error : theme.textSecondary,
        },
      ]}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    fontSize: 16,
  },
  button: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.6,
  },
  message: {
    lineHeight: 20,
  },
});
