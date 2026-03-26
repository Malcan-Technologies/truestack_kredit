import { Country, State } from "country-state-city";

export type AddressOption = {
  value: string;
  label: string;
};

export const DEFAULT_COUNTRY_CODE = "MY";

/** Convert ISO 3166-1 alpha-2 country code to emoji flag (e.g. "MY" -> "🇲🇾") */
export function getCountryFlag(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) return "";
  const code = countryCode.toUpperCase();
  return code
    .split("")
    .map((char) => String.fromCodePoint(0x1f1e6 - 65 + char.charCodeAt(0)))
    .join("");
}

const allCountries = Country.getAllCountries();

const malaysiaCountryOption = allCountries.find((country) => country.isoCode === DEFAULT_COUNTRY_CODE);

const countryOptions: AddressOption[] = [
  ...(malaysiaCountryOption
    ? [{ value: malaysiaCountryOption.isoCode, label: `${getCountryFlag(malaysiaCountryOption.isoCode)} ${malaysiaCountryOption.name}` }]
    : []),
  ...allCountries
    .filter((country) => country.isoCode !== DEFAULT_COUNTRY_CODE)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((country) => ({ value: country.isoCode, label: `${getCountryFlag(country.isoCode)} ${country.name}` })),
];

export const getCountryOptions = (): AddressOption[] => countryOptions;

export const getStateOptions = (countryCode: string): AddressOption[] => {
  if (!countryCode) return [];

  return State.getStatesOfCountry(countryCode)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((state) => ({
      value: state.isoCode,
      label: state.name,
    }));
};

export const getCountryName = (countryCode: string | null | undefined): string | null => {
  if (!countryCode) return null;
  return Country.getCountryByCode(countryCode)?.name ?? countryCode;
};

export const getStateName = (countryCode: string | null | undefined, stateCode: string | null | undefined): string | null => {
  if (!countryCode || !stateCode) return null;
  const state = State.getStatesOfCountry(countryCode).find((item) => item.isoCode === stateCode);
  return state?.name ?? stateCode;
};

/** Build full address string from structured fields for display/copy */
export function formatFullAddress(data: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  address?: string | null;
  businessAddress?: string | null;
}): string {
  const line1 = data.addressLine1 || data.businessAddress || data.address;
  const line2 = data.addressLine2;
  const city = data.city;
  const state = data.state ? getStateName(data.country, data.state) : null;
  const postcode = data.postcode;
  const country = data.country ? getCountryName(data.country) : null;

  const parts = [
    line1,
    line2,
    [city, state, postcode].filter(Boolean).join(", "),
    country,
  ].filter((p): p is string => Boolean(p && p.trim()));

  return parts.join(", ") || "";
}
