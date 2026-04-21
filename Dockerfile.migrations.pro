FROM node:22-alpine

WORKDIR /app

# Prisma engine dependency on Alpine.
RUN apk add --no-cache openssl

# Install workspace dependencies.
# Include every npm workspace package.json so `npm ci` matches package-lock.json.
COPY package.json package-lock.json ./
COPY apps/admin/package.json ./apps/admin/
COPY apps/admin_pro/package.json ./apps/admin_pro/
COPY apps/backend/package.json ./apps/backend/
COPY apps/backend_pro/package.json ./apps/backend_pro/
COPY apps/signing-gateway/package.json ./apps/signing-gateway/
COPY apps/borrower_pro/Demo_Client/package.json ./apps/borrower_pro/Demo_Client/
COPY apps/borrower_pro/Proficient_Premium/package.json ./apps/borrower_pro/Proficient_Premium/
COPY apps/borrower_pro_mobile/Demo_Client/package.json ./apps/borrower_pro_mobile/Demo_Client/
COPY packages/shared/package.json ./packages/shared/
COPY packages/borrower/package.json ./packages/borrower/

RUN test -s package-lock.json \
  && node -e "const l=require('./package-lock.json'); if (l.lockfileVersion == null) throw new Error('Invalid package-lock.json');"

RUN npm ci

# Copy only what migration/seed execution needs.
COPY apps/backend_pro/prisma ./apps/backend_pro/prisma
COPY apps/backend_pro/package.json ./apps/backend_pro/package.json
COPY apps/backend_pro/src ./apps/backend_pro/src
COPY apps/backend_pro/tsconfig.json ./apps/backend_pro/tsconfig.json
COPY scripts/run-prisma-migrations-pro.sh ./scripts/run-prisma-migrations-pro.sh

RUN chmod +x ./scripts/run-prisma-migrations-pro.sh

# Pre-generate Prisma client.
WORKDIR /app/apps/backend_pro
RUN npx prisma generate --schema=prisma/schema.prisma

WORKDIR /app
CMD ["./scripts/run-prisma-migrations-pro.sh"]
