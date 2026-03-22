/**
 * Legacy script: subscription payment requests no longer exist in TrueKredit Pro.
 * Clears related TrueIdentity webhook idempotency keys only (if any).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n🔄 Clearing subscription payment webhook idempotency keys (Pro has no SubscriptionPaymentRequest)...\n");

  const deletedEvents = await prisma.$executeRaw`
    DELETE FROM "TrueIdentityWebhookEvent"
    WHERE "idempotencyKey" LIKE 'subscription.payment.decision:%'
  `;
  console.log(`✓ Deleted ${deletedEvents} TrueIdentityWebhookEvent idempotency record(s)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
