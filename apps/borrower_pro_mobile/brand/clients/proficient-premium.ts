import type { BrandTokens } from '@/brand/tokens';

/**
 * Aligns with `apps/borrower_pro/Proficient_Premium` (web). Same neutral black/white palette as
 * `demo-client` — color is reserved for status. Only the identity (id/displayName/tagline) differs;
 * client artwork (icon/splash) lives in each app's `app.config.ts` asset references.
 */
export const proficientPremiumBrand: BrandTokens = {
  id: 'proficient-premium',
  displayName: 'Proficient Premium',
  productTagline: 'TrueKredit Pro — borrower',
  colors: {
    dark: {
      background: '#0A0A0A',
      surface: '#171717',
      surfaceSelected: '#2E3135',
      border: '#292929',
      text: '#FAFAFA',
      textSecondary: '#8C8C8C',
      primary: '#FAFAFA',
      primaryForeground: '#0A0A0A',
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
      primary: '#171717',
      primaryForeground: '#FAFAFA',
      success: '#22C55E',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },
  },
};
