/**
 * Per-client visual + copy tokens. New Pro clients: add `clients/<id>.ts` and point
 * `active.ts` at it (or swap via build script / EAS env later).
 */

export type ThemeModePalette = {
  background: string;
  surface: string;
  surfaceSelected: string;
  border: string;
  text: string;
  textSecondary: string;
  /** Links, tab accents, key CTAs */
  primary: string;
  /** Foreground color rendered on primary surfaces */
  primaryForeground: string;
  success: string;
  warning: string;
  error: string;
  info: string;
};

export type BrandTokens = {
  id: string;
  displayName: string;
  productTagline: string;
  colors: {
    light: ThemeModePalette;
    dark: ThemeModePalette;
  };
};
