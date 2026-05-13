import type { BrandTokens } from '@/brand/tokens';

/**
 * Aligns with `apps/borrower_pro/Pinjocep/docs/planning/brand.md`. Branded red `primary`
 * (`#8a0304` light / `#f22526` dark) for buttons, tab accents, links, focus rings; every other
 * token stays on the neutral black/white palette. Client artwork (icon/splash) lives in the
 * `Pinjocep/app.config.ts` asset references.
 */
export const pinjocepBrand: BrandTokens = {
  id: 'pinjocep',
  displayName: 'Pinjocep',
  productTagline: 'TrueKredit Pro — borrower',
  colors: {
    dark: {
      background: '#0A0A0A',
      surface: '#171717',
      surfaceSelected: '#2E3135',
      border: '#292929',
      text: '#FAFAFA',
      textSecondary: '#8C8C8C',
      primary: '#f22526',
      primaryForeground: '#FAFAFA',
      success: '#22C55E',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },
    light: {
      background: '#FFFFFF',
      surface: '#FAFAFA',
      surfaceSelected: '#E5E5E5',
      border: '#E5E5E5',
      text: '#0A0A0A',
      textSecondary: '#737373',
      primary: '#8a0304',
      primaryForeground: '#FAFAFA',
      success: '#22C55E',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },
  },
};
