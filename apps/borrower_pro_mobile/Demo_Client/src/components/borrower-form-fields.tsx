import { MaterialIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Option = {
  label: string;
  value: string;
};

export type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'words' | 'characters' | 'sentences';
  multiline?: boolean;
  error?: string;
  helperText?: string;
  disabled?: boolean;
};

export type OptionChipGroupProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  error?: string;
  helperText?: string;
  disabled?: boolean;
};

export type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  searchable?: boolean;
  emptyText?: string;
};

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  multiline = false,
  error,
  helperText,
  disabled = false,
}: FieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.fieldWrap}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        editable={!disabled}
        style={[
          styles.input,
          {
            minHeight: multiline ? 92 : 48,
            borderColor: error ? theme.error : theme.border,
            backgroundColor: disabled ? theme.backgroundElement : theme.background,
            color: theme.text,
            textAlignVertical: multiline ? 'top' : 'center',
            opacity: disabled ? 0.7 : 1,
          },
        ]}
      />
      {error ? (
        <ThemedText type="small" style={{ color: theme.error }}>
          {error}
        </ThemedText>
      ) : helperText ? (
        <ThemedText type="small" themeColor="textSecondary">
          {helperText}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function ReadOnlyField({
  label,
  value,
  helperText,
  locked = false,
}: {
  label: string;
  value: string;
  helperText?: string;
  /** When true, shows a lock affordance and non-editable styling (e.g. verified identity). */
  locked?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.fieldWrap}>
      <View style={styles.readOnlyLabelRow}>
        {locked ? (
          <MaterialIcons name="lock-outline" size={16} color={theme.textSecondary} />
        ) : null}
        <ThemedText type="smallBold">{label}</ThemedText>
        {locked ? (
          <ThemedText type="small" themeColor="textSecondary">
            Read-only
          </ThemedText>
        ) : null}
      </View>
      <View
        style={[
          styles.staticField,
          locked && styles.staticFieldLocked,
          {
            borderColor: theme.border,
            backgroundColor: locked ? theme.backgroundElement : theme.background,
          },
        ]}>
        <ThemedText type="default" style={locked ? { opacity: 0.92 } : undefined}>
          {value || '—'}
        </ThemedText>
      </View>
      {helperText ? (
        <ThemedText type="small" themeColor="textSecondary">
          {helperText}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function OptionChipGroup({
  label,
  value,
  onChange,
  options,
  error,
  helperText,
  disabled = false,
}: OptionChipGroupProps) {
  const theme = useTheme();

  return (
    <View style={styles.fieldWrap}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <Pressable
              key={option.value}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: selected ? theme.primary : theme.border,
                  backgroundColor: selected ? theme.backgroundSelected : theme.background,
                  opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
                },
              ]}>
              <ThemedText
                type="smallBold"
                style={{ color: selected ? theme.primary : theme.text }}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <ThemedText type="small" style={{ color: theme.error }}>
          {error}
        </ThemedText>
      ) : helperText ? (
        <ThemedText type="small" themeColor="textSecondary">
          {helperText}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  error,
  helperText,
  disabled = false,
  searchable = false,
  emptyText = 'No options available.',
}: SelectFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedOption = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => {
      const haystack = `${option.label} ${option.value}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, options]);

  function handleClose() {
    setOpen(false);
    setQuery('');
  }

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    handleClose();
  }

  return (
    <View style={styles.fieldWrap}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.selectTrigger,
          {
            borderColor: error ? theme.error : theme.border,
            backgroundColor: disabled ? theme.backgroundElement : theme.background,
            opacity: disabled ? 0.6 : pressed ? 0.8 : 1,
          },
        ]}>
        <ThemedText
          type="default"
          style={{ color: selectedOption ? theme.text : theme.textSecondary, flex: 1 }}>
          {selectedOption?.label ?? placeholder}
        </ThemedText>
        <MaterialIcons name="arrow-drop-down" size={22} color={theme.textSecondary} />
      </Pressable>
      {error ? (
        <ThemedText type="small" style={{ color: theme.error }}>
          {error}
        </ThemedText>
      ) : helperText ? (
        <ThemedText type="small" themeColor="textSecondary">
          {helperText}
        </ThemedText>
      ) : null}

      <Modal transparent animationType="fade" visible={open} onRequestClose={handleClose}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
          <View
            style={[
              styles.selectModal,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}>
            <View style={styles.selectModalHeader}>
              <ThemedText type="smallBold">{label}</ThemedText>
              <Pressable onPress={handleClose}>
                <ThemedText type="small" themeColor="primary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            {searchable ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={theme.textSecondary}
                autoCorrect={false}
                autoCapitalize="none"
                style={[
                  styles.searchInput,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                    color: theme.text,
                  },
                ]}
              />
            ) : null}

            <ScrollView style={styles.selectList} contentContainerStyle={styles.selectListContent}>
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => {
                  const selected = option.value === value;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => handleSelect(option.value)}
                      style={({ pressed }) => [
                        styles.selectOption,
                        {
                          borderColor: selected ? theme.primary : theme.border,
                          backgroundColor: selected ? theme.backgroundSelected : theme.background,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}>
                      <ThemedText
                        type="default"
                        style={{ flex: 1, color: selected ? theme.primary : theme.text }}>
                        {option.label}
                      </ThemedText>
                      {selected ? (
                        <MaterialIcons name="check" size={18} color={theme.primary} />
                      ) : null}
                    </Pressable>
                  );
                })
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {emptyText}
                </ThemedText>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function FormSwitchRow({
  title,
  description,
  value,
  onValueChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.switchRow,
        {
          borderColor: theme.border,
          backgroundColor: theme.background,
        },
      ]}>
      <View style={styles.switchCopy}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: {
    gap: Spacing.one,
  },
  readOnlyLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  staticField: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    justifyContent: 'center',
  },
  staticFieldLocked: {
    borderStyle: 'dashed',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  selectTrigger: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  selectModal: {
    maxHeight: '75%',
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  selectModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  searchInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  selectList: {
    flexGrow: 0,
  },
  selectListContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  selectOption: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  switchRow: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  switchCopy: {
    flex: 1,
    gap: Spacing.one,
  },
});
