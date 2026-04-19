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

if [ "$RESET_DATABASE" = "true" ]; then
  echo "Resetting database (RESET_DATABASE=true)..."
  npx prisma migrate reset --force --skip-seed --schema=prisma/schema.prisma
  echo "Database reset complete."
  echo ""
fi

if [ -n "$RESOLVE_ROLLED_BACK_MIGRATIONS" ]; then
  echo "Resolving migrations as rolled-back: $RESOLVE_ROLLED_BACK_MIGRATIONS"
  OLD_IFS="$IFS"
  IFS=','
  for migration in $RESOLVE_ROLLED_BACK_MIGRATIONS; do
    trimmed=$(echo "$migration" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    if [ -n "$trimmed" ]; then
      echo "  -> prisma migrate resolve --rolled-back $trimmed"
      npx prisma migrate resolve --rolled-back "$trimmed" --schema=prisma/schema.prisma || {
        echo "WARNING: failed to mark $trimmed as rolled-back (it may not be in a failed state). Continuing."
      }
    fi
  done
  IFS="$OLD_IFS"
  echo ""
fi

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
