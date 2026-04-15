import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PushService } from './pushService.js';

describe('PushService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a failed result when the Expo transport request throws', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));

    const result = await PushService.send({
      to: 'ExponentPushToken[test-token]',
      title: 'Notice',
      body: 'Hello',
    });

    expect(result).toEqual({
      success: false,
      errorMessage: 'Expo push request failed: socket hang up',
    });
  });
});
