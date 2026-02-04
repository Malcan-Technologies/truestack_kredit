import { prisma } from '../../lib/prisma.js';

export interface AuditLogParams {
  tenantId: string;
  memberId?: string;  // TenantMember ID (replaces userId)
  action: string;
  entityType: string;
  entityId: string;
  previousData?: unknown;
  newData?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Audit logging service for compliance
 */
export class AuditService {
  /**
   * Log an audit event
   */
  static async log(params: AuditLogParams): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: params.tenantId,
          memberId: params.memberId,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          previousData: params.previousData ? JSON.parse(JSON.stringify(params.previousData)) : null,
          newData: params.newData ? JSON.parse(JSON.stringify(params.newData)) : null,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });
    } catch (error) {
      // Log error but don't throw - audit logging should not break the main flow
      console.error('[AuditService] Failed to log audit event:', error);
    }
  }

  /**
   * Log a create action
   */
  static async logCreate(
    tenantId: string,
    memberId: string,
    entityType: string,
    entityId: string,
    data: unknown,
    ipAddress?: string
  ): Promise<void> {
    return this.log({
      tenantId,
      memberId,
      action: 'CREATE',
      entityType,
      entityId,
      newData: data,
      ipAddress,
    });
  }

  /**
   * Log an update action
   */
  static async logUpdate(
    tenantId: string,
    memberId: string,
    entityType: string,
    entityId: string,
    previousData: unknown,
    newData: unknown,
    ipAddress?: string
  ): Promise<void> {
    return this.log({
      tenantId,
      memberId,
      action: 'UPDATE',
      entityType,
      entityId,
      previousData,
      newData,
      ipAddress,
    });
  }

  /**
   * Log a delete action
   */
  static async logDelete(
    tenantId: string,
    memberId: string,
    entityType: string,
    entityId: string,
    previousData: unknown,
    ipAddress?: string
  ): Promise<void> {
    return this.log({
      tenantId,
      memberId,
      action: 'DELETE',
      entityType,
      entityId,
      previousData,
      ipAddress,
    });
  }

  /**
   * Log a login event
   */
  static async logLogin(
    tenantId: string,
    memberId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    return this.log({
      tenantId,
      memberId,
      action: 'LOGIN',
      entityType: 'TenantMember',
      entityId: memberId,
      ipAddress,
      userAgent,
    });
  }
}
