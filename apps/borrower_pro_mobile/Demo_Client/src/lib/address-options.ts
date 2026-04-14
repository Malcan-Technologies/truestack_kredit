import { Country, State } from 'country-state-city';

export type AddressOption = {
  value: string;
  label: string;
};

export const DEFAULT_COUNTRY_CODE = 'MY';

export function getCountryFlag(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) {
    return '';
  }

  const code = countryCode.toUpperCase();
  return code
    .split('')
    .map((char) => String.fromCodePoint(0x1f1e6 - 65 + char.charCodeAt(0)))
    .join('');
}

const allCountries = Country.getAllCountries();
const malaysiaCountryOption = allCountries.find((country) => country.isoCode === DEFAULT_COUNTRY_CODE);

const countryOptions: AddressOption[] = [
  ...(malaysiaCountryOption
    ? [
        {
          value: malaysiaCountryOption.isoCode,
          label: `${getCountryFlag(malaysiaCountryOption.isoCode)} ${malaysiaCountryOption.name}`,
        },
      ]
    : []),
  ...allCountries
    .filter((country) => country.isoCode !== DEFAULT_COUNTRY_CODE)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((country) => ({
      value: country.isoCode,
      label: `${getCountryFlag(country.isoCode)} ${country.name}`,
    })),
];

export function getCountryOptions(): AddressOption[] {
  return countryOptions;
}

export function getStateOptions(countryCode: string): AddressOption[] {
  if (!countryCode) {
    return [];
  }

  return State.getStatesOfCountry(countryCode)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((state) => ({
      value: state.isoCode,
      label: state.name,
    }));
}

export function getCountryName(countryCode: string | null | undefined): string | null {
  if (!countryCode) {
    return null;
  }

  return Country.getCountryByCode(countryCode)?.name ?? countryCode;
}

export function getStateName(
  countryCode: string | null | undefined,
  stateCode: string | null | undefined,
): string | null {
  if (!countryCode || !stateCode) {
    return null;
  }

  const state = State.getStatesOfCountry(countryCode).find((item) => item.isoCode === stateCode);
  return state?.name ?? stateCode;
}
