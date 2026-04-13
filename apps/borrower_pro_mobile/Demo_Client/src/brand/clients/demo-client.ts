import type { BrandTokens } from '@/brand/tokens';

/** Aligns with `apps/borrower_pro/Demo_Client/docs/planning/brand.md` */
export const demoClientBrand: BrandTokens = {
  id: 'demo-client',
  displayName: 'Demo Client',
  productTagline: 'TrueKredit Pro — borrower',
  colors: {
    dark: {
      background: '#0A0A0A',
      surface: '#171717',
      surfaceSelected: '#2E3135',
      border: '#292929',
      text: '#FAFAFA',
      textSecondary: '#8C8C8C',
      primary: '#3B82F6',
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
      primary: '#2563EB',
      success: '#22C55E',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },
  },
};
