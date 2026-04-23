import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';

/**
 * Resend "from" line: display name from tenant (company) when known; shared system address.
 */
export async function formatResendFromForTenant(tenantId: string | null | undefined): Promise<string> {
  let name = config.email.fromName;
  if (tenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    if (t?.name?.trim()) {
      name = t.name.trim();
    }
  }
  return `${name} <${config.email.fromAddress}>`;
}
