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

  it('rejects invalid non-Expo tokens with a machine-readable code', async () => {
    const result = await PushService.send({
      to: 'native-apns-token',
      title: 'Notice',
      body: 'Hello',
    });

    expect(result).toEqual({
      success: false,
      errorCode: 'InvalidPushTokenFormat',
      errorMessage: 'Unsupported push token format',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts current Expo push token format', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          status: 'ok',
          id: 'ticket-1',
        },
      }),
    });

    const result = await PushService.send({
      to: 'ExpoPushToken[test-token]',
      title: 'Notice',
      body: 'Hello',
    });

    expect(result).toEqual({
      success: true,
      providerMessageId: 'ticket-1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
