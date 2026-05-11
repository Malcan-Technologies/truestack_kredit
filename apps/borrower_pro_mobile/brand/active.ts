import { demoClientBrand } from '@/brand/clients/demo-client';
import { proficientPremiumBrand } from '@/brand/clients/proficient-premium';
import type { BrandTokens } from '@/brand/tokens';
import { getEnv } from '@/lib/config/env';

/**
 * White-label client registry. Each per-client app selects its brand via `EXPO_PUBLIC_CLIENT_ID`
 * (set in that app's `.env`). For a new client: add a `clients/<id>.ts` export and register it here.
 */
const brandsById: Record<string, BrandTokens> = {
  [demoClientBrand.id]: demoClientBrand,
  [proficientPremiumBrand.id]: proficientPremiumBrand,
};

export const activeBrand: BrandTokens = brandsById[getEnv().clientId] ?? demoClientBrand;
