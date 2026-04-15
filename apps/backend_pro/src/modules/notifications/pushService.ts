export interface PushMessageInput {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

function isExpoPushToken(token: string): boolean {
  return /^ExponentPushToken\[[^\]]+\]$/.test(token.trim());
}

export class PushService {
  static async send(message: PushMessageInput): Promise<PushSendResult> {
    if (!isExpoPushToken(message.to)) {
      return {
        success: false,
        errorMessage: 'Unsupported push token format',
      };
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
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
        data: message.data ?? {},
      }),
    });

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

