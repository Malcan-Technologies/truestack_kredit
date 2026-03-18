/**
 * Remove subscription payment records for webhook testing.
 * - Deletes all SubscriptionPaymentRequest records
 * - Deletes TrueIdentityWebhookEvent records for subscription.payment.decision (idempotency)
 *
 * After running, trigger the flow again from Kredit: go to subscription payment page
 * and click "I've Made the Transfer" to create a new request and send webhook to Admin.
 *
 * Run from apps/backend: npm run db:reset-payment-status
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n🔄 Removing subscription payment records for webhook testing...\n");

  // Delete all SubscriptionPaymentRequest records
  const deletedRequests = await prisma.subscriptionPaymentRequest.deleteMany({});
  console.log(`✓ Deleted ${deletedRequests.count} SubscriptionPaymentRequest(s)`);

  // Delete idempotency records so webhook can be processed again
  const deletedEvents = await prisma.$executeRaw`
    DELETE FROM "TrueIdentityWebhookEvent"
    WHERE "idempotencyKey" LIKE 'subscription.payment.decision:%'
  `;
  console.log(`✓ Deleted ${deletedEvents} TrueIdentityWebhookEvent idempotency record(s)\n`);
  console.log("Done. Trigger the flow again from Kredit (subscription payment page → I've Made the Transfer).\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
