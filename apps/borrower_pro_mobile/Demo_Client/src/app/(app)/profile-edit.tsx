import { MaterialIcons } from '@expo/vector-icons';
import type { BorrowerDetail } from '@kredit/borrower';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import {
  DatePickerField,
  Field,
  FormSwitchRow,
  OptionChipGroup,
  PhoneField,
  ReadOnlyField,
  SelectField,
} from '@/components/borrower-form-fields';
import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import {
  SectionCompleteStatusRow,
  SectionOptionalStatusRow,
} from '@/components/verified-status-row';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { borrowerClient } from '@/lib/api/borrower';
import { getCountryOptions, getStateOptions } from '@/lib/address-options';
import { buildUpdateBorrowerPayload, borrowerToFormData } from '@/lib/borrower-form-data';
import {
  bankOptions,
  bumiStatusOptions,
  documentTypeOptions,
  educationOptions,
  employmentOptions,
  extractDateFromIC,
  extractGenderFromIC,
  genderOptions,
  isCorporateAdditionalDetailsComplete,
  isCorporateAddressSectionComplete,
  isCorporateBankSectionComplete,
  isCorporateCompanySectionComplete,
  isCorporateContactSectionComplete,
  isCorporateDirectorsSectionComplete,
  isCorporateSocialMediaComplete,
  isIndividualAddressSectionComplete,
  isIndividualBankSectionComplete,
  isIndividualContactSectionComplete,
  isIndividualEmergencyContactComplete,
  isIndividualPersonalSectionComplete,
  isIndividualSocialMediaComplete,
  relationshipOptions,
  raceOptions,
  type CorporateFormData,
  type IndividualFormData,
  type BorrowerType,
  validateCorporateForm,
  validateIndividualForm,
} from '@/lib/onboarding';
import { isIndividualIdentityLocked } from '@/lib/borrower-verification';
import { useBorrowerAccess } from '@/lib/borrower-access';
import {
  formatICForDisplay,
  formatOptionLabel,
  getBorrowerDisplayName,
} from '@/lib/format/borrower';
import { formatDate } from '@/lib/format/date';
import { useRouter } from 'expo-router';

type ButtonVariant = 'primary' | 'outline';

function ActionButton({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const palette =
    variant === 'outline'
      ? {
          backgroundColor: theme.background,
          borderColor: theme.border,
          textColor: theme.text,
        }
      : {
          backgroundColor: theme.primary,
          borderColor: theme.primary,
          textColor: theme.primaryForeground,
        };

  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      onPress={() => void onPress()}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          opacity: pressed || loading ? 0.75 : disabled ? 0.45 : 1,
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.textColor} size="small" />
      ) : (
        <ThemedText type="smallBold" style={{ color: palette.textColor }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

function zeroLike(value: string) {
  const normalized = value.trim();
  return normalized === '0' || normalized === '0.0' || normalized === '0.00';
}

export default function ProfileEditScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { activeBorrowerId, borrowerContextVersion, refreshBorrowerProfiles } = useBorrowerAccess();
  const [borrower, setBorrower] = useState<BorrowerDetail | null>(null);
  const [borrowerType, setBorrowerType] = useState<BorrowerType>('INDIVIDUAL');
  const [individualFormData, setIndividualFormData] = useState<IndividualFormData | null>(null);
  const [corporateFormData, setCorporateFormData] = useState<CorporateFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [noMonthlyIncome, setNoMonthlyIncome] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const countryOptions = useMemo(() => getCountryOptions(), []);
  const individualStateOptions = useMemo(
    () => getStateOptions(individualFormData?.country ?? ''),
    [individualFormData?.country],
  );
  const corporateStateOptions = useMemo(
    () => getStateOptions(corporateFormData?.country ?? ''),
    [corporateFormData?.country],
  );
  const identityLocked = borrower ? isIndividualIdentityLocked(borrower) : false;
  const profileReady =
    !loading && borrower !== null && individualFormData !== null && corporateFormData !== null;
  const isIndividual = borrowerType === 'INDIVIDUAL';
  const isIndividualIC = individualFormData?.documentType === 'IC';
  const derivedDateOfBirth =
    isIndividualIC && individualFormData ? extractDateFromIC(individualFormData.icNumber) : null;
  const derivedGender =
    isIndividualIC && individualFormData ? extractGenderFromIC(individualFormData.icNumber) : null;
  const dateOfBirthValue =
    individualFormData?.dateOfBirth ||
    (isIndividualIC && derivedDateOfBirth ? derivedDateOfBirth : '') ||
    '';
  const genderValue =
    individualFormData?.gender || (isIndividualIC && derivedGender ? derivedGender : '') || '';

  const individualCompletion = individualFormData
    ? {
        personal: isIndividualPersonalSectionComplete(individualFormData, noMonthlyIncome),
        contact: isIndividualContactSectionComplete(individualFormData),
        address: isIndividualAddressSectionComplete(individualFormData),
        bank: isIndividualBankSectionComplete(individualFormData),
        emergency: isIndividualEmergencyContactComplete(individualFormData),
        social: isIndividualSocialMediaComplete(individualFormData),
      }
    : {
        personal: false,
        contact: false,
        address: false,
        bank: false,
        emergency: false,
        social: false,
      };
  const corporateCompletion = corporateFormData
    ? {
        company: isCorporateCompanySectionComplete(corporateFormData),
        address: isCorporateAddressSectionComplete(corporateFormData),
        contact: isCorporateContactSectionComplete(corporateFormData),
        directors: isCorporateDirectorsSectionComplete(corporateFormData),
        bank: isCorporateBankSectionComplete(corporateFormData),
        additional: isCorporateAdditionalDetailsComplete(corporateFormData),
        social: isCorporateSocialMediaComplete(corporateFormData),
      }
    : {
        company: false,
        address: false,
        contact: false,
        directors: false,
        bank: false,
        additional: false,
        social: false,
      };

  const loadBorrower = useCallback(async () => {
    setLoading(true);
    try {
      const response = await borrowerClient.fetchBorrower();
      const nextBorrower = response.data;
      const nextFormState = borrowerToFormData(nextBorrower);
      setBorrower(nextBorrower);
      setBorrowerType(nextFormState.borrowerType);
      setIndividualFormData(nextFormState.individualFormData);
      setCorporateFormData(nextFormState.corporateFormData);
      setNoMonthlyIncome(
        nextFormState.borrowerType === 'INDIVIDUAL' &&
          zeroLike(nextFormState.individualFormData.monthlyIncome),
      );
      setValidationErrors({});
    } catch (error) {
      Alert.alert(
        'Unable to load profile',
        error instanceof Error ? error.message : 'Please try again.',
      );
      router.replace('/borrower-profile');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadBorrower();
  }, [loadBorrower, activeBorrowerId, borrowerContextVersion]);

  function clearError(key: string) {
    setValidationErrors((current) => {
      if (!current[key]) {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function handleSave() {
    if (!individualFormData || !corporateFormData) {
      return;
    }

    const errors = isIndividual
      ? validateIndividualForm(individualFormData, noMonthlyIncome)
      : validateCorporateForm(corporateFormData);

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      Alert.alert('Missing required fields', 'Please complete the required fields before saving.');
      return;
    }

    setSaving(true);
    try {
      await borrowerClient.updateBorrower(
        buildUpdateBorrowerPayload({
          borrowerType,
          individualFormData,
          corporateFormData,
          noMonthlyIncome,
          identityLocked,
        }),
      );
      await refreshBorrowerProfiles();
      router.replace('/borrower-profile');
    } catch (error) {
      Alert.alert(
        'Unable to save profile',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  function updateCorporateDirector(
    index: number,
    updates: Partial<CorporateFormData['directors'][number]>,
  ) {
    setCorporateFormData((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        directors: current.directors.map((director, currentIndex) => {
          if (currentIndex !== index) {
            if (
              Object.prototype.hasOwnProperty.call(updates, 'isAuthorizedRepresentative') &&
              updates.isAuthorizedRepresentative
            ) {
              return { ...director, isAuthorizedRepresentative: false };
            }

            return director;
          }

          return {
            ...director,
            ...updates,
          };
        }),
      };
    });
  }

  function addDirector() {
    setCorporateFormData((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        directors: [
          ...current.directors,
          {
            id: undefined,
            name: '',
            icNumber: '',
            position: '',
            isAuthorizedRepresentative: current.directors.length === 0,
          },
        ],
      };
    });
  }

  function removeDirector(index: number) {
    setCorporateFormData((current) => {
      if (!current || current.directors.length <= 1) {
        return current;
      }

      const nextDirectors = current.directors.filter((_, currentIndex) => currentIndex !== index);
      if (!nextDirectors.some((director) => director.isAuthorizedRepresentative)) {
        nextDirectors[0] = {
          ...nextDirectors[0],
          isAuthorizedRepresentative: true,
        };
      }

      return {
        ...current,
        directors: nextDirectors,
      };
    });
  }

  return (
    <PageScreen
      title="Edit profile"
      subtitle="Review and update your profile."
      showBackButton
      backFallbackHref="/borrower-profile"
      stickyFooter={
        <View style={styles.footerRow}>
          <ActionButton
            label="Save changes"
            loading={saving}
            disabled={!profileReady}
            onPress={handleSave}
          />
        </View>
      }>
      {!profileReady ? (
        <SectionCard title="Loading profile">
          <View style={styles.centeredState}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              Preparing the edit form...
            </ThemedText>
          </View>
        </SectionCard>
      ) : (
        <>
      <SectionCard
        title={getBorrowerDisplayName(borrower)}
        description="Review your changes carefully before saving.">
        {Object.keys(validationErrors).length > 0 ? (
          <View
            style={[
              styles.errorBanner,
              {
                borderColor: theme.error,
                backgroundColor: theme.background,
              },
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.error }}>
              Please complete the required fields before saving.
            </ThemedText>
          </View>
        ) : null}
      </SectionCard>

      {isIndividual ? (
        <>
          <SectionCard
            title="Personal information"
            description={
              identityLocked
                ? 'Your identity has been verified by e-KYC. Your name, IC, date of birth and gender are locked. Contact support if any of these need updating.'
                : undefined
            }
            action={<SectionCompleteStatusRow complete={individualCompletion.personal} />}>
            {identityLocked ? (
              <>
                <ReadOnlyField locked label="Full name" value={individualFormData.name} />
                <ReadOnlyField
                  locked
                  label="Document type"
                  value={formatOptionLabel('documentType', individualFormData.documentType)}
                />
                <ReadOnlyField
                  locked
                  label="IC / Passport number"
                  value={
                    individualFormData.documentType === 'IC'
                      ? formatICForDisplay(individualFormData.icNumber)
                      : individualFormData.icNumber
                  }
                />
                <ReadOnlyField
                  locked
                  label="Date of birth"
                  value={individualFormData.dateOfBirth ? formatDate(individualFormData.dateOfBirth) : '—'}
                />
                <ReadOnlyField
                  locked
                  label="Gender"
                  value={formatOptionLabel('gender', individualFormData.gender)}
                />
              </>
            ) : (
              <>
                <OptionChipGroup
                  label="Document type"
                  value={individualFormData.documentType}
                  onChange={(value) => {
                    clearError('documentType');
                    if (value === 'PASSPORT') {
                      setIndividualFormData((current) =>
                        current
                          ? {
                              ...current,
                              documentType: value,
                              dateOfBirth: '',
                              gender: '',
                            }
                          : current,
                      );
                      return;
                    }

                    const nextDate = extractDateFromIC(individualFormData.icNumber);
                    const nextGender = extractGenderFromIC(individualFormData.icNumber);
                    if (nextDate) clearError('dateOfBirth');
                    if (nextGender) clearError('gender');
                    setIndividualFormData((current) =>
                      current
                        ? {
                            ...current,
                            documentType: value,
                            dateOfBirth: nextDate || '',
                            gender: nextGender || '',
                          }
                        : current,
                    );
                  }}
                  options={documentTypeOptions}
                  error={validationErrors.documentType}
                />
                <Field
                  label="Full name"
                  value={individualFormData.name}
                  onChangeText={(value) => {
                    clearError('name');
                    setIndividualFormData((current) =>
                      current ? { ...current, name: value } : current,
                    );
                  }}
                  placeholder="As per your document"
                  autoCapitalize="words"
                  error={validationErrors.name}
                />
                <Field
                  label="IC / Passport number"
                  value={individualFormData.icNumber}
                  onChangeText={(value) => {
                    const cleanValue =
                      individualFormData.documentType === 'IC'
                        ? value.replace(/\D/g, '').substring(0, 12)
                        : value;
                    const nextDate =
                      individualFormData.documentType === 'IC'
                        ? extractDateFromIC(cleanValue)
                        : null;
                    const nextGender =
                      individualFormData.documentType === 'IC'
                        ? extractGenderFromIC(cleanValue)
                        : null;
                    clearError('icNumber');
                    if (nextDate) clearError('dateOfBirth');
                    if (nextGender) clearError('gender');
                    setIndividualFormData((current) =>
                      current
                        ? {
                            ...current,
                            icNumber: cleanValue,
                            ...(current.documentType === 'IC'
                              ? { dateOfBirth: nextDate || '', gender: nextGender || '' }
                              : {}),
                          }
                        : current,
                    );
                  }}
                  placeholder="12 digits for IC"
                  autoCapitalize="characters"
                  error={validationErrors.icNumber}
                  helperText={
                    individualFormData.documentType === 'IC'
                      ? 'Enter a complete 12-digit IC number. Date of birth and gender are auto-extracted.'
                      : undefined
                  }
                />
                {isIndividualIC ? (
                  <>
                    <ReadOnlyField
                      autoFilled
                      label="Date of birth"
                      value={dateOfBirthValue ? formatDate(dateOfBirthValue) : ''}
                      placeholder="Enter your IC number to auto-fill"
                      helperText="Derived from your IC number."
                    />
                    <ReadOnlyField
                      autoFilled
                      label="Gender"
                      value={
                        genderValue
                          ? formatOptionLabel('gender', genderValue)
                          : ''
                      }
                      placeholder="Enter your IC number to auto-fill"
                      helperText="Derived from your IC number."
                    />
                  </>
                ) : (
                  <>
                    <DatePickerField
                      label="Date of birth"
                      value={dateOfBirthValue}
                      onChange={(value) => {
                        clearError('dateOfBirth');
                        setIndividualFormData((current) =>
                          current ? { ...current, dateOfBirth: value } : current,
                        );
                      }}
                      error={validationErrors.dateOfBirth}
                    />
                    <OptionChipGroup
                      label="Gender"
                      value={genderValue}
                      onChange={(value) => {
                        clearError('gender');
                        setIndividualFormData((current) =>
                          current ? { ...current, gender: value } : current,
                        );
                      }}
                      options={genderOptions}
                      error={validationErrors.gender}
                    />
                  </>
                )}
              </>
            )}
            <SelectField
              label="Race"
              value={individualFormData.race}
              onChange={(value) => {
                clearError('race');
                setIndividualFormData((current) =>
                  current ? { ...current, race: value } : current,
                );
              }}
              options={raceOptions}
              placeholder="Select race"
              error={validationErrors.race}
            />
            <SelectField
              label="Education level"
              value={individualFormData.educationLevel}
              onChange={(value) => {
                clearError('educationLevel');
                setIndividualFormData((current) =>
                  current ? { ...current, educationLevel: value } : current,
                );
              }}
              options={educationOptions}
              placeholder="Select education level"
              error={validationErrors.educationLevel}
            />
            <Field
              label="Occupation"
              value={individualFormData.occupation}
              onChangeText={(value) => {
                clearError('occupation');
                setIndividualFormData((current) =>
                  current ? { ...current, occupation: value } : current,
                );
              }}
              placeholder="Your job or role"
              autoCapitalize="words"
              error={validationErrors.occupation}
            />
            <SelectField
              label="Employment status"
              value={individualFormData.employmentStatus}
              onChange={(value) => {
                clearError('employmentStatus');
                setIndividualFormData((current) =>
                  current ? { ...current, employmentStatus: value } : current,
                );
              }}
              options={employmentOptions}
              placeholder="Select employment status"
              error={validationErrors.employmentStatus}
            />
            <FormSwitchRow
              title="No monthly income"
              description="Toggle this if you do not currently earn a monthly income."
              value={noMonthlyIncome}
              onValueChange={(value) => {
                clearError('monthlyIncome');
                setNoMonthlyIncome(value);
              }}
            />
            {!noMonthlyIncome ? (
              <Field
                label="Monthly income"
                value={individualFormData.monthlyIncome}
                onChangeText={(value) => {
                  clearError('monthlyIncome');
                  setIndividualFormData((current) =>
                    current ? { ...current, monthlyIncome: value } : current,
                  );
                }}
                placeholder="0.00"
                keyboardType="numeric"
                autoCapitalize="none"
                error={validationErrors.monthlyIncome}
              />
            ) : null}
          </SectionCard>

          <SectionCard
            title="Contact information"
            action={<SectionCompleteStatusRow complete={individualCompletion.contact} />}>
            <PhoneField
              label="Phone number"
              value={individualFormData.phone}
              onChangeText={(value) => {
                clearError('phone');
                setIndividualFormData((current) =>
                  current ? { ...current, phone: value } : current,
                );
              }}
              error={validationErrors.phone}
            />
            <Field
              label="Email"
              value={individualFormData.email}
              onChangeText={(value) => {
                clearError('email');
                setIndividualFormData((current) =>
                  current ? { ...current, email: value } : current,
                );
              }}
              placeholder="name@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={validationErrors.email}
            />
          </SectionCard>

          <SectionCard
            title="Address"
            action={<SectionCompleteStatusRow complete={individualCompletion.address} />}>
            <Field
              label="Address line 1"
              value={individualFormData.addressLine1}
              onChangeText={(value) => {
                clearError('addressLine1');
                setIndividualFormData((current) =>
                  current ? { ...current, addressLine1: value } : current,
                );
              }}
              placeholder="House / street"
              error={validationErrors.addressLine1}
            />
            <Field
              label="Address line 2"
              value={individualFormData.addressLine2}
              onChangeText={(value) =>
                setIndividualFormData((current) =>
                  current ? { ...current, addressLine2: value } : current,
                )
              }
              placeholder="Apartment / unit"
            />
            <Field
              label="City"
              value={individualFormData.city}
              onChangeText={(value) => {
                clearError('city');
                setIndividualFormData((current) =>
                  current ? { ...current, city: value } : current,
                );
              }}
              placeholder="City"
              error={validationErrors.city}
            />
            <SelectField
              label="State"
              value={individualFormData.state}
              onChange={(value) => {
                clearError('state');
                setIndividualFormData((current) =>
                  current ? { ...current, state: value } : current,
                );
              }}
              options={individualStateOptions}
              placeholder="Select state"
              error={validationErrors.state}
              disabled={!individualFormData.country || individualStateOptions.length === 0}
              searchable
              helperText={
                !individualFormData.country || individualStateOptions.length === 0
                  ? 'Select a country first.'
                  : undefined
              }
            />
            <Field
              label="Postcode"
              value={individualFormData.postcode}
              onChangeText={(value) => {
                clearError('postcode');
                setIndividualFormData((current) =>
                  current ? { ...current, postcode: value } : current,
                );
              }}
              placeholder="Postcode"
              keyboardType="numeric"
              autoCapitalize="none"
              error={validationErrors.postcode}
            />
            <SelectField
              label="Country"
              value={individualFormData.country}
              onChange={(value) => {
                const nextStateOptions = getStateOptions(value);
                clearError('country');
                clearError('state');
                setIndividualFormData((current) =>
                  current
                    ? {
                        ...current,
                        country: value,
                        state: nextStateOptions.some((option) => option.value === current.state)
                          ? current.state
                          : '',
                      }
                    : current,
                );
              }}
              options={countryOptions}
              placeholder="Select country"
              error={validationErrors.country}
              searchable
            />
          </SectionCard>

          <SectionCard
            title="Emergency contact"
            action={<SectionOptionalStatusRow complete={individualCompletion.emergency} />}>
            <Field
              label="Emergency contact name"
              value={individualFormData.emergencyContactName}
              onChangeText={(value) =>
                setIndividualFormData((current) =>
                  current ? { ...current, emergencyContactName: value } : current,
                )
              }
              placeholder="Optional"
              autoCapitalize="words"
            />
            <PhoneField
              label="Emergency contact phone"
              value={individualFormData.emergencyContactPhone}
              onChangeText={(value) =>
                setIndividualFormData((current) =>
                  current ? { ...current, emergencyContactPhone: value } : current,
                )
              }
            />
            <OptionChipGroup
              label="Relationship"
              value={individualFormData.emergencyContactRelationship}
              onChange={(value) =>
                setIndividualFormData((current) =>
                  current ? { ...current, emergencyContactRelationship: value } : current,
                )
              }
              options={relationshipOptions}
            />
          </SectionCard>

          <SectionCard
            title="Bank information"
            action={<SectionCompleteStatusRow complete={individualCompletion.bank} />}>
            <SelectField
              label="Bank"
              value={individualFormData.bankName}
              onChange={(value) => {
                clearError('bankName');
                setIndividualFormData((current) =>
                  current ? { ...current, bankName: value } : current,
                );
              }}
              options={bankOptions}
              placeholder="Select bank"
              error={validationErrors.bankName}
              searchable
            />
            {individualFormData.bankName === 'OTHER' ? (
              <Field
                label="Bank name"
                value={individualFormData.bankNameOther}
                onChangeText={(value) => {
                  clearError('bankNameOther');
                  setIndividualFormData((current) =>
                    current ? { ...current, bankNameOther: value } : current,
                  );
                }}
                placeholder="Enter bank name"
                error={validationErrors.bankNameOther}
              />
            ) : null}
            <Field
              label="Bank account number"
              value={individualFormData.bankAccountNo}
              onChangeText={(value) => {
                clearError('bankAccountNo');
                setIndividualFormData((current) =>
                  current ? { ...current, bankAccountNo: value } : current,
                );
              }}
              placeholder="Digits only"
              keyboardType="numeric"
              autoCapitalize="none"
              error={validationErrors.bankAccountNo}
            />
          </SectionCard>

          <SectionCard
            title="Social media"
            action={<SectionOptionalStatusRow complete={individualCompletion.social} />}>
            <Field
              label="Instagram"
              value={individualFormData.instagram}
              onChangeText={(value) =>
                setIndividualFormData((current) =>
                  current ? { ...current, instagram: value } : current,
                )
              }
              placeholder="@handle"
              autoCapitalize="none"
            />
            <Field
              label="TikTok"
              value={individualFormData.tiktok}
              onChangeText={(value) =>
                setIndividualFormData((current) =>
                  current ? { ...current, tiktok: value } : current,
                )
              }
              placeholder="@handle"
              autoCapitalize="none"
            />
            <Field
              label="Facebook"
              value={individualFormData.facebook}
              onChangeText={(value) =>
                setIndividualFormData((current) =>
                  current ? { ...current, facebook: value } : current,
                )
              }
              placeholder="Profile URL or handle"
              autoCapitalize="none"
            />
            <Field
              label="LinkedIn"
              value={individualFormData.linkedin}
              onChangeText={(value) =>
                setIndividualFormData((current) =>
                  current ? { ...current, linkedin: value } : current,
                )
              }
              placeholder="Profile URL"
              autoCapitalize="none"
            />
            <Field
              label="X (Twitter)"
              value={individualFormData.xTwitter}
              onChangeText={(value) =>
                setIndividualFormData((current) =>
                  current ? { ...current, xTwitter: value } : current,
                )
              }
              placeholder="@handle"
              autoCapitalize="none"
            />
          </SectionCard>
        </>
      ) : (
        <>
          <SectionCard
            title="Company information"
            action={<SectionCompleteStatusRow complete={corporateCompletion.company} />}>
            <Field
              label="Company name"
              value={corporateFormData.companyName}
              onChangeText={(value) => {
                clearError('companyName');
                setCorporateFormData((current) =>
                  current ? { ...current, companyName: value } : current,
                );
              }}
              placeholder="Registered company name"
              autoCapitalize="words"
              error={validationErrors.companyName}
            />
            <Field
              label="SSM registration number"
              value={corporateFormData.ssmRegistrationNo}
              onChangeText={(value) => {
                clearError('ssmRegistrationNo');
                setCorporateFormData((current) =>
                  current ? { ...current, ssmRegistrationNo: value } : current,
                );
              }}
              placeholder="Company registration number"
              autoCapitalize="characters"
              error={validationErrors.ssmRegistrationNo}
            />
            <OptionChipGroup
              label="Taraf (Bumi status)"
              value={corporateFormData.bumiStatus}
              onChange={(value) => {
                clearError('bumiStatus');
                setCorporateFormData((current) =>
                  current ? { ...current, bumiStatus: value } : current,
                );
              }}
              options={bumiStatusOptions}
              error={validationErrors.bumiStatus}
            />
            <Field
              label="Nature of business"
              value={corporateFormData.natureOfBusiness}
              onChangeText={(value) =>
                setCorporateFormData((current) =>
                  current ? { ...current, natureOfBusiness: value } : current,
                )
              }
              placeholder="Optional"
              autoCapitalize="words"
            />
            <DatePickerField
              label="Date of incorporation"
              value={corporateFormData.dateOfIncorporation}
              onChange={(value) =>
                setCorporateFormData((current) =>
                  current ? { ...current, dateOfIncorporation: value } : current,
                )
              }
            />
          </SectionCard>

          <SectionCard
            title="Business address"
            action={<SectionCompleteStatusRow complete={corporateCompletion.address} />}>
            <Field
              label="Address line 1"
              value={corporateFormData.addressLine1}
              onChangeText={(value) => {
                clearError('addressLine1');
                setCorporateFormData((current) =>
                  current ? { ...current, addressLine1: value } : current,
                );
              }}
              placeholder="Registered address"
              error={validationErrors.addressLine1}
            />
            <Field
              label="Address line 2"
              value={corporateFormData.addressLine2}
              onChangeText={(value) =>
                setCorporateFormData((current) =>
                  current ? { ...current, addressLine2: value } : current,
                )
              }
              placeholder="Optional"
            />
            <Field
              label="City"
              value={corporateFormData.city}
              onChangeText={(value) => {
                clearError('city');
                setCorporateFormData((current) =>
                  current ? { ...current, city: value } : current,
                );
              }}
              placeholder="City"
              error={validationErrors.city}
            />
            <SelectField
              label="State"
              value={corporateFormData.state}
              onChange={(value) => {
                clearError('state');
                setCorporateFormData((current) =>
                  current ? { ...current, state: value } : current,
                );
              }}
              options={corporateStateOptions}
              placeholder="Select state"
              error={validationErrors.state}
              disabled={!corporateFormData.country || corporateStateOptions.length === 0}
              searchable
              helperText={
                !corporateFormData.country || corporateStateOptions.length === 0
                  ? 'Select a country first.'
                  : undefined
              }
            />
            <Field
              label="Postcode"
              value={corporateFormData.postcode}
              onChangeText={(value) => {
                clearError('postcode');
                setCorporateFormData((current) =>
                  current ? { ...current, postcode: value } : current,
                );
              }}
              placeholder="Postcode"
              keyboardType="numeric"
              autoCapitalize="none"
              error={validationErrors.postcode}
            />
            <SelectField
              label="Country"
              value={corporateFormData.country}
              onChange={(value) => {
                const nextStateOptions = getStateOptions(value);
                clearError('country');
                clearError('state');
                setCorporateFormData((current) =>
                  current
                    ? {
                        ...current,
                        country: value,
                        state: nextStateOptions.some((option) => option.value === current.state)
                          ? current.state
                          : '',
                      }
                    : current,
                );
              }}
              options={countryOptions}
              placeholder="Select country"
              error={validationErrors.country}
              searchable
            />
          </SectionCard>

          <SectionCard
            title="Company contact"
            action={<SectionCompleteStatusRow complete={corporateCompletion.contact} />}>
            <PhoneField
              label="Company phone"
              value={corporateFormData.companyPhone}
              onChangeText={(value) => {
                clearError('companyPhone');
                setCorporateFormData((current) =>
                  current ? { ...current, companyPhone: value } : current,
                );
              }}
              error={validationErrors.companyPhone}
            />
            <Field
              label="Company email"
              value={corporateFormData.companyEmail}
              onChangeText={(value) => {
                clearError('companyEmail');
                setCorporateFormData((current) =>
                  current ? { ...current, companyEmail: value } : current,
                );
              }}
              placeholder="company@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={validationErrors.companyEmail}
            />
          </SectionCard>

          <SectionCard
            title="Additional details"
            action={<SectionOptionalStatusRow complete={corporateCompletion.additional} />}>
            <Field
              label="Paid-up capital"
              value={corporateFormData.paidUpCapital}
              onChangeText={(value) =>
                setCorporateFormData((current) =>
                  current ? { ...current, paidUpCapital: value } : current,
                )
              }
              placeholder="0.00"
              keyboardType="numeric"
              autoCapitalize="none"
            />
            <Field
              label="Number of employees"
              value={corporateFormData.numberOfEmployees}
              onChangeText={(value) =>
                setCorporateFormData((current) =>
                  current ? { ...current, numberOfEmployees: value } : current,
                )
              }
              placeholder="Optional"
              keyboardType="numeric"
              autoCapitalize="none"
            />
          </SectionCard>

          <SectionCard
            title="Company directors"
            description="Choose one authorized representative for e-KYC."
            action={<SectionCompleteStatusRow complete={corporateCompletion.directors} />}>
            {validationErrors.authorizedRepresentative ? (
              <ThemedText type="small" style={{ color: theme.error }}>
                {validationErrors.authorizedRepresentative}
              </ThemedText>
            ) : null}
            {corporateFormData.directors.map((director, index) => (
              <View
                key={director.id ?? `director-${index}`}
                style={[
                  styles.directorCard,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}>
                <View style={styles.directorHeader}>
                  <ThemedText type="smallBold">{`Director ${index + 1}`}</ThemedText>
                  <View style={styles.directorActions}>
                    <Pressable
                      onPress={() =>
                        updateCorporateDirector(index, {
                          isAuthorizedRepresentative: true,
                        })
                      }
                      style={({ pressed }) => [
                        styles.repPill,
                        {
                          borderColor: director.isAuthorizedRepresentative ? theme.primary : theme.border,
                          backgroundColor: director.isAuthorizedRepresentative
                            ? theme.backgroundSelected
                            : theme.backgroundElement,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={{
                          color: director.isAuthorizedRepresentative ? theme.primary : theme.text,
                        }}>
                        {director.isAuthorizedRepresentative ? 'Authorized rep' : 'Set as rep'}
                      </ThemedText>
                    </Pressable>
                    {corporateFormData.directors.length > 1 ? (
                      <Pressable onPress={() => removeDirector(index)}>
                        <ThemedText type="smallBold" style={{ color: theme.error }}>
                          Remove
                        </ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <Field
                  label="Director name"
                  value={director.name}
                  onChangeText={(value) => {
                    clearError(`directorName_${index}`);
                    updateCorporateDirector(index, { name: value });
                  }}
                  placeholder="As per IC"
                  autoCapitalize="words"
                  error={validationErrors[`directorName_${index}`]}
                />
                <Field
                  label="Director IC"
                  value={director.icNumber}
                  onChangeText={(value) => {
                    clearError(`directorIc_${index}`);
                    updateCorporateDirector(index, {
                      icNumber: value.replace(/\D/g, '').substring(0, 12),
                    });
                  }}
                  placeholder="12 digits"
                  autoCapitalize="none"
                  keyboardType="numeric"
                  error={validationErrors[`directorIc_${index}`]}
                />
                <Field
                  label="Position"
                  value={director.position}
                  onChangeText={(value) => updateCorporateDirector(index, { position: value })}
                  placeholder="Director / Manager / Founder"
                  autoCapitalize="words"
                />
              </View>
            ))}
            {corporateFormData.directors.length < 10 ? (
              <Pressable
                accessibilityRole="button"
                onPress={addDirector}
                style={({ pressed }) => [
                  styles.addDirectorButton,
                  { borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
                ]}>
                <MaterialIcons name="add" size={18} color={theme.primary} />
                <ThemedText type="small" style={{ color: theme.primary }}>
                  Add director
                </ThemedText>
              </Pressable>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Bank information"
            action={<SectionCompleteStatusRow complete={corporateCompletion.bank} />}>
            <SelectField
              label="Bank"
              value={corporateFormData.bankName}
              onChange={(value) => {
                clearError('bankName');
                setCorporateFormData((current) =>
                  current ? { ...current, bankName: value } : current,
                );
              }}
              options={bankOptions}
              placeholder="Select bank"
              error={validationErrors.bankName}
              searchable
            />
            {corporateFormData.bankName === 'OTHER' ? (
              <Field
                label="Bank name"
                value={corporateFormData.bankNameOther}
                onChangeText={(value) => {
                  clearError('bankNameOther');
                  setCorporateFormData((current) =>
                    current ? { ...current, bankNameOther: value } : current,
                  );
                }}
                placeholder="Enter bank name"
                error={validationErrors.bankNameOther}
              />
            ) : null}
            <Field
              label="Bank account number"
              value={corporateFormData.bankAccountNo}
              onChangeText={(value) => {
                clearError('bankAccountNo');
                setCorporateFormData((current) =>
                  current ? { ...current, bankAccountNo: value } : current,
                );
              }}
              placeholder="Digits only"
              keyboardType="numeric"
              autoCapitalize="none"
              error={validationErrors.bankAccountNo}
            />
          </SectionCard>

          <SectionCard
            title="Social media"
            action={<SectionOptionalStatusRow complete={corporateCompletion.social} />}>
            <Field
              label="Instagram"
              value={corporateFormData.instagram}
              onChangeText={(value) =>
                setCorporateFormData((current) =>
                  current ? { ...current, instagram: value } : current,
                )
              }
              placeholder="@handle"
              autoCapitalize="none"
            />
            <Field
              label="TikTok"
              value={corporateFormData.tiktok}
              onChangeText={(value) =>
                setCorporateFormData((current) =>
                  current ? { ...current, tiktok: value } : current,
                )
              }
              placeholder="@handle"
              autoCapitalize="none"
            />
            <Field
              label="Facebook"
              value={corporateFormData.facebook}
              onChangeText={(value) =>
                setCorporateFormData((current) =>
                  current ? { ...current, facebook: value } : current,
                )
              }
              placeholder="Profile URL or handle"
              autoCapitalize="none"
            />
            <Field
              label="LinkedIn"
              value={corporateFormData.linkedin}
              onChangeText={(value) =>
                setCorporateFormData((current) =>
                  current ? { ...current, linkedin: value } : current,
                )
              }
              placeholder="Profile URL"
              autoCapitalize="none"
            />
            <Field
              label="X (Twitter)"
              value={corporateFormData.xTwitter}
              onChangeText={(value) =>
                setCorporateFormData((current) =>
                  current ? { ...current, xTwitter: value } : current,
                )
              }
              placeholder="@handle"
              autoCapitalize="none"
            />
          </SectionCard>
        </>
      )}
        </>
      )}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  centeredState: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actionButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.three,
  },
  directorCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  directorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  directorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  repPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  addDirectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
  },
  footerRow: {
    gap: Spacing.two,
  },
});
