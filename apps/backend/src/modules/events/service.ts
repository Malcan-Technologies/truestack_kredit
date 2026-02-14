import { prisma } from '../../lib/prisma.js';
import { nanoid } from 'nanoid';
import { createHmac } from 'crypto';
import { config } from '../../lib/config.js';

export type EventType = 
  | 'tenant.created'
  | 'tenant.updated'
  | 'tenant.blocked'
  | 'subscription.paid'
  | 'subscription.expired'
  | 'invoice.issued'
  | 'receipt.generated'
  | 'loan.created'
  | 'loan.disbursed'
  | 'loan.closed'
  | 'user.invited'
  | 'user.revoked';

interface EmitEventParams {
  tenantId: string;
  eventType: EventType;
  payload: Record<string, unknown>;
}

/**
 * Domain event emitter using the outbox pattern
 * Events are stored in the database and processed asynchronously
 */
export class DomainEventEmitter {
  /**
   * Emit an event to the outbox
   */
  static async emit(params: EmitEventParams): Promise<string> {
    const idempotencyKey = `${params.eventType}-${params.tenantId}-${nanoid(10)}`;

    const event = await prisma.outboxEvent.create({
      data: {
        tenantId: params.tenantId,
        eventType: params.eventType,
        payload: params.payload as object,
        idempotencyKey,
        status: 'PENDING',
      },
    });

    return event.id;
  }

  /**
   * Process pending events (called by a cron job or worker)
   */
  static async processPendingEvents(webhookUrl?: string): Promise<number> {
    const events = await prisma.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: 5 }, // Max 5 attempts
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });

    let processed = 0;

    for (const event of events) {
      try {
        // Update attempt count
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts: { increment: 1 },
            lastAttemptAt: new Date(),
          },
        });

        // Send webhook if URL is configured
        if (webhookUrl) {
          await this.sendWebhook(webhookUrl, event);
        } else {
          // In development, just log the event
          console.log('[DomainEventEmitter] Event:', event.eventType, event.payload);
        }

        // Mark as sent
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        processed++;
      } catch (error) {
        console.error('[DomainEventEmitter] Failed to process event:', event.id, error);
        
        // Mark as failed if max attempts reached
        if (event.attempts >= 4) {
          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'FAILED' },
          });
        }
      }
    }

    return processed;
  }

  /**
   * Send webhook with HMAC signature
   */
  private static async sendWebhook(
    url: string,
    event: { id: string; eventType: string; payload: unknown; idempotencyKey: string }
  ): Promise<void> {
    const body = JSON.stringify({
      id: event.id,
      type: event.eventType,
      payload: event.payload,
      idempotencyKey: event.idempotencyKey,
      timestamp: new Date().toISOString(),
    });

    // Create HMAC signature
    const secret = config.webhook.secret;
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Kredit-Signature': signature,
        'X-Kredit-Idempotency-Key': event.idempotencyKey,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Webhook failed with status ${response.status}`);
    }
  }

  // Convenience methods for common events

  static async emitTenantCreated(tenantId: string, tenantData: Record<string, unknown>) {
    return this.emit({
      tenantId,
      eventType: 'tenant.created',
      payload: tenantData,
    });
  }

  static async emitSubscriptionPaid(tenantId: string, subscriptionData: Record<string, unknown>) {
    return this.emit({
      tenantId,
      eventType: 'subscription.paid',
      payload: subscriptionData,
    });
  }

  static async emitLoanDisbursed(tenantId: string, loanData: Record<string, unknown>) {
    return this.emit({
      tenantId,
      eventType: 'loan.disbursed',
      payload: loanData,
    });
  }

  static async emitInvoiceIssued(tenantId: string, invoiceData: Record<string, unknown>) {
    return this.emit({
      tenantId,
      eventType: 'invoice.issued',
      payload: invoiceData,
    });
  }
}
