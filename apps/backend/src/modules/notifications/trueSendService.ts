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
import { AuditService } from '../compliance/auditService.js';
import { getFile } from '../../lib/storage.js';
import { safeRound, toSafeNumber } from '../../lib/math.js';

// ============================================
// Types
// ============================================

interface SendEmailParams {
  tenantId: string;
  loanId?: string;
  borrowerId?: string;
  emailType: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  htmlBody: string;
  attachmentPath?: string;
  attachmentFilename?: string;
}

interface ResendApiResponse {
  id: string;
}

// ============================================
// Email HTML Builder
// ============================================

function buildEmailWrapper(tenantName: string, content: string): string {
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
    .badge { display: inline-block; background: #f97316; color: #fff; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 10px; letter-spacing: 0.5px; margin-left: 8px; vertical-align: middle; }
    h2 { color: #1a1a1a; margin: 0 0 16px 0; font-size: 20px; }
    p { margin: 0 0 12px 0; }
    .highlight { background: #fff7ed; border-left: 4px solid #f97316; padding: 16px; margin: 16px 0; border-radius: 0 8px 8px 0; }
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
      <p class="header-text">${tenantName}<span class="badge">TrueSend</span></p>
      <p class="header-sub">Powered by TrueKredit</p>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p class="footer-text">This is an automated email sent via TrueSend by TrueKredit on behalf of ${tenantName}.</p>
      <p class="footer-text">If you believe you received this email in error, please contact ${tenantName} directly.</p>
    </div>
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

// ============================================
// TrueSend Service
// ============================================

export class TrueSendService {
  /**
   * Core email sending method — all public methods funnel through this
   */
  private static async sendEmail(params: SendEmailParams): Promise<void> {
    const { tenantId, loanId, borrowerId, emailType, recipientEmail, recipientName, subject, htmlBody, attachmentPath, attachmentFilename } = params;

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
        attachmentPath,
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
        return;
      }

      // Build attachments array if we have a PDF
      let attachments: Array<{ filename: string; content: string }> | undefined;
      if (attachmentPath) {
        const fileBuffer = await getFile(attachmentPath);
        if (fileBuffer) {
          attachments = [{
            filename: attachmentFilename || 'document.pdf',
            content: fileBuffer.toString('base64'),
          }];
        }
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'TrueKredit <kredit-no-reply@truestack.my>',
          to: recipientEmail,
          subject,
          html: htmlBody,
          ...(attachments ? { attachments } : {}),
        }),
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

      // Audit log
      if (loanId) {
        await AuditService.log({
          tenantId,
          action: 'TRUESEND_EMAIL_SENT',
          entityType: 'Loan',
          entityId: loanId,
          newData: {
            emailLogId: emailLog.id,
            emailType,
            recipient: recipientEmail,
            subject,
            hasAttachment: !!attachmentPath,
          },
        });
      }

      console.log(`[TrueSend] Sent ${emailType} to ${recipientEmail} (resendId: ${data.id})`);
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
  static async sendPaymentReminder(
    tenantId: string,
    loanId: string,
    dueDate: Date,
    amount: number,
    milestoneNumber: number,
    daysUntilDue: number
  ): Promise<void> {
    // Check add-on
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan || !loan.borrower.email) return;

    const amountFormatted = formatCurrency(safeRound(amount, 2));
    const dueDateFormatted = formatDate(dueDate);
    const tenantName = loan.tenant.name;

    const content = `
      <h2>Payment Reminder</h2>
      <p>Dear ${loan.borrower.name},</p>
      <p>This is a friendly reminder that your loan repayment is due ${daysUntilDue === 1 ? '<strong>tomorrow</strong>' : `in <strong>${daysUntilDue} days</strong>`}.</p>
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

    await this.sendEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      emailType: 'PAYMENT_REMINDER',
      recipientEmail: loan.borrower.email,
      recipientName: loan.borrower.name,
      subject: `Payment Reminder — ${amountFormatted} due ${dueDateFormatted}`,
      htmlBody: buildEmailWrapper(tenantName, content),
    });
  }

  /**
   * Late Payment Notice — consolidates multiple late milestones into one email (1x per month)
   */
  static async sendLatePaymentNotice(
    tenantId: string,
    loanId: string,
    overdueMilestones: Array<{ milestoneNumber: number; dueDate: Date; amount: number; daysOverdue: number }>
  ): Promise<void> {
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan || !loan.borrower.email) return;

    const tenantName = loan.tenant.name;
    const totalOverdue = overdueMilestones.reduce((sum, m) => sum + m.amount, 0);

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

    await this.sendEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      emailType: 'LATE_PAYMENT',
      recipientEmail: loan.borrower.email,
      recipientName: loan.borrower.name,
      subject: `Late Payment Notice — ${formatCurrency(safeRound(totalOverdue, 2))} overdue`,
      htmlBody: buildEmailWrapper(tenantName, content),
    });
  }

  /**
   * Arrears Notice — attaches arrears letter PDF
   */
  static async sendArrearsNotice(
    tenantId: string,
    loanId: string,
    letterPath: string
  ): Promise<void> {
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan || !loan.borrower.email) return;

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

    await this.sendEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      emailType: 'ARREARS_NOTICE',
      recipientEmail: loan.borrower.email,
      recipientName: loan.borrower.name,
      subject: `Arrears Notice — Immediate Attention Required`,
      htmlBody: buildEmailWrapper(tenantName, content),
      attachmentPath: letterPath,
      attachmentFilename: letterFilename,
    });
  }

  /**
   * Default Notice — attaches default letter PDF
   */
  static async sendDefaultNotice(
    tenantId: string,
    loanId: string,
    letterPath: string
  ): Promise<void> {
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan || !loan.borrower.email) return;

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

    await this.sendEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      emailType: 'DEFAULT_NOTICE',
      recipientEmail: loan.borrower.email,
      recipientName: loan.borrower.name,
      subject: `Default Notice — Urgent Action Required`,
      htmlBody: buildEmailWrapper(tenantName, content),
      attachmentPath: letterPath,
      attachmentFilename: letterFilename,
    });
  }

  /**
   * Disbursement Notification — email-only, no PDF attachment
   */
  static async sendDisbursementNotification(
    tenantId: string,
    loanId: string
  ): Promise<void> {
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan || !loan.borrower.email) return;

    const tenantName = loan.tenant.name;
    const principal = toSafeNumber(loan.principalAmount);
    const rate = toSafeNumber(loan.interestRate);

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
      <p>Your repayment schedule will begin as per the agreed terms. Please ensure timely payments to maintain a good repayment record.</p>
      <p>If you have any questions, please contact ${tenantName} directly.</p>
      <p>Thank you for your trust.</p>
    `;

    await this.sendEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      emailType: 'DISBURSEMENT',
      recipientEmail: loan.borrower.email,
      recipientName: loan.borrower.name,
      subject: `Loan Disbursement Confirmation — ${formatCurrency(principal)}`,
      htmlBody: buildEmailWrapper(tenantName, content),
    });
  }

  /**
   * Completion Notification — attaches discharge letter PDF
   * Works for both normal completion and early settlement
   */
  static async sendCompletionNotification(
    tenantId: string,
    loanId: string,
    dischargePath: string
  ): Promise<void> {
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan || !loan.borrower.email) return;

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

    await this.sendEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      emailType: 'COMPLETION',
      recipientEmail: loan.borrower.email,
      recipientName: loan.borrower.name,
      subject: `Loan ${isEarlySettlement ? 'Early Settlement' : 'Completion'} — Discharge Letter`,
      htmlBody: buildEmailWrapper(tenantName, content),
      attachmentPath: dischargePath,
      attachmentFilename: letterFilename,
    });
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
  ): Promise<void> {
    const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
    if (!isActive) return;

    const loan = await this.getLoanContext(tenantId, loanId);
    if (!loan || !loan.borrower.email) return;

    const tenantName = loan.tenant.name;
    const amountFormatted = formatCurrency(safeRound(paymentAmount, 2));

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

    await this.sendEmail({
      tenantId,
      loanId,
      borrowerId: loan.borrowerId,
      emailType: 'PAYMENT_RECEIPT',
      recipientEmail: loan.borrower.email,
      recipientName: loan.borrower.name,
      subject: `Payment Receipt — ${amountFormatted} (${receiptNumber})`,
      htmlBody: buildEmailWrapper(tenantName, content),
      attachmentPath: receiptPath,
      attachmentFilename: receiptFilename,
    });
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
          const filename = emailLog.attachmentPath.split('/').pop() || 'document.pdf';
          attachments = [{ filename, content: fileBuffer.toString('base64') }];
        }
      }

      // Re-fetch tenant name for the email wrapper
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      const tenantName = tenant?.name || 'Your Lender';

      // Build a simple resend body
      const htmlBody = buildEmailWrapper(tenantName, `
        <p>This is a re-delivery of a previous email notification.</p>
        <p><em>Original email type: ${emailLog.emailType}</em></p>
        <p>If you have any questions about this notice, please contact ${tenantName} directly.</p>
      `);

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'TrueKredit <kredit-no-reply@truestack.my>',
          to: emailLog.recipientEmail,
          subject: `[Resent] ${emailLog.subject}`,
          html: htmlBody,
          ...(attachments ? { attachments } : {}),
        }),
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

      // Audit log
      if (emailLog.loanId) {
        await AuditService.log({
          tenantId,
          action: 'TRUESEND_EMAIL_RESENT',
          entityType: 'Loan',
          entityId: emailLog.loanId,
          newData: {
            emailLogId: emailLog.id,
            emailType: emailLog.emailType,
            recipient: emailLog.recipientEmail,
            newResendMessageId: data.id,
          },
        });
      }

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
