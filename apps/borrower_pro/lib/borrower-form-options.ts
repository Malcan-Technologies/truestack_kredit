/** Document type options for borrower forms */
export const DOCUMENT_TYPE_OPTIONS = [
  { value: "IC", label: "IC (MyKad)" },
  { value: "PASSPORT", label: "Passport" },
] as const;

/** Bank options for borrower forms */
export const BANK_OPTIONS = [
  { value: "MAYBANK", label: "Maybank" },
  { value: "CIMB", label: "CIMB Bank" },
  { value: "PUBLIC_BANK", label: "Public Bank" },
  { value: "RHB", label: "RHB Bank" },
  { value: "HONG_LEONG", label: "Hong Leong Bank" },
  { value: "AMBANK", label: "AmBank" },
  { value: "BANK_ISLAM", label: "Bank Islam" },
  { value: "BANK_RAKYAT", label: "Bank Rakyat" },
  { value: "BSN", label: "BSN" },
  { value: "AFFIN", label: "Affin Bank" },
  { value: "ALLIANCE", label: "Alliance Bank" },
  { value: "OCBC", label: "OCBC Bank" },
  { value: "UOB", label: "UOB" },
  { value: "HSBC", label: "HSBC" },
  { value: "STANDARD_CHARTERED", label: "Standard Chartered" },
  { value: "AGROBANK", label: "Agrobank" },
  { value: "MUAMALAT", label: "Bank Muamalat" },
  { value: "OTHER", label: "Lain-lain (Other)" },
] as const;

/** Gender options */
export const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
] as const;

/** Race options */
export const RACE_OPTIONS = [
  { value: "MELAYU", label: "Melayu" },
  { value: "CINA", label: "Cina" },
  { value: "INDIA", label: "India" },
  { value: "LAIN_LAIN", label: "Lain-lain" },
  { value: "BUMIPUTRA_SABAH_SARAWAK", label: "Bumiputra Sabah/Sarawak" },
  { value: "BUKAN_WARGANEGARA", label: "Bukan Warganegara" },
] as const;

/** Education level options */
export const EDUCATION_OPTIONS = [
  { value: "NO_FORMAL", label: "Tiada Pendidikan Formal" },
  { value: "PRIMARY", label: "Sekolah Rendah" },
  { value: "SECONDARY", label: "Sekolah Menengah" },
  { value: "DIPLOMA", label: "Diploma" },
  { value: "DEGREE", label: "Ijazah Sarjana Muda" },
  { value: "POSTGRADUATE", label: "Pasca Siswazah" },
] as const;

/** Employment status options */
export const EMPLOYMENT_OPTIONS = [
  { value: "EMPLOYED", label: "Bekerja" },
  { value: "SELF_EMPLOYED", label: "Bekerja Sendiri" },
  { value: "UNEMPLOYED", label: "Tidak Bekerja" },
  { value: "RETIRED", label: "Bersara" },
  { value: "STUDENT", label: "Pelajar" },
] as const;

/** Bumiputera status options (for corporate) */
export const BUMI_STATUS_OPTIONS = [
  { value: "BUMI", label: "Bumiputera" },
  { value: "BUKAN_BUMI", label: "Bukan Bumiputera" },
  { value: "ASING", label: "Asing" },
] as const;

/** Emergency contact relationship options */
export const RELATIONSHIP_OPTIONS = [
  { value: "SPOUSE", label: "Spouse" },
  { value: "PARENT", label: "Parent" },
  { value: "SIBLING", label: "Sibling" },
  { value: "CHILD", label: "Child" },
  { value: "FRIEND", label: "Friend" },
  { value: "OTHER", label: "Other" },
] as const;

/** Bank account: digits only, 8-17 digits */
export const BANK_ACCOUNT_REGEX = /^\d{8,17}$/;

/** Postcode: digits only */
export const POSTCODE_REGEX = /^\d+$/;
