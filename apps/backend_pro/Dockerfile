# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

# Prisma needs OpenSSL in Alpine images.
RUN apk add --no-cache openssl

FROM base AS deps

# Copy workspace manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/admin/package.json ./apps/admin/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client and compile backend.
RUN npx prisma generate --schema=apps/backend/prisma/schema.prisma
RUN npm run build -w apps/backend

FROM base AS runner
WORKDIR /app/apps/backend

ENV NODE_ENV=production
ENV PORT=4000
ENV HOSTNAME=0.0.0.0

# Run as non-root user.
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Runtime files
COPY --from=builder --chown=nodejs:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend/package.json ./package.json
# Logo for invoice PDF (same pattern as admin-truestack: process.cwd()/public/logo-light.png)
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend/public ./public
# User-guide docs for /api/docs (help center) - must be at /app/docs for path.join(process.cwd(), '..', '..', 'docs', 'user-guide')
COPY --from=builder --chown=nodejs:nodejs /app/docs /app/docs

USER nodejs

EXPOSE 4000

CMD ["node", "dist/index.js"]
