import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError } from '../../lib/errors.js';
import {
  NOTIFICATION_DEFINITIONS,
  getNotificationDefinition,
  isNotificationChannel,
  type NotificationChannel,
} from './catalog.js';

const DEFAULT_PAYMENT_REMINDER_DAYS = [3, 1, 0] as const;
const DEFAULT_LATE_PAYMENT_NOTICE_DAYS = [3, 7, 10] as const;
const DEFAULT_ARREARS_PERIOD = 14;
export const MAX_PAYMENT_REMINDER_DAY = 30;
export const MAX_REMINDER_FREQUENCY_COUNT = 3;

function dedupeDays(days: number[]): number[] {
  return [...new Set(days)];
}

export function normalizePaymentReminderDays(days: number[]): number[] {
  return dedupeDays(days)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= MAX_PAYMENT_REMINDER_DAY)
    .sort((a, b) => b - a)
    .slice(0, MAX_REMINDER_FREQUENCY_COUNT);
}

export function normalizeLatePaymentNoticeDays(days: number[], maxLateDay: number): number[] {
  return dedupeDays(days)
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= maxLateDay)
    .sort((a, b) => a - b)
    .slice(0, MAX_REMINDER_FREQUENCY_COUNT);
}

export interface TrueSendSettings {
  paymentReminderDays: number[];
  latePaymentNoticeDays: number[];
}

export function readTrueSendSettings(rawSettings: unknown, maxLateDay: number): TrueSendSettings {
  const raw = rawSettings && typeof rawSettings === 'object' ? (rawSettings as Record<string, unknown>) : {};
  const paymentReminderDaysRaw = Array.isArray(raw.paymentReminderDays)
    ? raw.paymentReminderDays
    : DEFAULT_PAYMENT_REMINDER_DAYS;
  const latePaymentNoticeDaysRaw = Array.isArray(raw.latePaymentNoticeDays)
    ? raw.latePaymentNoticeDays
    : DEFAULT_LATE_PAYMENT_NOTICE_DAYS;

  const paymentReminderDays = normalizePaymentReminderDays(
    paymentReminderDaysRaw.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= MAX_PAYMENT_REMINDER_DAY),
  );
  const latePaymentNoticeDays = normalizeLatePaymentNoticeDays(
    latePaymentNoticeDaysRaw.filter((day): day is number => Number.isInteger(day) && day >= 1),
    maxLateDay,
  );

  const fallbackLatePaymentNoticeDays = normalizeLatePaymentNoticeDays(
    [...DEFAULT_LATE_PAYMENT_NOTICE_DAYS],
    maxLateDay,
  );

  return {
    paymentReminderDays: paymentReminderDays.length > 0 ? paymentReminderDays : [...DEFAULT_PAYMENT_REMINDER_DAYS],
    latePaymentNoticeDays: latePaymentNoticeDays.length > 0
      ? latePaymentNoticeDays
      : fallbackLatePaymentNoticeDays.length > 0
        ? fallbackLatePaymentNoticeDays
        : maxLateDay >= 1
          ? [maxLateDay]
          : [],
  };
}

export async function getTenantNoticePeriods(tenantId: string) {
  const periods = await prisma.product.aggregate({
    where: { tenantId, isActive: true },
    _min: {
      arrearsPeriod: true,
      defaultPeriod: true,
    },
  });

  return {
    arrearsPeriod: periods._min.arrearsPeriod ?? DEFAULT_ARREARS_PERIOD,
    defaultPeriod: periods._min.defaultPeriod ?? DEFAULT_ARREARS_PERIOD * 2,
  };
}

export async function ensureTenantNotificationSettings(tenantId: string): Promise<void> {
  const rows = NOTIFICATION_DEFINITIONS.flatMap((definition) =>
    definition.channels.map((channel) => ({
      tenantId,
      notificationKey: definition.key,
      channel,
      enabled: true,
    })),
  );

  await prisma.tenantNotificationSetting.createMany({
    data: rows,
    skipDuplicates: true,
  });
}

export interface NotificationAutomationSettingRow {
  key: string;
  label: string;
  description: string;
  category: string;
  supportedChannels: NotificationChannel[];
  channels: Record<NotificationChannel, boolean>;
}

export interface NotificationSettingsPayload {
  enabled: boolean;
  automations: NotificationAutomationSettingRow[];
  truesend: TrueSendSettings;
  constraints: {
    maxReminderFrequencyCount: number;
    maxPaymentReminderDay: number;
    maxLatePaymentNoticeDay: number;
    arrearsPeriod: number;
    defaultPeriod: number;
  };
}

export async function getNotificationSettings(tenantId: string): Promise<NotificationSettingsPayload> {
  await ensureTenantNotificationSettings(tenantId);

  const [tenant, rows, periods] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, truesendSettings: true },
    }),
    prisma.tenantNotificationSetting.findMany({
      where: { tenantId },
      orderBy: [{ notificationKey: 'asc' }, { channel: 'asc' }],
    }),
    getTenantNoticePeriods(tenantId),
  ]);

  const rowMap = new Map(rows.map((row) => [`${row.notificationKey}:${row.channel}`, row.enabled]));
  const automations: NotificationAutomationSettingRow[] = NOTIFICATION_DEFINITIONS.map((definition) => {
    const channels = {
      email: false,
      in_app: false,
      push: false,
    } as Record<NotificationChannel, boolean>;

    for (const channel of definition.channels) {
      channels[channel] = rowMap.get(`${definition.key}:${channel}`) ?? true;
    }
    if (channels.push && definition.channels.includes('in_app')) {
      channels.in_app = true;
    }

    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      category: definition.category,
      supportedChannels: definition.channels,
      channels,
    };
  });

  return {
    enabled: tenant?.status === 'ACTIVE',
    automations,
    truesend: readTrueSendSettings(tenant?.truesendSettings, periods.arrearsPeriod),
    constraints: {
      maxReminderFrequencyCount: MAX_REMINDER_FREQUENCY_COUNT,
      maxPaymentReminderDay: MAX_PAYMENT_REMINDER_DAY,
      maxLatePaymentNoticeDay: periods.arrearsPeriod,
      arrearsPeriod: periods.arrearsPeriod,
      defaultPeriod: periods.defaultPeriod,
    },
  };
}

export async function updateNotificationSettings(params: {
  tenantId: string;
  memberId?: string | null;
  automations: Array<{
    key: string;
    channels: Record<string, boolean>;
  }>;
  truesend?: {
    paymentReminderDays: number[];
    latePaymentNoticeDays: number[];
  };
}): Promise<NotificationSettingsPayload> {
  await ensureTenantNotificationSettings(params.tenantId);
  const periods = await getTenantNoticePeriods(params.tenantId);

  if (params.truesend) {
    const normalizedPaymentReminderDays = normalizePaymentReminderDays(params.truesend.paymentReminderDays);
    const normalizedLatePaymentNoticeDays = normalizeLatePaymentNoticeDays(
      params.truesend.latePaymentNoticeDays,
      periods.arrearsPeriod,
    );

    if (normalizedPaymentReminderDays.length !== params.truesend.paymentReminderDays.length) {
      throw new BadRequestError('Payment reminder days must be unique values.');
    }

    if (normalizedLatePaymentNoticeDays.length !== params.truesend.latePaymentNoticeDays.length) {
      throw new BadRequestError(
        `Late payment notice days must be unique values and cannot exceed arrears period (${periods.arrearsPeriod} days).`,
      );
    }

    await prisma.tenant.update({
      where: { id: params.tenantId },
      data: {
        truesendSettings: {
          paymentReminderDays: normalizedPaymentReminderDays,
          latePaymentNoticeDays: normalizedLatePaymentNoticeDays,
        } as Prisma.InputJsonValue,
      },
    });
  }

  for (const automation of params.automations) {
    const definition = getNotificationDefinition(automation.key);
    if (!definition) {
      throw new BadRequestError(`Unknown notification automation "${automation.key}".`);
    }

    const normalizedChannels = { ...automation.channels } as Record<string, boolean>;
    if (normalizedChannels.push && definition.channels.includes('in_app')) {
      normalizedChannels.in_app = true;
    }

    for (const [channel, enabled] of Object.entries(normalizedChannels)) {
      if (!isNotificationChannel(channel) || !definition.channels.includes(channel)) {
        continue;
      }

      await prisma.tenantNotificationSetting.upsert({
        where: {
          tenantId_notificationKey_channel: {
            tenantId: params.tenantId,
            notificationKey: automation.key,
            channel,
          },
        },
        update: {
          enabled,
          updatedByMemberId: params.memberId ?? null,
        },
        create: {
          tenantId: params.tenantId,
          notificationKey: automation.key,
          channel,
          enabled,
          updatedByMemberId: params.memberId ?? null,
        },
      });
    }
  }

  return getNotificationSettings(params.tenantId);
}

export async function getNotificationChannelState(
  tenantId: string,
  notificationKey: string,
): Promise<Record<NotificationChannel, boolean>> {
  await ensureTenantNotificationSettings(tenantId);
  const definition = getNotificationDefinition(notificationKey);
  if (!definition) {
    throw new BadRequestError(`Unknown notification automation "${notificationKey}".`);
  }

  const rows = await prisma.tenantNotificationSetting.findMany({
    where: { tenantId, notificationKey },
  });

  const rowMap = new Map(rows.map((row) => [row.channel, row.enabled]));
  const rawInApp = definition.channels.includes('in_app') ? rowMap.get('in_app') ?? true : false;
  const rawPush = definition.channels.includes('push') ? rowMap.get('push') ?? true : false;
  return {
    email: definition.channels.includes('email') ? rowMap.get('email') ?? true : false,
    in_app: definition.channels.includes('in_app') ? rawInApp || rawPush : false,
    push: rawPush,
  };
}

