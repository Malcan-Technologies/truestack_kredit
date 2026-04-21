# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

# Prisma needs OpenSSL in Alpine images.
RUN apk add --no-cache openssl

FROM base AS deps

# Copy workspace manifests first for better layer caching.
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

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY . .

# Build workspace packages needed by the backend, then generate Prisma client and compile.
RUN npm run build -w packages/shared
RUN npx prisma generate --schema=apps/backend_pro/prisma/schema.prisma
RUN npm run build -w apps/backend_pro

FROM base AS runner
WORKDIR /app/apps/backend_pro

ENV NODE_ENV=production
ENV PORT=4001
ENV HOSTNAME=0.0.0.0

# Run as non-root user.
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Runtime files
COPY --from=builder --chown=nodejs:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend_pro/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/packages/shared /app/packages/shared
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend_pro/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend_pro/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend_pro/package.json ./package.json
# User-guide docs for /api/docs - must be at /app/docs for path.join(process.cwd(), '..', '..', 'docs', 'user-guide')
COPY --from=builder --chown=nodejs:nodejs /app/docs /app/docs

USER nodejs

EXPOSE 4001

CMD ["node", "dist/index.js"]
