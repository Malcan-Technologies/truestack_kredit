/**
 * Inline edit screen for the identity fields TrueStack consumes (name + IC + document type).
 *
 * Scoped deliberately tight — the full borrower profile lives in `(tabs)/borrower-profile`. This
 * screen exists so the borrower can fix a name / IC mismatch discovered during e-KYC without
 * leaving the loan flow.
 */
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Field, OptionChipGroup } from '@/components/borrower-form-fields';
import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { borrowerClient } from '@/lib/api/borrower';
import { isIndividualIdentityLocked } from '@/lib/borrower-verification';
import { toast } from '@/lib/toast';
import type { BorrowerDetail } from '@kredit/borrower';

const DOCUMENT_OPTIONS = [
  { label: 'IC (MyKad)', value: 'IC' },
  { label: 'Passport', value: 'PASSPORT' },
] as const;

function normalizeIC(raw: string, documentType: string): string {
  if (documentType === 'PASSPORT') {
    return raw.trim();
  }
  const digits = raw.replace(/\D/g, '');
  return digits.slice(0, 12);
}

function validate(fields: {
  name: string;
  icNumber: string;
  documentType: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!fields.name.trim()) errors.name = 'Name is required';
  if (!fields.documentType) errors.documentType = 'Select a document type';
  if (!fields.icNumber.trim()) {
    errors.icNumber = 'ID number is required';
  } else if (fields.documentType === 'IC') {
    const clean = fields.icNumber.replace(/\D/g, '');
    if (!/^\d{12}$/.test(clean)) {
      errors.icNumber = 'IC must be 12 digits';
    }
  }
  return errors;
}

export default function EditIdentityScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ loanId?: string | string[] }>();
  const loanId = Array.isArray(params.loanId) ? params.loanId[0] : params.loanId;

  const [borrower, setBorrower] = useState<BorrowerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState('IC');
  const [icNumber, setIcNumber] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const res = await borrowerClient.fetchBorrower();
        if (cancelled) return;
        setBorrower(res.data);
        setName(res.data.name ?? '');
        setDocumentType(res.data.documentType ?? 'IC');
        setIcNumber(res.data.icNumber ?? '');
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Unable to load your profile.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const identityLocked =
    borrower?.borrowerType === 'INDIVIDUAL' && isIndividualIdentityLocked(borrower);
  const isCorporate = borrower?.borrowerType === 'CORPORATE';

  const clearError = useCallback((key: string) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    const nextErrors = validate({ name, icNumber, documentType });
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      await borrowerClient.updateBorrower({
        name: name.trim(),
        icNumber: normalizeIC(icNumber, documentType),
        documentType,
      });
      toast.success('Profile updated.');
      router.back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }, [name, icNumber, documentType, router]);

  if (loading) {
    return (
      <PageScreen
        title="Edit identity"
        showBackButton
        backFallbackHref={loanId ? (`/loans/${loanId}` as const) : '/loans'}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </PageScreen>
    );
  }

  if (loadError || !borrower) {
    return (
      <PageScreen
        title="Edit identity"
        showBackButton
        backFallbackHref={loanId ? (`/loans/${loanId}` as const) : '/loans'}>
        <View style={styles.centered}>
          <MaterialIcons name="error-outline" size={28} color={theme.error} />
          <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>
            {loadError ?? 'Could not load your profile.'}
          </ThemedText>
        </View>
      </PageScreen>
    );
  }

  if (isCorporate) {
    return (
      <PageScreen
        title="Edit identity"
        showBackButton
        backFallbackHref={loanId ? (`/loans/${loanId}` as const) : '/loans'}>
        <SectionCard title="Edit in your borrower profile">
          <ThemedText type="small" themeColor="textSecondary">
            Company and director details are managed in your borrower profile. Open the profile tab
            to update the company name, SSM number, or authorized representative.
          </ThemedText>
        </SectionCard>
      </PageScreen>
    );
  }

  const canSave = !identityLocked && !saving;

  return (
    <PageScreen
      title="Edit identity"
      showBackButton
      backFallbackHref={loanId ? (`/loans/${loanId}` as const) : '/loans'}
      stickyFooter={
        <Pressable
          accessibilityRole="button"
          onPress={() => void handleSave()}
          disabled={!canSave}
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: theme.primary,
              opacity: !canSave ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}>
          {saving ? (
            <ActivityIndicator color={theme.primaryForeground} />
          ) : (
            <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
              Save changes
            </ThemedText>
          )}
        </Pressable>
      }>
      <SectionCard
        title="Identity fields"
        description="Update your name, document type, and ID number. These are the fields TrueStack uses to verify your identity.">
        {identityLocked ? (
          <View
            style={[
              styles.lockNotice,
              { borderColor: theme.border, backgroundColor: theme.background },
            ]}>
            <MaterialIcons name="lock" size={16} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
              Your identity is already verified. These fields cannot be changed.
            </ThemedText>
          </View>
        ) : null}

        <Field
          label="Full name (as on ID)"
          value={name}
          onChangeText={(v) => {
            setName(v);
            clearError('name');
          }}
          placeholder="e.g. Nur Aisyah Binti Abdullah"
          autoCapitalize="words"
          error={errors.name}
          disabled={identityLocked}
        />

        <OptionChipGroup
          label="Document type"
          value={documentType}
          onChange={(v) => {
            setDocumentType(v);
            clearError('documentType');
            clearError('icNumber');
          }}
          options={DOCUMENT_OPTIONS}
          disabled={identityLocked}
          error={errors.documentType}
        />

        <Field
          label={documentType === 'PASSPORT' ? 'Passport number' : 'IC number'}
          value={icNumber}
          onChangeText={(v) => {
            setIcNumber(v);
            clearError('icNumber');
          }}
          placeholder={documentType === 'PASSPORT' ? 'A12345678' : '990101012345'}
          keyboardType={documentType === 'PASSPORT' ? 'default' : 'numeric'}
          autoCapitalize={documentType === 'PASSPORT' ? 'characters' : 'none'}
          error={errors.icNumber}
          helperText={
            documentType === 'IC'
              ? '12 digits, no dashes. We will format it for you.'
              : 'Include letters and numbers exactly as shown on your passport.'
          }
          disabled={identityLocked}
        />
      </SectionCard>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  lockNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
  },
});
