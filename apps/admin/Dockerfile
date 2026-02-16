# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps

# Copy workspace manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY apps/admin/package.json ./apps/admin/
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

WORKDIR /app/apps/admin

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=https://kredit-api.truestack.my
ARG NEXT_PUBLIC_APP_URL=https://kredit.truestack.my
ARG BACKEND_URL=https://kredit-api.truestack.my
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV BACKEND_URL=${BACKEND_URL}

# Admin auth route uses Prisma via Better Auth; generate client in this image.
RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
  npx prisma generate --schema=/app/apps/backend/prisma/schema.prisma

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as non-root user.
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY --from=builder --chown=nodejs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder --chown=nodejs:nodejs /app/apps/admin/public ./apps/admin/public

USER nodejs

EXPOSE 3000

CMD ["node", "apps/admin/server.js"]
