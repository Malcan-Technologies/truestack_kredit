import { describe, expect, it } from 'vitest';
import { getCorporateBorrowerVerificationFromLatestSessions } from './verification.js';

describe('getCorporateBorrowerVerificationFromLatestSessions', () => {
  it('marks a corporate borrower fully verified when the latest authorized representative session is approved', () => {
    const result = getCorporateBorrowerVerificationFromLatestSessions({
      directors: [
        { id: 'director-1', isAuthorizedRepresentative: true },
      ],
      sessions: [
        {
          directorId: 'director-1',
          status: 'completed',
          result: 'approved',
          createdAt: new Date('2026-04-14T09:00:00.000Z'),
          updatedAt: new Date('2026-04-14T09:05:00.000Z'),
        },
      ],
    });

    expect(result).toEqual({
      verificationStatus: 'FULLY_VERIFIED',
      documentVerified: true,
    });
  });

  it('downgrades to unverified when a newer retry exists after an older approved session', () => {
    const result = getCorporateBorrowerVerificationFromLatestSessions({
      directors: [
        { id: 'director-1', isAuthorizedRepresentative: true },
      ],
      sessions: [
        {
          directorId: 'director-1',
          status: 'completed',
          result: 'approved',
          createdAt: new Date('2026-04-14T09:00:00.000Z'),
          updatedAt: new Date('2026-04-14T09:05:00.000Z'),
        },
        {
          directorId: 'director-1',
          status: 'pending',
          result: null,
          createdAt: new Date('2026-04-14T10:00:00.000Z'),
          updatedAt: new Date('2026-04-14T10:00:00.000Z'),
        },
      ],
    });

    expect(result).toEqual({
      verificationStatus: 'UNVERIFIED',
      documentVerified: false,
    });
  });

  it('marks the borrower partially verified when only some required directors are approved', () => {
    const result = getCorporateBorrowerVerificationFromLatestSessions({
      directors: [
        { id: 'director-1', isAuthorizedRepresentative: true },
        { id: 'director-2', isAuthorizedRepresentative: true },
      ],
      sessions: [
        {
          directorId: 'director-1',
          status: 'completed',
          result: 'approved',
          createdAt: new Date('2026-04-14T09:00:00.000Z'),
          updatedAt: new Date('2026-04-14T09:05:00.000Z'),
        },
        {
          directorId: 'director-2',
          status: 'processing',
          result: null,
          createdAt: new Date('2026-04-14T09:30:00.000Z'),
          updatedAt: new Date('2026-04-14T09:35:00.000Z'),
        },
      ],
    });

    expect(result).toEqual({
      verificationStatus: 'PARTIALLY_VERIFIED',
      documentVerified: false,
    });
  });
});
