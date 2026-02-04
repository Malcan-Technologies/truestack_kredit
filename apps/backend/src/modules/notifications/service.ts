import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';

interface SendNotificationParams {
  tenantId: string;
  type: 'email' | 'whatsapp';
  recipient: string;
  subject?: string;
  body: string;
}

/**
 * Notification service for sending emails and WhatsApp messages
 */
export class NotificationService {
  /**
   * Send a notification
   */
  static async send(params: SendNotificationParams) {
    // Create notification record
    const notification = await prisma.notification.create({
      data: {
        tenantId: params.tenantId,
        type: params.type,
        recipient: params.recipient,
        subject: params.subject,
        body: params.body,
        status: 'pending',
      },
    });

    // Attempt to send
    try {
      if (params.type === 'email') {
        await this.sendEmail(params.recipient, params.subject || '', params.body);
      } else if (params.type === 'whatsapp') {
        await this.sendWhatsApp(params.recipient, params.body);
      }

      // Update status to sent
      return await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      });
    } catch (error) {
      console.error('[NotificationService] Failed to send:', error);
      
      // Update status to failed
      return await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'failed' },
      });
    }
  }

  /**
   * Retry a failed notification
   */
  static async retry(notificationId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    try {
      if (notification.type === 'email') {
        await this.sendEmail(notification.recipient, notification.subject || '', notification.body);
      } else if (notification.type === 'whatsapp') {
        await this.sendWhatsApp(notification.recipient, notification.body);
      }

      return await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      });
    } catch (error) {
      console.error('[NotificationService] Retry failed:', error);
      throw error;
    }
  }

  /**
   * Send email via Resend
   */
  private static async sendEmail(to: string, subject: string, body: string): Promise<void> {
    const apiKey = config.notifications.resendApiKey;
    
    if (!apiKey) {
      console.log('[NotificationService] Email (mock):', { to, subject });
      return; // Mock in development
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'TrueKredit <noreply@kredit.truestack.my>',
        to,
        subject,
        html: body,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error: ${error}`);
    }
  }

  /**
   * Send WhatsApp message via Meta API
   */
  private static async sendWhatsApp(to: string, body: string): Promise<void> {
    const { accessToken, phoneNumberId } = config.notifications.whatsapp;
    
    if (!accessToken || !phoneNumberId) {
      console.log('[NotificationService] WhatsApp (mock):', { to, body });
      return; // Mock in development
    }

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WhatsApp API error: ${error}`);
    }
  }

  /**
   * Send billing reminder
   */
  static async sendBillingReminder(tenantId: string, daysUntilDue: number): Promise<void> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        members: {
          where: { role: 'OWNER' },
          take: 1,
          include: {
            user: true,
          },
        },
      },
    });

    if (!tenant || !tenant.members[0]) return;

    const ownerUser = tenant.members[0].user;

    await this.send({
      tenantId,
      type: 'email',
      recipient: ownerUser.email,
      subject: `Payment reminder - ${daysUntilDue} days remaining`,
      body: `
        <h2>Payment Reminder</h2>
        <p>Dear ${ownerUser.name || 'Admin'},</p>
        <p>This is a reminder that your TrueKredit subscription payment is due in ${daysUntilDue} days.</p>
        <p>Please ensure timely payment to avoid service interruption.</p>
        <p>Thank you for using TrueKredit.</p>
      `,
    });
  }

  /**
   * Send repayment reminder
   */
  static async sendRepaymentReminder(
    tenantId: string,
    borrowerPhone: string,
    loanId: string,
    dueDate: Date,
    amount: number
  ): Promise<void> {
    if (!borrowerPhone) return;

    await this.send({
      tenantId,
      type: 'whatsapp',
      recipient: borrowerPhone,
      body: `Peringatan: Bayaran pinjaman anda sebanyak RM${amount.toFixed(2)} perlu dibuat sebelum ${dueDate.toLocaleDateString('ms-MY')}. Sila pastikan bayaran dibuat tepat pada masanya. Terima kasih.`,
    });
  }
}
