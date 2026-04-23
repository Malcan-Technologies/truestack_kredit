/**
 * TrueSend Service
 *
 * Handles automated email sending for loan events.
 * Checks add-on status, builds branded HTML, sends via Resend with optional PDF attachments,
 * logs to EmailLog table, and creates audit entries.
 */

import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { AddOnService } from '../../lib/addOnService.js';
import { getFile } from '../../lib/storage.js';
import { safeAdd, safeRound, toSafeNumber } from '../../lib/math.js';
import { NotificationOrchestrator, type NotifyBorrowerEventInput } from './orchestrator.js';
import { getNotificationChannelState } from './settings.js';
import { formatResendFromForTenant } from './emailSender.js';

// ============================================
// Types
// ============================================

interface EmailAttachment {
  path: string;
  filename: string;
}

interface SendEmailParams {
  tenantId: string;
  loanId?: string;
  borrowerId?: string;
  emailType: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  htmlBody: string;
  /** @deprecated Use `attachments` array instead for multiple files */
  attachmentPath?: string;
  /** @deprecated Use `attachments` array instead for multiple files */
  attachmentFilename?: string;
  /** Multiple file attachments */
  attachments?: EmailAttachment[];
  /** If true, fail sending when any requested attachment cannot be loaded */
  requireAllAttachments?: boolean;
}

interface ResendApiResponse {
  id: string;
}

interface AutomationEmailResult {
  delivered: boolean;
  required: boolean;
}

const RECURRING_NOTIFICATION_KEYS = new Set([
  'payment_reminder',
  'late_payment_notice',
]);
const RECURRING_NOTIFICATION_DEDUPE_WINDOW_MS = 18 * 60 * 60 * 1000;

function extractFilenameFromPath(filePath: string): string {
  if (!filePath) return 'document.pdf';

  if (filePath.startsWith('s3://')) {
    const withoutScheme = filePath.slice('s3://'.length);
    const parts = withoutScheme.split('/');
    const maybeFile = parts[parts.length - 1];
    return maybeFile || 'document.pdf';
  }

  try {
    const parsed = new URL(filePath);
    const pathname = parsed.pathname || '';
    const lastSegment = pathname.split('/').filter(Boolean).pop();
    return lastSegment || 'document.pdf';
  } catch {
    const cleanPath = filePath.split('?')[0].split('#')[0];
    const lastSegment = cleanPath.split('/').filter(Boolean).pop();
    return lastSegment || 'document.pdf';
  }
}

// ============================================
// Email HTML Builder
// ============================================

interface TenantEmailInfo {
  name: string;
  logoUrl?: string | null;
  registrationNumber?: string | null;
  email?: string | null;
  contactNumber?: string | null;
  businessAddress?: string | null;
}

const RESEND_REQUEST_TIMEOUT_MS = 20_000;

async function buildEmailWrapper(tenant: TenantEmailInfo, content: string): Promise<string> {
  const tenantName = tenant.name;

  // Build tenant details for footer
  const tenantDetails: string[] = [];
  if (tenant.registrationNumber) tenantDetails.push(`SSM: ${tenant.registrationNumber}`);
  if (tenant.email) tenantDetails.push(tenant.email);
  if (tenant.contactNumber) tenantDetails.push(tenant.contactNumber);
  if (tenant.businessAddress) tenantDetails.push(tenant.businessAddress);

  const tenantDetailsHtml = tenantDetails.length > 0
    ? `<p class="footer-text" style="margin-top:8px;line-height:1.5;">${tenantDetails.join('<br />')}</p>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #1a1a1a; padding: 24px 32px; }
    .header-text { color: #ffffff; font-size: 18px; font-weight: 600; margin: 0; }
    .header-sub { color: #999; font-size: 12px; margin: 4px 0 0 0; }
    .body { padding: 32px; }
    .footer { padding: 24px 32px; background: #fafafa; border-top: 1px solid #eee; }
    .footer-text { color: #999; font-size: 12px; margin: 0; }
    .footer-tenant { padding: 16px 32px; background: #f5f5f5; border-top: 1px solid #eee; text-align: center; }
    .badge { display: inline-block; background: #3b82f6; color: #fff; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 10px; letter-spacing: 0.5px; margin-left: 8px; vertical-align: middle; }
    h2 { color: #1a1a1a; margin: 0 0 16px 0; font-size: 20px; }
    p { margin: 0 0 12px 0; }
    .highlight { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .detail-label { color: #666; font-size: 14px; }
    .detail-value { color: #1a1a1a; font-size: 14px; font-weight: 500; }
    table.details { width: 100%; border-collapse: collapse; margin: 16px 0; }
    table.details td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    table.details td:first-child { color: #666; width: 40%; }
    table.details td:last-child { color: #1a1a1a; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="header-text">${tenantName}</p>
      <p class="header-sub">Powered by TrueKredit</p>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p class="footer-text">This is an automated email from ${tenantName}.</p>
      <p class="footer-text">If you believe you received this email in error, please contact ${tenantName} directly.</p>
    </div>
    ${tenantDetails.length > 0 ? `
    <div class="footer-tenant">
      <p class="footer-text" style="font-weight:600;color:#666;">${tenantName}</p>
      ${tenantDetailsHtml}
    </div>` : ''}
  </div>
</body>
</html>`;
}

function formatCurrency(amount: number): string {
  return `RM ${new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(date);
}

async function sendResendRequest(apiKey: string, payload: Record<string, unknown>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, RESEND_REQUEST_TIMEOUT_MS);

  try {
    return await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================
// TrueSend Service
// ============================================

export class TrueSendService {
  /**
   * Core email sending method — all public methods funnel through this
   */
  private static async sendEmail(params: SendEmailParams): Promise<boolean> {
    const {
      tenantId,
      loanId,
      borrowerId,
      emailType,
      recipientEmail,
      recipientName,
      subject,
      htmlBody,
      attachmentPath,
      attachmentFilename,
      requireAllAttachments = false,
    } = params;

    // Resolve the primary attachment path for logging (first attachment or legacy single)
    const primaryAttachmentPath = params.attachments?.[0]?.path || attachmentPath || undefined;

    // Create EmailLog record
    const emailLog = await prisma.emailLog.create({
      data: {
        tenantId,
        loanId,
        borrowerId,
        emailType,
        recipientEmail,
        recipientName,
        subject,
        status: 'pending',
        attachmentPath: primaryAttachmentPath,
      },
    });

    try {
      const apiKey = config.notifications.resendApiKey;

      if (!apiKey) {
        console.log(`[TrueSend] Email (mock): ${emailType} to ${recipientEmail} | subject: ${subject}`);
        await prisma.emailLog.update({
          where: { id: emailLog.id },
          data: { status: 'sent', sentAt: new Date(), lastEventAt: new Date() },
        });
        return true;
      }

      // Build attachments array from multiple sources
      const resendAttachments: Array<{ filename: string; content: string }> = [];

      // Support new multi-attachment array
      if (params.attachments && params.attachments.length > 0) {
        for (const att of params.attachments) {
          const fileBuffer = await getFile(att.path);
          if (fileBuffer) {
            resendAttachments.push({
              filename: att.filename,
              content: fileBuffer.toString('base64'),
            });
          } else {
            const message = `[TrueSend] Could not load attachment: ${att.path}`;
            if (requireAllAttachments) {
              throw new Error(message);
            }
            console.warn(message);
          }
        }
      }
      // Legacy single attachment fallback
      else if (attachmentPath) {
        const fileBuffer = await getFile(attachmentPath);
        if (fileBuffer) {
          resendAttachments.push({
            filename: attachmentFilename || 'document.pdf',
            content: fileBuffer.toString('base64'),
          });
        } else {
          const message = `[TrueSend] Could not load attachment: ${attachmentPath}`;
          if (requireAllAttachments) {
            throw new Error(message);
          }
          console.warn(message);
        }
      }

      const from = await formatResendFromForTenant(tenantId);

      const response = await sendResendRequest(apiKey, {
        from,
        to: recipientEmail,
        subject,
        html: htmlBody,
        ...(resendAttachments.length > 0 ? { attachments: resendAttachments } : {}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as ResendApiResponse;

      // Update EmailLog with Resend message ID
      await prisma.emailLog.update({
        where: { id: emailLog.id },
        data: {
          resendMessageId: data.id,
          status: 'sent',
          sentAt: new Date(),
          lastEventAt: new Date(),
        },
      });

      console.log(`[TrueSend] Sent ${emailType} to ${recipientEmail} (resendId: ${data.id})`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[TrueSend] Failed to send ${emailType} to ${recipientEmail}:`, errorMessage);

      await prisma.emailLog.update({
        where: { id: emailLog.id },
        data: {
          status: 'failed',
          failureReason: errorMessage,
          lastEventAt: new Date(),
        },
      });
      return false;
    }
  }

  private static async sendAutomationEmail(
    params: Omit<SendEmailParams, 'recipientEmail'> & {
      recipientEmail?: string | null;
      notificationKey: string;
    }
  ): Promise<AutomationEmailResult> {
    const channelState = await getNotificationChannelState(params.tenantId, params.notificationKey);
    const emailRequired = channelState.email && Boolean(params.recipientEmail);
    if (!emailRequired || !params.recipientEmail) {
      return { delivered: false, required: false };
    }

    const primaryAttachmentPath = params.attachments?.[0]?.path || params.attachmentPath || null;
    const recentEmailFilter = RECURRING_NOTIFICATION_KEYS.has(params.notificationKey)
      ? {
          createdAt: {
            gte: new Date(Date.now() - RECURRING_NOTIFICATION_DEDUPE_WINDOW_MS),
          },
        }
      : {};
    const existingEmail = await prisma.emailLog.findFirst({
      where: {
        tenantId: params.tenantId,
        loanId: params.loanId,
        borrowerId: params.borrowerId,
        emailType: params.emailType,
        recipientEmail: params.recipientEmail,
        subject: params.subject,
        attachmentPath: primaryAttachmentPath,
        status: { in: ['sent', 'delivered'] },
        ...recentEmailFilter,
      },
      select: { id: true },
    });

    if (existingEmail) {
      return { delivered: true, required: true };
    }

    const {
      notificationKey: _notificationKey,
      recipientEmail,
      ...emailParams
    } = params;
    return {
      delivered: await this.sendEmail({
        ...emailParams,
        recipientEmail,
      }),
      required: true,
    };
  }

  private static async fanOutBorrowerNotification(
    input: NotifyBorrowerEventInput,
    failureMessage: string,
  ): Promise<boolean> {
    const recentNotificationFilter = RECURRING_NOTIFICATION_KEYS.has(input.notificationKey)
      ? {
          createdAt: {
            gte: new Date(Date.now() - RECURRING_NOTIFICATION_DEDUPE_WINDOW_MS),
          },
        }
      : {};
    const existingNotification = await prisma.borrowerNotification.findFirst({
      where: {
        tenantId: input.tenantId,
        borrowerId: input.borrowerId,
        notificationKey: input.notificationKey,
        title: input.title,
        body: input.body,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        ...recentNotificationFilter,
      },
      select: { id: true },
    });

    if (existingNotification) {
      return true;
    }

    try {
      await NotificationOrchestrator.notifyBorrowerEvent(input);
      return true;
    } catch (notificationError) {
      console.error(failureMessage, notificationError);
      return false;
    }
  }

  /**
   * Helper to fetch loan + borrower + tenant for email context
   */
  private static async getLoanContext(tenantId: string, loanId: string) {
    return prisma.loan.findFirst({
      where: { id: loanId, tenantId },
      include: {
        borrower: true,
        product: true,
        tenant: true,
      },
    });
  }

  // ============================================
  // Public Methods — Each Email Type
  // ============================================

  /**
   * Payment Reminder — sent 3 days and 1 day before a milestone due date
   */
  static async sendPaymentReminderWithContext(params: {
    tenantId: string;
    loanId: string;
    borrowerId?: string;
    recipientEmail?: string | null;
    recipientName: string;
    tenant: TenantEmailInfo;
    dueDate: Date;
    amount: number;
    milestoneNumber: number;
    daysUntilDue: number;
  }): Promise<boolean> {
    const {
      tenantId,
      loanId,
      borrowerId,
      recipientEmail,
      recipientName,
      tenant,
      dueDate,
      amount,
      milestoneNumber,
      daysUntilDue,
    } = params;

    const amountFormatted = formatCurrency(safeRound(amount, 2));
    const dueDateFormatted = formatDate(dueDate);

    const content = `
      <h2>Payment Reminder</h2>
      <p>Dear ${recipientName},</p>
      <p>This is a friendly reminder that your loan repayment is due ${
        daysUntilDue === 0
          ? '<strong>today</strong>'
          : daysUntilDue === 1
          ? '<strong>tomorrow</strong>'
          : `in <strong>${daysUntilDue} days</strong>`
      }.</p>
      <div class="highlight">
        <table class="details">
          <tr><td>Due Date</td><td>${dueDateFormatted}</td></tr>
          <tr><td>Payment #</td><td>${milestoneNumber}</td></tr>
          <tr><td>Amount Due</td><td>${amountFormatted}</td></tr>
        </table>
      </div>
      <p>Please ensure your payment is made on or before the due date to avoid any late payment charges.</p>
      <p>If you have already made this payment, please disregard this notice.</p>
      <p>Thank you.</p>
    `;

    const emailResult = await this.sendAutomationEmail({
      tenantId,
      loanId,
      borrowerId,
      notificationKey: 'payment_reminder',
      emailType: 'PAYMENT_REMINDER',
      recipientEmail,
      recipientName,
      subject: `Payment Reminder — ${amountFormatted} due ${dueDateFormatted}`,
      htmlBody: await buildEmailWrapper(tenant, content),
    });

    let borrowerNotificationProcessed = true;
    if (borrowerId) {
      borrowerNotificationProcessed = await this.fanOutBorrowerNotification(
        {
          tenantId,
          borrowerId,
          notificationKey: 'payment_reminder',
          category: 'payments',
          title: daysUntilDue === 0 ? 'Payment due today' : 'Upcoming payment reminder',
          body:
            daysUntilDue === 0
              ? `${amountFormatted} is due today for repayment #${milestoneNumber}.`
              : `${amountFormatted} is due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} for repayment #${milestoneNumber}.`,
          deepLink: `/loans/${loanId}`,
          sourceType: 'LOAN',
          sourceId: loanId,
          metadata: {
            amount,
            milestoneNumber,
            daysUntilDue,
            dueDate: dueDate.toISOString(),
          },
        },
        `[TrueSend] Failed to fan out payment reminder for loan ${loanId}:`,
      );
    }

    if (emailResult.required && !emailResult.delivered) {
      throw new Error(`TrueSend failed to deliver email for payment reminder on loan ${loanId}`);
    }

    if (!borrowerNotificationProcessed) {
      throw new Error(`TrueSend failed to deliver borrower notification for payment reminder on loan ${loanId}`);
    }

    return emailResult.delivered;
  }

  static async sendPaymentReminder(
    tenantId: string,
    loanId: string,
    dueDate: Date,
    amount: number,
    milestoneNumber: number,
    daysUntilDue: number
  ): Promise<boolean> {
    // Check add-on
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return false;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan) return false;

    return await this.sendPaymentReminderWithContext({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId ?? undefined,
      recipientEmail: loan.borrower.email ?? null,
      recipientName: loan.borrower.name,
      tenant: loan.tenant,
      dueDate,
      amount,
      milestoneNumber,
      daysUntilDue,
    });
  }

  /**
   * Late Payment Notice — consolidates multiple overdue milestones in one email
   */
  static async sendLatePaymentNotice(
    tenantId: string,
    loanId: string,
    overdueMilestones: Array<{ milestoneNumber: number; dueDate: Date; amount: number; daysOverdue: number }>
  ): Promise<boolean> {
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return false;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan) return false;

    const tenantName = loan.tenant.name;
    const totalOverdue = overdueMilestones.reduce((sum, m) => safeAdd(sum, m.amount), 0);

    const milestoneRows = overdueMilestones.map((m) => `
      <tr>
        <td>#${m.milestoneNumber}</td>
        <td>${formatDate(m.dueDate)}</td>
        <td>${formatCurrency(safeRound(m.amount, 2))}</td>
        <td>${m.daysOverdue} days</td>
      </tr>
    `).join('');

    const content = `
      <h2>Late Payment Notice</h2>
      <p>Dear ${loan.borrower.name},</p>
      <p>We wish to inform you that the following repayment(s) on your loan are <strong>overdue</strong>:</p>
      <table class="details" style="margin: 16px 0;">
        <tr style="background: #f9f9f9;"><td><strong>Payment</strong></td><td><strong>Due Date</strong></td><td><strong>Amount</strong></td><td><strong>Overdue</strong></td></tr>
        ${milestoneRows}
      </table>
      <div class="highlight">
        <table class="details">
          <tr><td>Total Overdue</td><td><strong>${formatCurrency(safeRound(totalOverdue, 2))}</strong></td></tr>
        </table>
      </div>
      <p>Please arrange for immediate payment to avoid additional late charges and potential escalation.</p>
      <p>If you have already made this payment, please disregard this notice.</p>
      <p>Thank you.</p>
    `;

    const emailResult = await this.sendAutomationEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      notificationKey: 'late_payment_notice',
      emailType: 'LATE_PAYMENT',
      recipientEmail: loan.borrower.email ?? null,
      recipientName: loan.borrower.name,
      subject: `Late Payment Notice — ${formatCurrency(safeRound(totalOverdue, 2))} overdue`,
      htmlBody: await buildEmailWrapper(loan.tenant, content),
    });

    const borrowerNotificationProcessed = await this.fanOutBorrowerNotification(
      {
          tenantId,
          borrowerId: loan.borrowerId,
          notificationKey: 'late_payment_notice',
          category: 'collections',
          title: 'Late payment notice',
          body: `${formatCurrency(safeRound(totalOverdue, 2))} is overdue on your loan account.`,
          deepLink: `/loans/${loanId}`,
          sourceType: 'LOAN',
          sourceId: loanId,
          metadata: {
            overdueMilestones: overdueMilestones.map((milestone) => ({
              milestoneNumber: milestone.milestoneNumber,
              dueDate: milestone.dueDate.toISOString(),
              amount: milestone.amount,
              daysOverdue: milestone.daysOverdue,
            })),
          },
      },
      `[TrueSend] Failed to fan out late payment notice for loan ${loanId}:`,
    );

    if (emailResult.required && !emailResult.delivered) {
      throw new Error(`TrueSend failed to deliver email for late payment notice on loan ${loanId}`);
    }

    if (!borrowerNotificationProcessed) {
      throw new Error(`TrueSend failed to deliver borrower notification for late payment notice on loan ${loanId}`);
    }

    return emailResult.delivered;
  }

  /**
   * Arrears Notice — attaches arrears letter PDF
   */
  static async sendArrearsNotice(
    tenantId: string,
    loanId: string,
    letterPath: string
  ): Promise<boolean> {
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return false;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan) return false;

    const tenantName = loan.tenant.name;

    const content = `
      <h2>Arrears Notice</h2>
      <p>Dear ${loan.borrower.name},</p>
      <p>Please be informed that your loan account is currently <strong>in arrears</strong> due to outstanding overdue repayments.</p>
      <p>Attached to this email is a formal arrears notice letter for your reference and records.</p>
      <div class="highlight">
        <p><strong>Important:</strong> Please contact ${tenantName} immediately to discuss repayment arrangements and avoid further action.</p>
      </div>
      <p>If you have already settled the outstanding amount, please disregard this notice.</p>
      <p>Thank you.</p>
    `;

    // Extract filename from path
    const letterFilename = letterPath.split('/').pop() || 'arrears-letter.pdf';

    const emailResult = await this.sendAutomationEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      notificationKey: 'arrears_notice',
      emailType: 'ARREARS_NOTICE',
      recipientEmail: loan.borrower.email ?? null,
      recipientName: loan.borrower.name,
      subject: `Arrears Notice — Immediate Attention Required`,
      htmlBody: await buildEmailWrapper(loan.tenant, content),
      attachmentPath: letterPath,
      attachmentFilename: letterFilename,
      requireAllAttachments: true,
    });

    const borrowerNotificationProcessed = await this.fanOutBorrowerNotification(
      {
          tenantId,
          borrowerId: loan.borrowerId,
          notificationKey: 'arrears_notice',
          category: 'collections',
          title: 'Arrears notice issued',
          body: 'Your loan has entered arrears. Review the notice and contact your lender promptly.',
          deepLink: `/loans/${loanId}`,
          sourceType: 'LOAN',
          sourceId: loanId,
      },
      `[TrueSend] Failed to fan out arrears notice for loan ${loanId}:`,
    );

    if (emailResult.required && !emailResult.delivered) {
      throw new Error(`TrueSend failed to deliver email for arrears notice on loan ${loanId}`);
    }

    if (!borrowerNotificationProcessed) {
      throw new Error(`TrueSend failed to deliver borrower notification for arrears notice on loan ${loanId}`);
    }

    return emailResult.delivered;
  }

  /**
   * Default Notice — attaches default letter PDF
   */
  static async sendDefaultNotice(
    tenantId: string,
    loanId: string,
    letterPath: string
  ): Promise<boolean> {
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return false;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan) return false;

    const tenantName = loan.tenant.name;

    const content = `
      <h2>Default Notice</h2>
      <p>Dear ${loan.borrower.name},</p>
      <p>This is to formally notify you that your loan account has been <strong>classified as defaulted</strong> due to prolonged non-payment.</p>
      <p>Attached to this email is a formal default notice letter for your reference and records.</p>
      <div class="highlight">
        <p><strong>Important:</strong> Please contact ${tenantName} urgently to discuss the settlement of your outstanding balance and avoid further legal or recovery action.</p>
      </div>
      <p>Thank you.</p>
    `;

    const letterFilename = letterPath.split('/').pop() || 'default-letter.pdf';

    const emailResult = await this.sendAutomationEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      notificationKey: 'default_notice',
      emailType: 'DEFAULT_NOTICE',
      recipientEmail: loan.borrower.email ?? null,
      recipientName: loan.borrower.name,
      subject: `Default Notice — Urgent Action Required`,
      htmlBody: await buildEmailWrapper(loan.tenant, content),
      attachmentPath: letterPath,
      attachmentFilename: letterFilename,
      requireAllAttachments: true,
    });

    const borrowerNotificationProcessed = await this.fanOutBorrowerNotification(
      {
          tenantId,
          borrowerId: loan.borrowerId,
          notificationKey: 'default_notice',
          category: 'collections',
          title: 'Default notice issued',
          body: 'Your loan has been marked as defaulted. Review the formal notice immediately.',
          deepLink: `/loans/${loanId}`,
          sourceType: 'LOAN',
          sourceId: loanId,
      },
      `[TrueSend] Failed to fan out default notice for loan ${loanId}:`,
    );

    if (emailResult.required && !emailResult.delivered) {
      throw new Error(`TrueSend failed to deliver email for default notice on loan ${loanId}`);
    }

    if (!borrowerNotificationProcessed) {
      throw new Error(`TrueSend failed to deliver borrower notification for default notice on loan ${loanId}`);
    }

    return emailResult.delivered;
  }

  /**
   * Disbursement Notification — confirms loan disbursement.
   * For online-originated loans, attaches the fully-signed agreement PDF.
   */
  static async sendDisbursementNotification(
    tenantId: string,
    loanId: string
  ): Promise<boolean> {
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return false;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan) return false;

    const tenantName = loan.tenant.name;
    const principal = toSafeNumber(loan.principalAmount);
    const rate = toSafeNumber(loan.interestRate);

    const isOnline = loan.loanChannel === 'ONLINE';
    const hasSignedAgreement = isOnline && loan.agreementPath;

    const content = `
      <h2>Loan Disbursement Confirmation</h2>
      <p>Dear ${loan.borrower.name},</p>
      <p>We are pleased to inform you that your loan has been <strong>successfully disbursed</strong>.</p>
      <div class="highlight">
        <table class="details">
          <tr><td>Loan Amount</td><td>${formatCurrency(principal)}</td></tr>
          <tr><td>Interest Rate</td><td>${safeRound(rate, 2)}% p.a.</td></tr>
          <tr><td>Term</td><td>${loan.term} months</td></tr>
          <tr><td>Disbursement Date</td><td>${loan.disbursementDate ? formatDate(loan.disbursementDate) : 'N/A'}</td></tr>
          ${loan.disbursementReference ? `<tr><td>Reference</td><td>${loan.disbursementReference}</td></tr>` : ''}
        </table>
      </div>
      ${hasSignedAgreement ? '<p>Attached to this email is your <strong>fully signed loan agreement</strong> for your records.</p>' : ''}
      <p>Your repayment schedule will begin as per the agreed terms. Please ensure timely payments to maintain a good repayment record.</p>
      <p>If you have any questions, please contact ${tenantName} directly.</p>
      <p>Thank you for your trust.</p>
    `;

    const emailResult = await this.sendAutomationEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      notificationKey: 'loan_disbursed',
      emailType: 'DISBURSEMENT',
      recipientEmail: loan.borrower.email ?? null,
      recipientName: loan.borrower.name,
      subject: `Loan Disbursement Confirmation — ${formatCurrency(principal)}`,
      htmlBody: await buildEmailWrapper(loan.tenant, content),
      ...(hasSignedAgreement ? {
        attachmentPath: loan.agreementPath!,
        attachmentFilename: loan.agreementOriginalName || 'signed-loan-agreement.pdf',
      } : {}),
    });

    const borrowerNotificationProcessed = await this.fanOutBorrowerNotification(
      {
          tenantId,
          borrowerId: loan.borrowerId,
          notificationKey: 'loan_disbursed',
          category: 'loan_lifecycle',
          title: 'Loan disbursed',
          body: `${formatCurrency(principal)} has been disbursed to you.`,
          deepLink: `/loans/${loanId}`,
          sourceType: 'LOAN',
          sourceId: loanId,
      },
      `[TrueSend] Failed to fan out disbursement notification for loan ${loanId}:`,
    );

    if (emailResult.required && !emailResult.delivered) {
      throw new Error(`TrueSend failed to deliver email for disbursement notification on loan ${loanId}`);
    }

    if (!borrowerNotificationProcessed) {
      throw new Error(`TrueSend failed to deliver borrower notification for disbursement notification on loan ${loanId}`);
    }

    return emailResult.delivered;
  }

  /**
   * Completion Notification — attaches discharge letter PDF
   * Works for both normal completion and early settlement
   */
  static async sendCompletionNotification(
    tenantId: string,
    loanId: string,
    dischargePath: string
  ): Promise<boolean> {
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return false;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan) return false;

    const tenantName = loan.tenant.name;
    const isEarlySettlement = !!loan.earlySettlementDate;

    const content = `
      <h2>Loan ${isEarlySettlement ? 'Early Settlement' : 'Completion'} Confirmation</h2>
      <p>Dear ${loan.borrower.name},</p>
      <p>We are pleased to confirm that your loan has been <strong>fully settled${isEarlySettlement ? ' (early settlement)' : ''}</strong>. All obligations under this loan have been fulfilled.</p>
      <p>Attached to this email is your official <strong>discharge letter</strong> for your records.</p>
      <div class="highlight">
        <p>This letter confirms that you have no further outstanding obligations under this loan agreement. Please keep it for your records.</p>
      </div>
      <p>Thank you for your commitment to timely repayment. We appreciate your trust in ${tenantName}.</p>
    `;

    const letterFilename = dischargePath.split('/').pop() || 'discharge-letter.pdf';

    const emailResult = await this.sendAutomationEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      notificationKey: 'loan_completed',
      emailType: 'COMPLETION',
      recipientEmail: loan.borrower.email ?? null,
      recipientName: loan.borrower.name,
      subject: `Loan ${isEarlySettlement ? 'Early Settlement' : 'Completion'} — Discharge Letter`,
      htmlBody: await buildEmailWrapper(loan.tenant, content),
      attachmentPath: dischargePath,
      attachmentFilename: letterFilename,
      requireAllAttachments: true,
    });

    const borrowerNotificationProcessed = await this.fanOutBorrowerNotification(
      {
          tenantId,
          borrowerId: loan.borrowerId,
          notificationKey: 'loan_completed',
          category: 'loan_lifecycle',
          title: isEarlySettlement ? 'Loan early-settled' : 'Loan completed',
          body: isEarlySettlement
            ? 'Your loan has been fully settled early.'
            : 'Your loan has been fully completed.',
          deepLink: `/loans/${loanId}`,
          sourceType: 'LOAN',
          sourceId: loanId,
      },
      `[TrueSend] Failed to fan out completion notification for loan ${loanId}:`,
    );

    if (emailResult.required && !emailResult.delivered) {
      throw new Error(`TrueSend failed to deliver email for completion notification on loan ${loanId}`);
    }

    if (!borrowerNotificationProcessed) {
      throw new Error(`TrueSend failed to deliver borrower notification for completion notification on loan ${loanId}`);
    }

    return emailResult.delivered;
  }

  /**
   * Payment Receipt — attaches the generated receipt PDF after a payment is recorded.
   * Works for both regular repayments and early settlement payments.
   */
  static async sendPaymentReceipt(
    tenantId: string,
    loanId: string,
    receiptPath: string,
    paymentAmount: number,
    receiptNumber: string,
    isEarlySettlement: boolean = false
  ): Promise<boolean> {
    /**
     * `payment_receipt` is the unified "payment recorded" notification: in-app + push always
     * fan out (subject to per-channel toggles), while the receipt email is additionally gated
     * by the TRUESEND add-on so tenants without TrueSend can still receive in-app/push alerts.
     */
    const trueSendActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan) return false;

    const tenantName = loan.tenant.name;
    const amountFormatted = formatCurrency(safeRound(paymentAmount, 2));

    /**
     * In-app + push and email are independent channels: attempt both and only escalate
     * failures after both have run, so a notification outage cannot block the receipt
     * email and an email outage cannot suppress the inbox/push entry.
     */
    const borrowerNotificationProcessed = await this.fanOutBorrowerNotification(
      {
          tenantId,
          borrowerId: loan.borrowerId,
          notificationKey: 'payment_receipt',
          category: 'payments',
          title: isEarlySettlement ? 'Settlement receipt available' : 'Payment recorded',
          body: `${amountFormatted} has been recorded successfully.`,
          deepLink: `/loans/${loanId}`,
          sourceType: 'PAYMENT_TRANSACTION',
          sourceId: receiptNumber,
      },
      `[TrueSend] Failed to fan out payment receipt for loan ${loanId}:`,
    );

    let emailRequired = false;
    let emailDelivered = false;
    if (trueSendActive) {
      const content = `
        <h2>Payment Receipt${isEarlySettlement ? ' — Early Settlement' : ''}</h2>
        <p>Dear ${loan.borrower.name},</p>
        <p>We acknowledge receipt of your ${isEarlySettlement ? 'early settlement ' : ''}payment. Thank you for your prompt payment.</p>
        <div class="highlight">
          <table class="details">
            <tr><td>Receipt Number</td><td>${receiptNumber}</td></tr>
            <tr><td>Amount Paid</td><td>${amountFormatted}</td></tr>
            ${isEarlySettlement ? '<tr><td>Payment Type</td><td>Early Settlement</td></tr>' : ''}
          </table>
        </div>
        <p>Attached to this email is your official <strong>payment receipt</strong> for your records.</p>
        <p>If you have any questions regarding this payment, please contact ${tenantName} directly.</p>
        <p>Thank you.</p>
      `;

      const receiptFilename = receiptPath.split('/').pop() || `receipt-${receiptNumber}.pdf`;

      const emailResult = await this.sendAutomationEmail({
        tenantId,
        loanId,
        borrowerId: loan.borrowerId,
        notificationKey: 'payment_receipt',
        emailType: 'PAYMENT_RECEIPT',
        recipientEmail: loan.borrower.email ?? null,
        recipientName: loan.borrower.name,
        subject: `Payment Receipt — ${amountFormatted} (${receiptNumber})`,
        htmlBody: await buildEmailWrapper(loan.tenant, content),
        attachmentPath: receiptPath,
        attachmentFilename: receiptFilename,
        requireAllAttachments: true,
      });
      emailRequired = emailResult.required;
      emailDelivered = emailResult.delivered;
    }

    /** Defer escalation until both channels have been attempted so they remain independent. */
    if (emailRequired && !emailDelivered) {
      throw new Error(`TrueSend failed to deliver email for payment receipt on loan ${loanId}`);
    }
    if (!borrowerNotificationProcessed) {
      throw new Error(`Failed to deliver borrower notification for payment receipt on loan ${loanId}`);
    }

    return emailDelivered;
  }

  /**
   * Signed Agreement — sends the digitally signed loan agreement PDF to the borrower
   */
  static async sendSignedAgreement(
    tenantId: string,
    loanId: string,
    agreementPath: string,
    agreementFilename: string,
  ): Promise<boolean> {
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return false;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan) return false;

    const content = `
      <h2>Signed Loan Agreement</h2>
      <p>Dear ${loan.borrower.name},</p>
      <p>Your loan agreement has been <strong>digitally signed</strong> and is attached to this email for your records.</p>
      <div class="highlight">
        <table class="details">
          <tr><td>Loan Amount</td><td>${formatCurrency(safeRound(toSafeNumber(loan.principalAmount), 2))}</td></tr>
          <tr><td>Term</td><td>${loan.term} months</td></tr>
          ${loan.agreementDate ? `<tr><td>Agreement Date</td><td>${formatDate(loan.agreementDate)}</td></tr>` : ''}
        </table>
      </div>
      <p>Please keep this document safely. It serves as proof of the loan agreement between you and ${loan.tenant.name}.</p>
      <p>If you have any questions, please contact ${loan.tenant.name} directly.</p>
      <p>Thank you.</p>
    `;

    const emailResult = await this.sendAutomationEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      notificationKey: 'signed_agreement_ready',
      emailType: 'SIGNED_AGREEMENT',
      recipientEmail: loan.borrower.email ?? null,
      recipientName: loan.borrower.name,
      subject: `Your Signed Loan Agreement`,
      htmlBody: await buildEmailWrapper(loan.tenant, content),
      attachmentPath: agreementPath,
      attachmentFilename: agreementFilename,
      requireAllAttachments: true,
    });

    const borrowerNotificationProcessed = await this.fanOutBorrowerNotification(
      {
          tenantId,
          borrowerId: loan.borrowerId,
          notificationKey: 'signed_agreement_ready',
          category: 'loan_lifecycle',
          title: 'Signed agreement ready',
          body: 'Your signed loan agreement is now available.',
          deepLink: `/loans/${loanId}`,
          sourceType: 'LOAN',
          sourceId: loanId,
      },
      `[TrueSend] Failed to fan out signed agreement notification for loan ${loanId}:`,
    );

    if (emailResult.required && !emailResult.delivered) {
      throw new Error(`TrueSend failed to deliver email for signed agreement on loan ${loanId}`);
    }

    if (!borrowerNotificationProcessed) {
      throw new Error(`TrueSend failed to deliver borrower notification for signed agreement on loan ${loanId}`);
    }

    return emailResult.delivered;
  }

  // ============================================
  // Resend — Admin-triggered re-send of a failed email
  // ============================================

  /**
   * Resend a failed/bounced email (1x per day limit)
   *
   * Rules:
   * - Only allowed if status is 'failed', 'bounced', or 'complained'
   * - Maximum 1 resend per calendar day (Malaysia time)
   * - Does NOT allow resend if already 'delivered'
   */
  static async resendEmail(emailLogId: string, tenantId: string): Promise<{ success: boolean; message: string }> {
    const emailLog = await prisma.emailLog.findFirst({
      where: { id: emailLogId, tenantId },
      include: { loan: { include: { borrower: true, tenant: true, product: true } } },
    });

    if (!emailLog) {
      return { success: false, message: 'Email log not found' };
    }

    // Only allow resend for certain statuses
    const resendableStatuses = ['failed', 'bounced', 'complained'];
    if (!resendableStatuses.includes(emailLog.status)) {
      return { success: false, message: `Cannot resend an email with status "${emailLog.status}". Only failed, bounced, or complained emails can be resent.` };
    }

    // Check 1x per day limit (Malaysia time)
    if (emailLog.resentAt) {
      const now = new Date();
      const malaysiaOffset = 8 * 60 * 60 * 1000; // UTC+8
      const todayMalaysia = new Date(now.getTime() + malaysiaOffset);
      const lastResentMalaysia = new Date(emailLog.resentAt.getTime() + malaysiaOffset);

      const todayDateStr = todayMalaysia.toISOString().split('T')[0];
      const lastResentDateStr = lastResentMalaysia.toISOString().split('T')[0];

      if (todayDateStr === lastResentDateStr) {
        return { success: false, message: 'This email has already been resent today. You can resend again tomorrow.' };
      }
    }

    // Check add-on is still active
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) {
      return { success: false, message: 'TrueSend add-on is not active' };
    }

    try {
      const apiKey = config.notifications.resendApiKey;

      if (!apiKey) {
        console.log(`[TrueSend] Resend (mock): ${emailLog.emailType} to ${emailLog.recipientEmail}`);
        await prisma.emailLog.update({
          where: { id: emailLog.id },
          data: {
            status: 'sent',
            sentAt: new Date(),
            lastEventAt: new Date(),
            resentAt: new Date(),
            resentCount: { increment: 1 },
            failureReason: null,
          },
        });
        return { success: true, message: 'Email resent successfully (mock)' };
      }

      // Build attachments if original had one
      let attachments: Array<{ filename: string; content: string }> | undefined;
      if (emailLog.attachmentPath) {
        const fileBuffer = await getFile(emailLog.attachmentPath);
        if (fileBuffer) {
          const filename = extractFilenameFromPath(emailLog.attachmentPath);
          attachments = [{ filename, content: fileBuffer.toString('base64') }];
        } else {
          throw new Error(`Attachment not found for resend: ${emailLog.attachmentPath}`);
        }
      }

      // Re-fetch tenant for the email wrapper
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      const tenantInfo: TenantEmailInfo = {
        name: tenant?.name || 'Your Lender',
        logoUrl: tenant?.logoUrl,
        registrationNumber: tenant?.registrationNumber,
        email: tenant?.email,
        contactNumber: tenant?.contactNumber,
        businessAddress: tenant?.businessAddress,
      };

      // Build a simple resend body
      const htmlBody = await buildEmailWrapper(tenantInfo, `
        <p>This is a re-delivery of a previous email notification.</p>
        <p><em>Original email type: ${emailLog.emailType}</em></p>
        <p>If you have any questions about this notice, please contact ${tenantInfo.name} directly.</p>
      `);

      const from = await formatResendFromForTenant(tenantId);

      const response = await sendResendRequest(apiKey, {
        from,
        to: emailLog.recipientEmail,
        subject: `[Resent] ${emailLog.subject}`,
        html: htmlBody,
        ...(attachments ? { attachments } : {}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as ResendApiResponse;

      await prisma.emailLog.update({
        where: { id: emailLog.id },
        data: {
          resendMessageId: data.id,
          status: 'sent',
          sentAt: new Date(),
          lastEventAt: new Date(),
          resentAt: new Date(),
          resentCount: { increment: 1 },
          failureReason: null,
        },
      });

      return { success: true, message: 'Email resent successfully' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[TrueSend] Resend failed for ${emailLog.id}:`, errorMessage);

      await prisma.emailLog.update({
        where: { id: emailLog.id },
        data: {
          failureReason: `Resend failed: ${errorMessage}`,
          lastEventAt: new Date(),
        },
      });

      return { success: false, message: `Resend failed: ${errorMessage}` };
    }
  }
}
