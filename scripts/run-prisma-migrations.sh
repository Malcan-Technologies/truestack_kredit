#!/bin/sh
# Prisma database operations runner for ECS task.

set -e

cd /app/apps/backend

echo "=========================================="
echo "Database Operations Runner"
echo "=========================================="
echo ""

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

echo "DATABASE_URL is set."
echo ""

if [ "$SKIP_MIGRATIONS" = "true" ]; then
  echo "Skipping migrations (SKIP_MIGRATIONS=true)"
else
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy --schema=prisma/schema.prisma
  echo "Migrations complete."
fi

if [ "$SEED_DATABASE" = "true" ]; then
  echo ""
  echo "Running production database seed..."
  npm run db:seed:prod
  echo "Seed complete."
fi

echo ""
echo "Database operations finished."
