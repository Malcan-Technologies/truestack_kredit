export interface PushMessageInput {
  to: string;
  title: string;
  body: string;
  channelId?: string;
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
  errorCode?: string;
}

export function isExpoPushToken(token: string): boolean {
  return /^Expo(?:nent)?PushToken\[[^\]]+\]$/.test(token.trim());
}

function getTransportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unknown transport error';
}

export class PushService {
  static async send(message: PushMessageInput): Promise<PushSendResult> {
    if (!isExpoPushToken(message.to)) {
      return {
        success: false,
        errorCode: 'InvalidPushTokenFormat',
        errorMessage: 'Unsupported push token format',
      };
    }

    let response: Response;

    try {
      response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: message.to,
          sound: 'default',
          title: message.title,
          body: message.body,
          ...(message.channelId ? { channelId: message.channelId } : {}),
          data: message.data ?? {},
        }),
      });
    } catch (error) {
      return {
        success: false,
        errorMessage: `Expo push request failed: ${getTransportErrorMessage(error)}`,
      };
    }

    const json = (await response.json().catch(() => null)) as
      | {
          data?: {
            status?: string;
            id?: string;
            message?: string;
            details?: { error?: string };
          };
          errors?: Array<{ message?: string }>;
        }
      | null;

    if (!response.ok || json?.data?.status === 'error') {
      return {
        success: false,
        errorCode: json?.data?.details?.error,
        errorMessage:
          json?.data?.message ||
          json?.data?.details?.error ||
          json?.errors?.[0]?.message ||
          `Expo push request failed with status ${response.status}`,
      };
    }

    return {
      success: true,
      providerMessageId: json?.data?.id,
    };
  }
}

