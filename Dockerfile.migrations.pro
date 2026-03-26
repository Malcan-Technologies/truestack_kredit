FROM node:22-alpine

WORKDIR /app

# Prisma engine dependency on Alpine.
RUN apk add --no-cache openssl

# Install workspace dependencies.
COPY package.json package-lock.json ./
COPY apps/backend_pro/package.json ./apps/backend_pro/
COPY apps/admin_pro/package.json ./apps/admin_pro/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

# Copy only what migration/seed execution needs.
COPY apps/backend_pro/prisma ./apps/backend_pro/prisma
COPY apps/backend_pro/package.json ./apps/backend_pro/package.json
COPY apps/backend_pro/src ./apps/backend_pro/src
COPY apps/backend_pro/tsconfig.json ./apps/backend_pro/tsconfig.json
COPY apps/backend_pro/tsconfig.lint.json ./apps/backend_pro/tsconfig.lint.json
COPY scripts/run-prisma-migrations-pro.sh ./scripts/run-prisma-migrations-pro.sh

RUN chmod +x ./scripts/run-prisma-migrations-pro.sh

# Pre-generate Prisma client.
WORKDIR /app/apps/backend_pro
RUN npx prisma generate --schema=prisma/schema.prisma

WORKDIR /app
CMD ["./scripts/run-prisma-migrations-pro.sh"]
