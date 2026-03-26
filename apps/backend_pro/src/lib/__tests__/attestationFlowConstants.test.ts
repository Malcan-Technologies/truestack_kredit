import { describe, it, expect } from 'vitest';
import {
  MAX_AVAILABILITY_HORIZON_DAYS,
  MAX_BORROWER_ATTESTATION_PROPOSALS,
} from '../attestationConstants.js';

describe('attestation flow overhaul constants', () => {
  it('allows only one borrower slot proposal per loan', () => {
    expect(MAX_BORROWER_ATTESTATION_PROPOSALS).toBe(1);
  });

  it('caps configurable availability horizon at 7 days', () => {
    expect(MAX_AVAILABILITY_HORIZON_DAYS).toBe(7);
  });

  it('loanChannel round-trips in JSON like admin/borrower API payloads', () => {
    const row = { id: 'loan_1', loanChannel: 'ONLINE' as const };
    expect(JSON.parse(JSON.stringify(row)).loanChannel).toBe('ONLINE');
  });
});
