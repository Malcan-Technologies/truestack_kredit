import { demoClientBrand } from '@/brand/clients/demo-client';
import type { BrandTokens } from '@/brand/tokens';

/**
 * Active white-label client. For a new store build, switch this import to another
 * `clients/*.ts` export or generate this file in CI from client registry + brand guide.
 */
export const activeBrand: BrandTokens = demoClientBrand;
