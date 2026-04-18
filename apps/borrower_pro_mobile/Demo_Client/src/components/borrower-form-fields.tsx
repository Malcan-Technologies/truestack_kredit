import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getCountries, getCountryCallingCode, parsePhoneNumber } from 'react-phone-number-input';
import en from 'react-phone-number-input/locale/en.json';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import type { Country } from 'react-phone-number-input';

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

export type DatePickerFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1919 }, (_, i) => CURRENT_YEAR - i);

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatDateDisplay(value: string) {
  try {
    const parts = value.split('-').map(Number);
    const [y, m, d] = parts;
    if (!y || !m || !d) return value;
    return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
  } catch {
    return value;
  }
}

export function DatePickerField({
  label,
  value,
  onChange,
  error,
  helperText,
  disabled = false,
}: DatePickerFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const defaultYear = CURRENT_YEAR - 30;
  const [pickerYear, setPickerYear] = useState(defaultYear);
  const [pickerMonth, setPickerMonth] = useState(1);
  const [pickerDay, setPickerDay] = useState(1);

  const daysInMonth = getDaysInMonth(pickerYear, pickerMonth);
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth],
  );

  useEffect(() => {
    if (pickerDay > daysInMonth) {
      setPickerDay(daysInMonth);
    }
  }, [pickerDay, daysInMonth]);

  function handleOpen() {
    if (value) {
      const [y, m, d] = value.split('-').map(Number);
      if (y) setPickerYear(y);
      if (m) setPickerMonth(m);
      if (d) setPickerDay(Math.min(d, getDaysInMonth(y || defaultYear, m || 1)));
    }
    setOpen(true);
  }

  function handleConfirm() {
    const clampedDay = Math.min(pickerDay, getDaysInMonth(pickerYear, pickerMonth));
    onChange(
      `${pickerYear}-${String(pickerMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`,
    );
    setOpen(false);
  }

  const displayValue = value ? formatDateDisplay(value) : '';

  return (
    <View style={styles.fieldWrap}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <Pressable
        disabled={disabled}
        onPress={handleOpen}
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
          style={{ color: displayValue ? theme.text : theme.textSecondary, flex: 1 }}>
          {displayValue || 'Select date'}
        </ThemedText>
        <MaterialIcons name="calendar-today" size={18} color={theme.textSecondary} />
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

      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} />
          <View
            style={[
              styles.selectModal,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <View style={styles.selectModalHeader}>
              <ThemedText type="smallBold">{label}</ThemedText>
              <Pressable onPress={() => setOpen(false)}>
                <ThemedText type="small" themeColor="primary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            <View style={styles.dateColumns}>
              <View style={styles.dateColumn}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.dateColLabel}>
                  Day
                </ThemedText>
                <ScrollView style={styles.dateScroll} showsVerticalScrollIndicator={false}>
                  {days.map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => setPickerDay(d)}
                      style={[
                        styles.dateItem,
                        pickerDay === d && { backgroundColor: theme.backgroundSelected, borderRadius: 10 },
                      ]}>
                      <ThemedText
                        type="default"
                        style={{
                          textAlign: 'center',
                          color: pickerDay === d ? theme.primary : theme.text,
                          fontWeight: pickerDay === d ? '600' : '400',
                        }}>
                        {String(d).padStart(2, '0')}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={[styles.dateColumn, { flex: 2 }]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.dateColLabel}>
                  Month
                </ThemedText>
                <ScrollView style={styles.dateScroll} showsVerticalScrollIndicator={false}>
                  {MONTHS.map((m, i) => (
                    <Pressable
                      key={i + 1}
                      onPress={() => setPickerMonth(i + 1)}
                      style={[
                        styles.dateItem,
                        pickerMonth === i + 1 && {
                          backgroundColor: theme.backgroundSelected,
                          borderRadius: 10,
                        },
                      ]}>
                      <ThemedText
                        type="default"
                        style={{
                          textAlign: 'center',
                          color: pickerMonth === i + 1 ? theme.primary : theme.text,
                          fontWeight: pickerMonth === i + 1 ? '600' : '400',
                        }}>
                        {m}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.dateColumn}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.dateColLabel}>
                  Year
                </ThemedText>
                <ScrollView style={styles.dateScroll} showsVerticalScrollIndicator={false}>
                  {YEARS.map((y) => (
                    <Pressable
                      key={y}
                      onPress={() => setPickerYear(y)}
                      style={[
                        styles.dateItem,
                        pickerYear === y && { backgroundColor: theme.backgroundSelected, borderRadius: 10 },
                      ]}>
                      <ThemedText
                        type="default"
                        style={{
                          textAlign: 'center',
                          color: pickerYear === y ? theme.primary : theme.text,
                          fontWeight: pickerYear === y ? '600' : '400',
                        }}>
                        {y}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            <Pressable
              onPress={handleConfirm}
              style={[styles.dateConfirmBtn, { backgroundColor: theme.primary }]}>
              <ThemedText type="smallBold" style={{ color: '#fff', textAlign: 'center' }}>
                Confirm
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
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

const PRIORITY_COUNTRIES: Country[] = ['MY', 'SG', 'ID', 'TH', 'BN', 'PH'];

function getFlagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function parseE164(value: string): { country: Country; nationalNumber: string } {
  try {
    const parsed = parsePhoneNumber(value);
    if (parsed?.country && parsed?.nationalNumber) {
      return { country: parsed.country, nationalNumber: parsed.nationalNumber };
    }
  } catch {}
  return { country: 'MY', nationalNumber: '' };
}

const allCountryOptions = (() => {
  const all = getCountries();
  const priority = PRIORITY_COUNTRIES.filter((c) => all.includes(c));
  const rest = all.filter((c) => !PRIORITY_COUNTRIES.includes(c));
  return [...priority, ...rest].map((code) => ({
    code,
    name: (en as Record<string, string>)[code] ?? code,
    callingCode: getCountryCallingCode(code),
    flag: getFlagEmoji(code),
  }));
})();

export function PhoneField({
  label,
  value,
  onChangeText,
  error,
  disabled = false,
}: Pick<FieldProps, 'label' | 'value' | 'onChangeText' | 'error' | 'disabled'>) {
  const theme = useTheme();

  const initialRef = useRef(value);
  const initialParsed = useMemo(() => parseE164(initialRef.current), []);
  const [country, setCountry] = useState<Country>(initialParsed.country);
  const [nationalNumber, setNationalNumber] = useState(initialParsed.nationalNumber);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  const prevValueRef = useRef(value);
  useEffect(() => {
    if (value !== prevValueRef.current && value !== undefined && value !== null) {
      prevValueRef.current = value;
      const parsed = parseE164(value);
      setCountry(parsed.country);
      setNationalNumber(parsed.nationalNumber);
    }
  }, [value]);

  const callingCode = getCountryCallingCode(country);

  const filteredOptions = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return allCountryOptions;
    return allCountryOptions.filter(
      (o) => o.name.toLowerCase().includes(q) || o.callingCode.includes(q),
    );
  }, [pickerQuery]);

  function handleNumberChange(text: string) {
    const digits = text.replace(/\D/g, '');
    setNationalNumber(text);
    onChangeText(digits ? `+${callingCode}${digits}` : '');
  }

  function handleCountrySelect(code: Country) {
    setCountry(code);
    setPickerOpen(false);
    setPickerQuery('');
    const newCallingCode = getCountryCallingCode(code);
    const digits = nationalNumber.replace(/\D/g, '');
    onChangeText(digits ? `+${newCallingCode}${digits}` : '');
  }

  return (
    <View style={styles.fieldWrap}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View
        style={[
          styles.phoneRow,
          {
            borderColor: error ? theme.error : theme.border,
            backgroundColor: disabled ? theme.backgroundElement : theme.background,
          },
        ]}>
        <Pressable
          disabled={disabled}
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [styles.countryBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <ThemedText type="default">
            {getFlagEmoji(country)} +{callingCode}
          </ThemedText>
          <MaterialIcons name="arrow-drop-down" size={18} color={theme.textSecondary} />
        </Pressable>
        <View style={[styles.phoneDivider, { backgroundColor: theme.border }]} />
        <TextInput
          value={nationalNumber}
          onChangeText={handleNumberChange}
          placeholder="16 2487680"
          placeholderTextColor={theme.textSecondary}
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
          style={[styles.phoneInput, { color: disabled ? theme.textSecondary : theme.text }]}
        />
      </View>
      {error ? (
        <ThemedText type="small" style={{ color: theme.error }}>
          {error}
        </ThemedText>
      ) : null}

      <Modal
        transparent
        animationType="fade"
        visible={pickerOpen}
        onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPickerOpen(false)} />
          <View
            style={[
              styles.selectModal,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <View style={styles.selectModalHeader}>
              <ThemedText type="smallBold">Country / Region</ThemedText>
              <Pressable onPress={() => { setPickerOpen(false); setPickerQuery(''); }}>
                <ThemedText type="small" themeColor="primary">
                  Close
                </ThemedText>
              </Pressable>
            </View>
            <TextInput
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder="Search"
              placeholderTextColor={theme.textSecondary}
              autoCorrect={false}
              autoCapitalize="none"
              style={[
                styles.searchInput,
                { borderColor: theme.border, backgroundColor: theme.background, color: theme.text },
              ]}
            />
            <ScrollView style={styles.selectList} contentContainerStyle={styles.selectListContent}>
              {filteredOptions.map((option) => {
                const selected = option.code === country;
                return (
                  <Pressable
                    key={option.code}
                    onPress={() => handleCountrySelect(option.code)}
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
                      {option.flag} {option.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      +{option.callingCode}
                    </ThemedText>
                    {selected ? (
                      <MaterialIcons name="check" size={18} color={theme.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
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
  dateColumns: {
    flexDirection: 'row',
    gap: Spacing.two,
    height: 220,
  },
  dateColumn: {
    flex: 1,
    gap: Spacing.one,
  },
  dateColLabel: {
    textAlign: 'center',
  },
  dateScroll: {
    flex: 1,
  },
  dateItem: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    minHeight: 40,
    justifyContent: 'center',
  },
  dateConfirmBtn: {
    borderRadius: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  switchCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  phoneRow: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: 2,
  },
  phoneDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: Spacing.two,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
